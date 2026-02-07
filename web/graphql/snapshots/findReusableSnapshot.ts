export async function findReusableSnapshot(args: {
  shopId: string;
  requestScope: Record<string, any>;
}) {
  const candidates = await prisma.snapshotRun.findMany({
    where: {
      shopId: args.shopId,
      state: "SUCCEEDED",
    },
    orderBy: [
      { productCount: "asc" },  // smallest first
      { createdAt: "desc" },
    ],
    take: 10,
  });

  for (const run of candidates) {
    if (isSupersetScope(run.planScope as any, args.requestScope)) {
      return run;
    }
  }

  return null;
}
