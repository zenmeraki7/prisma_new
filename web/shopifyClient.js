// web/shopifyClient.js
import * as Shopify from "@shopify/shopify-api";
import { prisma } from "./db/prisma.js"; // Prisma client for shop tokens

// Get a GraphQL client for a specific shop
export async function getShopifyAdminClient(shopId) {
  // fetch the shop access token from your database
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { accessToken: true, shopDomain: true },
  });

  if (!shop) throw new Error(`Shop ${shopId} not found`);

  // create Shopify GraphQL client
  const client = new Shopify.Clients.Graphql(shop.shopDomain, shop.accessToken);
  return client;
}
