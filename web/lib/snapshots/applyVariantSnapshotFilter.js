import { prisma } from "../../db/prisma.js";

/**
 * @typedef {Object} VariantFilter
 * @property {string} key
 * @property {string} op
 * @property {any} value
 * @property {any} [value2]
 */

/**
 * @param {Object} params
 * @param {string} params.planHash
 * @param {VariantFilter[]} params.filters
 * @returns {Promise<string[]>}
 */
export async function applyVariantSnapshotFilter({
  planHash,
  filters,
}) {
  // In the new architecture, the snapshot worker (runSnapshot.ts)
  // ALREADY evaluated the filters and saved the matching product IDs
  // into the SnapshotProduct table for this run.
  //
  // So we just need to:
  // 1. Find the latest SUCCEEDED SnapshotRun for this planHash.
  // 2. Return the productIds linked to it.

  // 1. Find successful run
  const run = await prisma.snapshotRun.findFirst({
    where: {
      planHash,
      state: "SUCCEEDED",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!run) {
    return [];
  }

  // 2. Get products
  const snapshotProducts = await prisma.snapshotProduct.findMany({
    where: { snapshotRunId: run.id },
    select: { productId: true },
  });

  return snapshotProducts.map((p) => p.productId);
}
