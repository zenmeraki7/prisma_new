// web/graphql/snapshots/resolvers.ts
import { createSnapshot } from "../../graphql/createSnapshot.js";
import { generateCSV, generateJSON } from "../lib/exportGenerator.js";
import { prisma } from "../db/prisma.js";
import type { GraphQLContext } from "../graphql/schema.js";

// Type definitions for resolver arguments
type SnapshotStatusArgs = {
  snapshotRunId: string;
};

type CreateSnapshotArgs = {
  productIds: string[];
};

type DownloadExportArgs = {
  snapshotRunId: string;
  format: string;
};

export const snapshotResolvers = {
  Query: {
    // Get snapshot status
    snapshotStatus: async (
      _parent: unknown,
      args: SnapshotStatusArgs,
      ctx: GraphQLContext
    ) => {
      const { snapshotRunId } = args;
      const { shopId } = ctx;

      const snapshot = await prisma.snapshotRun.findUnique({
        where: { id: snapshotRunId },
      });

      if (!snapshot || snapshot.shopId !== shopId) {
        return null;
      }

      return snapshot;
    },
  },

  Mutation: {
    // Create snapshot from product IDs
    createSnapshot: async (
      _parent: unknown,
      args: CreateSnapshotArgs,
      ctx: GraphQLContext
    ) => {
      const { productIds } = args;
      const { shopId } = ctx;

      const result = await createSnapshot(shopId, productIds);
      return result;
    },

    // Download export
    downloadExport: async (
      _parent: unknown,
      args: DownloadExportArgs,
      ctx: GraphQLContext
    ) => {
      const { snapshotRunId, format } = args;
      const { shopId } = ctx;

      const snapshot = await prisma.snapshotRun.findUnique({
        where: { id: snapshotRunId },
      });

      if (!snapshot || snapshot.shopId !== shopId) {
        throw new Error("Snapshot not found");
      }

      if (snapshot.state !== "SUCCEEDED") {
        throw new Error("Snapshot not ready");
      }

      let data: string;
      if (format === "csv") {
        data = await generateCSV(snapshotRunId, shopId);
      } else {
        data = await generateJSON(snapshotRunId, shopId);
      }

      return {
        data,
        filename: `export-${snapshotRunId}.${format}`,
      };
    },
  },
};