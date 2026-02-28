// FILE: web/controllers/sync/bulkFinishController.pg.js

import fetch from "node-fetch";
import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

import {
  runProductMirrorBulkWorker,
} from "../../services/syncService/productMirrorBulkWorker.pg.js";

import {
  runVariantMirrorBulkWorker,
} from "../../services/syncService/variantMirrorBulkWorker.pg.js";

import {
  runVariantInventoryMirrorBulkWorker,
} from "../../services/syncService/variantInventoryMirrorBulkWorker.pg.js";

/**
 * Shopify bulk_operations/finish webhook
 */
export async function bulkFinishControllerPg(req, res, next) {
  try {
    const body = req.body;

    const bulkOperationId = body.admin_graphql_api_id;
    const resultUrl = body.url;
    const status = body.status;
    const shopDomain =
      req.headers["x-shopify-shop-domain"] || body.shop_domain;

    if (status !== "COMPLETED") {
      return res.status(200).send("ignored");
    }

    const { rows: shopRows } = await pool.query(
      `SELECT id, default_location_id
       FROM shops
       WHERE shop_domain=$1
       LIMIT 1`,
      [shopDomain]
    );

    if (!shopRows.length) {
      return res.status(200).send("shop not found");
    }

    const shopId = shopRows[0].id;
    const defaultLocationId = shopRows[0].default_location_id;

    const { rows: syncRows } = await pool.query(
      `SELECT * FROM sync_history
       WHERE shop_id=$1
       AND bulk_operation_id=$2
       LIMIT 1`,
      [shopId, bulkOperationId]
    );

    if (!syncRows.length) {
      return res.status(200).send("sync row not found");
    }

    const syncRow = syncRows[0];

    await pool.query(
      `UPDATE sync_history
       SET status='processing',
           result_url=$2,
           updated_at=NOW()
       WHERE id=$1`,
      [syncRow.id, resultUrl]
    );

    const response = await fetch(resultUrl);
    if (!response.ok || !response.body) {
      throw new Error("Failed to fetch bulk JSONL result");
    }

    if (syncRow.source === "PRODUCTS") {
      await runProductMirrorBulkWorker({
        shopId,
        syncHistoryId: syncRow.id,
        jsonlStream: response.body,
      });
    }

    if (syncRow.source === "VARIANTS") {
      await runVariantMirrorBulkWorker({
        shopId,
        syncHistoryId: syncRow.id,
        jsonlStream: response.body,
      });
    }

    if (syncRow.source === "INVENTORY") {
      await runVariantInventoryMirrorBulkWorker({
        shopId,
        syncHistoryId: syncRow.id,
        jsonlStream: response.body,
        defaultLocationId,
      });
    }

    await pool.query(
      `UPDATE sync_history
       SET status='completed',
           finished_at=NOW(),
           updated_at=NOW()
       WHERE id=$1`,
      [syncRow.id]
    );

    res.status(200).send("ok");
  } catch (err) {
    logger.error("[bulkFinishController.pg] Error", err);
    next(err);
  }
}