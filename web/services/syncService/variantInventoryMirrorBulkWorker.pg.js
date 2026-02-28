// FILE: web/services/syncService/variantInventoryMirrorBulkWorker.pg.js

import readline from "readline";
import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";
import { hydrateVariantInventoryMirrorBatchPg } from "./variantInventoryMirrorSyncProcessor.pg.js";

/* -------------------------------------------------------------------------- */
/*  Safety constants                                                          */
/* -------------------------------------------------------------------------- */

const HYDRATION_BATCH_SIZE = 500;        // number of JSONL records per batch
const PROGRESS_PERSIST_INTERVAL = 1_000; // every N records, update sync_history
const MAX_STREAM_RECORDS = 500_000;      // hard cap to avoid runaway jobs

/* -------------------------------------------------------------------------- */
/*  Per-shop advisory locks (Postgres)                                       */
/* -------------------------------------------------------------------------- */

/**
 * We use pg_advisory_lock to prevent concurrent inventory syncs per shop.
 * You can swap this for Redis locks if you already have a pattern for that.
 */

const INVENTORY_LOCK_KEY = 2; // logical namespace for "inventory sync" locks

async function acquireInventorySyncLock(client, shopId) {
  const sql = "SELECT pg_try_advisory_lock($1, $2) AS locked";
  const { rows } = await client.query(sql, [shopId, INVENTORY_LOCK_KEY]);
  if (!rows[0]?.locked) {
    throw new Error("inventorySync.lockNotAcquired");
  }
}

async function releaseInventorySyncLock(client, shopId) {
  try {
    await client.query("SELECT pg_advisory_unlock($1, $2)", [
      shopId,
      INVENTORY_LOCK_KEY,
    ]);
  } catch (err) {
    logger.warn("[variantInventoryMirrorBulkWorker.pg] Failed to release advisory lock", {
      shopId,
      err,
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Sync history helpers                                                      */
/* -------------------------------------------------------------------------- */

async function markSyncHistoryStart(client, syncHistoryId) {
  if (!syncHistoryId) return;
  await client.query(
    `
    UPDATE sync_history
    SET
      status = 'running',
      started_at = COALESCE(started_at, NOW())
    WHERE id = $1
  `,
    [syncHistoryId],
  );
}

async function updateSyncHistoryProgress(client, syncHistoryId, processedCount) {
  if (!syncHistoryId) return;
  await client.query(
    `
    UPDATE sync_history
    SET
      processed_count = $2,
      updated_at = NOW()
    WHERE id = $1
  `,
    [syncHistoryId, processedCount],
  );
}

async function markSyncHistoryCompleted(client, syncHistoryId, processedCount) {
  if (!syncHistoryId) return;
  await client.query(
    `
    UPDATE sync_history
    SET
      status = 'completed',
      processed_count = $2,
      finished_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
  `,
    [syncHistoryId, processedCount],
  );
}

async function markSyncHistoryFailed(client, syncHistoryId, processedCount, errorMessage) {
  if (!syncHistoryId) return;
  await client.query(
    `
    UPDATE sync_history
    SET
      status = 'failed',
      processed_count = $2,
      error_message = LEFT($3::text, 1000),
      finished_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
  `,
    [syncHistoryId, processedCount, errorMessage || "unknown error"],
  );
}

/* -------------------------------------------------------------------------- */
/*  Main worker entrypoint                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Process Shopify Bulk Operation JSONL result for inventory levels and
 * hydrate variant_inventory_mirror + variant_mirror.
 *
 * @param {object} params
 * @param {number} params.shopId
 * @param {number} params.syncHistoryId
 * @param {NodeJS.ReadableStream} params.jsonlStream
 * @param {number} params.defaultLocationId - shop's primary location id (numeric)
 */
export async function runVariantInventoryMirrorBulkWorker({
  shopId,
  syncHistoryId,
  jsonlStream,
  defaultLocationId,
}) {
  if (!shopId) throw new Error("runVariantInventoryMirrorBulkWorker: shopId required");
  if (!jsonlStream) throw new Error("runVariantInventoryMirrorBulkWorker: jsonlStream required");

  const client = await pool.connect();
  let processed = 0;
  let batch = [];

  try {
    await acquireInventorySyncLock(client, shopId);
    await markSyncHistoryStart(client, syncHistoryId);

    const rl = readline.createInterface({
      input: jsonlStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line || !line.trim()) continue;

      processed += 1;

      if (processed > MAX_STREAM_RECORDS) {
        throw new Error(
          `inventorySync.tooManyRecords: exceeded MAX_STREAM_RECORDS=${MAX_STREAM_RECORDS}`,
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        logger.warn(
          "[variantInventoryMirrorBulkWorker.pg] Skipping invalid JSONL line",
          {
            shopId,
            lineSnippet: line.slice(0, 200),
          },
        );
        continue;
      }

      // Normalize raw Shopify inventoryLevel node -> internal record shape.
      // This depends on your bulk query. A common shape:
      //
      // {
      //   "id": "gid://shopify/InventoryLevel/...",
      //   "available": 10,
      //   "inventory_item": { "id": "gid://shopify/InventoryItem/123" },
      //   "location": { "id": "gid://shopify/Location/456", "name": "Main" }
      // }
      //
      // Adapt these keys if your query differs.
      const node = parsed; // if you have { "node": { ... } } then use parsed.node
      const inventoryItemGid =
        node.inventory_item?.id ||
        node.inventoryItem?.id ||
        node.inventoryItemGid ||
        node.inventory_item_gid;
      const locationGid =
        node.location?.id ||
        node.locationGid ||
        node.location_gid;
      const locationName =
        node.location?.name ||
        node.location_name ||
        null;
      const available = node.available ?? node.quantity ?? 0;

      batch.push({
        inventoryItemGid,
        locationGid,
        locationName,
        available,
      });

      if (batch.length >= HYDRATION_BATCH_SIZE) {
        await hydrateVariantInventoryMirrorBatchPg({
          shopId,
          records: batch,
          defaultLocationId,
          client,
        });
        batch = [];
      }

      if (processed % PROGRESS_PERSIST_INTERVAL === 0) {
        await updateSyncHistoryProgress(client, syncHistoryId, processed);
      }
    }

    // Flush remaining batch
    if (batch.length > 0) {
      await hydrateVariantInventoryMirrorBatchPg({
        shopId,
        records: batch,
        defaultLocationId,
        client,
      });
      batch = [];
    }

    await markSyncHistoryCompleted(client, syncHistoryId, processed);
  } catch (err) {
    logger.error(
      "[variantInventoryMirrorBulkWorker.pg] Inventory bulk worker failed",
      { shopId, syncHistoryId, processed, err },
    );
    await markSyncHistoryFailed(client, syncHistoryId, processed, err.message);
    throw err;
  } finally {
    try {
      await releaseInventorySyncLock(client, shopId);
    } finally {
      client.release();
    }
  }
}