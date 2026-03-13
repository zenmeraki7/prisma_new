import readline from "readline";
import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

const HYDRATION_BATCH_SIZE = 250;
const PROGRESS_PERSIST_INTERVAL = 500;
const MAX_STREAM_RECORDS = 200_000;
const PRODUCT_LOCK_KEY = 1;

async function acquireProductSyncLock(client, shopId) {
  const { rows } = await client.query(
    "SELECT pg_try_advisory_lock($1, $2) AS locked",
    [shopId, PRODUCT_LOCK_KEY],
  );
  if (!rows[0]?.locked) throw new Error("productSync.lockNotAcquired");
}

async function releaseProductSyncLock(client, shopId) {
  try {
    await client.query("SELECT pg_advisory_unlock($1, $2)", [shopId, PRODUCT_LOCK_KEY]);
  } catch (err) {
    logger.warn("[productMirrorBulkWorker.pg] Failed to release advisory lock", {
      shopId,
      err,
    });
  }
}

async function markSyncHistoryStart(client, syncHistoryId) {
  if (!syncHistoryId) return;
  await client.query(
    `
      UPDATE sync_history
      SET status = 'running',
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
      SET processed_count = $2,
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
      SET status = 'completed',
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
      SET status = 'failed',
          processed_count = $2,
          error_message = LEFT($3::text, 1000),
          finished_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [syncHistoryId, processedCount, errorMessage || "unknown error"],
  );
}

function parseNumericIdFromGid(gid) {
  if (!gid) return null;
  const parts = String(gid).split("/");
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "active" || s === "draft" || s === "archived") return s;
  return "draft";
}

function mapProductNodeToRow(shopId, node) {
  const shopifyProductId = parseNumericIdFromGid(node.id);
  if (!shopifyProductId) return null;

  return {
    shopId,
    shopifyProductId,
    category: node.category?.name ?? null,
    descriptionHtml: node.descriptionHtml ?? node.description ?? null,
    handle: node.handle ?? null,
    productTypeCustom: node.productType ?? null,
    status: normalizeStatus(node.status),
    themeTemplate: node.templateSuffix ?? null,
    title: node.title ?? null,
    vendor: node.vendor ?? null,
    createdAt: node.createdAt ?? null,
    publishedAt: node.publishedAt ?? null,
    updatedAt: node.updatedAt ?? null,

    // until true publication + SEO-hidden sync exists
    seoHidden: false,
    visibleOnlineStore:
      typeof node.isPublished === "boolean"
        ? node.isPublished
        : Boolean(node.publishedAt || node.onlineStoreUrl),
    visiblePos: false,

    option1Name: Array.isArray(node.options) ? node.options[0]?.name ?? null : null,
    option2Name: Array.isArray(node.options) ? node.options[1]?.name ?? null : null,
    option3Name: Array.isArray(node.options) ? node.options[2]?.name ?? null : null,

    seoTitle: node.seo?.title ?? null,
    seoDescription: node.seo?.description ?? null,
  };
}

async function upsertProductMirrorBatchPg({ records, client }) {
  if (!records.length) return;

  const values = [];
  const params = [];
  let i = 1;

  for (const r of records) {
    values.push(
      `(
        $${i++}, $${i++}, $${i++}, $${i++}, $${i++},
        $${i++}, $${i++}, $${i++}, $${i++}, $${i++},
        $${i++}, $${i++}, $${i++}, $${i++}, $${i++},
        $${i++}, $${i++}, $${i++}, $${i++}
      )`,
    );

    params.push(
      r.shopId,
      r.shopifyProductId,
      r.category,
      r.descriptionHtml,
      r.handle,
      r.productTypeCustom,
      r.status,
      r.themeTemplate,
      r.title,
      r.vendor,
      r.createdAt,
      r.publishedAt,
      r.updatedAt,
      r.seoHidden,
      r.visibleOnlineStore,
      r.visiblePos,
      r.option1Name,
      r.option2Name,
      r.option3Name,
      r.seoTitle,
      r.seoDescription,
    );
  }

  const sql = `
    INSERT INTO product_mirror (
      shop_id,
      shopify_product_id,
      category,
      description_html,
      handle,
      product_type_custom,
      status,
      theme_template,
      title,
      vendor,
      created_at,
      published_at,
      updated_at,
      seo_hidden,
      visible_online_store,
      visible_pos,
      option1_name,
      option2_name,
      option3_name,
      seo_title,
      seo_description
    )
    VALUES ${values.join(", ")}
    ON CONFLICT (shop_id, shopify_product_id)
    DO UPDATE SET
      category             = EXCLUDED.category,
      description_html     = EXCLUDED.description_html,
      handle               = EXCLUDED.handle,
      product_type_custom  = EXCLUDED.product_type_custom,
      status               = EXCLUDED.status,
      theme_template       = EXCLUDED.theme_template,
      title                = EXCLUDED.title,
      vendor               = EXCLUDED.vendor,
      created_at           = EXCLUDED.created_at,
      published_at         = EXCLUDED.published_at,
      updated_at           = EXCLUDED.updated_at,
      seo_hidden           = EXCLUDED.seo_hidden,
      visible_online_store = EXCLUDED.visible_online_store,
      visible_pos          = EXCLUDED.visible_pos,
      option1_name         = EXCLUDED.option1_name,
      option2_name         = EXCLUDED.option2_name,
      option3_name         = EXCLUDED.option3_name,
      seo_title            = EXCLUDED.seo_title,
      seo_description      = EXCLUDED.seo_description
  `;

  await client.query(sql, params);
}

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
      if (!line?.trim()) continue;

      processed += 1;
      if (processed > MAX_STREAM_RECORDS) {
        throw new Error(`productSync.tooManyRecords: exceeded MAX_STREAM_RECORDS=${MAX_STREAM_RECORDS}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      const node = parsed.node || parsed;
      if (!node?.id) continue;

      const row = mapProductNodeToRow(shopId, node);
      if (!row) continue;

      batch.push(row);

      if (batch.length >= HYDRATION_BATCH_SIZE) {
        await upsertProductMirrorBatchPg({ records: batch, client });
        batch = [];
      }

      if (processed % PROGRESS_PERSIST_INTERVAL === 0) {
        await updateSyncHistoryProgress(client, syncHistoryId, processed);
      }
    }

    if (batch.length > 0) {
      await upsertProductMirrorBatchPg({ records: batch, client });
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