import { Worker } from "bullmq";
import IORedis from "ioredis";

export const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export function createWorker<T>(
  name: string,
  handler: (job: T) => Promise<void>,
) {
  return new Worker(
    name,
    async (job) => {
      await handler(job.data);
    },
    {
      connection: redis,
      concurrency: 1, // snapshot jobs must be serialized per worker
    },
  );
}
