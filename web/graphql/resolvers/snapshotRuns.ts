// FILE: web/graphql/resolvers/snapshotRuns.ts
import type { PrismaClient } from "@prisma/client";

interface GraphQLContext {
  prisma: PrismaClient;
  shopId: string;
}

interface SnapshotRunsArgs {
  first?: number | null;
  after?: string | null;
}

function encodeCursor(id: bigint): string {
  return Buffer.from(id.toString(), "utf8").toString("base64");
}

function decodeCursor(cursor: string): bigint {
  const decoded = Buffer.from(cursor, "base64").toString("utf8");
  return BigInt(decoded);
}

export const snapshotRunsResolvers = {
  Query: {
    snapshotRuns: async (
      _parent: unknown,
      args: SnapshotRunsArgs,
      ctx: GraphQLContext
    ) => {
      const { prisma, shopId } = ctx;
      const first = args.first ?? 25;

      const cursorId =
        args.after != null && args.after !== ""
          ? decodeCursor(args.after)
          : null;

      const where = { shopId };

      const [rows, totalCount] = await Promise.all([
        prisma.snapshotRun.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: first + 1,
          ...(cursorId && {
            cursor: { id: cursorId },
            skip: 1,
          }),
        }),
        prisma.snapshotRun.count({ where }),
      ]);

      const hasNextPage = rows.length > first;
      const pageRows = hasNextPage ? rows.slice(0, first) : rows;

      const edges = pageRows.map((run) => ({
        cursor: encodeCursor(run.id as bigint),
        node: {
          id: (run.id as bigint).toString(),
          shopId: run.shopId,
          status: run.status, // ✅ Prisma field is `status`
          progress: run.progress,
          total: run.total,
          filterSummary: run.filterSummary,
          planHash: run.planHash,
          errorMessage: run.errorMessage,
          createdAt: run.createdAt.toISOString(),
          updatedAt: run.updatedAt.toISOString(),
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
          hasPreviousPage: false, // not implemented yet
          startCursor,
          endCursor,
        },
        totalCount,
      };
    },
  },
};
