// FILE: web/graphql/resolvers/fastProducts.ts

import { GraphQLError } from "graphql";
import type { PrismaClient, Prisma } from "@prisma/client";

import { astFromJson } from "../../lib/filters/astFromJson";
import { FilterPlanner } from "../../lib/filters/planner";

interface GraphQLContext {
  prisma: PrismaClient;
  shopId: string;
}

interface FastProductsArgs {
  first?: number | null;
  after?: string | null;
  filter?: unknown; // JSON AST (FilterExpr)
  sort?: {
    field:
      | "TITLE"
      | "CREATED_AT"
      | "UPDATED_AT"
      | "PUBLISHED_AT"
      | "TOTAL_INVENTORY"
      | "VARIANT_COUNT";
    direction: "ASC" | "DESC";
  } | null;
}

export const fastProductsResolvers = {
  Query: {
    fastProducts: async (
      _parent: unknown,
      args: FastProductsArgs,
      ctx: GraphQLContext,
    ) => {
      const { prisma, shopId } = ctx;
      const {
        filter: rawFilter,
        first: rawFirst = 50,
        after,
        sort,
      } = args;

      // 1. Parse Filter
      let filterExpr = null;
      try {
        filterExpr = astFromJson(rawFilter);
      } catch (e: any) {
        throw new GraphQLError(`Invalid filter: ${e?.message ?? String(e)}`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      // 2. Plan Filter
      const plan = FilterPlanner.plan(filterExpr, { shopId });

      if (plan.meta.snapshotFiltersCount > 0) {
        throw new GraphQLError(
          "This query only supports FAST-plane filters.",
          { extensions: { code: "BAD_USER_INPUT" } },
        );
      }

      const where = plan.fastQuery;

      // 3. Sorting & Pagination
      const take = clampFirst(rawFirst);
      const orderBy = mapSortToOrderBy(sort);

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

      // 4. Prisma Query
      const items = await prisma.productLite.findMany({
        where,
        take: take + 1,
        skip: cursor ? 1 : 0,
        cursor,
        orderBy,
      });

      const hasNextPage = items.length > take;
      const nodes = hasNextPage ? items.slice(0, take) : items;

      const edges = nodes.map((row) => ({
        cursor: Buffer.from(row.id.toString(), "utf8").toString("base64"),
        node: mapProductNode(row),
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: Boolean(after),
          startCursor: edges[0]?.cursor ?? null,
          endCursor: edges[edges.length - 1]?.cursor ?? null,
        },
      };
    },
  },
};

// ---------------- HELPERS ----------------

function mapProductNode(row: Prisma.ProductLiteGetPayload<{}>) {
  return {
    id: row.id.toString(),
    title: row.title,
    handle: row.handle,
    status: row.status,
    vendor: row.vendor,
    productType: row.productType,
    tags: row.tags,
    hasImages: row.hasImages,
    updatedAtShopify: row.updatedAtShopify.toISOString(),
    totalInventory: row.totalInventory ?? 0,
    variantCount: row.variantCount ?? 0,
  };
}

function mapSortToOrderBy(
  sort: FastProductsArgs["sort"],
): Prisma.ProductLiteOrderByWithRelationInput {
  const dir = sort?.direction === "DESC" ? "desc" : "asc";
  const field = sort?.field ?? "CREATED_AT";

  switch (field) {
    case "TITLE":
      return { title: dir };

    case "CREATED_AT":
      return { createdAtShopify: dir };

    case "UPDATED_AT":
      return { updatedAtShopify: dir };

    case "PUBLISHED_AT":
      return { publishedAtShopify: dir };

    case "TOTAL_INVENTORY":
      return { totalInventory: dir };

    case "VARIANT_COUNT":
      return { variantCount: dir };

    default:
      return { createdAtShopify: "desc" };
  }
}

function clampFirst(rawFirst: number | null | undefined): number {
  const n = typeof rawFirst === "number" ? rawFirst : 50;
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, 250);
}
