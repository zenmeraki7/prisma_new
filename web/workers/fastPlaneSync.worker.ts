// FILE: web/workers/fastPlaneSync.worker.ts

import "dotenv/config";
import { prisma } from "../db/prisma.js";

/**
 * Payload from your queue should at least contain shopDomain or shopId.
 */
type FastSyncJobData = {
  shopDomain: string; // from Shopify
};

export async function runFastPlaneSync(job: { data: FastSyncJobData }) {
  const { shopDomain } = job.data;

  // 1) Canonical shop row
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  if (!shop) {
    console.error("[fastPlaneSync] No Shop row for domain", shopDomain);
    return;
  }

  const canonicalShopId = shop.id;

  console.log(
    "[fastPlaneSync] syncing FAST plane for",
    shopDomain,
    "as shopId =",
    canonicalShopId,
  );

  // 2) TODO: Fetch products from Shopify API / BulkOps here.
  const productsFromShopify: Array<{
    productId: string;
    title: string;
    handle: string;
    status: string;
    vendor?: string | null;
    productType?: string | null;
    tags: string[];
    hasImages: boolean;
    createdAtShopify: Date;
    updatedAtShopify: Date;
    publishedAtShopify?: Date | null;
    totalInventory?: number | null;
    variantCount?: number | null;
  }> = []; // fill from Shopify

  // 3) Upsert into ProductLite with canonical shopId
  for (const p of productsFromShopify) {
    await prisma.productLite.upsert({
      where: {
        shopId_productId: {
          shopId: canonicalShopId,
          productId: p.productId,
        },
      },
      update: {
        title: p.title,
        handle: p.handle,
        status: p.status,
        vendor: p.vendor ?? null,
        productType: p.productType ?? null,
        tags: p.tags,
        hasImages: p.hasImages,
        createdAtShopify: p.createdAtShopify,
        updatedAtShopify: p.updatedAtShopify,
        publishedAtShopify: p.publishedAtShopify ?? null,
        totalInventory: p.totalInventory ?? null,
        variantCount: p.variantCount ?? null,
      },
      create: {
        shopId: canonicalShopId,             // 🔥 IMPORTANT
        productId: p.productId,              // Shopify GID
        title: p.title,
        handle: p.handle,
        status: p.status,
        vendor: p.vendor ?? null,
        productType: p.productType ?? null,
        tags: p.tags,
        hasImages: p.hasImages,
        createdAtShopify: p.createdAtShopify,
        updatedAtShopify: p.updatedAtShopify,
        publishedAtShopify: p.publishedAtShopify ?? null,
        totalInventory: p.totalInventory ?? null,
        variantCount: p.variantCount ?? null,
      },
    });
  }

  console.log(
    "[fastPlaneSync] completed FAST sync for",
    shopDomain,
    "shopId =",
    canonicalShopId,
  );
}
