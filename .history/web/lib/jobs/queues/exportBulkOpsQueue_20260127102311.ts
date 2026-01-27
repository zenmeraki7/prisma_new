// web/lib/jobs/queues/exportBulkOpsQueue.ts
//
// BullMQ queue for BulkOps-based export jobs.
//
// IMPORTANT:
//  - This queue is consumed by export.bulkOps.worker.ts.
//  - Payload IDs are BigInt serialized as strings (do NOT pass numbers).
//  - Ensure QueueScheduler is instantiated in exactly one process per environment.
//

import { Queue, QueueScheduler } from "bullmq";
import { buildRedisConnection } from "../redis";

export const EXPORT_BULK_OPS_QUEUE_NAME = "export:bulk-ops";

/**
 * Payload for a BulkOps export job.
 *
 * NOTE:
 *  - exportJobId MUST be a stringified BigInt.
 *  - Never pass BigInt directly through BullMQ.
 */
export type BulkExportJobPayload = {
  shopId: number;
  exportJobId: string; // BigInt serialized as string
};

const connection = buildRedisConnection();

/**
 * Queue used to enqueue BulkOps-based export jobs.
 */
export const exportBulkOpsQueue = new Queue<BulkExportJobPayload>(
  EXPORT_BULK_OPS_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      // DB (ExportJob) is the source of truth; completed jobs can be dropped.
      removeOnComplete: true,

      // Keep failed jobs for inspection/debugging.
      removeOnFail: false,
    },
  },
);

/**
 * QueueScheduler is required for:
 *  - Delayed jobs
 *  - Retry/backoff
 *  - Recovering stalled jobs
 *
 * IMPORTANT:
 *  - Instantiate this in ONE place only (typically worker process).
 *  - If you run API + worker in separate processes, ensure only the worker
 *    imports this file OR guard scheduler creation behind an env flag.
 */
export const exportBulkOpsQueueScheduler = new QueueScheduler(
  EXPORT_BULK_OPS_QUEUE_NAME,
  {
    connection,
  },
);
