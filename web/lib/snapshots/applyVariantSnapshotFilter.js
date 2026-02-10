import { prisma } from "../../db/prisma.js";

/**
 * @typedef {Object} VariantFilter
 * @property {string} key
 * @property {string} op
 * @property {any} value
 * @property {any} [value2]
 */

/**
 * Deterministic planHash from filters (key, op, value) so snapshotFilter and trigger use the same run.
 * Must match the hash used when creating the run (e.g. from triggerSnapshotRun with same filters).
 * @param {VariantFilter[]} filters
 * @returns {string}
 */
export function computePlanHashFromFilters(filters) {
  if (!filters?.length) return "pf_0";
  const clauses = [...filters]
    .filter((f) => f && typeof f.key === "string")
    .map((f) => ({ key: f.key, op: f.op, value: f.value }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const ast = { op: "and", clauses, groups: [] };
  const json = JSON.stringify(ast);
  let hash = 0;
  for (let i = 0; i < json.length; i += 1) {
    const chr = json.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return `pf_${(hash >>> 0).toString(16)}`;
}

/**
 * @param {Object} params
 * @param {string} [params.planHash] - optional; if omitted, computed from filters
 * @param {string} params.shopId
 * @param {VariantFilter[]} params.filters
 * @returns {Promise<string[]>}
 */
export async function applyVariantSnapshotFilter({
  planHash: planHashParam,
  shopId,
  filters,
}) {
  // Use server-computed planHash from filters so frontend doesn't need to match trigger's planHash
  const planHash =
    planHashParam && typeof planHashParam === "string"
      ? planHashParam
      : computePlanHashFromFilters(filters ?? []);

  // 1. Find successful run (scoped by shop)
  const run = await prisma.snapshotRun.findFirst({
    where: {
      planHash,
      shopId,
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
