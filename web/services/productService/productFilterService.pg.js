// FILE: web/services/productService/productFilterService.pg.js

import { OPS, REGISTRY_BY_KEY } from "./filterRegistry.server.js";
import logger from "../../utils/logger.server.js";

/**
 * @typedef {"STRING"|"NUMBER"|"BOOLEAN"|"DATE"|"ENUM"} FilterValueType
 */

/**
 * @typedef {Object} FilterCondition
 * @property {string} key
 * @property {string} operator
 * @property {*} value
 */

/**
 * @typedef {Object} FilterGroup
 * @property {"AND"|"OR"} operator
 * @property {Array<FilterGroup|FilterCondition>} conditions
 */

/**
 * @typedef {Object} ProductFilterParams
 * @property {string|number} shopId
 * @property {FilterGroup} [filterConfig]
 * @property {string|null} [sortKey]
 * @property {string|null} [sortDirection]
 * @property {number} [page]
 * @property {number} [pageSize]
 */

/**
 * @typedef {Object} VariantFilterParams
 * @property {string|number} shopId
 * @property {FilterGroup} [filterConfig]
 * @property {string|null} [sortKey]
 * @property {string|null} [sortDirection]
 * @property {number} [page]
 * @property {number} [pageSize]
 */

export const MAX_PAGE_SIZE = 250;
export const MAX_FILTER_DEPTH = 8;
export const MAX_IN_VALUES = 500;

export class FilterValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "FilterValidationError";
  }
}

/* -------------------------------------------------------------------------- */
/* Sort definitions                                                            */
/* -------------------------------------------------------------------------- */

export const SORT_DEFS = Object.freeze({
  CREATED_AT: {
    key: "CREATED_AT",
    expression: `p."createdAtShopify"`,
    defaultDirection: "DESC",
  },
  UPDATED_AT: {
    key: "UPDATED_AT",
    expression: `p."updatedAtShopify"`,
    defaultDirection: "DESC",
  },
  PUBLISHED_AT: {
    key: "PUBLISHED_AT",
    expression: `p."publishedAtShopify"`,
    defaultDirection: "DESC",
  },
  TITLE: {
    key: "TITLE",
    expression: `p."title"`,
    defaultDirection: "ASC",
  },
  VENDOR: {
    key: "VENDOR",
    expression: `p."vendor"`,
    defaultDirection: "ASC",
  },
  TOTAL_INVENTORY: {
    key: "TOTAL_INVENTORY",
    expression: `vr."totalInventory"`,
    defaultDirection: "DESC",
    requiredJoinHints: [
      {
        type: "LEFT",
        tableSql: `"VariantRollup"`,
        alias: "vr",
        on: `vr."shopId" = p."shopId" AND vr."productId" = p."id"`,
      },
    ],
  },
  VARIANT_COUNT: {
    key: "VARIANT_COUNT",
    expression: `vr."variantCount"`,
    defaultDirection: "DESC",
    requiredJoinHints: [
      {
        type: "LEFT",
        tableSql: `"VariantRollup"`,
        alias: "vr",
        on: `vr."shopId" = p."shopId" AND vr."productId" = p."id"`,
      },
    ],
  },
  VARIANT_PRICE: {
    key: "VARIANT_PRICE",
    expression: `v."price"`,
    defaultDirection: "ASC",
    requiredJoinHints: [
      {
        type: "INNER",
        tableSql: `"VariantLite"`,
        alias: "v",
        on: `v."shopId" = p."shopId" AND v."productId" = p."id"`,
      },
    ],
  },
  VARIANT_SKU: {
    key: "VARIANT_SKU",
    expression: `v."sku"`,
    defaultDirection: "ASC",
    requiredJoinHints: [
      {
        type: "INNER",
        tableSql: `"VariantLite"`,
        alias: "v",
        on: `v."shopId" = p."shopId" AND v."productId" = p."id"`,
      },
    ],
  },
  VARIANT_INVENTORY_QUANTITY: {
    key: "VARIANT_INVENTORY_QUANTITY",
    expression: `v."inventoryQty"`,
    defaultDirection: "DESC",
    requiredJoinHints: [
      {
        type: "INNER",
        tableSql: `"VariantLite"`,
        alias: "v",
        on: `v."shopId" = p."shopId" AND v."productId" = p."id"`,
      },
    ],
  },
});

const ALLOWED_DIRECTIONS = new Set(["ASC", "DESC"]);
const ALLOWED_SORT_KEYS = new Set(Object.keys(SORT_DEFS));

export const PRESET_KEYS = Object.freeze({
  LOW_INVENTORY_VARIANT: "LOW_INVENTORY_VARIANT",
  LOW_INVENTORY_PRODUCT: "LOW_INVENTORY_PRODUCT",
  NO_SEO_VISIBILITY_HIDDEN: "NO_SEO_VISIBILITY_HIDDEN",
  MISSING_IMAGES: "MISSING_IMAGES",
  NO_SKU: "NO_SKU",
  NO_BARCODE: "NO_BARCODE",
  DRAFT_PRODUCTS: "DRAFT_PRODUCTS",
  ARCHIVED_PRODUCTS: "ARCHIVED_PRODUCTS",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  HIGH_COMPARE_AT_DISCOUNT: "HIGH_COMPARE_AT_DISCOUNT",
  MISSING_COST: "MISSING_COST",
});

export function buildPresetFilterGroup(presetKey, options = {}) {
  const threshold =
    typeof options.threshold === "number" ? options.threshold : 5;
  const discountThreshold =
    typeof options.discountThreshold === "number"
      ? options.discountThreshold
      : 20;

  switch (presetKey) {
    case PRESET_KEYS.LOW_INVENTORY_VARIANT:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.VARIANT_INVENTORY_QUANTITY, operator: "LT", value: threshold },
          { key: OPS.VARIANT_TRACK_QUANTITY, operator: "IS", value: true },
        ],
      };

    case PRESET_KEYS.LOW_INVENTORY_PRODUCT:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.PRODUCT_TOTAL_INVENTORY, operator: "LT", value: threshold },
          { key: OPS.PRODUCT_STATUS, operator: "EQ", value: "active" },
        ],
      };

    case PRESET_KEYS.NO_SEO_VISIBILITY_HIDDEN:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.PRODUCT_SEO_HIDDEN, operator: "IS", value: true },
          { key: OPS.PRODUCT_STATUS, operator: "EQ", value: "active" },
        ],
      };

    case PRESET_KEYS.MISSING_IMAGES:
      return {
        operator: "AND",
        conditions: [{ key: OPS.PRODUCT_IMAGE_COUNT, operator: "EQ", value: 0 }],
      };

    case PRESET_KEYS.NO_SKU:
      return {
        operator: "AND",
        conditions: [{ key: OPS.VARIANT_SKU, operator: "IS_EMPTY", value: null }],
      };

    case PRESET_KEYS.NO_BARCODE:
      return {
        operator: "AND",
        conditions: [{ key: OPS.VARIANT_BARCODE, operator: "IS_EMPTY", value: null }],
      };

    case PRESET_KEYS.DRAFT_PRODUCTS:
      return {
        operator: "AND",
        conditions: [{ key: OPS.PRODUCT_STATUS, operator: "EQ", value: "draft" }],
      };

    case PRESET_KEYS.ARCHIVED_PRODUCTS:
      return {
        operator: "AND",
        conditions: [{ key: OPS.PRODUCT_STATUS, operator: "EQ", value: "archived" }],
      };

    case PRESET_KEYS.OUT_OF_STOCK:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.PRODUCT_TOTAL_INVENTORY, operator: "LTE", value: 0 },
          { key: OPS.PRODUCT_STATUS, operator: "EQ", value: "active" },
        ],
      };

    case PRESET_KEYS.HIGH_COMPARE_AT_DISCOUNT:
      return {
        operator: "AND",
        conditions: [
          { key: OPS.VARIANT_COMPARE_AT_PRICE, operator: "IS_NOT_EMPTY", value: null },
          { key: OPS.VARIANT_PROFIT_MARGIN, operator: "GTE", value: discountThreshold },
        ],
      };

    case PRESET_KEYS.MISSING_COST:
      return {
        operator: "AND",
        conditions: [{ key: OPS.VARIANT_COST, operator: "IS_EMPTY", value: null }],
      };

    default:
      throw new RangeError(`buildPresetFilterGroup: unknown presetKey "${presetKey}"`);
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function normalizeShopId(shopId) {
  if (shopId === null || shopId === undefined || shopId === "") {
    throw new TypeError("shopId is required");
  }
  return String(shopId);
}

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
  const dir = typeof sortDirection === "string" ? sortDirection.toUpperCase() : null;
  const safeDir = dir && ALLOWED_DIRECTIONS.has(dir) ? dir : null;
  return { sortKey: safeKey, sortDirection: safeDir };
}

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
      if (typeof node.key !== "string") {
        throw new FilterValidationError("Filter condition key must be a string");
      }
      if (typeof node.operator !== "string") {
        throw new FilterValidationError("Filter condition operator must be a string");
      }
    } else {
      throw new FilterValidationError(
        "Filter node must have either conditions[] or key/operator",
      );
    }
  }

  walk(filterConfig, 1);
}

function quoteColumn(alias, column) {
  return `${alias}."${column}"`;
}

/* -------------------------------------------------------------------------- */
/* Product queries                                                             */
/* -------------------------------------------------------------------------- */

export function buildProductListQuery(params) {
  const {
    shopId: rawShopId,
    filterConfig,
    sortKey: rawSortKey,
    sortDirection: rawSortDirection,
    page: rawPage = 1,
    pageSize: rawPageSize = 50,
  } = params;

  const shopId = normalizeShopId(rawShopId);
  validateFilterConfig(filterConfig);

  const { page, pageSize } = normalizePagination(rawPage, rawPageSize);
  const { sortKey, sortDirection } = normalizeSortParams(rawSortKey, rawSortDirection);

  const { whereSql, joinsSql, values, nextParamIndex } = buildBaseFilterQueryParts({
    shopId,
    filterConfig,
    baseMode: "PRODUCT",
    sortKey,
    includeRollupJoin: true,
  });

  const orderBySql = buildOrderByClause({ sortKey, sortDirection, baseMode: "PRODUCT" });
  const limit = pageSize;
  const offset = (page - 1) * limit;

  const text = squish(`
    SELECT DISTINCT
      p."shopId"                         AS "shopId",
      p."id"                             AS "id",
      p."title"                          AS "title",
      p."handle"                         AS "handle",
      p."status"                         AS "status",
      p."vendor"                         AS "vendor",
      p."productType"                    AS "productType",
      p."categoryId"                     AS "categoryId",
      p."categoryName"                   AS "categoryName",
      p."description"                    AS "description",
      p."templateSuffix"                 AS "templateSuffix",
      p."seoHidden"                      AS "seoHidden",
      p."visibleOnlineStore"             AS "visibleOnlineStore",
      p."visiblePos"                     AS "visiblePos",
      p."option1Name"                    AS "option1Name",
      p."option2Name"                    AS "option2Name",
      p."option3Name"                    AS "option3Name",
      p."tags"                           AS "tags",
      p."hasImages"                      AS "hasImages",
      p."createdAtShopify"               AS "createdAtShopify",
      p."updatedAtShopify"               AS "updatedAtShopify",
      p."publishedAtShopify"             AS "publishedAtShopify",
      p."updatedAt"                      AS "updatedAt",
      COALESCE(vr."totalInventory", 0)   AS "totalInventory",
      COALESCE(vr."variantCount", 0)     AS "variantCount",
      vr."minPrice"                      AS "minPrice",
      vr."maxPrice"                      AS "maxPrice",
      vr."minCompareAtPrice"             AS "minCompareAtPrice",
      vr."maxCompareAtPrice"             AS "maxCompareAtPrice",
      vr."minCost"                       AS "minCost",
      vr."maxCost"                       AS "maxCost",
      vr."hasOutOfStockVariant"          AS "hasOutOfStockVariant",
      vr."hasInStockVariant"             AS "hasInStockVariant"
    FROM "ProductLite" p
    ${joinsSql}
    ${whereSql}
    ${orderBySql}
    LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
  `);

  return {
    text,
    values: [...values, limit, offset],
  };
}

export function buildProductCountQuery(params) {
  const {
    shopId: rawShopId,
    filterConfig,
  } = params;

  const shopId = normalizeShopId(rawShopId);
  validateFilterConfig(filterConfig);

  const { whereSql, joinsSql, values } = buildBaseFilterQueryParts({
    shopId,
    filterConfig,
    baseMode: "PRODUCT",
    includeRollupJoin: true,
  });

  const text = squish(`
    SELECT COUNT(DISTINCT p."id") AS total_count
    FROM "ProductLite" p
    ${joinsSql}
    ${whereSql}
  `);

  return { text, values };
}

export async function fetchProductsPage(client, params) {
  const listQuery = buildProductListQuery(params);
  const countQuery = buildProductCountQuery(params);

  try {
    const [listResult, countResult] = await Promise.all([
      client.query(listQuery.text, listQuery.values),
      client.query(countQuery.text, countQuery.values),
    ]);

    return {
      totalCount: Number(countResult.rows[0]?.total_count ?? 0),
      items: listResult.rows,
    };
  } catch (err) {
    logger.error({ err, params }, "fetchProductsPage: query failed");
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Variant queries                                                             */
/* -------------------------------------------------------------------------- */

export function buildVariantListQuery(params) {
  const {
    shopId: rawShopId,
    filterConfig,
    sortKey: rawSortKey,
    sortDirection: rawSortDirection,
    page: rawPage = 1,
    pageSize: rawPageSize = 50,
  } = params;

  const shopId = normalizeShopId(rawShopId);
  validateFilterConfig(filterConfig);

  const { page, pageSize } = normalizePagination(rawPage, rawPageSize);
  const { sortKey, sortDirection } = normalizeSortParams(rawSortKey, rawSortDirection);

  const { whereSql, joinsSql, values, nextParamIndex } = buildBaseFilterQueryParts({
    shopId,
    filterConfig,
    baseMode: "VARIANT",
    sortKey,
    includeRollupJoin: true,
  });

  const orderBySql = buildOrderByClause({ sortKey, sortDirection, baseMode: "VARIANT" });
  const limit = pageSize;
  const offset = (page - 1) * limit;

  const text = squish(`
    SELECT DISTINCT
      v."id"                             AS "rowId",
      v."shopId"                         AS "shopId",
      v."variantId"                      AS "variantId",
      v."productId"                      AS "productId",
      v."title"                          AS "variantTitle",
      v."sku"                            AS "sku",
      v."barcode"                        AS "barcode",
      v."price"                          AS "price",
      v."compareAtPrice"                 AS "compareAtPrice",
      v."cost"                           AS "cost",
      v."profitMarginPct"                AS "profitMarginPct",
      v."taxable"                        AS "taxable",
      v."trackQuantity"                  AS "trackQuantity",
      v."requiresShipping"               AS "requiresShipping",
      v."inventoryQty"                   AS "inventoryQty",
      v."inventoryPolicy"                AS "inventoryPolicy",
      v."countryOfOrigin"                AS "countryOfOrigin",
      v."hsTariffCode"                   AS "hsTariffCode",
      v."weightGrams"                    AS "weightGrams",
      v."weightUnit"                     AS "weightUnit",
      v."option1Value"                   AS "option1Value",
      v."option2Value"                   AS "option2Value",
      v."option3Value"                   AS "option3Value",
      p."title"                          AS "productTitle",
      p."handle"                         AS "productHandle",
      p."status"                         AS "productStatus",
      p."vendor"                         AS "productVendor",
      p."productType"                    AS "productType",
      p."categoryName"                   AS "categoryName",
      p."templateSuffix"                 AS "templateSuffix",
      p."visibleOnlineStore"             AS "visibleOnlineStore",
      p."visiblePos"                     AS "visiblePos",
      p."seoHidden"                      AS "seoHidden",
      p."createdAtShopify"               AS "createdAtShopify",
      p."updatedAtShopify"               AS "updatedAtShopify",
      p."publishedAtShopify"             AS "publishedAtShopify",
      COALESCE(vr."totalInventory", 0)   AS "productTotalInventory",
      COALESCE(vr."variantCount", 0)     AS "productVariantCount"
    FROM "ProductLite" p
    ${joinsSql}
    ${whereSql}
    ${orderBySql}
    LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
  `);

  return {
    text,
    values: [...values, limit, offset],
  };
}

export function buildVariantCountQuery(params) {
  const {
    shopId: rawShopId,
    filterConfig,
  } = params;

  const shopId = normalizeShopId(rawShopId);
  validateFilterConfig(filterConfig);

  const { whereSql, joinsSql, values } = buildBaseFilterQueryParts({
    shopId,
    filterConfig,
    baseMode: "VARIANT",
    includeRollupJoin: true,
  });

  const text = squish(`
    SELECT COUNT(DISTINCT v."id") AS total_count
    FROM "ProductLite" p
    ${joinsSql}
    ${whereSql}
  `);

  return { text, values };
}

export async function fetchVariantsPage(client, params) {
  const listQuery = buildVariantListQuery(params);
  const countQuery = buildVariantCountQuery(params);

  try {
    const [listResult, countResult] = await Promise.all([
      client.query(listQuery.text, listQuery.values),
      client.query(countQuery.text, countQuery.values),
    ]);

    return {
      totalCount: Number(countResult.rows[0]?.total_count ?? 0),
      items: listResult.rows,
    };
  } catch (err) {
    logger.error({ err, params }, "fetchVariantsPage: query failed");
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Core builder                                                                */
/* -------------------------------------------------------------------------- */

const BASE_VARIANT_JOIN_HINT = REGISTRY_BY_KEY[OPS.VARIANT_BARCODE]?.pg?.joinHints?.[0];
if (!BASE_VARIANT_JOIN_HINT) {
  throw new Error(
    "[productFilterService] Cannot derive BASE_VARIANT_JOIN_HINT from registry",
  );
}

const BASE_ROLLUP_JOIN_HINT = {
  type: "LEFT",
  tableSql: `"VariantRollup"`,
  alias: "vr",
  on: `vr."shopId" = p."shopId" AND vr."productId" = p."id"`,
};

function buildBaseFilterQueryParts({
  shopId,
  filterConfig,
  baseMode = "PRODUCT",
  sortKey = null,
  includeRollupJoin = false,
}) {
  const values = [shopId];
  const paramCounter = { value: 2 };
  const joinCollector = new JoinCollector();

  if (baseMode === "VARIANT") {
    joinCollector.addHint(BASE_VARIANT_JOIN_HINT);
  }

  if (includeRollupJoin) {
    joinCollector.addHint(BASE_ROLLUP_JOIN_HINT);
  }

  if (sortKey && SORT_DEFS[sortKey]?.requiredJoinHints?.length) {
    joinCollector.addHints(SORT_DEFS[sortKey].requiredJoinHints);
  }

  let filterPredicateSql = null;

  if (
    filterConfig &&
    Array.isArray(filterConfig.conditions) &&
    filterConfig.conditions.length > 0
  ) {
    filterPredicateSql = compileGroup(filterConfig, { values, paramCounter, joinCollector }, 0);
  }

  const whereSql = filterPredicateSql
    ? `WHERE p."shopId" = $1 AND (${filterPredicateSql})`
    : `WHERE p."shopId" = $1`;

  return {
    whereSql,
    joinsSql: joinCollector.toSql(),
    values,
    nextParamIndex: paramCounter.value,
  };
}

/* -------------------------------------------------------------------------- */
/* DSL compiler                                                                */
/* -------------------------------------------------------------------------- */

function compileGroup(group, ctx, depth) {
  if (depth > MAX_FILTER_DEPTH) {
    logger.warn(
      `compileGroup: max nesting depth (${MAX_FILTER_DEPTH}) exceeded`,
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
      logger.warn("compileGroup: child missing key/conditions, skipping");
    }
  }

  return parts.length ? parts.join(` ${op} `) : null;
}

function coerceValueForType(value, valueType) {
  switch (valueType) {
    case "NUMBER":
      if (Array.isArray(value)) {
        return value
          .map((v) => (v == null ? null : Number(v)))
          .filter((v) => Number.isFinite(v));
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

  if (def.unsupportedReason) {
    throw new FilterValidationError(
      `Filter "${key}" is unsupported: ${def.unsupportedReason}`,
    );
  }

  const { pg, valueType, operators } = def;

  if (!pg) {
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

  const columnExpr = pg.expression
    ? `(${pg.expression})`
    : quoteColumn(pg.tableAlias, pg.column);

  const coercedValue = coerceValueForType(value, valueType);

  return buildSqlPredicate({
    columnExpr,
    operator,
    value: coercedValue,
    valueType,
    ctx,
  });
}

/* -------------------------------------------------------------------------- */
/* Operator -> SQL                                                             */
/* -------------------------------------------------------------------------- */

function buildSqlPredicate({ columnExpr, operator, value, valueType, ctx }) {
  const { values, paramCounter } = ctx;
  const nextParam = () => `$${paramCounter.value++}`;

  switch (operator) {
    case "EQ": {
      const p = nextParam();
      values.push(value);
      return `${columnExpr} = ${p}`;
    }

    case "NEQ": {
      const p = nextParam();
      values.push(value);
      return `${columnExpr} IS DISTINCT FROM ${p}`;
    }

    case "GT": {
      const p = nextParam();
      values.push(value);
      return `${columnExpr} > ${p}`;
    }

    case "GTE": {
      const p = nextParam();
      values.push(value);
      return `${columnExpr} >= ${p}`;
    }

    case "LT": {
      const p = nextParam();
      values.push(value);
      return `${columnExpr} < ${p}`;
    }

    case "LTE": {
      const p = nextParam();
      values.push(value);
      return `${columnExpr} <= ${p}`;
    }

    case "IN": {
      if (!Array.isArray(value) || value.length === 0) return "FALSE";
      const capped = value.slice(0, MAX_IN_VALUES);
      const placeholders = capped.map((v) => {
        const p = nextParam();
        values.push(v);
        return p;
      });
      return `${columnExpr} IN (${placeholders.join(", ")})`;
    }

    case "NOT_IN": {
      if (!Array.isArray(value) || value.length === 0) return "TRUE";
      const capped = value.slice(0, MAX_IN_VALUES);
      const placeholders = capped.map((v) => {
        const p = nextParam();
        values.push(v);
        return p;
      });
      return `(${columnExpr} IS NULL OR ${columnExpr} NOT IN (${placeholders.join(", ")}))`;
    }

    case "BETWEEN": {
      if (!Array.isArray(value) || value.length !== 2) {
        logger.warn("buildSqlPredicate: BETWEEN requires [from, to]");
        return null;
      }
      const [from, to] = value;
      if (from == null || to == null) return null;
      const p1 = nextParam();
      const p2 = nextParam();
      values.push(from, to);
      return `${columnExpr} BETWEEN ${p1} AND ${p2}`;
    }

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

    case "CONTAINS":
    case "NOT_CONTAINS":
    case "STARTS_WITH":
    case "ENDS_WITH": {
      if (typeof value !== "string") {
        logger.warn(`buildSqlPredicate: ${operator} requires a string`);
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

      const p = nextParam();
      values.push(likeVal);
      const expr = `${columnExpr} ILIKE ${p} ESCAPE '\\\\'`;
      return operator === "NOT_CONTAINS" ? `NOT (${expr})` : expr;
    }

    case "IS": {
      const p = nextParam();
      values.push(value === true || value === "true");
      return `${columnExpr} = ${p}`;
    }

    case "IS_EMPTY": {
      if (valueType === "STRING" || valueType === "ENUM") {
        return `(${columnExpr} IS NULL OR trim(CAST(${columnExpr} AS text)) = '')`;
      }
      return `${columnExpr} IS NULL`;
    }

    case "IS_NOT_EMPTY": {
      if (valueType === "STRING" || valueType === "ENUM") {
        return `(${columnExpr} IS NOT NULL AND trim(CAST(${columnExpr} AS text)) <> '')`;
      }
      return `${columnExpr} IS NOT NULL`;
    }

    default:
      logger.warn(`buildSqlPredicate: unsupported operator "${operator}"`);
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Join collector                                                              */
/* -------------------------------------------------------------------------- */

class JoinCollector {
  constructor() {
    this._map = new Map();
  }

  addHint(hint) {
    if (!hint?.alias || !hint?.tableSql || !hint?.on) return;
    const key = `${hint.alias}|${hint.tableSql}`;
    if (!this._map.has(key)) {
      this._map.set(key, hint);
      return;
    }

    const existing = this._map.get(key);
    if (hint.type === "LEFT" && existing.type === "INNER") {
      this._map.set(key, hint);
    }
  }

  addHints(hints) {
    for (const hint of hints) this.addHint(hint);
  }

  toSql() {
    if (this._map.size === 0) return "";

    const lines = [];
    for (const { type, tableSql, alias, on } of this._map.values()) {
      const joinType = type?.toUpperCase() === "LEFT" ? "LEFT JOIN" : "INNER JOIN";
      lines.push(`${joinType} ${tableSql} ${alias} ON ${on}`);
    }
    return lines.join("\n");
  }
}

/* -------------------------------------------------------------------------- */
/* Order by                                                                    */
/* -------------------------------------------------------------------------- */

function buildOrderByClause({ sortKey, sortDirection, baseMode }) {
  if (!sortKey || !SORT_DEFS[sortKey]) {
    if (baseMode === "VARIANT") {
      return `ORDER BY p."updatedAtShopify" DESC NULLS LAST, v."id" DESC`;
    }
    return `ORDER BY p."updatedAtShopify" DESC NULLS LAST, p."id" DESC`;
  }

  const def = SORT_DEFS[sortKey];
  const dir = ALLOWED_DIRECTIONS.has(sortDirection)
    ? sortDirection
    : def.defaultDirection;

  if (baseMode === "VARIANT") {
    return `ORDER BY ${def.expression} ${dir} NULLS LAST, v."id" DESC`;
  }

  return `ORDER BY ${def.expression} ${dir} NULLS LAST, p."id" DESC`;
}

/* -------------------------------------------------------------------------- */
/* Utility                                                                     */
/* -------------------------------------------------------------------------- */

function squish(sql) {
  return sql
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

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