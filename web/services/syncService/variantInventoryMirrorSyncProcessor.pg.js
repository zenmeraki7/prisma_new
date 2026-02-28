// FILE: web/services/syncService/variantInventoryMirrorSyncProcessor.pg.js

import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

/**
 * Small helpers to strip numeric IDs out of Shopify GIDs.
 */
function parseNumericIdFromGid(gid) {
  if (!gid) return null;
  const parts = String(gid).split("/");
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isFinite(n) ? n : null;
}

/**
 * Hydrates variant_inventory_mirror for a batch of inventory-level records
 * and updates:
 *   - variant_mirror.default_available + total_available
 *   - product_mirror.rollup_total_inventory + rollup_variant_count
 *
 * All updates are done **only** for the affected inventory_item_ids,
 * wrapped in a single transaction.
 *
 * @param {object} params
 * @param {number} params.shopId
 * @param {Array<object>} params.records
 * @param {number} params.defaultLocationId  - shop's "primary" location id (numeric)
 * @param {import("pg").PoolClient} [params.client] - optional PG client; if omitted we use pool
 */
export async function hydrateVariantInventoryMirrorBatchPg({
  shopId,
  records,
  defaultLocationId,
  client,
}) {
  if (!records?.length) return;

  const pgClient = client || (await pool.connect());
  const shouldRelease = !client;

  try {
    await pgClient.query("BEGIN");

    const rows = [];
    const inventoryItemIds = new Set();

    for (const rec of records) {
      const inventoryItemId = parseNumericIdFromGid(rec.inventoryItemGid || rec.inventory_item_gid);
      const locationId = parseNumericIdFromGid(rec.locationGid || rec.location_gid);
      if (!inventoryItemId || !locationId) continue;

      const available = Number(rec.available ?? 0);
      const locationName = rec.locationName || rec.location_name || null;

      rows.push({
        inventoryItemId,
        locationId,
        locationName,
        available: Number.isFinite(available) ? Math.trunc(available) : 0,
      });

      inventoryItemIds.add(inventoryItemId);
    }

    if (!rows.length) {
      await pgClient.query("ROLLBACK");
      return;
    }

    // 1) Upsert into variant_inventory_mirror
    const values = [];
    const params = [];
    let paramIndex = 1;

    for (const r of rows) {
      values.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`,
      );
      params.push(
        shopId,
        r.inventoryItemId,
        r.locationId,
        r.locationName,
        r.available,
      );
    }

    const upsertSql = `
      INSERT INTO variant_inventory_mirror (
        shop_id,
        inventory_item_id,
        location_id,
        location_name,
        available
      )
      VALUES ${values.join(", ")}
      ON CONFLICT (shop_id, inventory_item_id, location_id)
      DO UPDATE SET
        location_name = EXCLUDED.location_name,
        available     = EXCLUDED.available,
        updated_at    = NOW()
    `;

    await pgClient.query(upsertSql, params);

    // 2) Recompute default_available + total_available on variant_mirror
    //    for only the affected inventory_item_ids.
    const inventoryItemIdList = Array.from(inventoryItemIds);

    const idParams = [shopId];
    const idPlaceholders = inventoryItemIdList
      .map((_, idx) => `$${idx + 2}`)
      .join(", ");
    for (const id of inventoryItemIdList) {
      idParams.push(id);
    }

    const rollupSql = `
      WITH per_item AS (
        SELECT
          shop_id,
          inventory_item_id,
          SUM(available) AS total_available
        FROM variant_inventory_mirror
        WHERE shop_id = $1
          AND inventory_item_id IN (${idPlaceholders})
        GROUP BY shop_id, inventory_item_id
      ),
      default_loc AS (
        SELECT
          shop_id,
          inventory_item_id,
          available AS default_available
        FROM variant_inventory_mirror
        WHERE shop_id = $1
          AND inventory_item_id IN (${idPlaceholders})
          AND location_id = $${inventoryItemIdList.length + 2}  -- defaultLocationId
      )
      UPDATE variant_mirror vm
      SET
        default_location_id = COALESCE(vm.default_location_id, $${inventoryItemIdList.length + 2}),
        default_available   = COALESCE(dl.default_available, 0),
        total_available     = COALESCE(pi.total_available, 0),
        updated_at          = NOW()
      FROM per_item pi
      LEFT JOIN default_loc dl
        ON dl.shop_id = pi.shop_id
       AND dl.inventory_item_id = pi.inventory_item_id
      WHERE vm.shop_id = pi.shop_id
        AND vm.inventory_item_id = pi.inventory_item_id
    `;

    idParams.push(defaultLocationId);

    await pgClient.query(rollupSql, idParams);

    // 3) NEW: Recompute product_mirror rollups for affected products only.
    //
    // We:
    //   - Find products whose variants use any of these inventory_item_ids.
    //   - For those products, aggregate SUM(total_available) and COUNT(variants).
    //   - Update product_mirror.rollup_total_inventory + rollup_variant_count.
    //
    // Requirements:
    //   - variant_mirror has (shop_id, shopify_product_id, inventory_item_id, total_available)
    //   - product_mirror has (shop_id, shopify_product_id, rollup_total_inventory, rollup_variant_count)
    const productParams = [shopId];
    const productPlaceholders = inventoryItemIdList
      .map((_, idx) => `$${idx + 2}`)
      .join(", ");
    for (const id of inventoryItemIdList) {
      productParams.push(id);
    }

    const productRollupSql = `
      WITH changed_variants AS (
        SELECT DISTINCT
          shop_id,
          shopify_product_id
        FROM variant_mirror
        WHERE shop_id = $1
          AND inventory_item_id IN (${productPlaceholders})
      ),
      rollups AS (
        SELECT
          vm.shop_id,
          vm.shopify_product_id,
          SUM(COALESCE(vm.total_available, 0)) AS rollup_total_inventory,
          COUNT(*) AS rollup_variant_count
        FROM variant_mirror vm
        INNER JOIN changed_variants cv
          ON cv.shop_id = vm.shop_id
         AND cv.shopify_product_id = vm.shopify_product_id
        WHERE vm.shop_id = $1
        GROUP BY vm.shop_id, vm.shopify_product_id
      )
      UPDATE product_mirror pm
      SET
        rollup_total_inventory = r.rollup_total_inventory,
        rollup_variant_count   = r.rollup_variant_count,
        updated_at             = NOW()
      FROM rollups r
      WHERE pm.shop_id = r.shop_id
        AND pm.shopify_product_id = r.shopify_product_id
    `;

    await pgClient.query(productRollupSql, productParams);

    await pgClient.query("COMMIT");
  } catch (err) {
    await pgClient.query("ROLLBACK");
    logger.error(
      "[variantInventoryMirrorSyncProcessor.pg] Failed to hydrate batch",
      {
        shopId,
        err,
      },
    );
    throw err;
  } finally {
    if (shouldRelease) pgClient.release();
  }
}