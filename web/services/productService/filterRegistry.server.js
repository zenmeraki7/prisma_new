/**
 * FILE: web/services/productService/filterRegistry.server.js
 *
 * PG-mirror aligned filter registry.
 *
 * Canonical query plane assumptions:
 *   - "ProductLite" p
 *   - "VariantLite" v
 *   - "VariantRollup" vr
 *   - "ProductCollection" pc
 *   - "ProductTag" pt
 *
 * IMPORTANT:
 *  - Only expose filters that are actually backed by the current PG mirror pipeline.
 *  - Unsupported filters remain in OPS for UI compatibility, but are explicitly marked unsupported.
 */

/**
 * @typedef {"PRODUCT"|"VARIANT"} FilterLevel
 * @typedef {"STRING"|"NUMBER"|"BOOLEAN"|"DATE"|"ENUM"} FilterValueType
 *
 * @typedef {Object} JoinHint
 * @property {"INNER"|"LEFT"} type
 * @property {string} tableSql
 * @property {string} alias
 * @property {string} on
 *
 * @typedef {Object} PgMapping
 * @property {string} [tableAlias]
 * @property {string} [column]
 * @property {string} [expression]
 * @property {JoinHint[]|null} [joinHints]
 *
 * @typedef {Object} FilterDefinition
 * @property {string} key
 * @property {FilterLevel} level
 * @property {string} label
 * @property {FilterValueType} valueType
 * @property {string[]} operators
 * @property {boolean} [sortable]
 * @property {boolean} [isComputed]
 * @property {string[]} [enumValues]
 * @property {string} [unsupportedReason]
 * @property {PgMapping} pg
 */

export const OPS = Object.freeze({
  // Product-level
  PRODUCT_CATEGORY: "PRODUCT_CATEGORY",
  PRODUCT_COLLECTION_TITLE: "PRODUCT_COLLECTION_TITLE",
  PRODUCT_COLLECTION_ID: "PRODUCT_COLLECTION_ID",
  PRODUCT_CREATED_AT: "PRODUCT_CREATED_AT",
  PRODUCT_PUBLISHED_AT: "PRODUCT_PUBLISHED_AT",
  PRODUCT_UPDATED_AT: "PRODUCT_UPDATED_AT",
  PRODUCT_DESCRIPTION: "PRODUCT_DESCRIPTION",
  PRODUCT_HANDLE: "PRODUCT_HANDLE",
  PRODUCT_IMAGE_COUNT: "PRODUCT_IMAGE_COUNT",
  PRODUCT_TOTAL_INVENTORY: "PRODUCT_TOTAL_INVENTORY",
  PRODUCT_OPTION1_NAME: "PRODUCT_OPTION1_NAME",
  PRODUCT_OPTION2_NAME: "PRODUCT_OPTION2_NAME",
  PRODUCT_OPTION3_NAME: "PRODUCT_OPTION3_NAME",
  PRODUCT_ID: "PRODUCT_ID",
  PRODUCT_TYPE_CUSTOM: "PRODUCT_TYPE_CUSTOM",
  PRODUCT_SEO_HIDDEN: "PRODUCT_SEO_HIDDEN",
  PRODUCT_STATUS: "PRODUCT_STATUS",
  PRODUCT_TAG: "PRODUCT_TAG",
  PRODUCT_THEME_TEMPLATE: "PRODUCT_THEME_TEMPLATE",
  PRODUCT_TITLE: "PRODUCT_TITLE",
  PRODUCT_VARIANT_COUNT: "PRODUCT_VARIANT_COUNT",
  PRODUCT_VENDOR: "PRODUCT_VENDOR",
  PRODUCT_VISIBLE_ONLINE_STORE: "PRODUCT_VISIBLE_ONLINE_STORE",
  PRODUCT_VISIBLE_POS: "PRODUCT_VISIBLE_POS",

  // Variant-level
  VARIANT_AVAILABILITY: "VARIANT_AVAILABILITY",
  VARIANT_BARCODE: "VARIANT_BARCODE",
  VARIANT_CHARGE_TAX: "VARIANT_CHARGE_TAX",
  VARIANT_COMPARE_AT_PRICE: "VARIANT_COMPARE_AT_PRICE",
  VARIANT_CONNECTED_INVENTORY_LOCATION_NAME: "VARIANT_CONNECTED_INVENTORY_LOCATION_NAME",
  VARIANT_CONNECTED_INVENTORY_LOCATION_ID: "VARIANT_CONNECTED_INVENTORY_LOCATION_ID",
  VARIANT_COST: "VARIANT_COST",
  VARIANT_COUNTRY_OF_ORIGIN: "VARIANT_COUNTRY_OF_ORIGIN",
  VARIANT_FULFILLMENT_SERVICE: "VARIANT_FULFILLMENT_SERVICE",
  VARIANT_GRAMS: "VARIANT_GRAMS",
  VARIANT_HS_TARIFF_CODE: "VARIANT_HS_TARIFF_CODE",
  VARIANT_INVENTORY_OUT_OF_STOCK_POLICY: "VARIANT_INVENTORY_OUT_OF_STOCK_POLICY",
  VARIANT_OPTION1_VALUE: "VARIANT_OPTION1_VALUE",
  VARIANT_OPTION2_VALUE: "VARIANT_OPTION2_VALUE",
  VARIANT_OPTION3_VALUE: "VARIANT_OPTION3_VALUE",
  VARIANT_PHYSICAL_PRODUCT: "VARIANT_PHYSICAL_PRODUCT",
  VARIANT_PRICE: "VARIANT_PRICE",
  VARIANT_PROFIT_MARGIN: "VARIANT_PROFIT_MARGIN",
  VARIANT_SKU: "VARIANT_SKU",
  VARIANT_TRACK_QUANTITY: "VARIANT_TRACK_QUANTITY",
  VARIANT_INVENTORY_QUANTITY: "VARIANT_INVENTORY_QUANTITY",
  VARIANT_TITLE: "VARIANT_TITLE",
  VARIANT_WEIGHT: "VARIANT_WEIGHT",
  VARIANT_WEIGHT_UNIT: "VARIANT_WEIGHT_UNIT",
});

const STRING_OPERATORS = Object.freeze([
  "EQ",
  "NEQ",
  "CONTAINS",
  "NOT_CONTAINS",
  "STARTS_WITH",
  "ENDS_WITH",
  "IN",
  "NOT_IN",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
]);

const NUMBER_OPERATORS = Object.freeze([
  "EQ",
  "NEQ",
  "GT",
  "GTE",
  "LT",
  "LTE",
  "BETWEEN",
  "IN",
  "NOT_IN",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
]);

const DATE_OPERATORS = Object.freeze([
  "ON",
  "BEFORE",
  "AFTER",
  "BETWEEN",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
]);

const BOOLEAN_OPERATORS = Object.freeze([
  "IS",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
]);

const ENUM_OPERATORS = Object.freeze([
  "EQ",
  "NEQ",
  "IN",
  "NOT_IN",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
]);

/* -------------------------------------------------------------------------- */
/* Join hints                                                                  */
/* -------------------------------------------------------------------------- */

const JOIN_VARIANT = Object.freeze(
  /** @type {JoinHint} */ ({
    type: "INNER",
    tableSql: `"VariantLite"`,
    alias: "v",
    on: `v."shopId" = p."shopId" AND v."productId" = p."id"`,
  }),
);

const JOIN_VARIANT_ROLLUP = Object.freeze(
  /** @type {JoinHint} */ ({
    type: "LEFT",
    tableSql: `"VariantRollup"`,
    alias: "vr",
    on: `vr."shopId" = p."shopId" AND vr."productId" = p."id"`,
  }),
);

const JOIN_COLLECTIONS = Object.freeze(
  /** @type {JoinHint[]} */ ([
    {
      type: "LEFT",
      tableSql: `"ProductCollection"`,
      alias: "pc",
      on: `pc."shopId" = p."shopId" AND pc."productId" = p."id"`,
    },
  ]),
);

const JOIN_TAGS = Object.freeze(
  /** @type {JoinHint[]} */ ([
    {
      type: "LEFT",
      tableSql: `"ProductTag"`,
      alias: "pt",
      on: `pt."shopId" = p."shopId" AND pt."productId" = p."id"`,
    },
  ]),
);

/* -------------------------------------------------------------------------- */
/* PG helpers                                                                  */
/* -------------------------------------------------------------------------- */

function pgProduct(column) {
  return { tableAlias: "p", column, joinHints: null };
}

function pgVariant(column) {
  return { tableAlias: "v", column, joinHints: [JOIN_VARIANT] };
}

function pgRollup(column) {
  return { tableAlias: "vr", column, joinHints: [JOIN_VARIANT_ROLLUP] };
}

function pgExpr(expression, joinHints = null) {
  return { expression, joinHints };
}

const NUMERIC_TEXT_CAST = (expr) =>
  `NULLIF(regexp_replace(COALESCE(${expr}, ''), '[^0-9\\.-]', '', 'g'), '')::numeric`;

const AVAILABILITY_EXPR = `
CASE
  WHEN COALESCE(v."inventoryQuantity", 0) > 0 THEN 'in_stock'
  WHEN COALESCE(v."inventoryQuantity", 0) <= 0
       AND LOWER(COALESCE(v."inventoryOutOfStockPolicy", '')) = 'continue'
    THEN 'on_backorder'
  ELSE 'out_of_stock'
END
`;

const PROFIT_MARGIN_EXPR = `
CASE
  WHEN v."price" IS NULL OR v."price" = 0 OR v."cost" IS NULL THEN NULL
  ELSE ROUND(((v."price" - v."cost") / v."price") * 100, 4)
END
`;

const HAS_IMAGES_COUNT_EXPR = `CASE WHEN p."hasImages" THEN 1 ELSE 0 END`;

const UNSUPPORTED_REASON_NOT_BACKED =
  "Not backed by the current PG mirror sync pipeline yet.";

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

/** @type {Record<string, FilterDefinition>} */
export const REGISTRY_BY_KEY = Object.freeze({
  [OPS.PRODUCT_CATEGORY]: {
    key: OPS.PRODUCT_CATEGORY,
    level: "PRODUCT",
    label: "Category",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgProduct("categoryName"),
  },

  [OPS.PRODUCT_COLLECTION_TITLE]: {
    key: OPS.PRODUCT_COLLECTION_TITLE,
    level: "PRODUCT",
    label: "Collection",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: {
      tableAlias: "pc",
      column: "collectionTitle",
      joinHints: JOIN_COLLECTIONS,
    },
  },

  [OPS.PRODUCT_COLLECTION_ID]: {
    key: OPS.PRODUCT_COLLECTION_ID,
    level: "PRODUCT",
    label: "Collection ID",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: false,
    pg: pgExpr(NUMERIC_TEXT_CAST(`pc."collectionId"`), JOIN_COLLECTIONS),
  },

  [OPS.PRODUCT_CREATED_AT]: {
    key: OPS.PRODUCT_CREATED_AT,
    level: "PRODUCT",
    label: "Date Created",
    valueType: "DATE",
    operators: DATE_OPERATORS,
    sortable: true,
    pg: pgProduct("createdAtShopify"),
  },

  [OPS.PRODUCT_PUBLISHED_AT]: {
    key: OPS.PRODUCT_PUBLISHED_AT,
    level: "PRODUCT",
    label: "Date Published",
    valueType: "DATE",
    operators: DATE_OPERATORS,
    sortable: true,
    pg: pgProduct("publishedAtShopify"),
  },

  [OPS.PRODUCT_UPDATED_AT]: {
    key: OPS.PRODUCT_UPDATED_AT,
    level: "PRODUCT",
    label: "Date Updated",
    valueType: "DATE",
    operators: DATE_OPERATORS,
    sortable: true,
    pg: pgProduct("updatedAtShopify"),
  },

  [OPS.PRODUCT_DESCRIPTION]: {
    key: OPS.PRODUCT_DESCRIPTION,
    level: "PRODUCT",
    label: "Description",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: false,
    pg: pgProduct("description"),
  },

  [OPS.PRODUCT_HANDLE]: {
    key: OPS.PRODUCT_HANDLE,
    level: "PRODUCT",
    label: "Handle",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgProduct("handle"),
  },

  [OPS.PRODUCT_IMAGE_COUNT]: {
    key: OPS.PRODUCT_IMAGE_COUNT,
    level: "PRODUCT",
    label: "Image Count",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: false,
    isComputed: true,
    pg: pgExpr(HAS_IMAGES_COUNT_EXPR),
  },

  [OPS.PRODUCT_TOTAL_INVENTORY]: {
    key: OPS.PRODUCT_TOTAL_INVENTORY,
    level: "PRODUCT",
    label: "Inventory Quantity (Total)",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: true,
    isComputed: true,
    pg: pgRollup("totalInventory"),
  },

  [OPS.PRODUCT_OPTION1_NAME]: {
    key: OPS.PRODUCT_OPTION1_NAME,
    level: "PRODUCT",
    label: "Option 1 Name",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgProduct("option1Name"),
  },

  [OPS.PRODUCT_OPTION2_NAME]: {
    key: OPS.PRODUCT_OPTION2_NAME,
    level: "PRODUCT",
    label: "Option 2 Name",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgProduct("option2Name"),
  },

  [OPS.PRODUCT_OPTION3_NAME]: {
    key: OPS.PRODUCT_OPTION3_NAME,
    level: "PRODUCT",
    label: "Option 3 Name",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgProduct("option3Name"),
  },

  [OPS.PRODUCT_ID]: {
    key: OPS.PRODUCT_ID,
    level: "PRODUCT",
    label: "Product ID",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: false,
    pg: pgExpr(NUMERIC_TEXT_CAST(`p."id"`)),
  },

  [OPS.PRODUCT_TYPE_CUSTOM]: {
    key: OPS.PRODUCT_TYPE_CUSTOM,
    level: "PRODUCT",
    label: "Product Type",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgProduct("productType"),
  },

  [OPS.PRODUCT_SEO_HIDDEN]: {
    key: OPS.PRODUCT_SEO_HIDDEN,
    level: "PRODUCT",
    label: "SEO Hidden",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable: false,
    unsupportedReason: UNSUPPORTED_REASON_NOT_BACKED,
    pg: pgProduct("seoHidden"),
  },

  [OPS.PRODUCT_STATUS]: {
    key: OPS.PRODUCT_STATUS,
    level: "PRODUCT",
    label: "Status",
    valueType: "ENUM",
    enumValues: Object.freeze(["active", "draft", "archived"]),
    operators: ENUM_OPERATORS,
    sortable: false,
    pg: pgExpr(`LOWER(COALESCE(p."status", ''))`),
  },

  [OPS.PRODUCT_TAG]: {
    key: OPS.PRODUCT_TAG,
    level: "PRODUCT",
    label: "Tag",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: {
      tableAlias: "pt",
      column: "tag",
      joinHints: JOIN_TAGS,
    },
  },

  [OPS.PRODUCT_THEME_TEMPLATE]: {
    key: OPS.PRODUCT_THEME_TEMPLATE,
    level: "PRODUCT",
    label: "Theme Template",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgProduct("themeTemplate"),
  },

  [OPS.PRODUCT_TITLE]: {
    key: OPS.PRODUCT_TITLE,
    level: "PRODUCT",
    label: "Title",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgProduct("title"),
  },

  [OPS.PRODUCT_VARIANT_COUNT]: {
    key: OPS.PRODUCT_VARIANT_COUNT,
    level: "PRODUCT",
    label: "Variant Count",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: true,
    pg: pgRollup("variantCount"),
  },

  [OPS.PRODUCT_VENDOR]: {
    key: OPS.PRODUCT_VENDOR,
    level: "PRODUCT",
    label: "Vendor",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgProduct("vendor"),
  },

  [OPS.PRODUCT_VISIBLE_ONLINE_STORE]: {
    key: OPS.PRODUCT_VISIBLE_ONLINE_STORE,
    level: "PRODUCT",
    label: "Visible Online Store",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable: false,
    unsupportedReason: UNSUPPORTED_REASON_NOT_BACKED,
    pg: pgProduct("visibleOnlineStore"),
  },

  [OPS.PRODUCT_VISIBLE_POS]: {
    key: OPS.PRODUCT_VISIBLE_POS,
    level: "PRODUCT",
    label: "Visible POS",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable: false,
    unsupportedReason: UNSUPPORTED_REASON_NOT_BACKED,
    pg: pgProduct("visiblePos"),
  },

  [OPS.VARIANT_AVAILABILITY]: {
    key: OPS.VARIANT_AVAILABILITY,
    level: "VARIANT",
    label: "Availability",
    valueType: "ENUM",
    enumValues: Object.freeze(["in_stock", "out_of_stock", "on_backorder"]),
    operators: ENUM_OPERATORS,
    sortable: false,
    isComputed: true,
    pg: pgExpr(AVAILABILITY_EXPR, [JOIN_VARIANT]),
  },

  [OPS.VARIANT_BARCODE]: {
    key: OPS.VARIANT_BARCODE,
    level: "VARIANT",
    label: "Barcode",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgVariant("barcode"),
  },

  [OPS.VARIANT_CHARGE_TAX]: {
    key: OPS.VARIANT_CHARGE_TAX,
    level: "VARIANT",
    label: "Charge Tax",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable: true,
    pg: pgVariant("chargeTax"),
  },

  [OPS.VARIANT_COMPARE_AT_PRICE]: {
    key: OPS.VARIANT_COMPARE_AT_PRICE,
    level: "VARIANT",
    label: "Compare-at Price",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: true,
    pg: pgVariant("compareAtPrice"),
  },

  [OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_NAME]: {
    key: OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_NAME,
    level: "VARIANT",
    label: "Connected Inventory Location Name",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: false,
    unsupportedReason:
      "Connected inventory location needs a dedicated PG-backed location materialization for VariantLite.",
    pg: pgExpr(`NULL::text`, [JOIN_VARIANT]),
  },

  [OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_ID]: {
    key: OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_ID,
    level: "VARIANT",
    label: "Connected Inventory Location ID",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: false,
    unsupportedReason:
      "Connected inventory location needs a dedicated PG-backed location materialization for VariantLite.",
    pg: pgExpr(`NULL::numeric`, [JOIN_VARIANT]),
  },

  [OPS.VARIANT_COST]: {
    key: OPS.VARIANT_COST,
    level: "VARIANT",
    label: "Cost",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: true,
    pg: pgVariant("cost"),
  },

  [OPS.VARIANT_COUNTRY_OF_ORIGIN]: {
    key: OPS.VARIANT_COUNTRY_OF_ORIGIN,
    level: "VARIANT",
    label: "Country of Origin",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgVariant("countryOfOrigin"),
  },

  [OPS.VARIANT_FULFILLMENT_SERVICE]: {
    key: OPS.VARIANT_FULFILLMENT_SERVICE,
    level: "VARIANT",
    label: "Fulfillment Service",
    valueType: "ENUM",
    enumValues: Object.freeze([]),
    operators: ENUM_OPERATORS,
    sortable: false,
    unsupportedReason:
      'Schema does not currently store fulfillment service on "VariantLite".',
    pg: pgExpr(`NULL::text`, [JOIN_VARIANT]),
  },

  [OPS.VARIANT_GRAMS]: {
    key: OPS.VARIANT_GRAMS,
    level: "VARIANT",
    label: "Weight (grams)",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: false,
    unsupportedReason:
      "Weight grams is not materialized; use weight + weight unit or add a computed grams column.",
    pg: pgExpr(`NULL::numeric`, [JOIN_VARIANT]),
  },

  [OPS.VARIANT_HS_TARIFF_CODE]: {
    key: OPS.VARIANT_HS_TARIFF_CODE,
    level: "VARIANT",
    label: "HS Tariff Code",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgVariant("hsTariffCode"),
  },

  [OPS.VARIANT_INVENTORY_OUT_OF_STOCK_POLICY]: {
    key: OPS.VARIANT_INVENTORY_OUT_OF_STOCK_POLICY,
    level: "VARIANT",
    label: "Inventory Out of Stock Policy",
    valueType: "ENUM",
    enumValues: Object.freeze(["deny", "continue"]),
    operators: ENUM_OPERATORS,
    sortable: true,
    pg: pgExpr(`LOWER(COALESCE(v."inventoryOutOfStockPolicy", ''))`, [JOIN_VARIANT]),
  },

  [OPS.VARIANT_OPTION1_VALUE]: {
    key: OPS.VARIANT_OPTION1_VALUE,
    level: "VARIANT",
    label: "Option 1 Value",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgVariant("option1Value"),
  },

  [OPS.VARIANT_OPTION2_VALUE]: {
    key: OPS.VARIANT_OPTION2_VALUE,
    level: "VARIANT",
    label: "Option 2 Value",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgVariant("option2Value"),
  },

  [OPS.VARIANT_OPTION3_VALUE]: {
    key: OPS.VARIANT_OPTION3_VALUE,
    level: "VARIANT",
    label: "Option 3 Value",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgVariant("option3Value"),
  },

  [OPS.VARIANT_PHYSICAL_PRODUCT]: {
    key: OPS.VARIANT_PHYSICAL_PRODUCT,
    level: "VARIANT",
    label: "Physical Product",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable: true,
    pg: pgVariant("physicalProduct"),
  },

  [OPS.VARIANT_PRICE]: {
    key: OPS.VARIANT_PRICE,
    level: "VARIANT",
    label: "Price",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: true,
    pg: pgVariant("price"),
  },

  [OPS.VARIANT_PROFIT_MARGIN]: {
    key: OPS.VARIANT_PROFIT_MARGIN,
    level: "VARIANT",
    label: "Profit Margin (%)",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: true,
    isComputed: true,
    pg: pgExpr(PROFIT_MARGIN_EXPR, [JOIN_VARIANT]),
  },

  [OPS.VARIANT_SKU]: {
    key: OPS.VARIANT_SKU,
    level: "VARIANT",
    label: "SKU",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgVariant("sku"),
  },

  [OPS.VARIANT_TRACK_QUANTITY]: {
    key: OPS.VARIANT_TRACK_QUANTITY,
    level: "VARIANT",
    label: "Track Quantity",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable: true,
    pg: pgVariant("trackQuantity"),
  },

  [OPS.VARIANT_INVENTORY_QUANTITY]: {
    key: OPS.VARIANT_INVENTORY_QUANTITY,
    level: "VARIANT",
    label: "Variant Inventory Quantity",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: true,
    pg: pgVariant("inventoryQuantity"),
  },

  [OPS.VARIANT_TITLE]: {
    key: OPS.VARIANT_TITLE,
    level: "VARIANT",
    label: "Variant Title",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable: true,
    pg: pgVariant("title"),
  },

  [OPS.VARIANT_WEIGHT]: {
    key: OPS.VARIANT_WEIGHT,
    level: "VARIANT",
    label: "Weight",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable: true,
    pg: pgVariant("weight"),
  },

  [OPS.VARIANT_WEIGHT_UNIT]: {
    key: OPS.VARIANT_WEIGHT_UNIT,
    level: "VARIANT",
    label: "Weight Unit",
    valueType: "ENUM",
    enumValues: Object.freeze(["g", "kg", "oz", "lb"]),
    operators: ENUM_OPERATORS,
    sortable: true,
    pg: pgExpr(`LOWER(COALESCE(v."weightUnit", ''))`, [JOIN_VARIANT]),
  },
});

export const ALL_OP_KEYS = Object.freeze(Object.values(OPS));

export const PRODUCT_OP_KEYS = Object.freeze(
  ALL_OP_KEYS.filter((key) => REGISTRY_BY_KEY[key]?.level === "PRODUCT"),
);

export const VARIANT_OP_KEYS = Object.freeze(
  ALL_OP_KEYS.filter((key) => REGISTRY_BY_KEY[key]?.level === "VARIANT"),
);

export function getFilter(key) {
  const entry = REGISTRY_BY_KEY[key];
  if (!entry && process.env.NODE_ENV !== "production") {
    throw new RangeError(`[filterRegistry] Unknown filter key: "${key}"`);
  }
  return entry;
}

export function getFiltersByOperator(operator) {
  return ALL_OP_KEYS
    .map((key) => REGISTRY_BY_KEY[key])
    .filter((entry) => entry?.operators.includes(operator));
}

export const SORTABLE_OP_KEYS = Object.freeze(
  ALL_OP_KEYS.filter((key) => REGISTRY_BY_KEY[key]?.sortable === true),
);

export const COMPUTED_OP_KEYS = Object.freeze(
  ALL_OP_KEYS.filter((key) => REGISTRY_BY_KEY[key]?.isComputed === true),
);

if (process.env.NODE_ENV !== "production") {
  const missingInRegistry = ALL_OP_KEYS.filter((key) => !REGISTRY_BY_KEY[key]);
  if (missingInRegistry.length > 0) {
    console.warn("[filterRegistry] OPS keys missing in REGISTRY_BY_KEY:", missingInRegistry);
  }
}

export default {
  OPS,
  REGISTRY_BY_KEY,
  ALL_OP_KEYS,
  PRODUCT_OP_KEYS,
  VARIANT_OP_KEYS,
  SORTABLE_OP_KEYS,
  COMPUTED_OP_KEYS,
  getFilter,
  getFiltersByOperator,
};