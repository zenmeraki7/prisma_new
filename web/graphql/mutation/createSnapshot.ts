// web/graphql/snapshots/mutations/createSnapshot.ts
import { prisma } from "../../db/prisma.js";
import crypto from "crypto";

type CreateSnapshotResult = {
  snapshotRunId: string;
  reused: boolean;
};

export async function createSnapshot(
  shopId: string,
  productIds: string[]
): Promise<CreateSnapshotResult> {
  // Create a simple hash from product IDs
  const planHash = crypto
    .createHash("md5")
    .update(productIds.sort().join(","))
    .digest("hex");

  // Check if snapshot already exists
  const existing = await prisma.snapshotRun.findFirst({
    where: {
      shopId,
      planHash,
      state: "SUCCEEDED",
      expiresAt: { gt: new Date() },
    },
  });

  if (existing) {
    return { snapshotRunId: existing.id, reused: true };
  }

  // Create new snapshot
  const snapshot = await prisma.snapshotRun.create({
    data: {
      shopId,
      planHash,
      filterSummary: `${productIds.length} selected products`,
      state: "PENDING",
      progress: 0,
      total: productIds.length,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  // Save product IDs to snapshot
  await prisma.snapshotProduct.createMany({
    data: productIds.map((productId) => ({
      snapshotRunId: snapshot.id,
      shopId,
      productId,
      sortKey: new Date(),
    })),
  });

  // Update to succeeded
  await prisma.snapshotRun.update({
    where: { id: snapshot.id },
    data: {
      state: "SUCCEEDED",
      progress: productIds.length,
    },
  });

  return { snapshotRunId: snapshot.id, reused: false };
}