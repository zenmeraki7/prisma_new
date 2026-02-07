import { prisma } from "../../db/prisma";
import { astFromJson } from "../../lib/filters/astFromJson";
import { planProductQuery } from "../filtering/planProductQuery";
import { bulkEditQueue } from "../../jobs";

export async function startBulkEditResolver(
  _,
  args: { filter: unknown; action: unknown },
  ctx: { shopId: string },
) {
  const filterExpr = astFromJson(args.filter);

  const { planHash, plan } = await planProductQuery({
    shopId: ctx.shopId,
    filter: filterExpr,
  });

  // Snapshot must exist before bulk edit
  if (plan.mode === "SNAPSHOT" && plan.snapshotRun.state !== "SUCCEEDED") {
    throw new Error("Snapshot not ready yet. Try again shortly.");
  }

  const job = await prisma.bulkEditJob.create({
    data: {
      shopId: ctx.shopId,
      planHash,
      action: args.action,
      state: "QUEUED",
    },
  });

  await bulkEditQueue.add(
    "bulk-edit",
    { bulkEditJobId: job.id },
    { removeOnComplete: true, removeOnFail: false },
  );

  return job;
}
