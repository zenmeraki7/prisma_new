// FILE: web/Jobs/Producers/snapshotCreateProducer.ts

import { Queue } from "bullmq";
import { SnapshotCreateJobData } from "../../workers/snapshotCreateWorker";

const SNAPSHOT_CREATE_QUEUE =
  process.env.SNAPSHOT_CREATE_QUEUE || "snapshot-create";

export const snapshotCreateQueue = new Queue<SnapshotCreateJobData>(
  SNAPSHOT_CREATE_QUEUE,
  {
    connection: {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT || 6379),
    },
  },
);

/**
 * Enqueue a new snapshot run.
 *
 * You call this from your GraphQL mutation or API route after:
 *  1. Running FilterPlanner + ProductLite query to get `candidateProductIds`
 *  2. Creating a SnapshotRun row in Postgres with status "QUEUED"
 */
export async function enqueueSnapshotCreateJob(data: SnapshotCreateJobData) {
  await snapshotCreateQueue.add("snapshot-create", data, {
    removeOnComplete: true,
    removeOnFail: false,
  });
}
