import { prisma } from "../../db/prisma";
import { fastPlaneSyncQueue } from "../../jobs";

export async function fastSyncResolver(
  _parent: unknown,
  _args: {},
  ctx: { shopId: string },
) {
  const shop = await prisma.shop.findUnique({
    where: { id: ctx.shopId },
    select: { fastSyncEnqueued: true },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  // Idempotent: already enqueued
  if (shop.fastSyncEnqueued) {
    return { enqueued: false };
  }

  await prisma.shop.update({
    where: { id: ctx.shopId },
    data: { fastSyncEnqueued: true },
  });

  await fastPlaneSyncQueue.add(
    "fast-sync",
    { shopId: ctx.shopId },
    {
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  return { enqueued: true };
}
