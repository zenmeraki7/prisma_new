export async function snapshotHistoryResolver(
  _,
  args: { limit: number },
  ctx: { shopId: string },
) {
  return prisma.snapshotRun.findMany({
    where: { shopId: ctx.shopId },
    orderBy: { createdAt: "desc" },
    take: Math.min(args.limit, 50),
  });
}
