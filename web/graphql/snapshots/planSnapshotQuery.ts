import { prisma } from "../../db/prisma";

export async function getOrCreateSnapshotRun(args: {
  shopId: string;
  planHash: string;
  filter: FilterExpr | null;
}) {
  const existing = await prisma.snapshotRun.findUnique({
    where: {
      shopId_planHash: {
        shopId: args.shopId,
        planHash: args.planHash,
      },
    },
  });

  if (existing) return existing;

  // create new run
  return prisma.snapshotRun.create({
    data: {
      shopId: args.shopId,
      planHash: args.planHash,
      state: "QUEUED",
    },
  });
}
