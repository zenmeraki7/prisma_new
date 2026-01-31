// web/graphql/snapshots/mutations/createSnapshotFromFilter.ts
import { prisma } from "../../db/prisma.js";
import crypto from "crypto";
import { astFromJson } from "../../lib/filters/astFromJson.js";
import { compileFastWhere } from "../../lib/filters/fastCompiler.js";
import { FILTER_REGISTRY } from "../../lib/filters/registry.js";

export async function createSnapshotFromFilter(
  shopId: string,
  rawFilter: unknown
) {
  // 1. Parse filter JSON
  const expr = astFromJson(rawFilter);

  // 2. Create hash from FILTER (not products)
  const planHash = crypto
    .createHash("md5")
    .update(JSON.stringify(rawFilter))
    .digest("hex");

  // 3. Reuse existing snapshot
  const existing = await prisma.snapshotRun.findFirst({
    where: {
      shopId,
      planHash,
      state: "SUCCEEDED",
      expiresAt: { gt: new Date() },
    },
  });

  if (existing) {
    return existing;
  }

  // 4. Create snapshotRun
  const snapshot = await prisma.snapshotRun.create({
    data: {
      shopId,
      planHash,
      filterSummary: "Snapshot from filter",
      state: "RUNNING",
      progress: 0,
      total: 0,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // 5. Run FAST filter ONCE
  const where = {
    shopId,
    ...compileFastWhere(expr, FILTER_REGISTRY),
  };

  const products = await prisma.productLite.findMany({
    where,
    select: { id: true },
  });
console.log('🔍SNAPSHOT DEBUG:',{
  shopId,
  planHash,
  productsFound: products.length,
  where:JSON.stringify(where,null,2),
})
  // 6. Save results
  const baseTime = Date.now();
  await prisma.snapshotProduct.createMany({
    data: products.map((p, index) => ({
      snapshotRunId: snapshot.id,
      shopId,
      productId: p.id,
      sortKey: new Date(baseTime + index), // Each product gets +1ms offset
    })),
  });

  // 7. Mark as completed
  await prisma.snapshotRun.update({
    where: { id: snapshot.id },
    data: {
      state: "SUCCEEDED",
      progress: products.length,
      total: products.length,
    },
  });

  return snapshot;
}