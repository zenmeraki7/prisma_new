// web/shopify-webhooks-fast.js
import { prisma } from "./db/prisma.js";
import { getShopifyAdminClient } from "./shopifyClient.js";

// Utility to fetch minimal product fields on create/update
async function fetchMinimalProduct(shopId, productGid) {
  const client = await getShopifyAdminClient(shopId);

  const query = `
    query FastProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        status
        vendor
        productType
        tags
        totalInventory
        collections(first: 50) {
          edges { node { id } }
        }
        images(first: 1) {
          edges { node { id } }
        }
        updatedAt
      }
    }
  `;

  const res = await client.request(query, { id: productGid });

  return res.product;
}

export async function handleProductCreateOrUpdate(shopId, productPayload) {
  const productGid = productPayload.admin_graphql_api_id || productPayload.id;
  const product = await fetchMinimalProduct(shopId, productGid);
  if (!product) return;

  const hasImages = Array.isArray(product.images?.edges) && product.images.edges.length > 0;
  const tags = Array.isArray(product.tags) ? product.tags : [];
  const collections = Array.isArray(product.collections?.edges)
    ? product.collections.edges.map((e) => e.node.id)
    : [];
  const totalInventory = typeof product.totalInventory === "number" ? product.totalInventory : null;
  const updatedAt = product.updatedAt ? new Date(product.updatedAt) : null;

  await prisma.$transaction([
    prisma.productLite.upsert({
      where: { shopId_id: { shopId, id: product.id } },
      update: {
        title: product.title ?? "",
        handle: product.handle ?? "",
        status: product.status ?? "UNKNOWN",
        vendor: product.vendor ?? null,
        productType: product.productType ?? null,
        hasImages,
        updatedAtShopify: updatedAt,
      },
      create: {
        shopId,
        id: product.id,
        title: product.title ?? "",
        handle: product.handle ?? "",
        status: product.status ?? "UNKNOWN",
        vendor: product.vendor ?? null,
        productType: product.productType ?? null,
        hasImages,
        updatedAtShopify: updatedAt,
      },
    }),
    prisma.productTag.deleteMany({
      where: { shopId, productId: product.id },
    }),
    prisma.productTag.createMany({
      data: tags.map((tag) => ({ shopId, productId: product.id, tag })),
      skipDuplicates: true,
    }),
    prisma.productCollection.deleteMany({
      where: { shopId, productId: product.id },
    }),
    prisma.productCollection.createMany({
      data: collections.map((collectionId) => ({
        shopId,
        productId: product.id,
        collectionId,
      })),
      skipDuplicates: true,
    }),
    prisma.variantRollup.upsert({
      where: { shopId_productId: { shopId, productId: product.id } },
      update: { totalInventory },
      create: { shopId, productId: product.id, totalInventory },
    }),
  ]);
}

export async function handleProductDelete(shopId, productPayload) {
  const productGid = productPayload.admin_graphql_api_id || productPayload.id;

  await prisma.$transaction([
    prisma.productTag.deleteMany({
      where: { shopId, productId: productGid },
    }),
    prisma.productCollection.deleteMany({
      where: { shopId, productId: productGid },
    }),
    prisma.variantRollup.deleteMany({
      where: { shopId, productId: productGid },
    }),
    prisma.productLite.deleteMany({
      where: { shopId, id: productGid },
    }),
  ]);
}
