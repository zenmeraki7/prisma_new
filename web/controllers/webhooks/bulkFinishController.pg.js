// FILE: web/controllers/webhooks/bulkFinishController.pg.js

import { dispatchBulkOperationResultPg } from "../../services/syncService/syncCoordinator.pg.js";
import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

/**
 * Shopify bulk_operations/finish webhook.
 *
 * Shopify sends something like:
 * {
 *   "admin_graphql_api_id": "gid://shopify/BulkOperation/123",
 *   "status": "COMPLETED",
 *   "error_code": null,
 *   "completed_at": "...",
 *   "object_count": "1234",
 *   "file_size": "12345",
 *   "url": "https://..."
 * }
 */
export async function bulkFinishWebhookPg(req, res, next) {
  try {
    const body = req.body;

    const bulkOperationId =
      body.admin_graphql_api_id ||
      body.admin_graphql_api_id ||
      body.id;

    const bulkOperationUrl = body.url;
    const status = body.status;

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

    // Derive shop domain from the HMAC-verified header your webhook lib exposes.
    // With @shopify/shopify-api middleware you'd often have req.shop or req.body.shop_domain.
    const shopDomain =
      req.shop ||
      body.shop_domain ||
      req.headers["x-shopify-shop-domain"];

    if (!shopDomain) {
      logger.error("[bulkFinishWebhookPg] No shop domain on webhook");
      return res.status(400).send("no shop domain");
    }

    // Map shopDomain -> shopId
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