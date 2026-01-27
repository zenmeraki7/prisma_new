// web/workers/export.fast.worker.ts
//
// Entrypoint for FAST-plane export worker.
// Run this in its own Node process:
//
//   node dist/web/workers/export.fast.worker.js
//
// Responsibilities:
//  - Attach a BullMQ Worker to the FAST export queue.
//  - Enforce per-shop concurrency cap via a Redis lock.
//  - Delegate actual export logic to handleFastExportJob.
//

import { Worker, Job } from "bullmq";
import {
  EXPORT_QUEUE_NAME,
  type ExportJobPayload,
} from "../lib/jobs/queues/exportQueue";
import { buildRedisConnection } from "../lib/jobs/redis";
import { handleFastExportJob } from "./export.worker";

const connection = buildRedisConnection();

/**
 * Acquire a per-shop lock so only one FAST export runs per shop at a time.
 * TTL keeps us safe from stuck workers; release happens in finally.
 */
async function withShopExportLock<T>(
  job: Job<ExportJobPayload>,
  fn: () => Promise<T>,
): Promise<T> {
  // NOTE: buildRedisConnection is expected to return an ioredis-compatible client.
  const redis = connection as any;
  const { shopId } = job.data;
  const lockKey = `export:fast:lock:shop:${shopId}`;
  const ttlSeconds = 60 * 10; // 10 minutes, tune as needed

  const acquired = await redis.set(
    lockKey,
    job.id ?? "1",
    "NX",
    "EX",
    ttlSeconds,
  );
  if (!acquired) {
    // Another FAST export is already running for this shop.
    // Throw to let BullMQ apply attempts/backoff policies.
    throw new Error(`FAST export already running for shopId=${shopId}`);
  }

  try {
    return await fn();
  } finally {
    try {
      await redis.del(lockKey);
    } catch {
      // Best-effort; lock will expire via TTL if this fails.
    }
  }
}

export const fastExportWorker = new Worker<ExportJobPayload>(
  EXPORT_QUEUE_NAME,
  async (job) => {
    return withShopExportLock(job, () => handleFastExportJob(job));
  },
  {
    connection,
    // Total concurrent FAST exports across all shops.
    // Per-shop lock ensures at most one per shop at a time.
    concurrency: 5,
  },
);

// Optional: basic logging
fastExportWorker.on("completed", (job) => {
  console.log(`[FAST] Export job completed`, {
    jobId: job.id,
    shopId: job.data.shopId,
  });
});

fastExportWorker.on("failed", (job, err) => {
  console.error(`[FAST] Export job failed`, {
    jobId: job?.id,
    shopId: job?.data.shopId,
    error: err,
  });
});

/**
 * Optional graceful shutdown for worker processes.
 */
async function shutdown(signal: string) {
  console.log(`[FAST] Received ${signal}, shutting down export worker...`);
  try {
    await fastExportWorker.close();
  } catch (err) {
    console.error("[FAST] Error closing worker", err);
  }

  try {
    // If buildRedisConnection returns a client with 'quit' or 'disconnect',
    // call it here. We guard with 'any' to avoid type coupling.
    const redis = connection as any;
    if (typeof redis.quit === "function") {
      await redis.quit();
    } else if (typeof redis.disconnect === "function") {
      redis.disconnect();
    }
  } catch (err) {
    console.error("[FAST] Error closing Redis connection", err);
  }

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
