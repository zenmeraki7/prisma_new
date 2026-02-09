// FILE: web/lib/snapshots/snapshotRunner.ts

import type { PrismaClient } from "@prisma/client";
import { SnapshotRunState } from "@prisma/client";

import { FilterPlanner } from "../filters/planner";
import type { FilterExpr } from "../../frontend/lib/filters/dsl";

const BATCH_SIZE = 1000;

interface SnapshotJob {
  shopId: string;
  planHash: string;    // Deterministic hash for this filter + shop
  filterExpr: FilterExpr;
}

/**
 * SnapshotRunner
 *
 * Responsibilities:
 * - Ensure there is a SnapshotRun for a given (shopId, planHash).
 * - If needed, build a fresh snapshot by:
 *   1) Using FilterPlanner to compute a FAST where-clause.
 *   2) Streaming matching ProductLite rows for that shop.
 *   3) Inserting membership rows into SnapshotProduct.
 *
 * NOTES:
 * - We ONLY use the FAST-plane query for membership.
 *   SNAPSHOT-plane filters are enforced later when querying
 *   SnapshotProduct via snapshotCompiler/productsBySnapshotResolver.
 */
export class SnapshotRunner {
  constructor(private prisma: PrismaClient) {}

  /**
   * Idempotent entrypoint.
   *
   * - If a non-FAILED run already exists for (shopId, planHash), returns its id.
   * - Otherwise, (re)creates a RUNNING run and kicks off processing.
   *
   * Returns: SnapshotRun.id as string (for GraphQL / client).
   */
  async ensureSnapshot(job: SnapshotJob): Promise<string> {
    const { shopId, planHash, filterExpr } = job;

    // 1) Check existing run
    const existing = await this.prisma.snapshotRun.findUnique({
      where: { shopId_planHash: { shopId, planHash } },
    });

    // If SUCCEEDED or RUNNING, just return its id (caller can poll status)
    if (existing && existing.state !== SnapshotRunState.FAILED) {
      // TODO (optional): TTL check; if too old, you may invalidate & rebuild.
      return existing.id.toString();
    }

    // 2) Upsert a new RUNNING run (handles races if 2 workers start same job)
    const run = await this.prisma.snapshotRun.upsert({
      where: { shopId_planHash: { shopId, planHash } },
      update: {
        state: SnapshotRunState.RUNNING,
        progress: 0,
        total: 0,
        errorMessage: null,
        createdAt: new Date(), // reset TTL anchor
        filterSummary: JSON.stringify(filterExpr),
      },
      create: {
        shopId,
        planHash,
        state: SnapshotRunState.RUNNING,
        filterSummary: JSON.stringify(filterExpr),
      },
    });

    // 3) Kick off the heavy work (in a real system: enqueue to BullMQ instead)
    // Here we await so the logic is explicit & testable.
    this.processRun(run.id, shopId, filterExpr).catch((err) => {
      console.error("[SnapshotRunner] Unhandled error in processRun:", err);
    });

    return run.id.toString();
  }

  /**
   * Heavy pipeline:
   * - Uses FilterPlanner to compute FAST-plane where-clause.
   * - Streams ProductLite in id-ascending order (shop-scoped).
   * - Inserts membership rows into SnapshotProduct in batches.
   */
  private async processRun(
    runId: bigint,
    shopId: string,
    expr: FilterExpr,
  ): Promise<void> {
    try {
      // A) Plan filters → FAST where (membership)
      // We pass no snapshotRunId, since here we are building the snapshot,
      // not querying an existing one.
      const plan = FilterPlanner.plan(expr, { shopId });

      const fastWhere = plan.fastQuery || {};

      // Always enforce shopId partition at the DB level
      const where: Prisma.ProductLiteWhereInput = {
        shopId,
        ...(fastWhere ?? {}),
      };

      // Optional: log snapshot-plane presence for debugging/metrics
      if (plan.meta.snapshotFiltersCount > 0) {
        console.info(
          `[SnapshotRunner] Snapshot plan for shop=${shopId}, runId=${runId.toString()} ` +
            `has ${plan.meta.snapshotFiltersCount} SNAPSHOT-plane leaves (used at query time).`,
        );
      }

      // B) Estimate total candidates for progress / guardrails
      const total = await this.prisma.productLite.count({ where });

      await this.prisma.snapshotRun.update({
        where: { id: runId },
        data: { total, progress: 0 },
      });

      // C) Stream ProductLite rows in batches using cursor on id (BigInt-safe)
      let processed = 0;
      let cursor: { id: bigint } | undefined = undefined;

      // Clear any prior membership for this run on re-run
      await this.prisma.snapshotProduct.deleteMany({
        where: { shopId, snapshotRunId: runId },
      });

      // Batching loop
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await this.prisma.productLite.findMany({
          where,
          orderBy: { id: "asc" },
          take: BATCH_SIZE + 1, // +1 to detect if more remain
          skip: cursor ? 1 : 0,
          cursor,
          select: {
            id: true,
            shopId: true,
            createdAtShopify: true,
            updatedAtShopify: true,
            // If you later want to materialize fields like SEO visibility,
            // you can include them here (or join via relations).
          },
        });

        if (batch.length === 0) break;

        const hasMore = batch.length > BATCH_SIZE;
        const window = hasMore ? batch.slice(0, BATCH_SIZE) : batch;

        // Build SnapshotProduct rows
        const snapshotRows = window.map((row) => ({
          shopId: row.shopId,
          snapshotRunId: runId,
          productId: row.id, // BigInt → matches SnapshotProduct.productId
          // For now we only use updatedAtShopify as sortKey; you can choose another:
          sortKey: row.updatedAtShopify ?? row.createdAtShopify,
          // Any snapshot-plane fields (e.g. searchEngineVisibility) can be set here later.
        }));

        if (snapshotRows.length > 0) {
          await this.prisma.snapshotProduct.createMany({
            data: snapshotRows,
            skipDuplicates: true,
          });
        }

        processed += snapshotRows.length;

        await this.prisma.snapshotRun.update({
          where: { id: runId },
          data: { progress: processed },
        });

        if (!hasMore) break;

        const last = window[window.length - 1];
        cursor = { id: last.id };
      }

      await this.prisma.snapshotRun.update({
        where: { id: runId },
        data: {
          state: SnapshotRunState.SUCCEEDED,
          // progress holds number of rows written (processed)
          progress: processed,
        },
      });
    } catch (e: any) {
      console.error(
        `[SnapshotRunner] processRun failed for runId=${runId.toString()}:`,
        e,
      );
      await this.prisma.snapshotRun.update({
        where: { id: runId },
        data: {
          state: SnapshotRunState.FAILED,
          errorMessage: e?.message ?? String(e),
        },
      });
    }
  }
}
