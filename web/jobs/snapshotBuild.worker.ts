import { createWorker } from "../workers/bootstrap";
import { prisma } from "../db/prisma";
import { compressSnapshot } from "../lib/compression/snapshotCompression";
import { computeSnapshotTtl } from "../graphql/snapshots/ttlPolicy";
import type { CompressionAlgo } from "../lib/compression/snapshotCompression";

/**
 * Job payload: snapshotRunId only
 * NEVER trust filter / plan in job payload
 */
type SnapshotBuildJob = {
  snapshotRunId: string;
};

const COMPRESSION: CompressionAlgo = "zstd";

createWorker<SnapshotBuildJob>("snapshot-build", async ({ snapshotRunId }) => {
  const run = await prisma.snapshotRun.findUnique({
    where: { id: snapshotRunId },
  });

  // Idempotency guard
  if (!run || run.state !== "QUEUED") {
    return;
  }

  // Move to RUNNING (atomic)
  await prisma.snapshotRun.update({
    where: { id: snapshotRunId },
    data: { state: "RUNNING" },
  });

  let productCount = 0;
  let approxBytes = 0n;

  /**
   * IMPORTANT:
   * Replace this with your real Bulk Operation stream reader.
   * The contract is: async iterable of plain JS objects.
   */
  const bulkStream = getBulkOperationStream(run.shopId, run.planHash);

  for await (const product of bulkStream) {
    const json = Buffer.from(JSON.stringify(product), "utf8");
    const compressed = compressSnapshot(json, COMPRESSION);

    productCount++;
    approxBytes += BigInt(compressed.length);

    // Idempotent insert (productId + snapshotRunId is unique logically)
    await prisma.snapshotProduct.upsert({
      where: {
        id: `${snapshotRunId}:${product.id}`,
      },
      update: {},
      create: {
        id: `${snapshotRunId}:${product.id}`,
        shopId: run.shopId,
        snapshotRunId,
        productId: product.id,
        dataCompressed: compressed,
        compression: COMPRESSION,
      },
    });
  }

  const ttlMs = computeSnapshotTtl({ productCount, approxBytes });

  await prisma.snapshotRun.update({
    where: { id: snapshotRunId },
    data: {
      state: "SUCCEEDED",
      completedAt: new Date(),
      productCount,
      approxBytes,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
});

/**
 * Placeholder – you already have this logic elsewhere.
 * Must return an AsyncIterable<object>
 */
async function* getBulkOperationStream(
  shopId: string,
  planHash: string,
): AsyncIterable<any> {
  throw new Error("Implement Shopify Bulk Operation stream here");
}
