// FILE: web/services/syncService/variantMirrorBulkWorker.pg.js

import readline from "readline";
import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

/* -------------------------------------------------------------------------- */
/*  Safety constants                                                          */
/* -------------------------------------------------------------------------- */

const HYDRATION_BATCH_SIZE = 500;        // variants per batch
const PROGRESS_PERSIST_INTERVAL = 1_000; // persist every N variants
const MAX_STREAM_RECORDS = 1_000_000;    // hard safety cap

/* -------------------------------------------------------------------------- */
/*  Advisory locks (per-shop variant sync)                                    */
/* -------------------------------------------------------------------------- */

const VARIANT_LOCK_KEY = 2; // logical namespace for "variant sync" locks (distinct from inventory)

async function acquireVariantSyncLock(client, shopId) {
  const sql = "SELECT pg_try_advisory_lock($1, $2) AS locked";
  const { rows } = await client.query(sql, [shopId, VARIANT_LOCK_KEY]);
  if (!rows[0]?.locked) {
    throw new Error("variantSync.lockNotAcquired");
  }
}

async function releaseVariantSyncLock(client, shopId) {
  try {
    await client.query("SELECT pg_advisory_unlock($1, $2)", [
      shopId,
      VARIANT_LOCK_KEY,
    ]);
  } catch (err) {
    logger.warn("[variantMirrorBulkWorker.pg] Failed to release advisory lock", {
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
      started_at = COALESCE(started_at, NOW()),
      updated_at = NOW()
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
/*  Mapping + batch upsert into variant_mirror                                */
/* -------------------------------------------------------------------------- */

function parseNumericIdFromGid(gid) {
  if (!gid) return null;
  const parts = String(gid).split("/");
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map a Shopify ProductVariant node (from bulk JSONL) to variant_mirror row.
 * Adjust field accesses to match your bulk query.
 */
function mapVariantNodeToRow(shopId, node) {
  const variantId = parseNumericIdFromGid(node.id);
  const productId = parseNumericIdFromGid(node.product?.id);

  const title = node.title ?? null;
  const sku = node.sku ?? null;
  const barcode = node.barcode ?? null;

  const price = node.price ?? null;
  const compareAtPrice = node.compareAtPrice ?? null;

  const taxable = node.taxable ?? null;
  const inventoryPolicy = node.inventoryPolicy ?? null; // DENY | CONTINUE
  const requiresShipping = node.requiresShipping ?? null;

  const inventoryItemId = parseNumericIdFromGid(
    node.inventoryItem?.id ||
      node.inventory_item_id ||
      node.inventory_item_gid,
  );

  // cost may be under unitCost or cost depending on API version
  let cost = null;
  if (node.inventoryItem?.unitCost?.amount != null) {
    cost = node.inventoryItem.unitCost.amount;
  } else if (node.inventoryItem?.cost != null) {
    cost = node.inventoryItem.cost;
  }

  const tracked = node.inventoryItem?.tracked ?? null;

  // weight + unit
  let weight = null;
  let weightUnit = null;
  if (node.weight != null && node.weightUnit) {
    weight = node.weight;
    weightUnit = node.weightUnit;
  } else if (node.weightInUnit?.value != null && node.weightInUnit?.unit) {
    weight = node.weightInUnit.value;
    weightUnit = node.weightInUnit.unit;
  }

  const createdAt = node.createdAt ?? null;
  const updatedAt = node.updatedAt ?? null;

  return {
    shopId,
    shopifyProductId: productId,
    shopifyVariantId: variantId,
    title,
    sku,
    barcode,
    price,
    compareAtPrice,
    taxable,
    inventoryPolicy,
    requiresShipping,
    inventoryItemId,
    tracked,
    cost,
    weight,
    weightUnit,
    createdAt,
    updatedAt,
  };
}

/**
 * Batch upsert into variant_mirror.
 * Assumes variant_mirror has at least:
 *   (shop_id, shopify_product_id, shopify_variant_id, title, sku, barcode,
 *    price, compare_at_price, taxable, inventory_policy, requires_shipping,
 *    inventory_item_id, tracked, cost, weight, weight_unit,
 *    created_at_source, updated_at_source, default_location_id,
 *    default_available, total_available, created_at, updated_at)
 */
async function upsertVariantMirrorBatchPg({ shopId, records, client }) {
  if (!records.length) return;

  const values = [];
  const params = [];
  let i = 1;

  for (const r of records) {
    values.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
    );
    params.push(
      r.shopId,
      r.shopifyProductId,
      r.shopifyVariantId,
      r.title,
      r.sku,
      r.barcode,
      r.price,
      r.compareAtPrice,
      r.taxable,
      r.inventoryPolicy,
      r.requiresShipping,
      r.inventoryItemId,
      r.tracked,
      r.cost,
      r.weight,
      r.weightUnit,
      r.createdAt,
      r.updatedAt,
    );
  }

  const sql = `
    INSERT INTO variant_mirror (
      shop_id,
      shopify_product_id,
      shopify_variant_id,
      title,
      sku,
      barcode,
      price,
      compare_at_price,
      taxable,
      inventory_policy,
      requires_shipping,
      inventory_item_id,
      tracked,
      cost,
      weight,
      weight_unit,
      created_at_source,
      updated_at_source
    )
    VALUES ${values.join(", ")}
    ON CONFLICT (shop_id, shopify_variant_id)
    DO UPDATE SET
      shopify_product_id  = EXCLUDED.shopify_product_id,
      title               = EXCLUDED.title,
      sku                 = EXCLUDED.sku,
      barcode             = EXCLUDED.barcode,
      price               = EXCLUDED.price,
      compare_at_price    = EXCLUDED.compare_at_price,
      taxable             = EXCLUDED.taxable,
      inventory_policy    = EXCLUDED.inventory_policy,
      requires_shipping   = EXCLUDED.requires_shipping,
      inventory_item_id   = EXCLUDED.inventory_item_id,
      tracked             = EXCLUDED.tracked,
      cost                = EXCLUDED.cost,
      weight              = EXCLUDED.weight,
      weight_unit         = EXCLUDED.weight_unit,
      created_at_source   = EXCLUDED.created_at_source,
      updated_at_source   = EXCLUDED.updated_at_source,
      updated_at          = NOW()
  `;

  await client.query(sql, params);
}

/* -------------------------------------------------------------------------- */
/*  Main worker entrypoint                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Process Shopify Variant Bulk Operation JSONL and hydrate variant_mirror.
 *
 * @param {object} params
 * @param {number} params.shopId
 * @param {number} params.syncHistoryId
 * @param {NodeJS.ReadableStream} params.jsonlStream
 */
export async function runVariantMirrorBulkWorker({
  shopId,
  syncHistoryId,
  jsonlStream,
}) {
  if (!shopId) throw new Error("runVariantMirrorBulkWorker: shopId required");
  if (!jsonlStream) throw new Error("runVariantMirrorBulkWorker: jsonlStream required");

  const client = await pool.connect();
  let processed = 0;
  let batch = [];

  try {
    await acquireVariantSyncLock(client, shopId);
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
          `variantSync.tooManyRecords: exceeded MAX_STREAM_RECORDS=${MAX_STREAM_RECORDS}`,
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        logger.warn("[variantMirrorBulkWorker.pg] Skipping invalid JSONL line", {
          shopId,
          lineSnippet: line.slice(0, 200),
        });
        continue;
      }

      const node = parsed.node || parsed;
      if (!node?.id) continue;

      const row = mapVariantNodeToRow(shopId, node);
      if (!row.shopifyVariantId || !row.shopifyProductId) continue;

      batch.push(row);

      if (batch.length >= HYDRATION_BATCH_SIZE) {
        await upsertVariantMirrorBatchPg({ shopId, records: batch, client });
        batch = [];
      }

      if (processed % PROGRESS_PERSIST_INTERVAL === 0) {
        await updateSyncHistoryProgress(client, syncHistoryId, processed);
      }
    }

    if (batch.length > 0) {
      await upsertVariantMirrorBatchPg({ shopId, records: batch, client });
      batch = [];
    }

    await markSyncHistoryCompleted(client, syncHistoryId, processed);
  } catch (err) {
    logger.error("[variantMirrorBulkWorker.pg] Variant bulk worker failed", {
      shopId,
      syncHistoryId,
      processed,
      err,
    });
    await markSyncHistoryFailed(client, syncHistoryId, processed, err.message);
    throw err;
  } finally {
    try {
      await releaseVariantSyncLock(client, shopId);
    } finally {
      client.release();
    }
  }
}