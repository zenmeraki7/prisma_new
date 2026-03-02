// FILE: web/controllers/webhooks/bulkFinishController.pg.js

import { dispatchBulkOperationResultPg } from "../../services/syncService/syncCoordinator.pg.js";
import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

/**
 * Shopify bulk_operations/finish webhook (pure webhook handler).
 *
 * Called via shopify.processWebhooks with signature:
 *   (topic: string, shop: string, body: string, webhookId: string)
 *
 * We wrap that into this function:
 *   handleBulkFinishWebhookPg({ topic, shop, webhookId, payload })
 */
export async function handleBulkFinishWebhookPg({
  topic,
  shop,
  webhookId,
  payload,
}) {
  try {
    // payload structure (per Shopify bulk_operations/finish):
    // {
    //   admin_graphql_api_id: "gid://shopify/BulkOperation/123",
    //   status: "COMPLETED",
    //   error_code: null,
    //   completed_at: "...",
    //   object_count: "1234",
    //   file_size: "12345",
    //   url: "https://..."
    // }

    const bulkOperationId =
      payload.admin_graphql_api_id ??
      payload.id ??
      null;

    const bulkOperationUrl = payload.url ?? null;
    const status = payload.status ?? null;

    if (!bulkOperationId || !bulkOperationUrl) {
      logger.warn("[handleBulkFinishWebhookPg] Missing bulk operation id/url", {
        topic,
        shop,
        webhookId,
        payload,
      });
      return; // webhook still returns 200 via processWebhooks
    }

    if (status !== "COMPLETED") {
      logger.warn(
        "[handleBulkFinishWebhookPg] Bulk operation not COMPLETED, ignoring",
        { topic, shop, webhookId, bulkOperationId, status },
      );
      return;
    }

    // In processWebhooks callback, `shop` is the verified shop domain.
    const shopDomain = shop;

    if (!shopDomain) {
      logger.error("[handleBulkFinishWebhookPg] No shop domain in callback", {
        topic,
        webhookId,
        payload,
      });
      return;
    }

    // Map shopDomain -> shopId
    const { rows } = await pool.query(
      "SELECT id, default_location_id FROM shops WHERE shop_domain = $1 LIMIT 1",
      [shopDomain],
    );

    if (!rows.length) {
      logger.warn(
        "[handleBulkFinishWebhookPg] Shop not found for bulk finish",
        { shopDomain, bulkOperationId },
      );
      return;
    }

    const shopId = rows[0].id;
    const defaultLocationId = rows[0].default_location_id || null;

    await dispatchBulkOperationResultPg({
      shopId,
      bulkOperationId,
      bulkOperationUrl,
      defaultLocationId,
    });

    logger.info("[handleBulkFinishWebhookPg] Dispatched bulk operation result", {
      shopId,
      shopDomain,
      bulkOperationId,
      bulkOperationUrl,
    });
  } catch (err) {
    logger.error("[handleBulkFinishWebhookPg] Error handling webhook", {
      error: err,
      topic,
      shop,
      webhookId,
    });
    // Let processWebhooks decide HTTP response; we just log.
  }
}

/**
 * Optional Express-style wrapper, if you still use this elsewhere.
 * Not used by shopify.processWebhooks, but kept for backwards compatibility.
 */
export async function bulkFinishWebhookPg(req, res, next) {
  try {
    const body = req.body || {};

    const bulkOperationId =
      body.admin_graphql_api_id ??
      body.id ??
      null;

    const bulkOperationUrl = body.url ?? null;
    const status = body.status ?? null;

    if (!bulkOperationId || !bulkOperationUrl) {
      logger.warn("[bulkFinishWebhookPg] Missing bulk operation id/url", {
        body,
      });
      return res.status(200).send("ignored");
    }

    if (status !== "COMPLETED") {
      logger.warn("[bulkFinishWebhookPg] Bulk operation not COMPLETED", {
        bulkOperationId,
        status,
      });
      return res.status(200).send("ignored");
    }

    const shopDomain =
      req.shop ||
      body.shop_domain ||
      req.headers["x-shopify-shop-domain"];

    if (!shopDomain) {
      logger.error("[bulkFinishWebhookPg] No shop domain on webhook");
      return res.status(400).send("no shop domain");
    }

    const { rows } = await pool.query(
      "SELECT id, default_location_id FROM shops WHERE shop_domain = $1 LIMIT 1",
      [shopDomain],
    );

    if (!rows.length) {
      logger.warn("[bulkFinishWebhookPg] Shop not found for bulk finish", {
        shopDomain,
      });
      return res.status(200).send("ok");
    }

    const shopId = rows[0].id;
    const defaultLocationId = rows[0].default_location_id || null;

    await dispatchBulkOperationResultPg({
      shopId,
      bulkOperationId,
      bulkOperationUrl,
      defaultLocationId,
    });

    res.status(200).send("ok");
  } catch (err) {
    next(err);
  }
}