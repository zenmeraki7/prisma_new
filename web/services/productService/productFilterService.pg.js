// FILE: web/services/productService/productFilterService.pg.js

import { OPS, REGISTRY_BY_KEY } from "./filterRegistry.server.js";
import logger from "../../utils/logger.server.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types (JSDoc only – for clarity & editor support)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {"STRING"|"NUMBER"|"BOOLEAN"|"DATE"|"ENUM"} FilterValueType
 */

/**
 * @typedef {Object} FilterCondition
 * @property {string} key        - OPS key
 * @property {string} operator   - e.g. EQ, NEQ, GT, CONTAINS, IS_EMPTY, etc.
 * @property {*}      value
 */

/**
 * @typedef {Object} FilterGroup
 * @property {"AND"|"OR"} operator
 * @property {Array<FilterGroup|FilterCondition>} conditions
 */

/**
 * @typedef {Object} ProductFilterParams
 * @property {number}      shopId
 * @property {FilterGroup} [filterConfig]
 * @property {string|null} [sortKey]
 * @property {string|null} [sortDirection]
 * @property {number}      [page]
 * @property {number}      [pageSize]
 */

/**
 * @typedef {Object} VariantFilterParams
 * @property {number}      shopId
 * @property {FilterGroup} [filterConfig]
 * @property {string|null} [sortKey]
 * @property {string|null} [sortDirection]
 * @property {number}      [page]
 * @property {number}      [pageSize]
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Hard cap on page size to prevent runaway queries */
export const MAX_PAGE_SIZE = 250;

/** Hard cap on nesting depth to prevent DoS via deeply nested filter trees */
export const MAX_FILTER_DEPTH = 8;

/** Hard cap on IN / NOT_IN array length */
export const MAX_IN_VALUES = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Custom Errors
// ─────────────────────────────────────────────────────────────────────────────

export class FilterValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "FilterValidationError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All sort keys map to product_mirror (pm) or variant_mirror (v) columns.
 */
export const SORT_DEFS = Object.freeze({
  CREATED_AT: {
    key: "CREATED_AT",
    tableAlias: "pm",
    field: "created_at",
    defaultDirection: "DESC",
  },
  UPDATED_AT: {
    key: "UPDATED_AT",
    tableAlias: "pm",
    field: "updated_at",
    defaultDirection: "DESC",
  },
  PUBLISHED_AT: {
    key: "PUBLISHED_AT",
    tableAlias: "pm",
    field: "published_at",
    defaultDirection: "DESC",
  },
  TITLE: {
    key: "TITLE",
    tableAlias: "pm",
    field: "title",
    defaultDirection: "ASC",
  },
  VENDOR: {
    key: "VENDOR",
    tableAlias: "pm",
    field: "vendor",
    defaultDirection: "ASC",
  },
  TOTAL_INVENTORY: {
    key: "TOTAL_INVENTORY",
    tableAlias: "pm",
    field: "rollup_inventory_qty",
    defaultDirection: "DESC",
  },
  VARIANT_COUNT: {
    key: "VARIANT_COUNT",
    tableAlias: "pm",
    field: "variant_count",
    defaultDirection: "DESC",
  },

  // Variant-level sorts
  VARIANT_PRICE: {
    key: "VARIANT_PRICE",
    tableAlias: "v",
    field: "price",
    defaultDirection: "ASC",
    requiresVariantJoin: true,
  },
  VARIANT_SKU: {
    key: "VARIANT_SKU",
    tableAlias: "v",
    field: "sku",
    defaultDirection: "ASC",
    requiresVariantJoin: true,
  },
  VARIANT_INVENTORY_QUANTITY: {
    key: "VARIANT_INVENTORY_QUANTITY",
    tableAlias: "v",
    field: "inventory_quantity",
    defaultDirection: "DESC",
    requiresVariantJoin: true,
  },
});

/** Allowed directions and keys (defends against injection). */
const ALLOWED_DIRECTIONS = new Set(["ASC", "DESC"]);
const ALLOWED_SORT_KEYS = new Set(Object.keys(SORT_DEFS));

// ─────────────────────────────────────────────────────────────────────────────
// Preset keys + builder
// ─────────────────────────────────────────────────────────────────────────────

export const PRESET_KEYS = Object.freeze({
  LOW_INVENTORY_VARIANT:    "LOW_INVENTORY_VARIANT",
  LOW_INVENTORY_PRODUCT:    "LOW_INVENTORY_PRODUCT",
  NO_SEO_VISIBILITY_HIDDEN: "NO_SEO_VISIBILITY_HIDDEN",

  MISSING_IMAGES:           "MISSING_IMAGES",
  NO_SKU:                   "NO_SKU",
  NO_BARCODE:               "NO_BARCODE",
  DRAFT_PRODUCTS:           "DRAFT_PRODUCTS",
  ARCHIVED_PRODUCTS:        "ARCHIVED_PRODUCTS",
  OUT_OF_STOCK:             "OUT_OF_STOCK",
  HIGH_COMPARE_AT_DISCOUNT: "HIGH_COMPARE_AT_DISCOUNT",
  MISSING_COST:             "MISSING_COST",
});

/**
 * Build a FilterGroup DSL for a given preset key.
 *
 * @param {string} presetKey
 * @param {Object} [options]
 * @param {number} [options.threshold]         inventory threshold (default: 5)
 * @param {number} [options.discountThreshold] compare-at discount % (default: 20)
 * @returns {FilterGroup}
 */
export function buildPresetFilterGroup(presetKey, options = {}) {
  const threshold         = typeof options.threshold === "number" ? options.threshold : 5;
  const discountThreshold = typeof options.discountThreshold === "number" ? options.discountThreshold : 20;

  switch (presetKey) {
    case PRESET_KEYS.LOW_INVENTORY_VARIANT:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.VARIANT_INVENTORY_QUANTITY, operator: "LT", value: threshold },
          { key: OPS.VARIANT_TRACK_QUANTITY,     operator: "IS", value: true },
        ],
      };

    case PRESET_KEYS.LOW_INVENTORY_PRODUCT:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.PRODUCT_TOTAL_INVENTORY, operator: "LT", value: threshold },
          { key: OPS.PRODUCT_STATUS,          operator: "EQ", value: "active" },
        ],
      };

    case PRESET_KEYS.NO_SEO_VISIBILITY_HIDDEN:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.PRODUCT_SEO_HIDDEN, operator: "IS", value: true },
          { key: OPS.PRODUCT_STATUS,     operator: "EQ", value: "active" },
        ],
      };

    case PRESET_KEYS.MISSING_IMAGES:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.PRODUCT_IMAGE_COUNT, operator: "EQ", value: 0 },
        ],
      };

    case PRESET_KEYS.NO_SKU:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.VARIANT_SKU, operator: "IS_EMPTY", value: null },
        ],
      };

    case PRESET_KEYS.NO_BARCODE:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.VARIANT_BARCODE, operator: "IS_EMPTY", value: null },
        ],
      };

    case PRESET_KEYS.DRAFT_PRODUCTS:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.PRODUCT_STATUS, operator: "EQ", value: "draft" },
        ],
      };

    case PRESET_KEYS.ARCHIVED_PRODUCTS:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.PRODUCT_STATUS, operator: "EQ", value: "archived" },
        ],
      };

    case PRESET_KEYS.OUT_OF_STOCK:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.PRODUCT_TOTAL_INVENTORY, operator: "LTE", value: 0 },
          { key: OPS.PRODUCT_STATUS,          operator: "EQ",  value: "active" },
        ],
      };

    case PRESET_KEYS.HIGH_COMPARE_AT_DISCOUNT:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.VARIANT_COMPARE_AT_PRICE, operator: "IS_NOT_EMPTY", value: null },
          { key: OPS.VARIANT_PROFIT_MARGIN,    operator: "GTE",          value: discountThreshold },
        ],
      };

    case PRESET_KEYS.MISSING_COST:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.VARIANT_COST, operator: "IS_EMPTY", value: null },
        ],
      };

    default:
      throw new RangeError(`buildPresetFilterGroup: unknown presetKey "${presetKey}"`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Input validation helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizePagination(page, pageSize) {
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

  let ps;
  if (Number.isFinite(pageSize) && pageSize >= 1) {
    ps = Math.floor(pageSize);
    if (ps > MAX_PAGE_SIZE) {
      logger.warn(
        { pageSize },
        `normalizePagination: pageSize capped at MAX_PAGE_SIZE=${MAX_PAGE_SIZE}`,
      );
      ps = MAX_PAGE_SIZE;
    }
  } else {
    ps = 50;
  }

  return { page: p, pageSize: ps };
}

function normalizeSortParams(sortKey, sortDirection) {
  const safeKey = sortKey && ALLOWED_SORT_KEYS.has(sortKey) ? sortKey : null;
  const dir = typeof sortDirection === "string"
    ? sortDirection.toUpperCase()
    : null;
  const safeDir = dir && ALLOWED_DIRECTIONS.has(dir) ? dir : null;
  return { sortKey: safeKey, sortDirection: safeDir };
}

/**
 * Lightweight structural validation. Throws FilterValidationError for
 * obviously broken configs (not for "unknown key", which we silently skip).
 *
 * @param {FilterGroup|null|undefined} filterConfig
 */
function validateFilterConfig(filterConfig) {
  if (!filterConfig) return;

  function walk(node, depth) {
    if (depth > MAX_FILTER_DEPTH) {
      throw new FilterValidationError(
        `Filter tree too deep (max depth ${MAX_FILTER_DEPTH})`,
      );
    }

    if (!node || typeof node !== "object") {
      throw new FilterValidationError("Filter config must be an object tree");
    }

    if (Array.isArray(node.conditions)) {
      // group
      if (node.operator && node.operator !== "AND" && node.operator !== "OR") {
        throw new FilterValidationError(
          `Unknown group.operator "${node.operator}" (expected AND/OR)`,
        );
      }
      for (const child of node.conditions) {
        if (!child) continue;
        walk(child, depth + 1);
      }
    } else if (node.key) {
      // leaf
      if (typeof node.key !== "string") {
        throw new FilterValidationError("Filter condition key must be a string");
      }
      if (typeof node.operator !== "string") {
        throw new FilterValidationError("Filter condition operator must be a string");
      }
      // value is free-form; no validation here.
    } else {
      throw new FilterValidationError(
        "Filter node must have either conditions[] or key/operator",
      );
    }
  }

  walk(filterConfig, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — PRODUCT-FIRST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build SELECT query for product list (product-first mode).
 *
 * @param {ProductFilterParams} params
 * @returns {{ text: string, values: Array }}
 */
export function buildProductListQuery(params) {
  const {
    shopId,
    filterConfig,
    sortKey: rawSortKey,
    sortDirection: rawSortDir,
    page: rawPage = 1,
    pageSize: rawPageSize = 50,
  } = params;

  if (!shopId) throw new TypeError("buildProductListQuery: shopId is required");

  validateFilterConfig(filterConfig);

  const { page, pageSize }         = normalizePagination(rawPage, rawPageSize);
  const { sortKey, sortDirection } = normalizeSortParams(rawSortKey, rawSortDir);

  const { whereSql, joinsSql, values, nextParamIndex } =
    buildBaseFilterQueryParts({ shopId, filterConfig, baseMode: "PRODUCT", sortKey });

  const orderBySql = buildOrderByClause({ sortKey, sortDirection });
  const limit      = pageSize;
  const offset     = (page - 1) * limit;

  const text = squish(`
    SELECT DISTINCT
      pm.id,
      pm.shop_id,
      pm.shopify_product_id,
      pm.title,
      pm.handle,
      pm.vendor,
      pm.status,
      pm.created_at,
      pm.published_at,
      pm.updated_at,
      pm.rollup_inventory_qty,
      pm.variant_count,
      pm.image_count,
      pm.category,
      pm.product_type_custom,
      pm.seo_hidden,
      pm.template_suffix,
      pm.visible_online_store,
      pm.visible_pos
    FROM product_mirror pm
    ${joinsSql}
    ${whereSql}
    ${orderBySql}
    LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
  `);

  return { text, values: [...values, limit, offset] };
}

/**
 * Build COUNT(DISTINCT pm.id) query matching same filters.
 *
 * @param {ProductFilterParams} params
 * @returns {{ text: string, values: Array }}
 */
export function buildProductCountQuery(params) {
  const { shopId, filterConfig } = params;
  if (!shopId) throw new TypeError("buildProductCountQuery: shopId is required");

  validateFilterConfig(filterConfig);

  const { whereSql, joinsSql, values } = buildBaseFilterQueryParts({
    shopId,
    filterConfig,
    baseMode: "PRODUCT",
  });

  const text = squish(`
    SELECT COUNT(DISTINCT pm.id) AS total_count
    FROM product_mirror pm
    ${joinsSql}
    ${whereSql}
  `);

  return { text, values };
}

/**
 * Fetches one page of products with total count in parallel.
 *
 * @param {import("pg").Pool|import("pg").PoolClient} client
 * @param {ProductFilterParams} params
 * @returns {Promise<{totalCount:number, items:object[]}>}
 */
export async function fetchProductsPage(client, params) {
  const listQuery  = buildProductListQuery(params);
  const countQuery = buildProductCountQuery(params);

  try {
    const [listResult, countResult] = await Promise.all([
      client.query(listQuery.text,  listQuery.values),
      client.query(countQuery.text, countQuery.values),
    ]);

    return {
      totalCount: Number(countResult.rows[0]?.total_count ?? 0),
      items:      listResult.rows,
    };
  } catch (err) {
    logger.error({ err, params }, "fetchProductsPage: query failed");
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — VARIANT-FIRST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build SELECT query for variant list (variant-first mode).
 *
 * @param {VariantFilterParams} params
 * @returns {{ text: string, values: Array }}
 */
export function buildVariantListQuery(params) {
  const {
    shopId,
    filterConfig,
    sortKey: rawSortKey,
    sortDirection: rawSortDir,
    page: rawPage = 1,
    pageSize: rawPageSize = 50,
  } = params;

  if (!shopId) throw new TypeError("buildVariantListQuery: shopId is required");

  validateFilterConfig(filterConfig);

  const { page, pageSize }         = normalizePagination(rawPage, rawPageSize);
  const { sortKey, sortDirection } = normalizeSortParams(rawSortKey, rawSortDir);

  const { whereSql, joinsSql, values, nextParamIndex } =
    buildBaseFilterQueryParts({ shopId, filterConfig, baseMode: "VARIANT", sortKey });

  const orderBySql = buildOrderByClause({ sortKey, sortDirection });
  const limit      = pageSize;
  const offset     = (page - 1) * limit;

  const text = squish(`
    SELECT DISTINCT
      v.id                     AS variant_id,
      v.shop_id,
      v.shopify_variant_id,
      v.shopify_product_id,
      v.title                  AS variant_title,
      v.sku,
      v.barcode,
      v.price,
      v.compare_at_price,
      v.cost,
      v.profit_margin_pct,
      v.inventory_quantity,
      v.track_quantity,
      v.taxable,
      v.requires_shipping,
      v.weight,
      v.weight_unit,
      v.grams,
      v.option1_value,
      v.option2_value,
      v.option3_value,
      v.inventory_policy,
      v.fulfillment_service,
      v.availability,
      pm.id                    AS product_id,
      pm.title                 AS product_title,
      pm.handle,
      pm.vendor,
      pm.status,
      pm.rollup_inventory_qty,
      pm.variant_count,
      pm.image_count,
      pm.category,
      pm.product_type_custom,
      pm.visible_online_store,
      pm.visible_pos
    FROM product_mirror pm
    ${joinsSql}
    ${whereSql}
    ${orderBySql}
    LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
  `);

  return { text, values: [...values, limit, offset] };
}

/**
 * Build COUNT(DISTINCT v.id) query.
 *
 * @param {VariantFilterParams} params
 * @returns {{ text: string, values: Array }}
 */
export function buildVariantCountQuery(params) {
  const { shopId, filterConfig } = params;
  if (!shopId) throw new TypeError("buildVariantCountQuery: shopId is required");

  validateFilterConfig(filterConfig);

  const { whereSql, joinsSql, values } = buildBaseFilterQueryParts({
    shopId,
    filterConfig,
    baseMode: "VARIANT",
  });

  const text = squish(`
    SELECT COUNT(DISTINCT v.id) AS total_count
    FROM product_mirror pm
    ${joinsSql}
    ${whereSql}
  `);

  return { text, values };
}

/**
 * Fetches one page of variants with total count in parallel.
 *
 * @param {import("pg").Pool|import("pg").PoolClient} client
 * @param {VariantFilterParams} params
 * @returns {Promise<{totalCount:number, items:object[]}>}
 */
export async function fetchVariantsPage(client, params) {
  const listQuery  = buildVariantListQuery(params);
  const countQuery = buildVariantCountQuery(params);

  try {
    const [listResult, countResult] = await Promise.all([
      client.query(listQuery.text,  listQuery.values),
      client.query(countQuery.text, countQuery.values),
    ]);

    return {
      totalCount: Number(countResult.rows[0]?.total_count ?? 0),
      items:      listResult.rows,
    };
  } catch (err) {
    logger.error({ err, params }, "fetchVariantsPage: query failed");
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core builder — WHERE + JOINs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the base variant join hint from the registry (single source of truth).
 * Typically something like:
 *   INNER JOIN variant_mirror v
 *     ON v.shop_id = pm.shop_id
 *    AND v.shopify_product_id = pm.shopify_product_id
 */
const BASE_VARIANT_JOIN_HINT = REGISTRY_BY_KEY[OPS.VARIANT_BARCODE]?.pg?.joinHints?.[0];
if (!BASE_VARIANT_JOIN_HINT) {
  throw new Error(
    "[productFilterService] Cannot derive BASE_VARIANT_JOIN_HINT from registry — check VARIANT_BARCODE entry.",
  );
}

/**
 * Internal: builds WHERE + JOINs + param array.
 *
 * @param {Object} args
 * @param {number}           args.shopId
 * @param {FilterGroup|null} args.filterConfig
 * @param {"PRODUCT"|"VARIANT"} [args.baseMode]
 * @param {string|null}      [args.sortKey]
 */
function buildBaseFilterQueryParts({ shopId, filterConfig, baseMode = "PRODUCT", sortKey = null }) {
  const values = [shopId];
  const paramCounter = { value: 2 };
  const joinCollector = new JoinCollector();

  // VARIANT mode always needs pm→v
  if (baseMode === "VARIANT") {
    joinCollector.addHint(BASE_VARIANT_JOIN_HINT);
  }

  // If sorting on variant column in product mode, ensure the join is present
  if (baseMode === "PRODUCT" && sortKey && SORT_DEFS[sortKey]?.requiresVariantJoin) {
    joinCollector.addHint(BASE_VARIANT_JOIN_HINT);
  }

  let filterPredicateSql = null;

  if (filterConfig && Array.isArray(filterConfig.conditions) && filterConfig.conditions.length > 0) {
    filterPredicateSql = compileGroup(filterConfig, { values, paramCounter, joinCollector }, 0);
  }

  const whereSql = filterPredicateSql
    ? `WHERE pm.shop_id = $1 AND (${filterPredicateSql})`
    : `WHERE pm.shop_id = $1`;

  return {
    whereSql,
    joinsSql:       joinCollector.toSql(),
    values,
    nextParamIndex: paramCounter.value,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter DSL compiler
// ─────────────────────────────────────────────────────────────────────────────

function compileGroup(group, ctx, depth) {
  if (depth > MAX_FILTER_DEPTH) {
    logger.warn(
      `compileGroup: max nesting depth (${MAX_FILTER_DEPTH}) exceeded — truncating deeper conditions`,
    );
    return null;
  }

  if (!group || !Array.isArray(group.conditions) || group.conditions.length === 0) {
    return null;
  }

  let op = "AND";
  if (group.operator === "OR") {
    op = "OR";
  } else if (group.operator && group.operator !== "AND") {
    logger.warn(`compileGroup: unknown group.operator "${group.operator}", defaulting to AND`);
  }

  const parts = [];

  for (const child of group.conditions) {
    if (!child) continue;

    if (Array.isArray(child.conditions)) {
      const nested = compileGroup(child, ctx, depth + 1);
      if (nested) parts.push(`(${nested})`);
    } else if (child.key) {
      const cond = compileCondition(child, ctx);
      if (cond) parts.push(cond);
    } else {
      logger.warn("compileGroup: encountered child without key or conditions — skipping");
    }
  }

  return parts.length ? parts.join(` ${op} `) : null;
}

function coerceValueForType(value, valueType) {
  switch (valueType) {
    case "NUMBER":
      if (Array.isArray(value)) {
        return value.map((v) => (v == null ? null : Number(v))).filter((v) => Number.isFinite(v));
      }
      return value == null ? null : Number(value);

    case "BOOLEAN":
      if (Array.isArray(value)) {
        return value.map((v) => v === true || v === "true");
      }
      return value === true || value === "true";

    case "DATE":
      if (Array.isArray(value)) {
        return value.map((v) => (v == null ? null : new Date(v)));
      }
      return value == null ? null : new Date(value);

    case "STRING":
    case "ENUM":
    default:
      return value;
  }
}

function compileCondition(condition, ctx) {
  const { key, operator, value } = condition;

  const def = REGISTRY_BY_KEY[key];
  if (!def) {
    logger.warn(`compileCondition: unknown filter key "${key}" — skipping`);
    return null;
  }

  const { pg, valueType, operators } = def;

  if (!pg?.tableAlias || !pg?.column) {
    logger.warn(`compileCondition: filter "${key}" missing PG mapping — skipping`);
    return null;
  }

  if (Array.isArray(operators) && !operators.includes(operator)) {
    logger.warn(`compileCondition: operator "${operator}" not allowed for "${key}" — skipping`);
    return null;
  }

  if (Array.isArray(pg.joinHints) && pg.joinHints.length > 0) {
    ctx.joinCollector.addHints(pg.joinHints);
  }

  const coercedValue = coerceValueForType(value, valueType);

  return buildSqlPredicate({
    columnExpr: `${pg.tableAlias}.${pg.column}`,
    operator,
    value: coercedValue,
    valueType,
    ctx,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Operator → SQL predicate
// ─────────────────────────────────────────────────────────────────────────────

function buildSqlPredicate({ columnExpr, operator, value, valueType, ctx }) {
  const { values, paramCounter } = ctx;
  const nextParam = () => `$${paramCounter.value++}`;

  switch (operator) {
    case "EQ": {
      const p = nextParam(); values.push(value);
      return `${columnExpr} = ${p}`;
    }

    case "NEQ": {
      const p = nextParam(); values.push(value);
      return `${columnExpr} IS DISTINCT FROM ${p}`;
    }

    case "GT": {
      const p = nextParam(); values.push(value);
      return `${columnExpr} > ${p}`;
    }

    case "GTE": {
      const p = nextParam(); values.push(value);
      return `${columnExpr} >= ${p}`;
    }

    case "LT": {
      const p = nextParam(); values.push(value);
      return `${columnExpr} < ${p}`;
    }

    case "LTE": {
      const p = nextParam(); values.push(value);
      return `${columnExpr} <= ${p}`;
    }

    case "IN": {
      if (!Array.isArray(value) || value.length === 0) return "FALSE";
      const capped = value.slice(0, MAX_IN_VALUES);
      if (capped.length < value.length) {
        logger.warn(`buildSqlPredicate: IN list truncated to ${MAX_IN_VALUES} values`);
      }
      const placeholders = capped.map((v) => {
        const p = nextParam(); values.push(v); return p;
      });
      return `${columnExpr} IN (${placeholders.join(", ")})`;
    }

    case "NOT_IN": {
      if (!Array.isArray(value) || value.length === 0) return "TRUE";
      const capped = value.slice(0, MAX_IN_VALUES);
      if (capped.length < value.length) {
        logger.warn(`buildSqlPredicate: NOT_IN list truncated to ${MAX_IN_VALUES} values`);
      }
      const placeholders = capped.map((v) => {
        const p = nextParam(); values.push(v); return p;
      });
      return `(${columnExpr} IS NULL OR ${columnExpr} NOT IN (${placeholders.join(", ")}))`;
    }

    case "BETWEEN": {
      if (!Array.isArray(value) || value.length !== 2) {
        logger.warn(`buildSqlPredicate: BETWEEN requires [from, to] array`);
        return null;
      }
      const [from, to] = value;
      if (from == null || to == null) {
        logger.warn(`buildSqlPredicate: BETWEEN bounds cannot be null`);
        return null;
      }
      const p1 = nextParam(); values.push(from);
      const p2 = nextParam(); values.push(to);
      return `${columnExpr} BETWEEN ${p1} AND ${p2}`;
    }

    case "ON": {
      const p = nextParam(); values.push(value);
      return `${columnExpr}::date = ${p}::date`;
    }

    case "BEFORE": {
      const p = nextParam(); values.push(value);
      return `${columnExpr} < ${p}`;
    }

    case "AFTER": {
      const p = nextParam(); values.push(value);
      return `${columnExpr} > ${p}`;
    }

    case "CONTAINS":
    case "NOT_CONTAINS":
    case "STARTS_WITH":
    case "ENDS_WITH": {
      if (typeof value !== "string") {
        logger.warn(`buildSqlPredicate: ${operator} requires a string value`);
        return null;
      }
      const escaped = value.replace(/([%_\\])/g, "\\$1");
      let likeVal;
      switch (operator) {
        case "CONTAINS":
        case "NOT_CONTAINS":
          likeVal = `%${escaped}%`;
          break;
        case "STARTS_WITH":
          likeVal = `${escaped}%`;
          break;
        case "ENDS_WITH":
          likeVal = `%${escaped}`;
          break;
      }
      const p = nextParam(); values.push(likeVal);
      const expr = `${columnExpr} ILIKE ${p} ESCAPE '\\'`;
      return operator === "NOT_CONTAINS" ? `NOT (${expr})` : expr;
    }

    case "IS": {
      const p = nextParam(); values.push(value === true || value === "true");
      return `${columnExpr} = ${p}`;
    }

    case "IS_EMPTY": {
      if (valueType === "STRING") {
        return `(${columnExpr} IS NULL OR trim(${columnExpr}) = '')`;
      }
      return `${columnExpr} IS NULL`;
    }

    case "IS_NOT_EMPTY": {
      if (valueType === "STRING") {
        return `(${columnExpr} IS NOT NULL AND trim(${columnExpr}) <> '')`;
      }
      return `${columnExpr} IS NOT NULL`;
    }

    default: {
      logger.warn(`buildSqlPredicate: unsupported operator "${operator}" for ${columnExpr}`);
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Join collector
// ─────────────────────────────────────────────────────────────────────────────

class JoinCollector {
  constructor() {
    this._map = new Map();
  }

  addHint(hint) {
    if (!hint?.alias || !hint?.table || !hint?.on) return;
    const key = `${hint.alias}|${hint.table}`;
    if (!this._map.has(key)) {
      this._map.set(key, hint);
    } else {
      const existing = this._map.get(key);
      // Prefer LEFT JOIN if any consumer requires it
      if (hint.type === "LEFT" && existing.type === "INNER") {
        this._map.set(key, hint);
      }
    }
  }

  addHints(hints) {
    for (const h of hints) this.addHint(h);
  }

  toSql() {
    if (this._map.size === 0) return "";
    const lines = [];
    for (const { type, table, alias, on } of this._map.values()) {
      const t = type?.toUpperCase() === "LEFT" ? "LEFT JOIN" : "INNER JOIN";
      lines.push(`${t} ${table} ${alias} ON ${on}`);
    }
    return lines.join("\n    ");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER BY builder
// ─────────────────────────────────────────────────────────────────────────────

function buildOrderByClause({ sortKey, sortDirection }) {
  if (!sortKey || !SORT_DEFS[sortKey]) {
    return "ORDER BY pm.created_at DESC, pm.id DESC";
  }

  const def = SORT_DEFS[sortKey];
  const dir = ALLOWED_DIRECTIONS.has(sortDirection) ? sortDirection : def.defaultDirection;

  return `ORDER BY ${def.tableAlias}.${def.field} ${dir}, pm.id ${dir}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function squish(sql) {
  return sql
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ─────────────────────────────────────────────────────────────────────────────

export { OPS, REGISTRY_BY_KEY };

export default {
  OPS,
  REGISTRY_BY_KEY,
  SORT_DEFS,
  PRESET_KEYS,
  buildPresetFilterGroup,
  buildProductListQuery,
  buildProductCountQuery,
  fetchProductsPage,
  buildVariantListQuery,
  buildVariantCountQuery,
  fetchVariantsPage,
  MAX_PAGE_SIZE,
  MAX_FILTER_DEPTH,
  MAX_IN_VALUES,
  FilterValidationError,
};