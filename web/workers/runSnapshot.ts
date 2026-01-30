import { prisma } from "../db/prisma.js";
import { evaluateSnapshotFilterToProductGids } from "../lib/snapshots/shopifySnapshotEvaluator.js";

export async function runSnapshotJob(snapshotRunId: string) {
  const run = await prisma.snapshotRun.findUnique({
    where: { id: snapshotRunId },
  });

  if (!run) throw new Error("SnapshotRun not found");

  await prisma.snapshotRun.update({
    where: { id: snapshotRunId },
    data: { state: "RUNNING" },
  });

  try {
    const filterJson = (run as any).filterJson;
    if (!filterJson) throw new Error("Missing filter JSON");

    const productIds = await evaluateSnapshotFilterToProductGids({
      shopId: run.shopId,
      filter: filterJson,
    });

    let processed = 0;

    for (const productId of productIds) {
      await prisma.snapshotProduct.create({
        data: {
          snapshotRunId,
          shopId: run.shopId,
          productId,
        },
      });
      processed++;
    }

    await prisma.snapshotRun.update({
      where: { id: snapshotRunId },
      data: {
        state: "SUCCEEDED",
        progress: processed,
        total: processed,
      },
    });
  } catch (e: any) {
    await prisma.snapshotRun.update({
      where: { id: snapshotRunId },
      data: {
        state: "FAILED",
        errorMessage: e.message,
      },
    });
    throw e;
  }
}
