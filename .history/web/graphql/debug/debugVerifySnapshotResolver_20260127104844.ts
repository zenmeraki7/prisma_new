// web/graphql/debug/debugVerifySnapshotResolver.ts
import { prisma } from "../../../db/prisma.js";
import { evaluateSnapshotFilterToProductGids } from "../../../lib/snapshots/shopifySnapshotEvaluator.js";
import type { GraphQLContext } from "../schema.js";
import type { FilterExpr } from "../../../lib/filters/dsl.js";

type DebugVerifySnapshotArgs = {
  planHash: string;
};

const REGISTRY_VERSION = "v1"; // keep in sync with filtering resolvers

export async function debugVerifySnapshotResolver(
  _parent: unknown,
  args: DebugVerifySnapshotArgs,
  ctx: GraphQLContext
) {
  const { shopId } = ctx;
  const { planHash } = args;

  // 1) Find latest run for this planHash
  const run = await prisma.snapshotRun.findFirst({
    where: { shopId, planHash },
    orderBy: { createdAt: "desc" },
  });

  if (!run) {
    return {
      ok: false,
      message: "No snapshot run found for this planHash.",
      mismatchedProductIds: [],
    };
  }

  // 2) We need the original filter expression.
  // In this design you’d typically log it in a separate table or in snapshotRunEvents.
  // For now we assume you stored it in an idempotency ledger or similar;
  // or (simplest) you pass it as JSON in an event.
  // Here we assume run.filterSummary is NOT the full filter JSON, so we cannot reconstruct.
  // Instead we assume you have a "snapshotPlan" table or you embed it into SnapshotRun as JSON.
  // If you upgrade schema, add "filterJson JSON" to SnapshotRun and load it here.
  //
  // For this example, we will bail out gracefully if filterJson is not present.
  const anyRun: any = run;
  const filterJson = anyRun.filterJson as FilterExpr | undefined;
  if (!filterJson) {
    return {
      ok: false,
      message:
        "SnapshotRun does not store filter JSON; cannot verify against Shopify truth.",
      mismatchedProductIds: [],
    };
  }

  // 3) Evaluate via Shopify directly
  const shopifySet = await evaluateSnapshotFilterToProductGids({
    shopId,
    filter: filterJson,
  });

  // 4) Compare with snapshotProducts
  const snapshotRows = await prisma.snapshotProduct.findMany({
    where: {
      snapshotRunId: run.id,
      shopId,
    },
    select: { productId: true },
  });

  const snapshotSet = new Set(snapshotRows.map((r) => r.productId));

  const missingInSnapshot: string[] = [];
  const extraInSnapshot: string[] = [];

  for (const id of shopifySet) {
    if (!snapshotSet.has(id)) missingInSnapshot.push(id);
  }
  for (const id of snapshotSet) {
    if (!shopifySet.has(id)) extraInSnapshot.push(id);
  }

  const mismatched = [...missingInSnapshot, ...extraInSnapshot];
  const ok = mismatched.length === 0;

  const message = ok
    ? "Snapshot matches Shopify BulkOps evaluation."
    : `Snapshot differs. Missing in snapshot: ${missingInSnapshot.length}, extra in snapshot: ${extraInSnapshot.length}.`;

  return {
    ok,
    message,
    mismatchedProductIds: mismatched,
  };
}
