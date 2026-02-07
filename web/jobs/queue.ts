import { Queue } from "bullmq";
import { redis } from "../workers/bootstrap";

export const snapshotBuildQueue = new Queue("snapshot-build", {
  connection: redis,
});

export const snapshotGcQueue = new Queue("snapshot-gc", {
  connection: redis,
});

export const bulkEditQueue = new Queue("bulk-edit", {
  connection: redis,
});
