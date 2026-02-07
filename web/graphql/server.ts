// FILE: web/graphql/server.ts

import { createYoga } from "graphql-yoga";
import type { IncomingMessage } from "http";
import { prisma } from "../db/prisma.js";
import { schema } from "./schema.js"; // your existing schema with typeDefs + resolvers

export type GraphQLContext = {
  shopId: string;
};

function extractShopDomainFromRequest(req: IncomingMessage): string {
  // TODO: replace this with your actual session / JWT / App Bridge logic.
  // For development, you can hardcode:
  //
  // return "demo-zen-store.myshopify.com";
  //
  const header = req.headers["x-shopify-shop-domain"];
  if (!header || Array.isArray(header)) {
    throw new Error("Missing x-shopify-shop-domain header");
  }
  return header;
}

export const yoga = createYoga<GraphQLContext>({
  schema,
  context: async ({ request }) => {
    const req = request as unknown as IncomingMessage;

    // 1) Extract Shopify shop domain from session / headers
    const shopDomain = extractShopDomainFromRequest(req);

    // 2) Lookup shop row and use its ID as canonical shopId
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });

    if (!shop) {
      throw new Error(`Shop not onboarded for domain: ${shopDomain}`);
    }

    return {
      shopId: shop.id, // THIS must match ProductLite.shopId
    };
  },
});
