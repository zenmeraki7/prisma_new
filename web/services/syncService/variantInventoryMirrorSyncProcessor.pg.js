import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

function parseNumericIdFromGid(gid) {
  if (!gid) return null;
  const parts = String(gid).split("/");
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isFinite(n) ? n : null;
}

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

      rows.push({
        inventoryItemId,
        locationId,
        locationName: rec.locationName || rec.location_name || null,
        available: Number.isFinite(Number(rec.available)) ? Math.trunc(Number(rec.available)) : 0,
      });

      inventoryItemIds.add(inventoryItemId);
    }

    if (!rows.length) {
      await pgClient.query("ROLLBACK");
      return;
    }

    const values = [];
    const params = [];
    let i = 1;

    for (const r of rows) {
      values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
      params.push(shopId, r.inventoryItemId, r.locationId, r.locationName, r.available);
    }

    await pgClient.query(
      `
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
          available = EXCLUDED.available,
          updated_at = NOW()
      `,
      params,
    );

    const inventoryItemIdList = Array.from(inventoryItemIds);
    const placeholders = inventoryItemIdList.map((_, idx) => `$${idx + 2}`).join(", ");
    const rollupParams = [shopId, ...inventoryItemIdList];

    await pgClient.query(
      `
        WITH inv_rollup AS (
          SELECT
            vim.shop_id,
            vim.inventory_item_id,
            SUM(vim.available) AS inventory_quantity
          FROM variant_inventory_mirror vim
          WHERE vim.shop_id = $1
            AND vim.inventory_item_id IN (${placeholders})
          GROUP BY vim.shop_id, vim.inventory_item_id
        )
        UPDATE variant_mirror vm
        SET inventory_quantity = COALESCE(ir.inventory_quantity, 0)
        FROM inv_rollup ir
        WHERE vm.shop_id = ir.shop_id
          AND vm.inventory_item_id = ir.inventory_item_id
      `,
      rollupParams,
    );

    await pgClient.query(
      `
        WITH changed_products AS (
          SELECT DISTINCT vm.shop_id, vm.shopify_product_id
          FROM variant_mirror vm
          WHERE vm.shop_id = $1
            AND vm.inventory_item_id IN (${placeholders})
        ),
        product_rollup AS (
          SELECT
            vm.shop_id,
            vm.shopify_product_id,
            COALESCE(SUM(vm.inventory_quantity), 0) AS total_inventory_qty,
            COUNT(*) AS variant_count
          FROM variant_mirror vm
          INNER JOIN changed_products cp
            ON cp.shop_id = vm.shop_id
           AND cp.shopify_product_id = vm.shopify_product_id
          WHERE vm.shop_id = $1
          GROUP BY vm.shop_id, vm.shopify_product_id
        )
        UPDATE product_mirror pm
        SET total_inventory_qty = pr.total_inventory_qty,
            variant_count = pr.variant_count
        FROM product_rollup pr
        WHERE pm.shop_id = pr.shop_id
          AND pm.shopify_product_id = pr.shopify_product_id
      `,
      rollupParams,
    );

    await pgClient.query("COMMIT");
  } catch (err) {
    await pgClient.query("ROLLBACK");
    logger.error("[variantInventoryMirrorSyncProcessor.pg] Failed to hydrate batch", {
      shopId,
      err,
    });
    throw err;
  } finally {
    if (shouldRelease) pgClient.release();
  }
}