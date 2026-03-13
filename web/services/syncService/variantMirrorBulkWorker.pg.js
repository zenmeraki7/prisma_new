import readline from "readline";
import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

const HYDRATION_BATCH_SIZE = 500;
const PROGRESS_PERSIST_INTERVAL = 1000;
const MAX_STREAM_RECORDS = 1_000_000;
const VARIANT_LOCK_KEY = 2;

async function acquireVariantSyncLock(client, shopId) {
  const { rows } = await client.query(
    "SELECT pg_try_advisory_lock($1, $2) AS locked",
    [shopId, VARIANT_LOCK_KEY],
  );
  if (!rows[0]?.locked) throw new Error("variantSync.lockNotAcquired");
}

async function releaseVariantSyncLock(client, shopId) {
  try {
    await client.query("SELECT pg_advisory_unlock($1, $2)", [shopId, VARIANT_LOCK_KEY]);
  } catch (err) {
    logger.warn("[variantMirrorBulkWorker.pg] Failed to release advisory lock", {
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

function normalizeInventoryPolicy(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "continue" ? "continue" : "deny";
}

function normalizeWeightUnit(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return ["g", "kg", "oz", "lb"].includes(v) ? v : null;
}

function computeProfitMarginPct(price, cost) {
  const p = price == null ? null : Number(price);
  const c = cost == null ? null : Number(cost);

  if (!Number.isFinite(p) || !Number.isFinite(c) || p === 0) return null;
  return Number((((p - c) / p) * 100).toFixed(4));
}

function mapVariantNodeToRow(shopId, node) {
  const shopifyVariantId = parseNumericIdFromGid(node.id);
  const shopifyProductId = parseNumericIdFromGid(node.product?.id);
  const inventoryItemId = parseNumericIdFromGid(node.inventoryItem?.id);

  if (!shopifyVariantId || !shopifyProductId) return null;

  let cost = null;
  if (node.inventoryItem?.unitCost?.amount != null) {
    cost = Number(node.inventoryItem.unitCost.amount);
  } else if (node.inventoryItem?.cost != null) {
    cost = Number(node.inventoryItem.cost);
  }

  const price = node.price != null ? Number(node.price) : null;
  const compareAtPrice = node.compareAtPrice != null ? Number(node.compareAtPrice) : null;
  const chargeTax = typeof node.taxable === "boolean" ? node.taxable : true;
  const physicalProduct =
    typeof node.requiresShipping === "boolean" ? node.requiresShipping : true;
  const trackQuantity =
    typeof node.inventoryItem?.tracked === "boolean" ? node.inventoryItem.tracked : true;

  let weight = null;
  let weightUnit = null;

  if (node.weight != null && node.weightUnit) {
    weight = Number(node.weight);
    weightUnit = normalizeWeightUnit(node.weightUnit);
  } else if (node.weightInUnit?.value != null && node.weightInUnit?.unit) {
    weight = Number(node.weightInUnit.value);
    weightUnit = normalizeWeightUnit(node.weightInUnit.unit);
  }

  return {
    shopId,
    shopifyVariantId,
    shopifyProductId,
    title: node.title ?? "",
    sku: node.sku ?? null,
    barcode: node.barcode ?? null,
    chargeTax,
    compareAtPrice,
    cost,
    countryOfOrigin: node.inventoryItem?.countryCodeOfOrigin ?? null,
    hsTariffCode:
      node.inventoryItem?.harmonizedSystemCode ??
      node.inventoryItem?.countryHarmonizedSystemCodes?.[0]?.harmonizedSystemCode ??
      null,
    inventoryOutOfStockPolicy: normalizeInventoryPolicy(node.inventoryPolicy),
    physicalProduct,
    price,
    profitMarginPct: computeProfitMarginPct(price, cost),
    trackQuantity,
    inventoryQuantity: 0,
    weight,
    weightUnit,
    option1Value: Array.isArray(node.selectedOptions) ? node.selectedOptions[0]?.value ?? null : null,
    option2Value: Array.isArray(node.selectedOptions) ? node.selectedOptions[1]?.value ?? null : null,
    option3Value: Array.isArray(node.selectedOptions) ? node.selectedOptions[2]?.value ?? null : null,
    inventoryItemId,
  };
}

async function upsertVariantMirrorBatchPg({ records, client }) {
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
        $${i++}, $${i++}, $${i++}
      )`,
    );

    params.push(
      r.shopId,
      r.shopifyVariantId,
      r.shopifyProductId,
      r.title,
      r.sku,
      r.barcode,
      r.chargeTax,
      r.compareAtPrice,
      r.cost,
      r.countryOfOrigin,
      r.hsTariffCode,
      r.inventoryOutOfStockPolicy,
      r.physicalProduct,
      r.price,
      r.profitMarginPct,
      r.trackQuantity,
      r.inventoryQuantity,
      r.weight,
      r.weightUnit,
      r.option1Value,
      r.option2Value,
      r.option3Value,
      r.inventoryItemId,
    );
  }

  const sql = `
    INSERT INTO variant_mirror (
      shop_id,
      shopify_variant_id,
      shopify_product_id,
      title,
      sku,
      barcode,
      charge_tax,
      compare_at_price,
      cost,
      country_of_origin,
      hs_tariff_code,
      inventory_out_of_stock_policy,
      physical_product,
      price,
      profit_margin_pct,
      track_quantity,
      inventory_quantity,
      weight,
      weight_unit,
      option1_value,
      option2_value,
      option3_value,
      inventory_item_id
    )
    VALUES ${values.join(", ")}
    ON CONFLICT (shop_id, shopify_variant_id)
    DO UPDATE SET
      shopify_product_id             = EXCLUDED.shopify_product_id,
      title                          = EXCLUDED.title,
      sku                            = EXCLUDED.sku,
      barcode                        = EXCLUDED.barcode,
      charge_tax                     = EXCLUDED.charge_tax,
      compare_at_price               = EXCLUDED.compare_at_price,
      cost                           = EXCLUDED.cost,
      country_of_origin              = EXCLUDED.country_of_origin,
      hs_tariff_code                 = EXCLUDED.hs_tariff_code,
      inventory_out_of_stock_policy  = EXCLUDED.inventory_out_of_stock_policy,
      physical_product               = EXCLUDED.physical_product,
      price                          = EXCLUDED.price,
      profit_margin_pct              = EXCLUDED.profit_margin_pct,
      track_quantity                 = EXCLUDED.track_quantity,
      weight                         = EXCLUDED.weight,
      weight_unit                    = EXCLUDED.weight_unit,
      option1_value                  = EXCLUDED.option1_value,
      option2_value                  = EXCLUDED.option2_value,
      option3_value                  = EXCLUDED.option3_value,
      inventory_item_id              = EXCLUDED.inventory_item_id
  `;

  await client.query(sql, params);
}

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
      if (!line?.trim()) continue;

      processed += 1;
      if (processed > MAX_STREAM_RECORDS) {
        throw new Error(`variantSync.tooManyRecords: exceeded MAX_STREAM_RECORDS=${MAX_STREAM_RECORDS}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      const node = parsed.node || parsed;
      if (!node?.id) continue;

      const row = mapVariantNodeToRow(shopId, node);
      if (!row) continue;

      batch.push(row);

      if (batch.length >= HYDRATION_BATCH_SIZE) {
        await upsertVariantMirrorBatchPg({ records: batch, client });
        batch = [];
      }

      if (processed % PROGRESS_PERSIST_INTERVAL === 0) {
        await updateSyncHistoryProgress(client, syncHistoryId, processed);
      }
    }

    if (batch.length > 0) {
      await upsertVariantMirrorBatchPg({ records: batch, client });
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