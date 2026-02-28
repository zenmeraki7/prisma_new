// FILE: web/routes/webhooks.pg.js

import express from "express";
import { shopify } from "../shopify.js";
import { bulkFinishWebhookPg } from "../controllers/webhooks/bulkFinishController.pg.js";

const router = express.Router();

// Shopify middleware that validates HMAC & parses JSON
router.post(
  "/bulk/finish",
  shopify.webhooks.process({}), // or your existing handler
  bulkFinishWebhookPg,
);

export default router;