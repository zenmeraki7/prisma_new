// FILE: web/services/bulkEdit/bulkEditSelection.service.js

import { prisma } from "../../db/prisma.js";

function uniqueStrings(values) {
  return [...new Set((values || []).map((v) => String(v)).filter(Boolean))];
}

/**
 * selection.where must already be model-correct:
 * - PRODUCT_WHERE => Prisma.ProductLiteWhereInput
 * - VARIANT_WHERE => Prisma.VariantLiteWhereInput
 */
export async function selectRowsForBulkEdit({
  shopId,
  scope,
  selection,
}) {
  if (scope === "PRODUCT") {
    if (selection.mode === "PRODUCT_IDS") {
      const ids = uniqueStrings(selection.ids);

      const rows = await prisma.productLite.findMany({
        where: {
          shopId,
          id: { in: ids },
          shopifyGid: { not: null },
        },
        select: {
          id: true,
          shopifyGid: true,
        },
      });

      return rows
        .filter((r) => r.shopifyGid)
        .map((r) => ({
          productId: r.id,
          productGid: r.shopifyGid,
        }));
    }

    if (selection.mode === "PRODUCT_WHERE") {
      const rows = await prisma.productLite.findMany({
        where: selection.where,
        select: {
          id: true,
          shopifyGid: true,
        },
      });

      return rows
        .filter((r) => r.shopifyGid)
        .map((r) => ({
          productId: r.id,
          productGid: r.shopifyGid,
        }));
    }
  }

  if (scope === "VARIANT") {
    if (selection.mode === "VARIANT_IDS") {
      const variantIds = uniqueStrings(selection.ids);

      const rows = await prisma.variantLite.findMany({
        where: {
          shopId,
          variantId: { in: variantIds },
          variantGid: { not: null },
          productGid: { not: null },
        },
        select: {
          variantId: true,
          variantGid: true,
          productId: true,
          productGid: true,
        },
      });

      return rows
        .filter((r) => r.variantGid && r.productGid)
        .map((r) => ({
          variantId: r.variantId,
          variantGid: r.variantGid,
          productId: r.productId,
          productGid: r.productGid,
        }));
    }

    if (selection.mode === "VARIANT_WHERE") {
      const rows = await prisma.variantLite.findMany({
        where: selection.where,
        select: {
          variantId: true,
          variantGid: true,
          productId: true,
          productGid: true,
        },
      });

      return rows
        .filter((r) => r.variantGid && r.productGid)
        .map((r) => ({
          variantId: r.variantId,
          variantGid: r.variantGid,
          productId: r.productId,
          productGid: r.productGid,
        }));
    }
  }

  throw new Error(
    `Unsupported selection combination: scope=${scope}, mode=${selection.mode}`,
  );
}