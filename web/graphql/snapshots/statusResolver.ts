// FILE: web/graphql/snapshots/statusResolver.ts

import { GraphQLError } from "graphql";
import type { PrismaClient } from "@prisma/client";

interface GraphQLContext {
  prisma: PrismaClient;
  shopId: string;
}

interface SnapshotStatusArgs {
  id: string; // GraphQL ID → SnapshotRun.id BigInt
}

export const snapshotStatusResolver = {
  Query: {
    snapshotStatus: async (
      _parent: unknown,
      args: SnapshotStatusArgs,
      ctx: GraphQLContext,
    ) => {
      const { prisma, shopId } = ctx;
      const { id } = args;

      let runId: bigint;
      try {
        runId = BigInt(id);
      } catch {
        throw new GraphQLError("Invalid snapshot run ID", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const run = await prisma.snapshotRun.findUnique({
        where: { id: runId },
        select: {
          id: true,
          shopId: true,
          state: true,
          progress: true,
          total: true,
          errorMessage: true,
          createdAt: true,
        },
      });

      if (!run || run.shopId !== shopId) {
        throw new GraphQLError("Snapshot run not found for this shop", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      return {
        id: run.id.toString(),
        state: run.state,
        progress: run.progress,
        total: run.total,
        errorMessage: run.errorMessage,
        createdAt: run.createdAt.toISOString(),
      };
    },
  },
};
