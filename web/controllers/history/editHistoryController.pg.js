// FILE: web/controllers/history/editHistoryController.pg.js

import { pool } from "../../db/postgres/pool.js";
import logger from "../../utils/logger.server.js";

/**
 * GET /api/pg/edit-history/by-bulk/:id
 *
 * Query:
 *  - page?: number (1-based, default 1)
 *  - limit?: number (default 10, max 200)
 *
 * Response:
 * {
 *   items: [
 *     {
 *       id: number,
 *       productTitle: string | null,
 *       productId: string | number | null,
 *       productImage: string | null,
 *       variantTitle: string | null,
 *       variantId: string | number | null,
 *       scope: "PRODUCT" | "VARIANT",
 *       field: string,
 *       oldValue: string | null,
 *       newValue: string | null,
 *       editType: "manual" | "scheduled" | "recurring",
 *       createdAt: string (ISO),
 *     }
 *   ],
 *   totalCount: number,
 *   totalPages: number,
 * }
 */
export async function getEditHistoryByBulkJobController(req, res, next) {
  try {
    const shopId = req.shopId;
    if (!shopId) {
      return res.status(400).json({ error: "shopId missing on request context" });
    }

    const bulkJobId = Number(req.params.id);
    if (!bulkJobId || Number.isNaN(bulkJobId)) {
      return res.status(400).json({ error: "Invalid bulk job id" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = Number(req.query.limit) || 10;
    const limit = Math.max(1, Math.min(limitRaw, 200));
    const offset = (page - 1) * limit;

    // 1) Count total edits for this bulk job
    const countSql = `
      SELECT COUNT(*)::bigint AS total_count
      FROM edit_history eh
      WHERE eh.shop_id = $1
        AND eh.bulk_job_id = $2
    `;
    const countRes = await pool.query(countSql, [shopId, bulkJobId]);
    const totalCount = Number(countRes.rows[0]?.total_count || 0);
    const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / limit);

    if (totalCount === 0) {
      return res.json({
        items: [],
        totalCount: 0,
        totalPages: 1,
      });
    }

    // 2) Fetch page of edits, joining product_mirror + variant_mirror
    //
    // Adjust pm.featured_image_url if your schema uses a different column
    // for the main product image (e.g. pm.image, pm.main_image, etc.).
    const itemsSql = `
      SELECT
        eh.id,
        eh.shop_id,
        eh.bulk_job_id,
        eh.shopify_product_id,
        eh.shopify_variant_id,
        eh.target_level,
        eh.field,
        eh.old_value,
        eh.new_value,
        eh.edit_type,
        eh.created_at,

        pm.title  AS product_title,
        pm.featured_image_url AS product_image,   -- TODO: align with your schema
        v.title   AS variant_title

      FROM edit_history eh
      LEFT JOIN product_mirror pm
        ON pm.shop_id = eh.shop_id
       AND pm.shopify_product_id = eh.shopify_product_id
      LEFT JOIN variant_mirror v
        ON v.shop_id = eh.shop_id
       AND v.shopify_variant_id = eh.shopify_variant_id

      WHERE eh.shop_id = $1
        AND eh.bulk_job_id = $2

      ORDER BY eh.created_at DESC, eh.id DESC
      LIMIT $3 OFFSET $4
    `;

    const itemsRes = await pool.query(itemsSql, [
      shopId,
      bulkJobId,
      limit,
      offset,
    ]);

    const items = itemsRes.rows.map((row) => ({
      id: row.id,
      productTitle: row.product_title || null,
      productId: row.shopify_product_id ?? null,
      productImage: row.product_image || null,
      variantTitle: row.variant_title || null,
      variantId: row.shopify_variant_id ?? null,
      scope: row.target_level === "VARIANT" ? "VARIANT" : "PRODUCT",
      field: row.field,
      oldValue: row.old_value,
      newValue: row.new_value,
      editType: row.edit_type,
      createdAt: row.created_at,
    }));

    return res.json({
      items,
      totalCount,
      totalPages,
    });
  } catch (err) {
    logger.error("[editHistoryController.pg] Failed to fetch edit history by bulk job", {
      err,
      shopId: req.shopId,
      bulkJobId: req.params.id,
    });
    next(err);
  }
}