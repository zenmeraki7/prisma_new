// FILE: web/shopify.js (plain JS version)

import { BillingInterval, LATEST_API_VERSION } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";

import { handleProductCreateOrUpdate, handleProductDelete } from "./shopify-webhooks-fast.js";
import { prisma } from "./db/prisma.js";

const DB_PATH = `${process.cwd()}/database.sqlite`;

// Example billing config (unused for now, but ready to plug in later)
const billingConfig = {
  "My Shopify One-Time Charge": {
    amount: 5.0,
    currencyCode: "USD",
    interval: BillingInterval.OneTime,
  },
};

// FAST-plane webhook handlers (product mirror maintenance)
const webhookHandlers = {
  PRODUCTS_CREATE: async (topic, shop, body) => {
    const payload = JSON.parse(body);
    const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
    if (!shopRecord) return;
    await handleProductCreateOrUpdate(shopRecord.id, payload);
  },

  PRODUCTS_UPDATE: async (topic, shop, body) => {
    const payload = JSON.parse(body);
    const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
    if (!shopRecord) return;
    await handleProductCreateOrUpdate(shopRecord.id, payload);
  },

  PRODUCTS_DELETE: async (topic, shop, body) => {
    const payload = JSON.parse(body);
    const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
    if (!shopRecord) return;
    await handleProductDelete(shopRecord.id, payload);
  },
};

const shopify = shopifyApp({
  api: {
    apiVersion: LATEST_API_VERSION,
    restResources,
    future: {
      customerAddressDefaultFix: true,
      lineItemBilling: true,
      unstable_managedPricingSupport: true,
    },
    // You can later swap this to `billing: billingConfig` once you wire billing
    billing: undefined,
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
    // NOTE: this custom handler is *extra*; Shopify will still use webhooks.process()
    // in your routes. You can later remove or refactor this once you standardize.
    async registerHandlers(req, res, next) {
      try {
        const topic = req.headers["x-shopify-topic"]?.toString();
        const shop = req.headers["x-shopify-shop-domain"]?.toString();
        const body = req.body?.toString() || "{}";

        if (!topic || !shop) {
          return res.status(400).send("Missing headers");
        }

        if (webhookHandlers[topic]) {
          await webhookHandlers[topic](topic, shop, body);
        } else {
          console.warn(`Unhandled webhook topic: ${topic}`);
        }

        res.status(200).send("Webhook handled");
      } catch (err) {
        console.error("Webhook processing error:", err);
        res.status(500).send("Internal error");
      }
    },
  },
  sessionStorage: new SQLiteSessionStorage(DB_PATH),
});

// ✅ Export both ways: named + default
export { shopify };
export default shopify;