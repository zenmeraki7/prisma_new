// web/jobs/snapshotRun.worker.ts
import { prisma } from "../db/prisma.js";
import { evaluateSnapshotFilterToProductGids } from "../lib/snapshots/shopifySnapshotEvaluator.js";
import type { FilterExpr } from "../lib/filters/dsl.js";

/**
 * Contract: given a snapshotRunId + filter JSON + shopId, compute the set
 * of matching product IDs via Shopify BulkOps and materialize them into
 * snapshot_products with a deterministic sortKey, then update snapshot_runs
 * state/progress.
 */
export async function processSnapshotRunJob(params: {
  snapshotRunId: string;
  shopId: string;
  filter: FilterExpr;
}) {
  const { snapshotRunId, shopId, filter } = params;

  const run = await prisma.snapshotRun.findUnique({
    where: { id: snapshotRunId },
  });

  if (!run) {
    console.warn("[SNAPSHOT] Run not found:", snapshotRunId);
    return;
  }
  if (run.shopId !== shopId) {
    console.warn(
      "[SNAPSHOT] Run shop mismatch; aborting.",
      snapshotRunId,
      "expected",
      run.shopId,
      "got",
      shopId
    );
    return;
  }

  // Mark RUNNING
  await prisma.snapshotRun.update({
    where: { id: snapshotRunId },
    data: {
      state: "RUNNING",
      progress: 0,
      total: 0,
      errorMessage: null,
    },
  });

  try {
    const set = await evaluateSnapshotFilterToProductGids({
      shopId,
      filter,
    });

    const productIds = Array.from(set);

    // Look up updatedAtShopify for sort key
    const products = await prisma.productLite.findMany({
      where: {
        shopId,
        id: { in: productIds },
      },
      select: {
        id: true,
        updatedAtShopify: true,
      },
    });
    const byId = new Map(products.map((p) => [p.id, p.updatedAtShopify]));

    const now = new Date();

    // Clear existing rows for this run
    await prisma.snapshotProduct.deleteMany({
      where: { snapshotRunId, shopId },
    });

    // Insert in batches to avoid exceeding parameter limits
    const batchSize = 500;
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);
      const data = batch.map((id) => ({
        snapshotRunId,
        shopId,
        productId: id,
        sortKey: byId.get(id) ?? now,
      }));

      await prisma.snapshotProduct.createMany({
        data,
        skipDuplicates: true,
      });

      await prisma.snapshotRun.update({
        where: { id: snapshotRunId },
        data: {
          progress: i + batch.length,
          total: productIds.length,
        },
      });
    }

    await prisma.snapshotRun.update({
      where: { id: snapshotRunId },
      data: {
        state: "SUCCEEDED",
        progress: productIds.length,
        total: productIds.length,
      },
    });

    await prisma.snapshotRunEvent.create({
      data: {
        snapshotRunId,
        shopId,
        kind: "INFO",
        message: `Snapshot completed with ${productIds.length} products.`,
      },
    });
  } catch (err: any) {
    console.error("[SNAPSHOT] Run failed", snapshotRunId, err);
    await prisma.snapshotRun.update({
      where: { id: snapshotRunId },
      data: {
        state: "FAILED",
        errorMessage:
          err?.message?.slice(0, 500) ??
          "Snapshot run failed; see logs for details.",
      },
    });
    await prisma.snapshotRunEvent.create({
      data: {
        snapshotRunId,
        shopId,
        kind: "ERROR",
        message: err?.message?.slice(0, 500) ?? "Snapshot run failed.",
      },
    });
  }
}
