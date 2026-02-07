import { astFromJson } from "../../lib/filters/astFromJson";
import { planProductQuery } from "../filtering/planProductQuery";
import { snapshotBuildQueue } from "../../jobs";

export async function warmSnapshotResolver(_, args, ctx) {
  const filterExpr = astFromJson(args.filter);

  const { plan } = await planProductQuery({
    shopId: ctx.shopId,
    filter: filterExpr,
  });

  if (plan.mode !== "SNAPSHOT") {
    return { message: "FAST plan does not need warming" };
  }

  if (plan.snapshotRun.state === "QUEUED") {
    await snapshotBuildQueue.add("build", {
      snapshotRunId: plan.snapshotRun.id,
    });
  }

  return {
    snapshotRunId: plan.snapshotRun.id,
    planHash: plan.planHash,
  };
}
