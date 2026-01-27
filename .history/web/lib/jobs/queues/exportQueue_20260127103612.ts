// web/lib/jobs/queues/exportQueue.ts
//
// BullMQ queue for FAST-plane export jobs.
//
// FAST exports:
//  - Read from product_lite / variant_rollup / product_tag
//  - Stream records to disk
//  - Suitable for small/medium exports
//
// IMPORTANT:
//  - This queue is consumed by export.fast.worker.ts.
//  - Payload IDs are BigInt serialized as strings (do NOT pass numbers).
//  - Ensure QueueScheduler is instantiated in exactly one process per environment.
//

import { Queue, QueueScheduler } from "bullmq";
import { buildRedisConnection } from "../redis";

export const EXPORT_QUEUE_NAME = "export:fast";

/**
 * Payload for a FAST-plane export job.
 *
 * NOTE:
 *  - exportJobId MUST be a stringified BigInt.
 *  - Never pass BigInt directly through BullMQ.
 */
export type ExportJobPayload = {
  /**
   * Shop context for multi-tenant isolation.
   */
  shopId: number;

  /**
   * ExportJob.id serialized as string (BigInt-safe).
   */
  exportJobId: string;
};

const connection = buildRedisConnection();

/**
 * Queue used to enqueue FAST-plane export jobs.
 */
export const exportQueue = new Queue<ExportJobPayload>(
  EXPORT_QUEUE_NAME,
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
export const exportQueueScheduler = new QueueScheduler(
  EXPORT_QUEUE_NAME,
  {
    connection,
  },
);
