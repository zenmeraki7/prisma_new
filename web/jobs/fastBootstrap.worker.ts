// web/jobs/fastBootstrap.worker.ts
import fetch from "node-fetch";
import { prisma } from "../db/prisma.js";
import { startProductsFastBootstrapBulkOp, waitForBulkOpResult } from "../shopify/bulkOps.js";

export async function runFastBootstrapForShop(shopId: string): Promise<void> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) {
    throw new Error(`Shop ${shopId} not found`);
  }

  // Mark sync enqueued
  await prisma.fastSyncState.upsert({
    where: { shopId },
    update: { syncEnqueued: true },
    create: { shopId, syncEnqueued: true },
  });

  const bulkOpId = await startProductsFastBootstrapBulkOp(shopId);
  const result = await waitForBulkOpResult(shopId, bulkOpId);

  const res = await fetch(result.url);
  if (!res.ok) {
    throw new Error(`BulkOp download failed: ${res.status}`);
  }

  const now = new Date();

  // We stream line by line; each line is a JSON object
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const upsertTasks: Promise<any>[] = [];

  const flushLine = (line: string) => {
    if (!line.trim()) return;
    const obj = JSON.parse(line);

    // BulkOps output: { "id": "...", "title": "...", ... }
    if (obj.__parentId) {
      // we care only about product nodes, not nested edges; Shopify’s bulk output
      // will give you "product" nodes; adjust parsing if needed.
      return;
    }

    const productId: string = obj.id;
    const hasImages: boolean =
      Array.isArray(obj.images?.edges) && obj.images.edges.length > 0;
    const tags: string[] = Array.isArray(obj.tags) ? obj.tags : [];
    const collections: string[] = Array.isArray(obj.collections?.edges)
      ? obj.collections.edges.map((e: any) => e.node.id)
      : [];

    const totalInventory: number | null =
      typeof obj.totalInventory === "number" ? obj.totalInventory : null;

    const updatedAt: Date | null = obj.updatedAt ? new Date(obj.updatedAt) : null;

    upsertTasks.push(
      prisma.$transaction([
        prisma.productLite.upsert({
          where: { shopId_id: { shopId, id: productId } },
          update: {
            title: obj.title ?? "",
            handle: obj.handle ?? "",
            status: obj.status ?? "UNKNOWN",
            vendor: obj.vendor ?? null,
            productType: obj.productType ?? null,
            hasImages,
            updatedAtShopify: updatedAt,
          },
          create: {
            shopId,
            id: productId,
            title: obj.title ?? "",
            handle: obj.handle ?? "",
            status: obj.status ?? "UNKNOWN",
            vendor: obj.vendor ?? null,
            productType: obj.productType ?? null,
            hasImages,
            updatedAtShopify: updatedAt,
          },
        }),
        // Tags
        prisma.productTag.deleteMany({
          where: { shopId, productId },
        }),
        prisma.productTag.createMany({
          data: tags.map((tag) => ({ shopId, productId, tag })),
          skipDuplicates: true,
        }),
        // Collections
        prisma.productCollection.deleteMany({
          where: { shopId, productId },
        }),
        prisma.productCollection.createMany({
          data: collections.map((collectionId) => ({
            shopId,
            productId,
            collectionId,
          })),
          skipDuplicates: true,
        }),
        // Variant rollup
        prisma.variantRollup.upsert({
          where: { shopId_productId: { shopId, productId } },
          update: { totalInventory },
          create: { shopId, productId, totalInventory },
        }),
      ])
    );
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      flushLine(line);
    }
  }
  if (buffer.length > 0) {
    flushLine(buffer);
  }

  await Promise.all(upsertTasks);

  await prisma.fastSyncState.upsert({
    where: { shopId },
    update: {
      fastReady: true,
      fastLastSyncAt: now,
      fastRevision: { increment: 1 },
      syncEnqueued: false,
    },
    create: {
      shopId,
      fastReady: true,
      fastLastSyncAt: now,
      fastRevision: 1,
      syncEnqueued: false,
    },
  });
}
