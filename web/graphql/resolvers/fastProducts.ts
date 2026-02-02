// FILE: web/graphql/resolvers/fastProducts.ts

import type { PrismaClient, Prisma } from "@prisma/client";
import {
  FilterPlanner,
  type UserFilter,
} from "../../lib/filters/planner";
import {
  FILTER_REGISTRY,
  type FilterKey,
  type FilterOperator,
} from "../../lib/filters/registry";

/**
 * Your GraphQL context should provide:
 * - prisma: PrismaClient instance
 * - shopId: the current shop's ID (multi-tenant isolation)
 */
interface GraphQLContext {
  prisma: PrismaClient;
  shopId: string;
}

/**
 * Args type matching fastProducts GraphQL query.
 * If you use codegen, replace with the generated type.
 */
interface FastProductsArgs {
  first?: number | null;
  after?: string | null;
  filter?: {
    predicates?: {
      key: string;
      operator: string;
      value: any;
    }[];
  } | null;
  sort?: {
    field: "TITLE" | "CREATED_AT" | "UPDATED_AT" | "PUBLISHED_AT" | "TOTAL_INVENTORY" | "VARIANT_COUNT";
    direction: "ASC" | "DESC";
  } | null;
}

/**
 * Return type matching FastProductConnection.
 * Again, you can replace with generated types if available.
 */
interface FastProductConnection {
  edges: {
    cursor: string;
    node: any;
  }[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  totalCount: number;
}

// --- Helpers: cursor encoding/decoding ---

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64");
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64").toString("utf8");
}

// --- Helper: map sort input to Prisma orderBy ---

function mapSortToOrderBy(
  sort: FastProductsArgs["sort"],
): Prisma.ProductLiteOrderByWithRelationInput {
  if (!sort) {
    // Default sort: createdAtShopify DESC, id DESC (stable)
    return { createdAtShopify: "desc", id: "desc" };
  }

  const dir = sort.direction === "DESC" ? "desc" : "asc";

  switch (sort.field) {
    case "TITLE":
      return { title: dir, id: "asc" };
    case "CREATED_AT":
      return { createdAtShopify: dir, id: "asc" };
    case "UPDATED_AT":
      return { updatedAtShopify: dir, id: "asc" };
    case "PUBLISHED_AT":
      return { publishedAtShopify: dir, id: "asc" };
    case "TOTAL_INVENTORY":
      return { totalInventory: dir, id: "asc" };
    case "VARIANT_COUNT":
      return { variantCount: dir, id: "asc" };
    default:
      return { createdAtShopify: "desc", id: "desc" };
  }
}

// --- Helper: convert GraphQL predicates → UserFilter[] ---

function buildUserFiltersFromArgs(args: FastProductsArgs): UserFilter[] {
  const predicates = args.filter?.predicates ?? [];
  const userFilters: UserFilter[] = [];

  for (const p of predicates) {
    const key = p.key as FilterKey;
    const operator = p.operator as FilterOperator;

    if (!FILTER_REGISTRY[key]) {
      console.warn(`[fastProducts] Unknown filter key from client: ${p.key}`);
      continue;
    }

    // We rely on runtime validation for operator; if it doesn't exist
    // in the registry for that key, the planner will log/warn.
    userFilters.push({
      key,
      operator,
      value: p.value,
    });
  }

  return userFilters;
}

// --- Main resolver implementation ---

export const fastProductsResolvers = {
  Query: {
    fastProducts: async (
      _parent: unknown,
      args: FastProductsArgs,
      ctx: GraphQLContext,
    ): Promise<FastProductConnection> => {
      const { prisma, shopId } = ctx;

      // 1. Convert GraphQL filter input → UserFilter[]
      const userFilters = buildUserFiltersFromArgs(args);

      // 2. Delegate to FilterPlanner (FAST vs SNAPSHOT plane)
      const planResult = FilterPlanner.plan(userFilters);
      const fastWhere = planResult.fastQuery;

      // NOTE:
      // - planResult.snapshotTasks holds SNAPSHOT-plane filters (SEO, description, etc.)
      //   You can consume these later via snapshot/bulk-ops pipeline.

      // 3. Multi-tenant safety: ALWAYS scope by shopId
      const where: Prisma.ProductLiteWhereInput = {
        shopId,
        // Planner may add AND conditions, variant some, array filters, etc.
        ...fastWhere,
      };

      // 4. Cursor-based pagination
      const first = Math.min(args.first ?? 50, 100);
      const orderBy = mapSortToOrderBy(args.sort);

      const findManyArgs: Prisma.ProductLiteFindManyArgs = {
        where,
        take: first + 1, // fetch one extra to detect hasNextPage
        orderBy,
      };

      if (args.after) {
        const decodedId = decodeCursor(args.after);
        findManyArgs.cursor = { id: decodedId };
        findManyArgs.skip = 1; // skip the cursor row itself
      }

      // 5. Execute FAST plane query
      const rows = await prisma.productLite.findMany(findManyArgs);

      const hasNextPage = rows.length > first;
      const pageRows = hasNextPage ? rows.slice(0, first) : rows;

      // 6. Compute total count (separate query)
      const totalCount = await prisma.productLite.count({ where });

      const edges = pageRows.map((row) => ({
        cursor: encodeCursor(row.id),
        node: {
          id: row.id,
          productId: row.productId,
          title: row.title,
          vendor: row.vendor,
          productType: row.productType,
          category: row.category,
          handle: row.handle,
          templateSuffix: row.templateSuffix,
          status: row.status,
          onlineStoreVisible: row.onlineStoreVisible,
          posVisible: row.posVisible,
          createdAtShopify: row.createdAtShopify.toISOString(),
          updatedAtShopify: row.updatedAtShopify.toISOString(),
          publishedAtShopify: row.publishedAtShopify
            ? row.publishedAtShopify.toISOString()
            : null,
          totalInventory: row.totalInventory,
          variantCount: row.variantCount,
          tags: row.tags ?? [],
          collections: row.collections ?? [],
        },
      }));

      const startCursor =
        edges.length > 0 ? edges[0].cursor : null;
      const endCursor =
        edges.length > 0 ? edges[edges.length - 1].cursor : null;

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: Boolean(args.after),
          startCursor,
          endCursor,
        },
        totalCount,
      };
    },
  },
};
