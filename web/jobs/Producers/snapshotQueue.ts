// FILE: web/Jobs/Producers/snapshotQueue.ts

import { Queue } from "bullmq";
import type { SnapshotJobData } from "../../lib/workers/snapshot.worker";

const SNAPSHOT_QUEUE = process.env.SNAPSHOT_QUEUE || "snapshot-queue";

export const snapshotQueue = new Queue<SnapshotJobData>(SNAPSHOT_QUEUE, {
  connection: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
  },
});

/**
 * Enqueue an INITIATE snapshot job.
 */
export async function enqueueSnapshotInitiateJob(data: SnapshotJobData) {
  if (data.action !== "INITIATE") {
    throw new Error(
      `[snapshotQueue] enqueueSnapshotInitiateJob expects action=INITIATE, got ${data.action}`,
    );
  }

  await snapshotQueue.add("snapshot-initiate", data, {
    removeOnComplete: true,
    removeOnFail: false,
  });
}
