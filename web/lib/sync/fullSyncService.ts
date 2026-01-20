// web/lib/sync/fullSyncService.ts
import { prisma } from "../../db/prisma";
import { startBulkOp, pollBulkOpUntilUrl, streamJsonl } from "./bulkOpRunner";
import { upsertProductLiteAndRollup, BulkProductNode } from "./fastPlaneWriter";

const FAST_BULK_QUERY = `
{
  products {
    edges {
      node {
        id
        title
        handle
        status
        vendor
        productType
        tags
        createdAt
        updatedAt
        publishedAt
        images(first: 1) { edges { node { id } } }
        variants(first: 250) {
          edges {
            node {
              id
              price
              inventoryQuantity
            }
          }
        }
      }
    }
  }
}
`;

export async function runFastFullSync(args: {
  shopId: string;
  shopDomain: string;
  accessToken: string;
  jobLedgerId: string;
}): Promise<void> {
  const { shopId, shopDomain, accessToken, jobLedgerId } = args;

  await prisma.jobLedger.update({
    where: { id: jobLedgerId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    // Optional: clear old FAST plane for this shop before rebuild (safe + deterministic).
    await prisma.$transaction([
      prisma.variantRollup.deleteMany({ where: { shopId } }),
      prisma.productLite.deleteMany({ where: { shopId } }),
    ]);

    await startBulkOp({ shop: shopDomain, accessToken, query: FAST_BULK_QUERY });
    const url = await pollBulkOpUntilUrl({ shop: shopDomain, accessToken });

    // BulkOps JSONL yields different shapes depending on query.
    // For the query above, you’ll receive product nodes.
    let count = 0;
    for await (const obj of streamJsonl(url)) {
      const p = obj as BulkProductNode;
      if (!p?.id) continue;
      await upsertProductLiteAndRollup({ shopId, product: p });
      count += 1;
    }

    await prisma.shopState.upsert({
      where: { shopId },
      create: { shopId, fastReady: true, fastLastSyncAt: new Date(), fastRevision: 1 },
      update: {
        fastReady: true,
        fastLastSyncAt: new Date(),
        fastRevision: { increment: 1 },
      },
    });

    await prisma.jobLedger.update({
      where: { id: jobLedgerId },
      data: { status: "SUCCEEDED", finishedAt: new Date() },
    });

    // You can log count via structured logs if you have a logger.
    void count;
  } catch (e: any) {
    await prisma.jobLedger.update({
      where: { id: jobLedgerId },
      data: { status: "FAILED", finishedAt: new Date(), error: String(e?.message ?? e) },
    });
    throw e;
  }
}
