// FILE: web/controllers/products/productFilterController.pg.js

import { pool } from "../../db/postgres/pool.js";
import {
  OPS,
  PRESET_KEYS,
  buildPresetFilterGroup,
  fetchProductsPage,
  fetchVariantsPage,
} from "../../services/productService/productFilterService.pg.js";

/**
 * Normalize pagination + sort from query/body.
 */
function parseListParams(req) {
  const page = Number(req.query.page ?? req.body.page ?? 1) || 1;
  const pageSize = Number(req.query.pageSize ?? req.body.pageSize ?? 50) || 50;

  const sortKey = (req.query.sortKey ?? req.body.sortKey) || null;
  const sortDirection = (req.query.sortDirection ?? req.body.sortDirection) || null;

  return { page, pageSize, sortKey, sortDirection };
}

/**
 * Product-first listing endpoint.
 *
 * Expects:
 *  - req.shopId  (numeric shops.id – however you store it)
 *  - req.body.filters   // DSL FilterGroup
 *  - optional query params: page, pageSize, sortKey, sortDirection
 */
export async function getProductsPg(req, res, next) {
  try {
    const shopId = req.shopId;
    if (!shopId) {
      return res.status(400).json({ error: "shopId missing on request context" });
    }

    const { page, pageSize, sortKey, sortDirection } = parseListParams(req);
    const filterConfig = req.body?.filters || null;

    const result = await fetchProductsPage(pool, {
      shopId,
      filterConfig,
      sortKey,
      sortDirection,
      page,
      pageSize,
    });

    res.json({
      mode: "PRODUCT",
      page,
      pageSize,
      totalCount: result.totalCount,
      items: result.items,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Variant-first listing endpoint.
 *
 * Expects:
 *  - req.shopId
 *  - req.body.filters    // DSL FilterGroup
 *  - optional query params: page, pageSize, sortKey, sortDirection
 */
export async function getVariantsPg(req, res, next) {
  try {
    const shopId = req.shopId;
    if (!shopId) {
      return res.status(400).json({ error: "shopId missing on request context" });
    }

    const { page, pageSize, sortKey, sortDirection } = parseListParams(req);
    const filterConfig = req.body?.filters || null;

    const result = await fetchVariantsPage(pool, {
      shopId,
      filterConfig,
      sortKey,
      sortDirection,
      page,
      pageSize,
    });

    res.json({
      mode: "VARIANT",
      page,
      pageSize,
      totalCount: result.totalCount,
      items: result.items,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Example preset endpoint – returns the filter DSL for a preset.
 * Frontend can consume this DSL directly as if user built it.
 *
 * GET /api/products/presets/:key
 */
export async function getPresetFilter(req, res, next) {
  try {
    const { key } = req.params;

    let presetKey;
    switch (key) {
      case "low-inventory-variant":
        presetKey = PRESET_KEYS.LOW_INVENTORY_VARIANT;
        break;
      case "low-inventory-product":
        presetKey = PRESET_KEYS.LOW_INVENTORY_PRODUCT;
        break;
      case "no-seo-hidden":
        presetKey = PRESET_KEYS.NO_SEO_VISIBILITY_HIDDEN;
        break;
      default:
        return res.status(404).json({ error: "Unknown preset key" });
    }

    const threshold = req.query.threshold
      ? Number(req.query.threshold)
      : undefined;

    const filterConfig = buildPresetFilterGroup(presetKey, { threshold });

    res.json({ presetKey, filterConfig });
  } catch (err) {
    next(err);
  }
}