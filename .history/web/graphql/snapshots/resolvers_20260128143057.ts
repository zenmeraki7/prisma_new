// web/graphql/snapshots/resolvers.ts
import { prisma } from "../../db/prisma.js";
import type { GraphQLContext } from "../schema.js";

// Import export functions
import { createSnapshot } from "../mutations/createSnapshot.js";
import { generateCSV, generateJSON } from "../../lib/exportGenerator.js";

// Type definitions for existing resolver arguments
type SnapshotStatusArgs = {
  planHash: string;
};

type ProductsBySnapshotArgs = {
  planHash: string;
  first?: number;
  after?: string | null;
};

// Type definitions for new export resolver arguments
type CreateSnapshotArgs = {
  productIds: string[];
};

type DownloadExportArgs = {
  snapshotRunId: string;
  format: string;
};

type SnapshotCursorPayload = {
  sortKey: Date;
  productId: string;
};

function encodeSnapshotCursor(payload: SnapshotCursorPayload): string {
  const json = JSON.stringify({
    s: payload.sortKey.toISOString(),
    p: payload.productId,
  });
  return Buffer.from(json, "utf8").toString("base64");
}

function decodeSnapshotCursor(cursor: string): SnapshotCursorPayload {
  const json = Buffer.from(cursor, "base64").toString("utf8");
  const obj = JSON.parse(json) as { s: string; p: string };
  const d = new Date(obj.s);
  if (Number.isNaN(d.getTime())) {
    throw new Error("productsBySnapshot: invalid cursor (bad date).");
  }
  return { sortKey: d, productId: obj.p };
}

function clampFirst(raw: number | undefined): number {
  const n = typeof raw === "number" ? raw : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(n, 1), 200);
}

// EXISTING RESOLVER: snapshotStatus
export async function snapshotStatusResolver(
  _parent: unknown,
  args: SnapshotStatusArgs,
  ctx: GraphQLContext
) {
  const { shopId } = ctx;
  const { planHash } = args;

  const latestRun = await prisma.snapshotRun.findFirst({
    where: { shopId, planHash },
    orderBy: { createdAt: "desc" },
  });

  if (!latestRun) {
    return {
      state: "PENDING",
      progress: 0,
      total: 0,
      errorMessage: null,
      filterSummary: "Not started",
      planHash,
      snapshotRunId: null,
    };
  }

  return {
    state: latestRun.state,
    progress: latestRun.progress,
    total: latestRun.total,
    errorMessage: latestRun.errorMessage,
    filterSummary: latestRun.filterSummary,
    planHash,
    snapshotRunId: latestRun.id,
  };
}

// EXISTING RESOLVER: productsBySnapshot
export async function productsBySnapshotResolver(
  _parent: unknown,
  args: ProductsBySnapshotArgs,
  ctx: GraphQLContext
) {
  const { shopId } = ctx;
  const { planHash } = args;
  const first = clampFirst(args.first);

  const now = new Date();

  const run = await prisma.snapshotRun.findFirst({
    where: {
      shopId,
      planHash,
      state: "SUCCEEDED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!run) {
    return {
      items: [],
      nextCursor: null,
      snapshotRunId: null,
    };
  }

  const cursor = args.after ? decodeSnapshotCursor(args.after) : null;

  const where: any = {
    snapshotRunId: run.id,
    shopId,
  };

  if (cursor) {
    const { sortKey, productId } = cursor;
    where.OR = [
      { sortKey: { lt: sortKey } },
      {
        sortKey,
        productId: { gt: productId },
      },
    ];
  }

  const rows = await prisma.snapshotProduct.findMany({
    where,
    orderBy: [
      { sortKey: "desc" },
      { productId: "asc" },
    ],
    take: first + 1,
  });

  let nextCursor: string | null = null;
  const pageRows = rows.slice(0, first);
  if (rows.length > first && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = encodeSnapshotCursor({
      sortKey: last.sortKey ?? new Date(0),
      productId: last.productId,
    });
  }

  const productIds = pageRows.map((r) => r.productId);
  if (productIds.length === 0) {
    return {
      items: [],
      nextCursor,
      snapshotRunId: run.id,
    };
  }

  const products = await prisma.productLite.findMany({
    where: {
      shopId,
      id: { in: productIds },
    },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const ordered = productIds
    .map((id) => byId.get(id))
    .filter((p): p is (typeof products)[number] => !!p);

  return {
    items: ordered,
    nextCursor,
    snapshotRunId: run.id,
  };
}

// NEW: Export mutations object
export const snapshotResolvers = {
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