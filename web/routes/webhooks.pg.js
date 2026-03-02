// FILE: web/routes/webhooks.pg.js

import express from "express";
import { DeliveryMethod } from "@shopify/shopify-api";
import { shopify } from "../shopify.js";
import { handleBulkFinishWebhookPg } from "../controllers/webhooks/bulkFinishController.pg.js";

const router = express.Router();

/**
 * Webhook handlers for this router.
 *
 * Topic: BULK_OPERATIONS_FINISH
 * Header: x-shopify-topic: bulk_operations/finish
 *
 * If you mount this router at /api/webhooks:
 *   - Route path here: "/bulk/finish"
 *   - Full callbackUrl: "/api/webhooks/bulk/finish"
 */
const webhookHandlers = {
  BULK_OPERATIONS_FINISH: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks/bulk/finish",
    /**
     * Shopify webhook callback signature used by processWebhooks:
     *   (topic: string, shop: string, body: string, webhookId: string)
     */
    async callback(topic, shop, body, webhookId) {
      const payload = JSON.parse(body);

      await handleBulkFinishWebhookPg({
        topic,
        shop,
        webhookId,
        payload,
      });
    },
  },
};

// This middleware:
//  - Validates HMAC
//  - Parses raw body
//  - Invokes the matching handler above
//  - Sends the HTTP response
router.post(
  "/bulk/finish",
  shopify.processWebhooks({ webhookHandlers }),
);

export default router;