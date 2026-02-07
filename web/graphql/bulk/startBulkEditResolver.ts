import { planProductQuery } from "../filtering/planProductQuery";

export async function startBulkEditResolver(
  _parent,
  args: {
    filter: unknown;
    action: unknown;
  },
  ctx: { shopId: string },
) {
  const filterExpr = astFromJson(args.filter);

  const { planHash } = await planProductQuery({
    shopId: ctx.shopId,
    filter: filterExpr,
  });

  const job = await prisma.bulkEditJob.create({
    data: {
      shopId: ctx.shopId,
      planHash,
      action: args.action,
      state: "QUEUED",
    },
  });

  return { jobId: job.id, planHash };
}
