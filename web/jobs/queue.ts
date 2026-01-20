// web/jobs/queue.ts
import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required");

export const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const FAST_SYNC_QUEUE_NAME = "fast_sync";

export const fastSyncQueue = new Queue(FAST_SYNC_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 2000,
    removeOnFail: 5000,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
});
