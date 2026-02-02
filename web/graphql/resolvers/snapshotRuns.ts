// FILE: web/graphql/resolvers/snapshotRuns.ts

import type { PrismaClient, SnapshotRunStatus as PrismaSnapshotRunStatus } from "@prisma/client";

interface GraphQLContext {
  prisma: PrismaClient;
  shopId: string;
}

interface SnapshotRunsArgs {
  first?: number | null;
  after?: string | null;
  filter?: {
    status?: "QUEUED" | "RUNNING" | "INGESTING" | "COMPLETED" | "FAILED" | null;
  } | null;
}

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64");
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64").toString("utf8");
}

export const snapshotRunsResolvers = {
  Query: {
    snapshotRuns: async (
      _parent: unknown,
      args: SnapshotRunsArgs,
      ctx: GraphQLContext,
    ) => {
      const { prisma, shopId } = ctx;
      const first = Math.min(args.first ?? 20, 100);

      const where: Parameters<PrismaClient["snapshotRun"]["findMany"]>[0]["where"] = {
        shopId,
      };

      if (args.filter?.status) {
        where.status = args.filter.status as PrismaSnapshotRunStatus;
      }

      const findManyArgs: Parameters<PrismaClient["snapshotRun"]["findMany"]>[0] =
        {
          where,
          take: first + 1,
          orderBy: {
            createdAt: "desc",
          },
        };

      if (args.after) {
        const decodedId = decodeCursor(args.after);
        findManyArgs.cursor = { id: decodedId };
        findManyArgs.skip = 1;
      }

      const rows = await prisma.snapshotRun.findMany(findManyArgs);
      const hasNextPage = rows.length > first;
      const pageRows = hasNextPage ? rows.slice(0, first) : rows;

      const totalCount = await prisma.snapshotRun.count({ where });

      const edges = pageRows.map((run) => ({
        cursor: encodeCursor(run.id),
        node: {
          id: run.id,
          shopId: run.shopId,
          status: run.status,
          createdAt: run.createdAt.toISOString(),
          updatedAt: run.updatedAt.toISOString(),
          bulkOperationId: run.bulkOperationId,
          bulkOperationStatus: run.bulkOperationStatus,
          bulkOperationUrl: run.bulkOperationUrl,
          errorMessage: run.errorMessage,
          candidateCount: run.candidateCount,
          filterJson: run.filterJson,
        },
      }));

      const startCursor = edges.length ? edges[0].cursor : null;
      const endCursor = edges.length ? edges[edges.length - 1].cursor : null;

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
