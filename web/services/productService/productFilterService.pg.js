// FILE: web/services/productService/productFilterService.pg.js

import { OPS, REGISTRY_BY_KEY } from "./filterRegistry.server.js";
import logger from "../../utils/logger.server.js";
// import { pool } from "../../db/postgres/pool.js"; // wire this in your app

/* ──────────────────────────────────────────────────────────────
 * Sort config – map frontend sort keys → pm.* columns
 * (You can extend later with variant-based sorts)
 * ─────────────────────────────────────────────────────────── */

export const SORT_DEFS = Object.freeze({
  CREATED_AT: {
    key: "CREATED_AT",
    field: "created_at",
    defaultDirection: "DESC",
  },
  UPDATED_AT: {
    key: "UPDATED_AT",
    field: "updated_at",
    defaultDirection: "DESC",
  },
  PUBLISHED_AT: {
    key: "PUBLISHED_AT",
    field: "published_at",
    defaultDirection: "DESC",
  },
  TITLE: {
    key: "TITLE",
    field: "title",
    defaultDirection: "ASC",
  },
  VENDOR: {
    key: "VENDOR",
    field: "vendor",
    defaultDirection: "ASC",
  },
  TOTAL_INVENTORY: {
    key: "TOTAL_INVENTORY",
    field: "total_inventory_qty",
    defaultDirection: "DESC",
  },
  VARIANT_COUNT: {
    key: "VARIANT_COUNT",
    field: "variant_count",
    defaultDirection: "DESC",
  },
});

/* ──────────────────────────────────────────────────────────────
 * Preset keys – pre-baked queries → filter groups
 * ─────────────────────────────────────────────────────────── */

export const PRESET_KEYS = Object.freeze({
  LOW_INVENTORY_VARIANT: "LOW_INVENTORY_VARIANT",       // variant-first
  LOW_INVENTORY_PRODUCT: "LOW_INVENTORY_PRODUCT",       // product-first
  NO_SEO_VISIBILITY_HIDDEN: "NO_SEO_VISIBILITY_HIDDEN", // products hidden from search
});

/**
 * Build a FilterGroup for a given preset.
 *
 * These are just helpers that return your existing DSL shape:
 *
 * FilterGroup = { operator: "AND"|"OR", conditions: Array<FilterGroup|FilterCondition> }
 * FilterCondition = { key, operator, value }
 *
 * @param {string} presetKey
 * @param {Object} [options]
 * @param {number} [options.threshold]  // inventory threshold, default 5
 * @returns {Object} filterConfig (FilterGroup)
 */
export function buildPresetFilterGroup(presetKey, options = {}) {
  const threshold = typeof options.threshold === "number" ? options.threshold : 5;

  switch (presetKey) {
    case PRESET_KEYS.LOW_INVENTORY_VARIANT:
      // Variants with inventory below threshold
      return {
        operator: "AND",
        conditions: [
          {
            key: OPS.VARIANT_INVENTORY_QUANTITY,
            operator: "LT",
            value: threshold,
          },
        ],
      };

    case PRESET_KEYS.LOW_INVENTORY_PRODUCT:
      // Products whose total rollup inventory is below threshold
      return {
        operator: "AND",
        conditions: [
          {
            key: OPS.PRODUCT_TOTAL_INVENTORY,
            operator: "LT",
            value: threshold,
          },
        ],
      };

    case PRESET_KEYS.NO_SEO_VISIBILITY_HIDDEN:
      // Products hidden from search (search engine visibility = hidden)
      return {
        operator: "AND",
        conditions: [
          {
            key: OPS.PRODUCT_SEO_HIDDEN,
            operator: "IS",
            value: true,
          },
        ],
      };

    default:
      throw new Error(`Unknown presetKey "${presetKey}"`);
  }
}

/* ──────────────────────────────────────────────────────────────
 * Public API – PRODUCT-FIRST
 *
 *  - buildProductListQuery(params) → { text, values }
 *  - buildProductCountQuery(params) → { text, values }
 *  - fetchProductsPage(client, params)
 * ─────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} FilterGroup
 * @property {"AND"|"OR"} operator
 * @property {Array<FilterGroup|FilterCondition>} conditions
 *
 * @typedef {Object} FilterCondition
 * @property {string} key            // OPS key
 * @property {string} operator       // EQ, GT, CONTAINS, etc.
 * @property {any} value             // string|number|array|null depending on operator
 *
 * @typedef {Object} ProductFilterParams
 * @property {number} shopId
 * @property {FilterGroup|null} [filterConfig]  // root group, may be null/empty
 * @property {string|null} [sortKey]           // one of SORT_DEFS keys
 * @property {"ASC"|"DESC"|null} [sortDirection]
 * @property {number} [page]                   // 1-based
 * @property {number} [pageSize]               // limit
 */

/**
 * Build SELECT query for product list (product-first mode).
 * Returns DISTINCT products.
 *
 * @param {ProductFilterParams} params
 */
export function buildProductListQuery(params) {
  const {
    shopId,
    filterConfig,
    sortKey,
    sortDirection,
    page = 1,
    pageSize = 50,
  } = params;

  if (!shopId) {
    throw new Error("buildProductListQuery: shopId is required");
  }

  const {
    whereSql,
    joinsSql,
    values,
    nextParamIndex,
  } = buildBaseFilterQueryParts({ shopId, filterConfig, baseMode: "PRODUCT" });

  const { orderBySql } = buildOrderByClause({ sortKey, sortDirection });

  const limit = Math.max(1, Math.min(pageSize, 250)); // hard cap
  const offset = Math.max(0, (Math.max(page, 1) - 1) * limit);

  let text = `
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
      pm.total_inventory_qty,
      pm.variant_count,
      pm.category,
      pm.product_type_custom,
      pm.visible_online_store,
      pm.visible_pos
    FROM product_mirror pm
    ${joinsSql}
    ${whereSql}
    ${orderBySql}
    LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
  `;

  const finalValues = [...values, limit, offset];

  return {
    text: collapseWhitespace(text),
    values: finalValues,
  };
}

/**
 * Build COUNT query for product list.
 * Returns COUNT(DISTINCT pm.id) matching same filters/joins.
 *
 * @param {ProductFilterParams} params
 */
export function buildProductCountQuery(params) {
  const { shopId, filterConfig } = params;

  if (!shopId) {
    throw new Error("buildProductCountQuery: shopId is required");
  }

  const { whereSql, joinsSql, values } = buildBaseFilterQueryParts({
    shopId,
    filterConfig,
    baseMode: "PRODUCT",
  });

  let text = `
    SELECT COUNT(DISTINCT pm.id) AS total_count
    FROM product_mirror pm
    ${joinsSql}
    ${whereSql}
  `;

  return {
    text: collapseWhitespace(text),
    values,
  };
}

/**
 * Optional convenience for callers – product-first page fetch.
 *
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {ProductFilterParams} params
 */
export async function fetchProductsPage(client, params) {
  const [listQuery, countQuery] = [
    buildProductListQuery(params),
    buildProductCountQuery(params),
  ];

  const [listResult, countResult] = await Promise.all([
    client.query(listQuery.text, listQuery.values),
    client.query(countQuery.text, countQuery.values),
  ]);

  const totalCount = Number(countResult.rows[0]?.total_count || 0);

  return {
    totalCount,
    items: listResult.rows,
  };
}

/* ──────────────────────────────────────────────────────────────
 * Public API – VARIANT-FIRST
 *
 *  - buildVariantListQuery(params) → { text, values }
 *  - buildVariantCountQuery(params) → { text, values }
 *  - fetchVariantsPage(client, params)
 *
 * Base FROM is still product_mirror pm, but we force pm→v join and
 * SELECT DISTINCT v.* + pm rollup columns. This keeps registry
 * joinHints consistent without a second registry.
 * ─────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} VariantFilterParams
 * @property {number} shopId
 * @property {FilterGroup|null} [filterConfig]
 * @property {string|null} [sortKey]           // still uses product SORT_DEFS for now
 * @property {"ASC"|"DESC"|null} [sortDirection]
 * @property {number} [page]
 * @property {number} [pageSize]
 */

/**
 * Build SELECT query for variant list (variant-first mode).
 *
 * @param {VariantFilterParams} params
 */
export function buildVariantListQuery(params) {
  const {
    shopId,
    filterConfig,
    sortKey,
    sortDirection,
    page = 1,
    pageSize = 50,
  } = params;

  if (!shopId) {
    throw new Error("buildVariantListQuery: shopId is required");
  }

  const {
    whereSql,
    joinsSql,
    values,
    nextParamIndex,
  } = buildBaseFilterQueryParts({ shopId, filterConfig, baseMode: "VARIANT" });

  const { orderBySql } = buildOrderByClause({ sortKey, sortDirection });

  const limit = Math.max(1, Math.min(pageSize, 250));
  const offset = Math.max(0, (Math.max(page, 1) - 1) * limit);

  let text = `
    SELECT DISTINCT
      v.id                    AS variant_id,
      v.shop_id               AS shop_id,
      v.shopify_variant_id,
      v.shopify_product_id,
      v.title                 AS variant_title,
      v.sku,
      v.barcode,
      v.price,
      v.compare_at_price,
      v.cost,
      v.inventory_quantity,
      v.profit_margin_pct,
      v.track_quantity,
      v.charge_tax,
      v.physical_product,
      v.weight,
      v.weight_unit,
      v.option1_value,
      v.option2_value,
      v.option3_value,
      pm.id                   AS product_id,
      pm.title                AS product_title,
      pm.handle,
      pm.vendor,
      pm.status,
      pm.total_inventory_qty,
      pm.variant_count,
      pm.category,
      pm.product_type_custom,
      pm.visible_online_store,
      pm.visible_pos
    FROM product_mirror pm
    ${joinsSql}
    ${whereSql}
    ${orderBySql}
    LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
  `;

  const finalValues = [...values, limit, offset];

  return {
    text: collapseWhitespace(text),
    values: finalValues,
  };
}

/**
 * Build COUNT query for variant list.
 * Returns COUNT(DISTINCT v.id).
 *
 * @param {VariantFilterParams} params
 */
export function buildVariantCountQuery(params) {
  const { shopId, filterConfig } = params;

  if (!shopId) {
    throw new Error("buildVariantCountQuery: shopId is required");
  }

  const { whereSql, joinsSql, values } = buildBaseFilterQueryParts({
    shopId,
    filterConfig,
    baseMode: "VARIANT",
  });

  let text = `
    SELECT COUNT(DISTINCT v.id) AS total_count
    FROM product_mirror pm
    ${joinsSql}
    ${whereSql}
  `;

  return {
    text: collapseWhitespace(text),
    values,
  };
}

/**
 * Optional convenience for callers – variant-first page fetch.
 *
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {VariantFilterParams} params
 */
export async function fetchVariantsPage(client, params) {
  const [listQuery, countQuery] = [
    buildVariantListQuery(params),
    buildVariantCountQuery(params),
  ];

  const [listResult, countResult] = await Promise.all([
    client.query(listQuery.text, listQuery.values),
    client.query(countQuery.text, countQuery.values),
  ]);

  const totalCount = Number(countResult.rows[0]?.total_count || 0);

  return {
    totalCount,
    items: listResult.rows,
  };
}

/* ──────────────────────────────────────────────────────────────
 * Core builder: WHERE + JOINs (shared between all modes)
 * ─────────────────────────────────────────────────────────── */

const BASE_VARIANT_JOIN_HINT = {
  type: "INNER",
  table: "variant_mirror",
  alias: "v",
  on: "v.product_id = pm.id AND v.shop_id = pm.shop_id",
};

/**
 * Internal: builds WHERE + JOINs + base params.
 *
 * @param {Object} args
 * @param {number} args.shopId
 * @param {FilterGroup|null} args.filterConfig
 * @param {"PRODUCT"|"VARIANT"} [args.baseMode]  // defaults to "PRODUCT"
 */
function buildBaseFilterQueryParts({ shopId, filterConfig, baseMode = "PRODUCT" }) {
  // shopId is always param #1
  const values = [shopId];
  let nextParamIndex = 2;

  // base shop predicate always applied
  const basePredicate = "pm.shop_id = $1";

  const joinCollector = new JoinCollector();

  // For VARIANT mode we *always* need pm→v join so SELECT can project v.*
  if (baseMode === "VARIANT") {
    joinCollector.addHints([BASE_VARIANT_JOIN_HINT]);
  }

  let filterPredicateSql = null;

  if (filterConfig && Array.isArray(filterConfig.conditions) && filterConfig.conditions.length > 0) {
    const ctx = {
      values,
      nextParamIndexRef: { value: nextParamIndex },
      joinCollector,
    };

    const groupSql = compileGroup(filterConfig, ctx);
    nextParamIndex = ctx.nextParamIndexRef.value;

    if (groupSql) {
      filterPredicateSql = groupSql;
    }
  }

  let whereSql;
  if (filterPredicateSql) {
    whereSql = `WHERE ${basePredicate} AND (${filterPredicateSql})`;
  } else {
    whereSql = `WHERE ${basePredicate}`;
  }

  const joinsSql = joinCollector.toSql();

  return {
    whereSql,
    joinsSql,
    values,
    nextParamIndex,
  };
}

/* ──────────────────────────────────────────────────────────────
 * Group / condition compiler
 * ─────────────────────────────────────────────────────────── */

function compileGroup(group, ctx) {
  if (!group || !Array.isArray(group.conditions) || group.conditions.length === 0) {
    return null;
  }

  const op = group.operator === "OR" ? "OR" : "AND";

  const compiledChildren = [];

  for (const child of group.conditions) {
    if (child && Array.isArray(child.conditions)) {
      const nested = compileGroup(child, ctx);
      if (nested) compiledChildren.push(`(${nested})`);
    } else if (child && child.key) {
      const cond = compileCondition(child, ctx);
      if (cond) compiledChildren.push(cond);
    }
  }

  if (!compiledChildren.length) return null;

  return compiledChildren.join(` ${op} `);
}

function compileCondition(condition, ctx) {
  const { key, operator, value } = condition;

  const def = REGISTRY_BY_KEY[key];
  if (!def) {
    logger.warn(`compileCondition: unknown filter key "${key}" – skipping`);
    return null;
  }

  const { pg, valueType, operators } = def;

  if (!pg || !pg.tableAlias || !pg.column) {
    logger.warn(`compileCondition: filter "${key}" missing PG mapping – skipping`);
    return null;
  }

  if (Array.isArray(operators) && !operators.includes(operator)) {
    logger.warn(
      `compileCondition: operator "${operator}" not allowed for key "${key}" – skipping`
    );
    return null;
  }

  // Register joins (if any) for this filter
  if (Array.isArray(pg.joinHints) && pg.joinHints.length > 0) {
    ctx.joinCollector.addHints(pg.joinHints);
  }

  const columnExpr = `${pg.tableAlias}.${pg.column}`;

  return buildSqlPredicate({
    columnExpr,
    operator,
    value,
    valueType,
    ctx,
  });
}

/* ──────────────────────────────────────────────────────────────
 * Operator → SQL mapping
 * ─────────────────────────────────────────────────────────── */

function buildSqlPredicate({ columnExpr, operator, value, valueType, ctx }) {
  const { values, nextParamIndexRef } = ctx;

  const nextParam = () => `$${nextParamIndexRef.value++}`;

  const makeLikeValue = (raw, pattern) => {
    if (typeof raw !== "string") return null;
    switch (pattern) {
      case "CONTAINS":
        return `%${raw}%`;
      case "STARTS_WITH":
        return `${raw}%`;
      case "ENDS_WITH":
        return `%${raw}`;
      default:
        return raw;
    }
  };

  switch (operator) {
    /* ───── Basic equality / comparison ───── */

    case "EQ": {
      const placeholder = nextParam();
      values.push(value);
      return `${columnExpr} = ${placeholder}`;
    }

    case "NEQ": {
      const placeholder = nextParam();
      values.push(value);
      return `${columnExpr} <> ${placeholder}`;
    }

    case "GT": {
      const placeholder = nextParam();
      values.push(value);
      return `${columnExpr} > ${placeholder}`;
    }

    case "GTE": {
      const placeholder = nextParam();
      values.push(value);
      return `${columnExpr} >= ${placeholder}`;
    }

    case "LT": {
      const placeholder = nextParam();
      values.push(value);
      return `${columnExpr} < ${placeholder}`;
    }

    case "LTE": {
      const placeholder = nextParam();
      values.push(value);
      return `${columnExpr} <= ${placeholder}`;
    }

    /* ───── IN / NOT IN ───── */

    case "IN": {
      if (!Array.isArray(value) || value.length === 0) {
        return "FALSE";
      }
      const placeholders = value.map((v) => {
        const p = nextParam();
        values.push(v);
        return p;
      });
      return `${columnExpr} IN (${placeholders.join(", ")})`;
    }

    case "NOT_IN": {
      if (!Array.isArray(value) || value.length === 0) {
        return "TRUE";
      }
      const placeholders = value.map((v) => {
        const p = nextParam();
        values.push(v);
        return p;
      });
      return `${columnExpr} NOT IN (${placeholders.join(", ")})`;
    }

    /* ───── BETWEEN (numbers/dates) ───── */

    case "BETWEEN": {
      if (!Array.isArray(value) || value.length !== 2) {
        return null;
      }
      const [from, to] = value;
      const p1 = nextParam();
      const p2 = nextParam();
      values.push(from, to);
      return `${columnExpr} BETWEEN ${p1} AND ${p2}`;
    }

    /* ───── Dates (ON / BEFORE / AFTER) ───── */

    case "ON": {
      const p = nextParam();
      values.push(value);
      return `${columnExpr}::date = ${p}::date`;
    }

    case "BEFORE": {
      const p = nextParam();
      values.push(value);
      return `${columnExpr} < ${p}`;
    }

    case "AFTER": {
      const p = nextParam();
      values.push(value);
      return `${columnExpr} > ${p}`;
    }

    /* ───── String LIKE / ILIKE ───── */

    case "CONTAINS":
    case "NOT_CONTAINS":
    case "STARTS_WITH":
    case "ENDS_WITH": {
      const likeVal = makeLikeValue(
        value,
        operator === "NOT_CONTAINS" ? "CONTAINS" : operator
      );
      if (likeVal == null) return null;
      const p = nextParam();
      values.push(likeVal);

      const expr = `${columnExpr} ILIKE ${p}`;
      return operator === "NOT_CONTAINS" ? `NOT (${expr})` : expr;
    }

    /* ───── Boolean-ish IS / IS_EMPTY / IS_NOT_EMPTY ───── */

    case "IS": {
      const p = nextParam();
      values.push(value === true);
      return `${columnExpr} = ${p}`;
    }

    case "IS_EMPTY": {
      if (valueType === "STRING") {
        return `(${columnExpr} IS NULL OR ${columnExpr} = '')`;
      }
      return `${columnExpr} IS NULL`;
    }

    case "IS_NOT_EMPTY": {
      if (valueType === "STRING") {
        return `(${columnExpr} IS NOT NULL AND ${columnExpr} <> '')`;
      }
      return `${columnExpr} IS NOT NULL`;
    }

    default: {
      logger.warn(`buildSqlPredicate: unsupported operator "${operator}" for ${columnExpr}`);
      return null;
    }
  }
}

/* ──────────────────────────────────────────────────────────────
 * Join collector – dedupes JOINs across filters
 * ─────────────────────────────────────────────────────────── */

class JoinCollector {
  constructor() {
    /** @type {Map<string, {type:string, table:string, alias:string, on:string}>} */
    this.joins = new Map();
  }

  addHints(hints) {
    for (const h of hints) {
      if (!h || !h.alias || !h.table || !h.on) continue;
      const key = `${h.alias}|${h.table}|${h.on}`;
      if (!this.joins.has(key)) {
        this.joins.set(key, h);
      }
    }
  }

  toSql() {
    if (this.joins.size === 0) return "";
    const parts = [];
    for (const { type, table, alias, on } of this.joins.values()) {
      const joinType = type && type.toUpperCase() === "LEFT" ? "LEFT JOIN" : "INNER JOIN";
      parts.push(`${joinType} ${table} ${alias} ON ${on}`);
    }
    return parts.length ? parts.join("\n    ") : "";
  }
}

/* ──────────────────────────────────────────────────────────────
 * ORDER BY builder
 * ─────────────────────────────────────────────────────────── */

function buildOrderByClause({ sortKey, sortDirection }) {
  if (!sortKey || !SORT_DEFS[sortKey]) {
    // Default: created_at DESC
    return { orderBySql: "ORDER BY pm.created_at DESC" };
  }

  const def = SORT_DEFS[sortKey];
  const direction =
    sortDirection && (sortDirection === "ASC" || sortDirection === "DESC")
      ? sortDirection
      : def.defaultDirection;

  const columnExpr = `pm.${def.field}`;
  return { orderBySql: `ORDER BY ${columnExpr} ${direction}` };
}

/* ──────────────────────────────────────────────────────────────
 * Utility – collapse extraneous whitespace
 * ─────────────────────────────────────────────────────────── */

function collapseWhitespace(sql) {
  return sql
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

export default {
  SORT_DEFS,
  PRESET_KEYS,
  buildPresetFilterGroup,
  buildProductListQuery,
  buildProductCountQuery,
  fetchProductsPage,
  buildVariantListQuery,
  buildVariantCountQuery,
  fetchVariantsPage,
};