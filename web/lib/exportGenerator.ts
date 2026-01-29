// web/lib/exportGenerator.ts
import { prisma } from "../db/prisma.js";

export async function generateCSV(
  snapshotRunId: string,
  shopId: string
): Promise<string> {
  // Get product IDs from snapshot
  const snapshotProducts = await prisma.snapshotProduct.findMany({
    where: { snapshotRunId },
  });

  const productIds = snapshotProducts.map((sp) => sp.productId);

  // Get full product data
  const products = await prisma.productLite.findMany({
    where: {
      shopId,
      id: { in: productIds },
    },
    include: {
      tags: true,
      variantRollup: true,
    },
  });

  // Generate CSV
  const headers = "ID,Title,Status,Vendor,Price,Inventory\n";

  const rows = products.map((product) => {
    const price = product.variantRollup?.minPrice?.toString() || "0";
    const inventory = product.variantRollup?.totalInventory?.toString() || "0";

    return [
      product.id,
      product.title,
      product.status,
      product.vendor || "",
      price,
      inventory,
    ]
      .map((value) => `"${value}"`)
      .join(",");
  });

  return headers + rows.join("\n");
}

export async function generateJSON(
  snapshotRunId: string,
  shopId: string
): Promise<string> {
  // Get product IDs from snapshot
  const snapshotProducts = await prisma.snapshotProduct.findMany({
    where: { snapshotRunId },
  });

  const productIds = snapshotProducts.map((sp) => sp.productId);

  // Get full product data
  const products = await prisma.productLite.findMany({
    where: {
      shopId,
      id: { in: productIds },
    },
    include: {
      tags: true,
      variantRollup: true,
    },
  });

  // Format as JSON
  const data = products.map((product) => ({
    id: product.id,
    title: product.title,
    status: product.status,
    vendor: product.vendor,
    price: product.variantRollup?.minPrice,
    inventory: product.variantRollup?.totalInventory,
    tags: product.tags.map((t) => t.tag),
  }));

  return JSON.stringify(data, null, 2);
}