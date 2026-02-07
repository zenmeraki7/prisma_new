import { createWorker } from "../workers/bootstrap";
import { prisma } from "../db/prisma";

type SnapshotGcJob = {};

createWorker<SnapshotGcJob>("snapshot-gc", async () => {
  const now = new Date();

  // 1️⃣ Mark expired (idempotent)
  await prisma.snapshotRun.updateMany({
    where: {
      state: { notIn: ["RUNNING", "EXPIRED"] },
      expiresAt: { lt: now },
    },
    data: { state: "EXPIRED" },
  });

  // 2️⃣ Delete expired in small batches, smallest first
  const expired = await prisma.snapshotRun.findMany({
    where: {
      state: "EXPIRED",
      expiresAt: { lt: now },
    },
    orderBy: [{ approxBytes: "asc" }],
    take: 50,
    select: { id: true },
  });

  if (expired.length === 0) return;

  await prisma.snapshotRun.deleteMany({
    where: {
      id: { in: expired.map((r) => r.id) },
    },
  });
});
