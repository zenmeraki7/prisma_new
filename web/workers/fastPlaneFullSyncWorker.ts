// web/workers/fastPlaneFullSyncWorker.ts
import { Worker } from "bullmq";
import { FAST_SYNC_QUEUE_NAME, redis } from "../jobs/queue";
import { runFastFullSync } from "../lib/sync/fullSyncService";

type FastFullSyncJob = {
  shopId: string;
  shopDomain: string;
  accessToken: string;
  jobLedgerId: string;
};

export const fastPlaneFullSyncWorker = new Worker<FastFullSyncJob>(
  FAST_SYNC_QUEUE_NAME,
  async (job) => {
    const payload = job.data;
    await runFastFullSync(payload);
  },
  {
    connection: redis,
    concurrency: 2, // keep tight; BulkOps is heavy
  }
);

fastPlaneFullSyncWorker.on("failed", (job, err) => {
  // Replace with your logger
  console.error("fastPlaneFullSyncWorker failed", { jobId: job?.id, err: String(err) });
});
