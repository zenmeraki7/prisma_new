// FILE: web/services/syncService/productMirrorBulkWorker.pg.js

import readline from "readline";
import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

/* -------------------------------------------------------------------------- */
/*  Safety constants                                                          */
/* -------------------------------------------------------------------------- */

const HYDRATION_BATCH_SIZE = 250;        // products per batch
const PROGRESS_PERSIST_INTERVAL = 500;   // persist every N products
const MAX_STREAM_RECORDS = 200_000;      // hard safety cap

/* -------------------------------------------------------------------------- */
/*  Advisory locks (per-shop product sync)                                    */
/* -------------------------------------------------------------------------- */

const PRODUCT_LOCK_KEY = 1; // logical namespace for "product sync" locks

async function acquireProductSyncLock(client, shopId) {
  const sql = "SELECT pg_try_advisory_lock($1, $2) AS locked";
  const { rows } = await client.query(sql, [shopId, PRODUCT_LOCK_KEY]);
  if (!rows[0]?.locked) {
    throw new Error("productSync.lockNotAcquired");
  }
}

async function releaseProductSyncLock(client, shopId) {
  try {
    await client.query("SELECT pg_advisory_unlock($1, $2)", [
      shopId,
      PRODUCT_LOCK_KEY,
    ]);
  } catch (err) {
    logger.warn("[productMirrorBulkWorker.pg] Failed to release advisory lock", {
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
/*  Mapping + batch upsert into product_mirror                                */
/* -------------------------------------------------------------------------- */

function parseNumericIdFromGid(gid) {
  if (!gid) return null;
  const parts = String(gid).split("/");
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map a Shopify Product node (from bulk JSONL) to product_mirror row shape.
 * Adjust field accesses to match your bulk query.
 */
function mapProductNodeToRow(shopId, node) {
  const productId = parseNumericIdFromGid(node.id);

  const title = node.title ?? null;
  const handle = node.handle ?? null;
  const status = node.status ?? null; // ACTIVE, DRAFT, ARCHIVED
  const productType = node.productType ?? null;
  const vendor = node.vendor ?? null;
  const templateSuffix = node.templateSuffix ?? null;
  const tags = Array.isArray(node.tags) ? node.tags : [];
  const publishedAt = node.publishedAt ?? null;
  const createdAt = node.createdAt ?? null;
  const updatedAt = node.updatedAt ?? null;
  const onlineStoreUrl = node.onlineStoreUrl ?? null;
  const seoTitle = node.seo?.title ?? null;
  const seoDescription = node.seo?.description ?? null;

  return {
    shopId,
    shopifyProductId: productId,
    title,
    handle,
    status,
    productType,
    vendor,
    templateSuffix,
    tags,
    publishedAt,
    createdAt,
    updatedAt,
    onlineStoreUrl,
    seoTitle,
    seoDescription,
  };
}

/**
 * Batch upsert into product_mirror.
 * Assumes product_mirror has at least:
 *   (shop_id, shopify_product_id, title, handle, status, product_type,
 *    vendor, template_suffix, tags, published_at, created_at, updated_at,
 *    online_store_url, seo_title, seo_description, rollup_total_inventory,
 *    rollup_variant_count, created_at, updated_at)
 */
async function upsertProductMirrorBatchPg({ shopId, records, client }) {
  if (!records.length) return;

  const values = [];
  const params = [];
  let i = 1;

  for (const r of records) {
    values.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
    );
    params.push(
      r.shopId,
      r.shopifyProductId,
      r.title,
      r.handle,
      r.status,
      r.productType,
      r.vendor,
      r.templateSuffix,
      r.tags,
      r.publishedAt,
      r.createdAt,
      r.updatedAt,
      r.onlineStoreUrl,
      r.seoTitle,
      r.seoDescription,
    );
  }

  const sql = `
    INSERT INTO product_mirror (
      shop_id,
      shopify_product_id,
      title,
      handle,
      status,
      product_type,
      vendor,
      template_suffix,
      tags,
      published_at,
      created_at_source,
      updated_at_source,
      online_store_url,
      seo_title,
      seo_description
    )
    VALUES ${values.join(", ")}
    ON CONFLICT (shop_id, shopify_product_id)
    DO UPDATE SET
      title              = EXCLUDED.title,
      handle             = EXCLUDED.handle,
      status             = EXCLUDED.status,
      product_type       = EXCLUDED.product_type,
      vendor             = EXCLUDED.vendor,
      template_suffix    = EXCLUDED.template_suffix,
      tags               = EXCLUDED.tags,
      published_at       = EXCLUDED.published_at,
      created_at_source  = EXCLUDED.created_at_source,
      updated_at_source  = EXCLUDED.updated_at_source,
      online_store_url   = EXCLUDED.online_store_url,
      seo_title          = EXCLUDED.seo_title,
      seo_description    = EXCLUDED.seo_description,
      updated_at         = NOW()
  `;

  await client.query(sql, params);
}

/* -------------------------------------------------------------------------- */
/*  Main worker entrypoint                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Process Shopify Product Bulk Operation JSONL and hydrate product_mirror.
 *
 * @param {object} params
 * @param {number} params.shopId
 * @param {number} params.syncHistoryId
 * @param {NodeJS.ReadableStream} params.jsonlStream
 */
export async function runProductMirrorBulkWorker({
  shopId,
  syncHistoryId,
  jsonlStream,
}) {
  if (!shopId) throw new Error("runProductMirrorBulkWorker: shopId required");
  if (!jsonlStream) throw new Error("runProductMirrorBulkWorker: jsonlStream required");

  const client = await pool.connect();
  let processed = 0;
  let batch = [];

  try {
    await acquireProductSyncLock(client, shopId);
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
          `productSync.tooManyRecords: exceeded MAX_STREAM_RECORDS=${MAX_STREAM_RECORDS}`,
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        logger.warn("[productMirrorBulkWorker.pg] Skipping invalid JSONL line", {
          shopId,
          lineSnippet: line.slice(0, 200),
        });
        continue;
      }

      // Some bulk payloads wrap the product in { "node": { ... } }
      const node = parsed.node || parsed;
      if (!node?.id) continue;

      const row = mapProductNodeToRow(shopId, node);
      if (!row.shopifyProductId) continue;

      batch.push(row);

      if (batch.length >= HYDRATION_BATCH_SIZE) {
        await upsertProductMirrorBatchPg({ shopId, records: batch, client });
        batch = [];
      }

      if (processed % PROGRESS_PERSIST_INTERVAL === 0) {
        await updateSyncHistoryProgress(client, syncHistoryId, processed);
      }
    }

    if (batch.length > 0) {
      await upsertProductMirrorBatchPg({ shopId, records: batch, client });
      batch = [];
    }

    await markSyncHistoryCompleted(client, syncHistoryId, processed);
  } catch (err) {
    logger.error("[productMirrorBulkWorker.pg] Product bulk worker failed", {
      shopId,
      syncHistoryId,
      processed,
      err,
    });
    await markSyncHistoryFailed(client, syncHistoryId, processed, err.message);
    throw err;
  } finally {
    try {
      await releaseProductSyncLock(client, shopId);
    } finally {
      client.release();
    }
  }
}