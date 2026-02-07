import { prisma } from "../../db/prisma";

export async function bootstrapProductsResolver(
  _parent: unknown,
  _args: {},
  ctx: { shopId: string },
) {
  const shop = await prisma.shop.findUnique({
    where: { id: ctx.shopId },
    select: {
      fastReady: true,
      fastLastSyncAt: true,
      fastRevision: true,
      fastSyncEnqueued: true,
    },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  return {
    status: {
      fastReady: shop.fastReady,
      fastLastSyncAt: shop.fastLastSyncAt,
      fastRevision: shop.fastRevision,
      syncEnqueued: shop.fastSyncEnqueued,
    },
  };
}
