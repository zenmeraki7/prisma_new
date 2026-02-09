// FILE: web/graphql/snapshots/productsBySnapshotResolver.ts

import { GraphQLError } from "graphql";
import type { PrismaClient, Prisma } from "@prisma/client";

import { astFromJson } from "../../lib/filters/astFromJson";
import { FilterPlanner } from "../../lib/filters/planner";
import type { FilterExpr } from "../../frontend/lib/filters/dsl";

interface GraphQLContext {
  prisma: PrismaClient;
  shopId: string;
}

interface ProductsBySnapshotArgs {
  input: {
    snapshotRunId: string;
    filter?: unknown;        // JSON AST from client
    first?: number | null;
    after?: string | null;   // cursor based on SnapshotProduct.id
  };
}

const SNAPSHOT_CANDIDATE_LIMIT = 2000;

export const productsBySnapshotResolver = {
  Query: {
    productsBySnapshot: async (
      _parent: unknown,
      args: ProductsBySnapshotArgs,
      ctx: GraphQLContext,
    ) => {
      const { prisma, shopId } = ctx;
      const {
        snapshotRunId: snapshotRunIdStr,
        filter: rawFilter,
        first: rawFirst = 50,
        after,
      } = args.input;

      // -------------------------------------------------------------------
      // 1. Normalize snapshotRunId & validate run
      // -------------------------------------------------------------------
      let snapshotRunId: bigint;
      try {
        snapshotRunId = BigInt(snapshotRunIdStr);
      } catch {
        throw new GraphQLError("Invalid snapshotRunId", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const run = await prisma.snapshotRun.findUnique({
        where: { id: snapshotRunId },
        select: { shopId: true, state: true, total: true, progress: true },
      });

      if (!run || run.shopId !== shopId) {
        throw new GraphQLError("Snapshot run not found for this shop", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (run.state !== "SUCCEEDED" && run.state !== "RUNNING") {
        throw new GraphQLError(
          `Snapshot run is not available (state=${run.state}).`,
          { extensions: { code: "BAD_REQUEST" } },
        );
      }

      // -------------------------------------------------------------------
      // 2. Parse AST & Plan with snapshotRunId
      // -------------------------------------------------------------------
      let filterExpr: FilterExpr | null = null;
      try {
        filterExpr = astFromJson(rawFilter);
      } catch (e: any) {
        throw new GraphQLError(`Invalid filter: ${e.message}`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const plan = FilterPlanner.plan(filterExpr, {
        shopId,
        snapshotRunId,
      });

      // `plan.snapshotQuery` is a Prisma.SnapshotProductWhereInput
      // with shopId + snapshotRunId enforced by snapshotCompiler.
      const snapshotWhere: Prisma.SnapshotProductWhereInput =
        plan.snapshotQuery || { shopId, snapshotRunId };

      // FAST plane query is used to further constrain ProductLite
      const fastWhere: Prisma.ProductLiteWhereInput = plan.fastQuery || {};

      // -------------------------------------------------------------------
      // 3. Guardrail: Candidate Count on SnapshotProduct
      // -------------------------------------------------------------------
      const candidateCount = await prisma.snapshotProduct.count({
        where: snapshotWhere,
      });

      const guardrail = {
        candidateCount,
        candidateLimit: SNAPSHOT_CANDIDATE_LIMIT,
        candidateLimitHit: candidateCount > SNAPSHOT_CANDIDATE_LIMIT,
      };

      // (Optional) If you want to hard-stop ridiculous queries:
      // if (candidateCount > HARD_LIMIT) { throw new GraphQLError(...) }

      // -------------------------------------------------------------------
      // 4. Cursor logic on SnapshotProduct.id
      // -------------------------------------------------------------------
      const take = clampFirst(rawFirst);
      let cursor: { id: bigint } | undefined;
      if (after) {
        try {
          const idStr = Buffer.from(after, "base64").toString("utf8");
          cursor = { id: BigInt(idStr) };
        } catch {
          throw new GraphQLError("Invalid cursor format", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }
      }

      // -------------------------------------------------------------------
      // 5. Fetch candidate Snapshot rows (membership IDs)
      // -------------------------------------------------------------------
      const snapshotRows = await prisma.snapshotProduct.findMany({
        where: snapshotWhere,
        take: take + 1,       // +1 for hasNext
        skip: cursor ? 1 : 0,
        cursor,
        orderBy: { sortKey: "asc" }, // Or { id: "asc" } if you prefer
        select: { id: true, productId: true },
      });

      const hasNextPage = snapshotRows.length > take;
      const window = hasNextPage
        ? snapshotRows.slice(0, take)
        : snapshotRows;

      if (window.length === 0) {
        return {
          items: [],
          nextCursor: null,
          mode: plan.meta.snapshotFiltersCount > 0
            ? "SNAPSHOT_ONLY"
            : "FAST_ONLY",
          guardrail,
        };
      }

      const nextCursor = hasNextPage
        ? Buffer.from(
            window[window.length - 1].id.toString(),
            "utf8",
          ).toString("base64")
        : null;

      const productIds = window.map((r) => r.productId);

      // -------------------------------------------------------------------
      // 6. Fetch ProductLite rows with FAST where + id IN productIds
      // -------------------------------------------------------------------
      const productWhere: Prisma.ProductLiteWhereInput = {
        AND: [
          { id: { in: productIds } },
          fastWhere,
        ],
      };

      const productRows = await prisma.productLite.findMany({
        where: productWhere,
        // Order by id to keep deterministic relation to snapshotRows
        orderBy: { id: "asc" },
      });

      // Map to bootstrap-compatible nodes
      const items = productRows.map(mapProductLiteNode);

      const mode =
        plan.meta.fastFiltersCount > 0 && plan.meta.snapshotFiltersCount > 0
          ? "HYBRID"
          : plan.meta.snapshotFiltersCount > 0
          ? "SNAPSHOT_ONLY"
          : "FAST_ONLY";

      return {
        items,
        nextCursor,
        mode,
        guardrail,
      };
    },
  },
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function mapProductLiteNode(
  row: Prisma.ProductLiteGetPayload<{ include?: {} }>,
) {
  return {
    id: row.id.toString(),
    productId: row.productId,
    title: row.title,
    handle: row.handle,
    status: row.status,
    vendor: row.vendor,
    productType: row.productType,
    tags: row.tags,
    hasImages: row.hasImages,
    updatedAtShopify: row.updatedAtShopify.toISOString(),
  };
}

function clampFirst(rawFirst: number | null | undefined): number {
  const n = typeof rawFirst === "number" ? rawFirst : 50;
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, 250);
}
