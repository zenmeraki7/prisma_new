import { createWorker } from "../workers/bootstrap";
import { prisma } from "../db/prisma";
import { decompressSnapshot } from "../lib/compression/snapshotCompression";

type BulkEditJobPayload = {
  bulkEditJobId: string;
};

createWorker<BulkEditJobPayload>("bulk-edit", async ({ bulkEditJobId }) => {
  const job = await prisma.bulkEditJob.findUnique({
    where: { id: bulkEditJobId },
  });

  if (!job || job.state !== "QUEUED") return;

  await prisma.bulkEditJob.update({
    where: { id: job.id },
    data: { state: "RUNNING" },
  });

  // Find snapshot (SNAPSHOT mode guaranteed at this point)
  const snapshotRun = await prisma.snapshotRun.findUnique({
    where: {
      shopId_planHash: {
        shopId: job.shopId,
        planHash: job.planHash,
      },
    },
  });

  if (!snapshotRun || snapshotRun.state !== "SUCCEEDED") {
    throw new Error("Snapshot missing or not ready");
  }

  const rows = await prisma.snapshotProduct.findMany({
    where: { snapshotRunId: snapshotRun.id },
    select: { dataCompressed: true, compression: true },
  });

  let processed = 0;
  let failed = 0;

  await prisma.bulkEditJob.update({
    where: { id: job.id },
    data: { total: rows.length },
  });

  for (const row of rows) {
    try {
      const buf = decompressSnapshot(
        Buffer.from(row.dataCompressed),
        row.compression as any,
      );
      const product = JSON.parse(buf.toString("utf8"));

      await applyBulkAction(product, job.action, job.shopId);
      processed++;
    } catch {
      failed++;
    }

    if ((processed + failed) % 50 === 0) {
      await prisma.bulkEditJob.update({
        where: { id: job.id },
        data: { processed, failed },
      });
    }
  }

  await prisma.bulkEditJob.update({
    where: { id: job.id },
    data: {
      processed,
      failed,
      state: "SUCCEEDED",
      completedAt: new Date(),
    },
  });
});

/**
 * Applies mutation to Shopify (or DB for FAST ops).
 * Must be idempotent.
 */
async function applyBulkAction(
  product: any,
  action: any,
  shopId: string,
) {
  // Implement Shopify GraphQL mutation here
  // Must be safe to retry
}
