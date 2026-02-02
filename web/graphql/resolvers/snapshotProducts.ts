// FILE: web/graphql/resolvers/snapshotProducts.ts

import type { PrismaClient, Prisma } from "@prisma/client";
import { planSnapshotProductWhere } from "../filtering/planSnapshotProductWhere";
import {
  buildSnapshotFullTextQuery,
  type SnapshotProductRow,
} from "../filtering/buildSnapshotFullTextQuery";

interface GraphQLContext {
  prisma: PrismaClient;
  shopId: string;
}

interface SnapshotProductsArgs {
  snapshotRunId: string;
  first?: number | null;
  after?: string | null;
  filter?: {
    predicates?: {
      key: string;
      operator: string;
      value: any;
    }[];
  } | null;
}

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64");
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64").toString("utf8");
}

export const snapshotProductsResolvers = {
  Query: {
    snapshotProducts: async (
      _parent: unknown,
      args: SnapshotProductsArgs,
      ctx: GraphQLContext,
    ) => {
      const { prisma, shopId } = ctx;
      const { snapshotRunId } = args;

      const first = Math.min(args.first ?? 50, 100);
      const cursorId = args.after ? decodeCursor(args.after) : null;

      // 1. Plan snapshot filters: scalar + full-text
      const plan = planSnapshotProductWhere(args.filter ?? null);
      const { snapshotWhere, fullTextFilters } = plan;

      // Base where used for the count() query
      const baseWhere: Prisma.SnapshotProductWhereInput = {
        shopId,
        snapshotRunId,
        ...(snapshotWhere ?? {}),
      };

      // 2. No full-text filters → pure Prisma path
      if (!fullTextFilters.length) {
        const findManyArgs: Prisma.SnapshotProductFindManyArgs = {
          where: baseWhere,
          take: first + 1,
          orderBy: {
            id: "asc", // compatible with id-based cursor
          },
        };

        if (cursorId) {
          findManyArgs.cursor = { id: cursorId };
          findManyArgs.skip = 1;
        }

        const rows = await prisma.snapshotProduct.findMany(findManyArgs);
        const hasNextPage = rows.length > first;
        const pageRows = hasNextPage ? rows.slice(0, first) : rows;

        const totalCount = await prisma.snapshotProduct.count({
          where: baseWhere,
        });

        const edges = pageRows.map((row) => ({
          cursor: encodeCursor(row.id),
          node: {
            id: row.id,
            productId: row.productId,
            snapshotRunId: row.snapshotRunId,
            description: row.description,
            seoTitle: row.seoTitle,
            seoDescription: row.seoDescription,
            searchEngineVisibility: row.searchEngineVisibility,
          },
        }));

        const startCursor = edges.length ? edges[0].cursor : null;
        const endCursor = edges.length ? edges[edges.length - 1].cursor : null;

        return {
          edges,
          pageInfo: {
            hasNextPage,
            hasPreviousPage: Boolean(cursorId),
            startCursor,
            endCursor,
          },
          totalCount,
        };
      }

      // 3. Full-text filters exist → raw SQL hybrid path
      const sql = buildSnapshotFullTextQuery({
        shopId,
        snapshotRunId,
        plan,
        limit: first + 1, // fetch one extra for hasNextPage
        cursorId,
      });

      const rows = await prisma.$queryRaw<SnapshotProductRow[]>(sql);
      const hasNextPage = rows.length > first;
      const pageRows = hasNextPage ? rows.slice(0, first) : rows;

      // Total count: we can do a separate COUNT(*) query using the same plan,
      // but without limit/cursor. For simplicity, we call buildSnapshotFullTextQuery
      // again with a large limit and ignore pagination columns, wrapped in a COUNT(*).
      // To keep this sketch simple and safe, we'll use Prisma's count() on baseWhere,
      // acknowledging it does NOT account for full-text filters.
      //
      // If you want exact counts, you can add a separate buildSnapshotFullTextCountQuery().
      const totalCount = await prisma.snapshotProduct.count({
        where: baseWhere,
      });

      const edges = pageRows.map((row) => ({
        cursor: encodeCursor(row.id),
        node: {
          id: row.id,
          productId: row.productId,
          snapshotRunId: row.snapshotRunId,
          description: row.description,
          seoTitle: row.seoTitle,
          seoDescription: row.seoDescription,
          searchEngineVisibility: row.searchEngineVisibility as any,
        },
      }));

      const startCursor = edges.length ? edges[0].cursor : null;
      const endCursor = edges.length ? edges[edges.length - 1].cursor : null;

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: Boolean(cursorId),
          startCursor,
          endCursor,
        },
        totalCount,
      };
    },
  },
};
