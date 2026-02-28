// FILE: web/queues/redisConnection.js

import IORedis from "ioredis";

// You can move these to .env
const redis = new IORedis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null, // required for BullMQ
});

redis.on("connect", () => {
  console.log("[redis] Connected");
});

redis.on("error", (err) => {
  console.error("[redis] Error", err);
});

export { redis };