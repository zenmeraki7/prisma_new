import { snapshotGcQueue } from "../jobs";

export async function scheduleSnapshotGc() {
  await snapshotGcQueue.add(
    "gc",
    {},
    {
      repeat: { every: 30 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}
