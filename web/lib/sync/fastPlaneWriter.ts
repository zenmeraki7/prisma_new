// web/lib/sync/fastPlaneWriter.ts
import { prisma } from "../../db/prisma";
import { Prisma } from "@prisma/client";

export type BulkProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor?: string | null;
  productType?: string | null;
  tags?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
  images?: { edges?: Array<{ node?: { id: string } }> } | null;

  variants?: {
    edges?: Array<{
      node?: {
        id: string;
        price?: string | null;
        inventoryQuantity?: number | null;
      };
    }>;
  };
};

function toDateOrNull(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function upsertProductLiteAndRollup(args: {
  shopId: string;
  product: BulkProductNode;
}): Promise<void> {
  const { shopId, product } = args;

  const tags = Array.isArray(product.tags) ? product.tags : [];
  const hasImages = !!product.images?.edges?.length;

  // Compute rollups from variant edges present in the bulk node.
  const vEdges = product.variants?.edges ?? [];
  let variantCount = 0;
  let totalInventory = 0;
  let minPrice: Prisma.Decimal | null = null;
  let maxPrice: Prisma.Decimal | null = null;
  let hasOutOfStockVariant = false;
  let hasInStockVariant = false;

  for (const e of vEdges) {
    const v = e?.node;
    if (!v) continue;
    variantCount += 1;

    const qty = typeof v.inventoryQuantity === "number" ? v.inventoryQuantity : 0;
    totalInventory += qty;
    if (qty <= 0) hasOutOfStockVariant = true;
    if (qty > 0) hasInStockVariant = true;

    const p = v.price ? new Prisma.Decimal(v.price) : null;
    if (p) {
      minPrice = minPrice ? Prisma.Decimal.min(minPrice, p) : p;
      maxPrice = maxPrice ? Prisma.Decimal.max(maxPrice, p) : p;
    }
  }

  await prisma.$transaction([
    prisma.productLite.upsert({
      where: { shopId_id: { shopId, id: product.id } },
      create: {
        shopId,
        id: product.id,
        title: product.title ?? "",
        handle: product.handle ?? "",
        status: product.status ?? "UNKNOWN",
        vendor: product.vendor ?? null,
        productType: product.productType ?? null,
        tags,
        hasImages,
        createdAtShopify: toDateOrNull(product.createdAt),
        updatedAtShopify: toDateOrNull(product.updatedAt),
        publishedAtShopify: toDateOrNull(product.publishedAt),
      },
      update: {
        title: product.title ?? "",
        handle: product.handle ?? "",
        status: product.status ?? "UNKNOWN",
        vendor: product.vendor ?? null,
        productType: product.productType ?? null,
        tags,
        hasImages,
        createdAtShopify: toDateOrNull(product.createdAt),
        updatedAtShopify: toDateOrNull(product.updatedAt),
        publishedAtShopify: toDateOrNull(product.publishedAt),
      },
    }),

    prisma.variantRollup.upsert({
      where: { shopId_productId: { shopId, productId: product.id } },
      create: {
        shopId,
        productId: product.id,
        variantCount,
        totalInventory,
        minPrice,
        maxPrice,
        hasOutOfStockVariant,
        hasInStockVariant,
      },
      update: {
        variantCount,
        totalInventory,
        minPrice,
        maxPrice,
        hasOutOfStockVariant,
        hasInStockVariant,
      },
    }),
  ]);
}
