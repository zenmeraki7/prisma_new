// FILE: web/services/productService/filterRegistry.server.js
//
// Filter registry (PG-only) for the FAST plane.
//
// REGISTRY_BY_KEY describes per filter:
//   level:      "PRODUCT" | "VARIANT"
//   valueType:  "STRING" | "NUMBER" | "BOOLEAN" | "DATE" | "ENUM"
//   operators:  allowed operators for DSL validation
//   sortable:   true if the column is indexed and safe to ORDER BY
//   isComputed: true if the column is materialized/derived (read-only)
//   enumValues: string[] for ENUM types (UI validation + autocomplete)
//   pg: {
//     tableAlias: string          – alias used in FROM/JOIN
//     column:     string          – column name on that alias
//     joinHints:  JoinHint[]|null – planner uses these to add JOINs
//   }
//
// JoinHint = { type: "INNER"|"LEFT", table: string, alias: string, on: string }
//
// Base FROM is always: product_mirror pm
// All queries MUST filter by shop: pm.shop_id = $1

// ─────────────────────────────────────────────────────────────────────────────
// JSDoc types (for editor support only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {"PRODUCT"|"VARIANT"} FilterLevel
 * @typedef {"STRING"|"NUMBER"|"BOOLEAN"|"DATE"|"ENUM"} FilterValueType
 *
 * @typedef {Object} JoinHint
 * @property {"INNER"|"LEFT"} type
 * @property {string} table
 * @property {string} alias
 * @property {string} on
 *
 * @typedef {Object} PgMapping
 * @property {string} tableAlias
 * @property {string} column
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
 * @property {PgMapping} pg
 */

// ─────────────────────────────────────────────────────────────────────────────
// OPS  –  canonical filter key enum
// ─────────────────────────────────────────────────────────────────────────────

export const OPS = Object.freeze({
  // Product-level
  PRODUCT_CATEGORY:                          "PRODUCT_CATEGORY",
  PRODUCT_COLLECTION_TITLE:                  "PRODUCT_COLLECTION_TITLE",
  PRODUCT_COLLECTION_ID:                     "PRODUCT_COLLECTION_ID",
  PRODUCT_CREATED_AT:                        "PRODUCT_CREATED_AT",
  PRODUCT_PUBLISHED_AT:                      "PRODUCT_PUBLISHED_AT",
  PRODUCT_UPDATED_AT:                        "PRODUCT_UPDATED_AT",
  PRODUCT_DESCRIPTION:                       "PRODUCT_DESCRIPTION",
  PRODUCT_HANDLE:                            "PRODUCT_HANDLE",
  PRODUCT_IMAGE_COUNT:                       "PRODUCT_IMAGE_COUNT",
  PRODUCT_TOTAL_INVENTORY:                   "PRODUCT_TOTAL_INVENTORY",
  PRODUCT_OPTION1_NAME:                      "PRODUCT_OPTION1_NAME",
  PRODUCT_OPTION2_NAME:                      "PRODUCT_OPTION2_NAME",
  PRODUCT_OPTION3_NAME:                      "PRODUCT_OPTION3_NAME",
  PRODUCT_ID:                                "PRODUCT_ID",
  PRODUCT_TYPE_CUSTOM:                       "PRODUCT_TYPE_CUSTOM",
  PRODUCT_SEO_HIDDEN:                        "PRODUCT_SEO_HIDDEN",
  PRODUCT_STATUS:                            "PRODUCT_STATUS",
  PRODUCT_TAG:                               "PRODUCT_TAG",
  PRODUCT_THEME_TEMPLATE:                    "PRODUCT_THEME_TEMPLATE",
  PRODUCT_TITLE:                             "PRODUCT_TITLE",
  PRODUCT_VARIANT_COUNT:                     "PRODUCT_VARIANT_COUNT",
  PRODUCT_VENDOR:                            "PRODUCT_VENDOR",
  PRODUCT_VISIBLE_ONLINE_STORE:              "PRODUCT_VISIBLE_ONLINE_STORE",
  PRODUCT_VISIBLE_POS:                       "PRODUCT_VISIBLE_POS",

  // Variant-level
  VARIANT_AVAILABILITY:                      "VARIANT_AVAILABILITY",
  VARIANT_BARCODE:                           "VARIANT_BARCODE",
  VARIANT_CHARGE_TAX:                        "VARIANT_CHARGE_TAX",
  VARIANT_COMPARE_AT_PRICE:                  "VARIANT_COMPARE_AT_PRICE",
  VARIANT_CONNECTED_INVENTORY_LOCATION_NAME: "VARIANT_CONNECTED_INVENTORY_LOCATION_NAME",
  VARIANT_CONNECTED_INVENTORY_LOCATION_ID:   "VARIANT_CONNECTED_INVENTORY_LOCATION_ID",
  VARIANT_COST:                              "VARIANT_COST",
  VARIANT_COUNTRY_OF_ORIGIN:                 "VARIANT_COUNTRY_OF_ORIGIN",
  VARIANT_FULFILLMENT_SERVICE:               "VARIANT_FULFILLMENT_SERVICE",
  VARIANT_GRAMS:                             "VARIANT_GRAMS",
  VARIANT_HS_TARIFF_CODE:                    "VARIANT_HS_TARIFF_CODE",
  VARIANT_INVENTORY_OUT_OF_STOCK_POLICY:     "VARIANT_INVENTORY_OUT_OF_STOCK_POLICY",
  VARIANT_OPTION1_VALUE:                     "VARIANT_OPTION1_VALUE",
  VARIANT_OPTION2_VALUE:                     "VARIANT_OPTION2_VALUE",
  VARIANT_OPTION3_VALUE:                     "VARIANT_OPTION3_VALUE",
  VARIANT_PHYSICAL_PRODUCT:                  "VARIANT_PHYSICAL_PRODUCT",
  VARIANT_PRICE:                             "VARIANT_PRICE",
  VARIANT_PROFIT_MARGIN:                     "VARIANT_PROFIT_MARGIN",
  VARIANT_SKU:                               "VARIANT_SKU",
  VARIANT_TRACK_QUANTITY:                    "VARIANT_TRACK_QUANTITY",
  VARIANT_INVENTORY_QUANTITY:                "VARIANT_INVENTORY_QUANTITY",
  VARIANT_TITLE:                             "VARIANT_TITLE",
  VARIANT_WEIGHT:                            "VARIANT_WEIGHT",
  VARIANT_WEIGHT_UNIT:                       "VARIANT_WEIGHT_UNIT",
});

// ─────────────────────────────────────────────────────────────────────────────
// Canonical operator sets
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Join hint constants
// ─────────────────────────────────────────────────────────────────────────────

/** product_mirror pm → variant_mirror v */
const JOIN_VARIANT = Object.freeze(
  /** @type {JoinHint} */ ({
    type: "INNER",
    table: "variant_mirror",
    alias: "v",
    on: "v.product_id = pm.id AND v.shop_id = pm.shop_id",
  }),
);

/**
 * product_mirror → product_collections → collections
 *
 * LEFT JOIN so products *without* any collection are still available for
 * IS_EMPTY / NEQ / NOT_IN semantics. Planner can tighten to INNER for EQ/IN.
 */
const JOIN_COLLECTIONS = Object.freeze(
  /** @type {JoinHint[]} */ ([
    {
      type: "LEFT",
      table: "product_collections",
      alias: "pc",
      on: "pc.product_id = pm.id",
    },
    {
      type: "LEFT",
      table: "collections",
      alias: "c",
      on: "c.id = pc.collection_id AND c.shop_id = pm.shop_id",
    },
  ]),
);

/**
 * product_mirror → product_tags → tags
 *
 * Same LEFT JOIN reasoning as collections (supports IS_EMPTY on Tag).
 */
const JOIN_TAGS = Object.freeze(
  /** @type {JoinHint[]} */ ([
    {
      type: "LEFT",
      table: "product_tags",
      alias: "pt",
      on: "pt.product_id = pm.id",
    },
    {
      type: "LEFT",
      table: "tags",
      alias: "t",
      on: "t.id = pt.tag_id AND t.shop_id = pm.shop_id",
    },
  ]),
);

/**
 * pm → variant_mirror → variant_inventory_mirror → locations
 */
const JOIN_VARIANT_LOCATION = Object.freeze(
  /** @type {JoinHint[]} */ ([
    JOIN_VARIANT,
    {
      type: "INNER",
      table: "variant_inventory_mirror",
      alias: "vim",
      on: "vim.variant_id = v.id AND vim.shop_id = pm.shop_id",
    },
    {
      type: "INNER",
      table: "locations",
      alias: "loc",
      on: "loc.id = vim.location_id AND loc.shop_id = pm.shop_id",
    },
  ]),
);

// ─────────────────────────────────────────────────────────────────────────────
// pg() helpers  – avoid repeating join boilerplate on every entry
// ─────────────────────────────────────────────────────────────────────────────

/** Product-level column directly on product_mirror (pm). */
/** @returns {PgMapping} */
function pgProduct(column) {
  return { tableAlias: "pm", column, joinHints: null };
}

/** Variant-level column on variant_mirror (v). */
/** @returns {PgMapping} */
function pgVariant(column) {
  return { tableAlias: "v", column, joinHints: [JOIN_VARIANT] };
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY_BY_KEY
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Record<string, FilterDefinition>} */
export const REGISTRY_BY_KEY = Object.freeze({
  // ───────────────────────────────────────────────────
  // PRODUCT-LEVEL FILTERS
  // ───────────────────────────────────────────────────

  [OPS.PRODUCT_CATEGORY]: {
    key:       OPS.PRODUCT_CATEGORY,
    level:     "PRODUCT",
    label:     "Category",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgProduct("category"),
  },

  [OPS.PRODUCT_COLLECTION_TITLE]: {
    key:       OPS.PRODUCT_COLLECTION_TITLE,
    level:     "PRODUCT",
    label:     "Collection",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg: {
      tableAlias: "c",
      column:     "title",
      joinHints:  JOIN_COLLECTIONS,
    },
  },

  [OPS.PRODUCT_COLLECTION_ID]: {
    key:       OPS.PRODUCT_COLLECTION_ID,
    level:     "PRODUCT",
    label:     "Collection ID",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable:  true,
    pg: {
      tableAlias: "c",
      column:     "shopify_collection_id",
      joinHints:  JOIN_COLLECTIONS,
    },
  },

  [OPS.PRODUCT_CREATED_AT]: {
    key:       OPS.PRODUCT_CREATED_AT,
    level:     "PRODUCT",
    label:     "Date Created",
    valueType: "DATE",
    operators: DATE_OPERATORS,
    sortable:  true,
    pg:        pgProduct("created_at"),
  },

  [OPS.PRODUCT_PUBLISHED_AT]: {
    key:       OPS.PRODUCT_PUBLISHED_AT,
    level:     "PRODUCT",
    label:     "Date Published",
    valueType: "DATE",
    operators: DATE_OPERATORS,
    sortable:  true,
    pg:        pgProduct("published_at"),
  },

  [OPS.PRODUCT_UPDATED_AT]: {
    key:       OPS.PRODUCT_UPDATED_AT,
    level:     "PRODUCT",
    label:     "Date Updated",
    valueType: "DATE",
    operators: DATE_OPERATORS,
    sortable:  true,
    pg:        pgProduct("updated_at"),
  },

  [OPS.PRODUCT_DESCRIPTION]: {
    key:       OPS.PRODUCT_DESCRIPTION,
    level:     "PRODUCT",
    label:     "Description",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  false, // TEXT – avoid ORDER BY for perf
    pg:        pgProduct("description"),
  },

  [OPS.PRODUCT_HANDLE]: {
    key:       OPS.PRODUCT_HANDLE,
    level:     "PRODUCT",
    label:     "Handle (URL Slug)",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgProduct("handle"),
  },

  // Derived from product_images mirror; not directly editable.
  [OPS.PRODUCT_IMAGE_COUNT]: {
    key:        OPS.PRODUCT_IMAGE_COUNT,
    level:      "PRODUCT",
    label:      "Image Count",
    valueType:  "NUMBER",
    operators:  NUMBER_OPERATORS,
    sortable:   true,
    isComputed: true, // derived metric
    pg:         pgProduct("image_count"),
  },

  // Rollup across variant_inventory_mirror; not edited directly.
  [OPS.PRODUCT_TOTAL_INVENTORY]: {
    key:        OPS.PRODUCT_TOTAL_INVENTORY,
    level:      "PRODUCT",
    label:      "Inventory Quantity (Total)",
    valueType:  "NUMBER",
    operators:  NUMBER_OPERATORS,
    sortable:   true,
    isComputed: true, // rollup field, edited via variants
    pg:         pgProduct("rollup_inventory_qty"),
  },

  [OPS.PRODUCT_OPTION1_NAME]: {
    key:       OPS.PRODUCT_OPTION1_NAME,
    level:     "PRODUCT",
    label:     "Option 1 Name",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgProduct("option1_name"),
  },

  [OPS.PRODUCT_OPTION2_NAME]: {
    key:       OPS.PRODUCT_OPTION2_NAME,
    level:     "PRODUCT",
    label:     "Option 2 Name",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgProduct("option2_name"),
  },

  [OPS.PRODUCT_OPTION3_NAME]: {
    key:       OPS.PRODUCT_OPTION3_NAME,
    level:     "PRODUCT",
    label:     "Option 3 Name",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgProduct("option3_name"),
  },

  [OPS.PRODUCT_ID]: {
    key:       OPS.PRODUCT_ID,
    level:     "PRODUCT",
    label:     "Shopify Product ID",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable:  true,
    pg:        pgProduct("shopify_product_id"),
  },

  [OPS.PRODUCT_TYPE_CUSTOM]: {
    key:       OPS.PRODUCT_TYPE_CUSTOM,
    level:     "PRODUCT",
    label:     "Product Type (Custom)",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgProduct("product_type_custom"),
  },

  [OPS.PRODUCT_SEO_HIDDEN]: {
    key:       OPS.PRODUCT_SEO_HIDDEN,
    level:     "PRODUCT",
    label:     "Search Engine Visibility (Hidden)",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable:  false,
    pg:        pgProduct("seo_hidden"),
  },

  [OPS.PRODUCT_STATUS]: {
    key:        OPS.PRODUCT_STATUS,
    level:      "PRODUCT",
    label:      "Status",
    valueType:  "ENUM",
    enumValues: Object.freeze(["active", "draft", "archived"]),
    operators:  ENUM_OPERATORS,
    sortable:   true,
    pg:         pgProduct("status"),
  },

  [OPS.PRODUCT_TAG]: {
    key:       OPS.PRODUCT_TAG,
    level:     "PRODUCT",
    label:     "Tag",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg: {
      tableAlias: "t",
      column:     "name",
      joinHints:  JOIN_TAGS,
    },
  },

  [OPS.PRODUCT_THEME_TEMPLATE]: {
    key:       OPS.PRODUCT_THEME_TEMPLATE,
    level:     "PRODUCT",
    label:     "Theme Template",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    // Shopify uses template_suffix; adjust if your mirror differs.
    pg:        pgProduct("template_suffix"),
  },

  [OPS.PRODUCT_TITLE]: {
    key:       OPS.PRODUCT_TITLE,
    level:     "PRODUCT",
    label:     "Title",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgProduct("title"),
  },

  [OPS.PRODUCT_VARIANT_COUNT]: {
    key:       OPS.PRODUCT_VARIANT_COUNT,
    level:     "PRODUCT",
    label:     "Variant Count",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable:  true,
    pg:        pgProduct("variant_count"),
  },

  [OPS.PRODUCT_VENDOR]: {
    key:       OPS.PRODUCT_VENDOR,
    level:     "PRODUCT",
    label:     "Vendor",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgProduct("vendor"),
  },

  [OPS.PRODUCT_VISIBLE_ONLINE_STORE]: {
    key:       OPS.PRODUCT_VISIBLE_ONLINE_STORE,
    level:     "PRODUCT",
    label:     "Visible on Online Store",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable:  false,
    pg:        pgProduct("visible_online_store"),
  },

  [OPS.PRODUCT_VISIBLE_POS]: {
    key:       OPS.PRODUCT_VISIBLE_POS,
    level:     "PRODUCT",
    label:     "Visible on POS",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable:  false,
    pg:        pgProduct("visible_pos"),
  },

  // ───────────────────────────────────────────────────
  // VARIANT-LEVEL FILTERS
  // ───────────────────────────────────────────────────

  [OPS.VARIANT_AVAILABILITY]: {
    key:        OPS.VARIANT_AVAILABILITY,
    level:      "VARIANT",
    label:      "Availability",
    valueType:  "ENUM",
    enumValues: Object.freeze(["in_stock", "out_of_stock", "on_backorder"]),
    operators:  ENUM_OPERATORS,
    sortable:   false,
    pg:         pgVariant("availability"),
  },

  [OPS.VARIANT_BARCODE]: {
    key:       OPS.VARIANT_BARCODE,
    level:     "VARIANT",
    label:     "Barcode (ISBN, UPC, GTIN, etc.)",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgVariant("barcode"),
  },

  [OPS.VARIANT_CHARGE_TAX]: {
    key:       OPS.VARIANT_CHARGE_TAX,
    level:     "VARIANT",
    label:     "Charge Tax on This Product",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable:  false,
    pg:        pgVariant("taxable"),
  },

  [OPS.VARIANT_COMPARE_AT_PRICE]: {
    key:       OPS.VARIANT_COMPARE_AT_PRICE,
    level:     "VARIANT",
    label:     "Compare-at Price",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable:  true,
    pg:        pgVariant("compare_at_price"),
  },

  [OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_NAME]: {
    key:       OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_NAME,
    level:     "VARIANT",
    label:     "Connected Inventory Location (Name)",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg: {
      tableAlias: "loc",
      column:     "name",
      joinHints:  JOIN_VARIANT_LOCATION,
    },
  },

  [OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_ID]: {
    key:       OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_ID,
    level:     "VARIANT",
    label:     "Connected Inventory Location (ID)",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable:  true,
    pg: {
      tableAlias: "loc",
      column:     "shopify_location_id",
      joinHints:  JOIN_VARIANT_LOCATION,
    },
  },

  [OPS.VARIANT_COST]: {
    key:       OPS.VARIANT_COST,
    level:     "VARIANT",
    label:     "Cost",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable:  true,
    pg:        pgVariant("cost"),
  },

  [OPS.VARIANT_COUNTRY_OF_ORIGIN]: {
    key:       OPS.VARIANT_COUNTRY_OF_ORIGIN,
    level:     "VARIANT",
    label:     "Country of Origin",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgVariant("country_of_origin"),
  },

  [OPS.VARIANT_FULFILLMENT_SERVICE]: {
    key:        OPS.VARIANT_FULFILLMENT_SERVICE,
    level:      "VARIANT",
    label:      "Fulfillment Service",
    valueType:  "ENUM",
    enumValues: Object.freeze(["manual", "shopify", "third_party"]),
    operators:  ENUM_OPERATORS,
    sortable:   false,
    pg:         pgVariant("fulfillment_service"),
  },

  [OPS.VARIANT_GRAMS]: {
    key:       OPS.VARIANT_GRAMS,
    level:     "VARIANT",
    label:     "Weight (grams, raw)",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable:  true,
    pg:        pgVariant("grams"),
  },

  [OPS.VARIANT_HS_TARIFF_CODE]: {
    key:       OPS.VARIANT_HS_TARIFF_CODE,
    level:     "VARIANT",
    label:     "HS Tariff Code",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgVariant("hs_tariff_code"),
  },

  [OPS.VARIANT_INVENTORY_OUT_OF_STOCK_POLICY]: {
    key:        OPS.VARIANT_INVENTORY_OUT_OF_STOCK_POLICY,
    level:      "VARIANT",
    label:      "Inventory Out of Stock Policy",
    valueType:  "ENUM",
    enumValues: Object.freeze(["deny", "continue"]),
    operators:  ENUM_OPERATORS,
    sortable:   false,
    pg:         pgVariant("inventory_policy"),
  },

  [OPS.VARIANT_OPTION1_VALUE]: {
    key:       OPS.VARIANT_OPTION1_VALUE,
    level:     "VARIANT",
    label:     "Option 1 Value",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgVariant("option1_value"),
  },

  [OPS.VARIANT_OPTION2_VALUE]: {
    key:       OPS.VARIANT_OPTION2_VALUE,
    level:     "VARIANT",
    label:     "Option 2 Value",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgVariant("option2_value"),
  },

  [OPS.VARIANT_OPTION3_VALUE]: {
    key:       OPS.VARIANT_OPTION3_VALUE,
    level:     "VARIANT",
    label:     "Option 3 Value",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgVariant("option3_value"),
  },

  [OPS.VARIANT_PHYSICAL_PRODUCT]: {
    key:       OPS.VARIANT_PHYSICAL_PRODUCT,
    level:     "VARIANT",
    label:     "Physical Product",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable:  false,
    pg:        pgVariant("requires_shipping"),
  },

  [OPS.VARIANT_PRICE]: {
    key:       OPS.VARIANT_PRICE,
    level:     "VARIANT",
    label:     "Price",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable:  true,
    pg:        pgVariant("price"),
  },

  [OPS.VARIANT_PROFIT_MARGIN]: {
    key:        OPS.VARIANT_PROFIT_MARGIN,
    level:      "VARIANT",
    label:      "Profit Margin (%)",
    valueType:  "NUMBER",
    operators:  NUMBER_OPERATORS,
    sortable:   true,
    isComputed: true, // materialized computed column
    pg:         pgVariant("profit_margin_pct"),
  },

  [OPS.VARIANT_SKU]: {
    key:       OPS.VARIANT_SKU,
    level:     "VARIANT",
    label:     "SKU",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgVariant("sku"),
  },

  [OPS.VARIANT_TRACK_QUANTITY]: {
    key:       OPS.VARIANT_TRACK_QUANTITY,
    level:     "VARIANT",
    label:     "Track Quantity",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    sortable:  false,
    pg:        pgVariant("track_quantity"),
  },

  [OPS.VARIANT_INVENTORY_QUANTITY]: {
    key:       OPS.VARIANT_INVENTORY_QUANTITY,
    level:     "VARIANT",
    label:     "Variant Inventory Quantity",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable:  true,
    pg:        pgVariant("inventory_quantity"),
  },

  [OPS.VARIANT_TITLE]: {
    key:       OPS.VARIANT_TITLE,
    level:     "VARIANT",
    label:     "Variant Title",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    sortable:  true,
    pg:        pgVariant("title"),
  },

  [OPS.VARIANT_WEIGHT]: {
    key:       OPS.VARIANT_WEIGHT,
    level:     "VARIANT",
    label:     "Weight",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    sortable:  true,
    pg:        pgVariant("weight"),
  },

  [OPS.VARIANT_WEIGHT_UNIT]: {
    key:        OPS.VARIANT_WEIGHT_UNIT,
    level:      "VARIANT",
    label:      "Weight Unit",
    valueType:  "ENUM",
    enumValues: Object.freeze(["g", "kg", "oz", "lb"]),
    operators:  ENUM_OPERATORS,
    sortable:   false,
    pg:         pgVariant("weight_unit"),
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Derived helpers  –  UI, validation, planner
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_OP_KEYS = Object.freeze(Object.values(OPS));

export const PRODUCT_OP_KEYS = Object.freeze(
  ALL_OP_KEYS.filter((key) => REGISTRY_BY_KEY[key]?.level === "PRODUCT"),
);

export const VARIANT_OP_KEYS = Object.freeze(
  ALL_OP_KEYS.filter((key) => REGISTRY_BY_KEY[key]?.level === "VARIANT"),
);

/** Dev-safe getter: throws if registry drift in non-production. */
export function getFilter(key) {
  const entry = REGISTRY_BY_KEY[key];
  if (!entry && process.env.NODE_ENV !== "production") {
    throw new RangeError(`[filterRegistry] Unknown filter key: "${key}"`);
  }
  return entry;
}

/** All filters that support a given operator – handy for UI builders. */
export function getFiltersByOperator(operator) {
  return ALL_OP_KEYS
    .map((key) => REGISTRY_BY_KEY[key])
    .filter((entry) => entry?.operators.includes(operator));
}

/** Keys that are safe to ORDER BY given your index strategy. */
export const SORTABLE_OP_KEYS = Object.freeze(
  ALL_OP_KEYS.filter((key) => REGISTRY_BY_KEY[key]?.sortable === true),
);

/** Keys that are computed/materialized and should not be bulk-editable. */
export const COMPUTED_OP_KEYS = Object.freeze(
  ALL_OP_KEYS.filter((key) => REGISTRY_BY_KEY[key]?.isComputed === true),
);

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only drift checks
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  const missingInRegistry = ALL_OP_KEYS.filter((key) => !REGISTRY_BY_KEY[key]);
  if (missingInRegistry.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[filterRegistry] OPS keys missing in REGISTRY_BY_KEY:",
      missingInRegistry,
    );
  }

  const enumsWithoutValues = ALL_OP_KEYS.filter((key) => {
    const e = REGISTRY_BY_KEY[key];
    return e?.valueType === "ENUM" && (!e.enumValues || e.enumValues.length === 0);
  });
  if (enumsWithoutValues.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[filterRegistry] ENUM filters missing enumValues:",
      enumsWithoutValues,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default export – backwards-compatible
// ─────────────────────────────────────────────────────────────────────────────
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