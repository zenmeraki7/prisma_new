// FILE: web/services/productService/filterRegistry.server.js

/**
 * Filter registry (PG-only) for FAST plane.
 *
 * - One canonical OPS key per logical filter.
 * - REGISTRY_BY_KEY describes:
 *    - level: "PRODUCT" | "VARIANT"
 *    - valueType: "STRING" | "NUMBER" | "BOOLEAN" | "DATE" | "ENUM"
 *    - operators: allowed operators for DSL
 *    - pg: {
 *        tableAlias: "pm" | "v" | "c" | "t" | "loc" | etc.
 *        column:     string               -- column name on that alias
 *        joinHints:  JoinHint[] | null    -- planner uses these to add JOINs
 *      }
 *
 * JoinHint = {
 *   type: "INNER" | "LEFT",
 *   table: string,
 *   alias: string,
 *   on: string,
 * }
 *
 * Base FROM is always: product_mirror pm
 * All queries MUST filter by shop: pm.shop_id = $1
 */

export const OPS = Object.freeze({
  // ───────────────────────────────────────────────────────────
  // Product-level fields
  // ───────────────────────────────────────────────────────────
  PRODUCT_CATEGORY: "PRODUCT_CATEGORY",
  PRODUCT_COLLECTION_TITLE: "PRODUCT_COLLECTION_TITLE",
  PRODUCT_COLLECTION_ID: "PRODUCT_COLLECTION_ID",
  PRODUCT_CREATED_AT: "PRODUCT_CREATED_AT",
  PRODUCT_PUBLISHED_AT: "PRODUCT_PUBLISHED_AT",
  PRODUCT_UPDATED_AT: "PRODUCT_UPDATED_AT",
  PRODUCT_DESCRIPTION: "PRODUCT_DESCRIPTION",
  PRODUCT_HANDLE: "PRODUCT_HANDLE",
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

  // ───────────────────────────────────────────────────────────
  // Variant-level fields
  // ───────────────────────────────────────────────────────────
  VARIANT_BARCODE: "VARIANT_BARCODE",
  VARIANT_CHARGE_TAX: "VARIANT_CHARGE_TAX",
  VARIANT_COMPARE_AT_PRICE: "VARIANT_COMPARE_AT_PRICE",
  VARIANT_CONNECTED_INVENTORY_LOCATION_NAME: "VARIANT_CONNECTED_INVENTORY_LOCATION_NAME",
  VARIANT_CONNECTED_INVENTORY_LOCATION_ID: "VARIANT_CONNECTED_INVENTORY_LOCATION_ID",
  VARIANT_COST: "VARIANT_COST",
  VARIANT_COUNTRY_OF_ORIGIN: "VARIANT_COUNTRY_OF_ORIGIN",
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

/* ──────────────────────────────────────────────────────────────
 * Canonical operator sets
 * (your DSL compiler should enforce these)
 * ─────────────────────────────────────────────────────────── */

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
  "IS", // value is true/false
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

/**
 * Convenience helper to define PG metadata without joins.
 */
function pgSimple(column, tableAlias = "pm") {
  return { tableAlias, column, joinHints: null };
}

/**
 * Join hint helpers – used for multi-table filters
 */

// One join from pm -> variant_mirror v
const JOIN_VARIANT = {
  type: "INNER",
  table: "variant_mirror",
  alias: "v",
  on: "v.product_id = pm.id AND v.shop_id = pm.shop_id",
};

// product_mirror pm -> product_collections pc -> collections c
const JOIN_COLLECTIONS = [
  {
    type: "INNER",
    table: "product_collections",
    alias: "pc",
    on: "pc.product_id = pm.id",
  },
  {
    type: "INNER",
    table: "collections",
    alias: "c",
    on: "c.id = pc.collection_id AND c.shop_id = pm.shop_id",
  },
];

// product_mirror pm -> product_tags pt -> tags t
const JOIN_TAGS = [
  {
    type: "INNER",
    table: "product_tags",
    alias: "pt",
    on: "pt.product_id = pm.id",
  },
  {
    type: "INNER",
    table: "tags",
    alias: "t",
    on: "t.id = pt.tag_id AND t.shop_id = pm.shop_id",
  },
];

// pm -> variant_mirror v -> variant_inventory_levels vil -> locations loc
const JOIN_VARIANT_LOCATION = [
  JOIN_VARIANT,
  {
    type: "INNER",
    table: "variant_inventory_levels",
    alias: "vil",
    on: "vil.variant_id = v.id AND vil.shop_id = pm.shop_id",
  },
  {
    type: "INNER",
    table: "locations",
    alias: "loc",
    on: "loc.id = vil.location_id AND loc.shop_id = pm.shop_id",
  },
];

/* ──────────────────────────────────────────────────────────────
 * REGISTRY_BY_KEY
 *
 * NOTE:
 *  - base FROM: product_mirror pm
 *  - planner:
 *      1. Collects all joinHints from active filters.
 *      2. Dedupes by {table, alias, on}.
 *      3. Builds JOIN clauses in a stable order.
 *      4. Emits predicates of the form `<alias>.<column>` with operators.
 * ─────────────────────────────────────────────────────────── */

export const REGISTRY_BY_KEY = Object.freeze({
  // ───────────────────────────────────────────────────────────
  // PRODUCT-LEVEL FILTERS
  // ───────────────────────────────────────────────────────────

  [OPS.PRODUCT_CATEGORY]: {
    key: OPS.PRODUCT_CATEGORY,
    level: "PRODUCT",
    label: "Category",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: pgSimple("category"),
  },

  [OPS.PRODUCT_COLLECTION_TITLE]: {
    key: OPS.PRODUCT_COLLECTION_TITLE,
    level: "PRODUCT",
    label: "Collection Title",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: {
      tableAlias: "c",
      column: "title",
      joinHints: JOIN_COLLECTIONS,
    },
  },

  [OPS.PRODUCT_COLLECTION_ID]: {
    key: OPS.PRODUCT_COLLECTION_ID,
    level: "PRODUCT",
    label: "Collection ID",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    pg: {
      tableAlias: "c",
      column: "shopify_collection_id",
      joinHints: JOIN_COLLECTIONS,
    },
  },

  [OPS.PRODUCT_CREATED_AT]: {
    key: OPS.PRODUCT_CREATED_AT,
    level: "PRODUCT",
    label: "Date Created",
    valueType: "DATE",
    operators: DATE_OPERATORS,
    pg: pgSimple("created_at"),
  },

  [OPS.PRODUCT_PUBLISHED_AT]: {
    key: OPS.PRODUCT_PUBLISHED_AT,
    level: "PRODUCT",
    label: "Date Published",
    valueType: "DATE",
    operators: DATE_OPERATORS,
    pg: pgSimple("published_at"),
  },

  [OPS.PRODUCT_UPDATED_AT]: {
    key: OPS.PRODUCT_UPDATED_AT,
    level: "PRODUCT",
    label: "Date Updated",
    valueType: "DATE",
    operators: DATE_OPERATORS,
    pg: pgSimple("updated_at"),
  },

  [OPS.PRODUCT_DESCRIPTION]: {
    key: OPS.PRODUCT_DESCRIPTION,
    level: "PRODUCT",
    label: "Description",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: pgSimple("description_html"),
  },

  [OPS.PRODUCT_HANDLE]: {
    key: OPS.PRODUCT_HANDLE,
    level: "PRODUCT",
    label: "Handle",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: pgSimple("handle"),
  },

  [OPS.PRODUCT_TOTAL_INVENTORY]: {
    key: OPS.PRODUCT_TOTAL_INVENTORY,
    level: "PRODUCT",
    label: "Inventory Quantity (Total)",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    pg: pgSimple("total_inventory_qty"),
  },

  [OPS.PRODUCT_OPTION1_NAME]: {
    key: OPS.PRODUCT_OPTION1_NAME,
    level: "PRODUCT",
    label: "Option 1 Name",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: pgSimple("option1_name"),
  },

  [OPS.PRODUCT_OPTION2_NAME]: {
    key: OPS.PRODUCT_OPTION2_NAME,
    level: "PRODUCT",
    label: "Option 2 Name",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: pgSimple("option2_name"),
  },

  [OPS.PRODUCT_OPTION3_NAME]: {
    key: OPS.PRODUCT_OPTION3_NAME,
    level: "PRODUCT",
    label: "Option 3 Name",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: pgSimple("option3_name"),
  },

  [OPS.PRODUCT_ID]: {
    key: OPS.PRODUCT_ID,
    level: "PRODUCT",
    label: "Product ID",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    pg: pgSimple("shopify_product_id"),
  },

  [OPS.PRODUCT_TYPE_CUSTOM]: {
    key: OPS.PRODUCT_TYPE_CUSTOM,
    level: "PRODUCT",
    label: "Product Type (Custom)",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: pgSimple("product_type_custom"),
  },

  [OPS.PRODUCT_SEO_HIDDEN]: {
    key: OPS.PRODUCT_SEO_HIDDEN,
    level: "PRODUCT",
    label: "Search Engine Visibility (Hidden)",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    pg: pgSimple("seo_hidden"),
  },

  [OPS.PRODUCT_STATUS]: {
    key: OPS.PRODUCT_STATUS,
    level: "PRODUCT",
    label: "Status",
    valueType: "ENUM", // active | draft | archived
    operators: ENUM_OPERATORS,
    pg: pgSimple("status"),
  },

  [OPS.PRODUCT_TAG]: {
    key: OPS.PRODUCT_TAG,
    level: "PRODUCT",
    label: "Tag",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: {
      tableAlias: "t",
      column: "name",
      joinHints: JOIN_TAGS,
    },
  },

  [OPS.PRODUCT_THEME_TEMPLATE]: {
    key: OPS.PRODUCT_THEME_TEMPLATE,
    level: "PRODUCT",
    label: "Theme Template",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: pgSimple("theme_template"),
  },

  [OPS.PRODUCT_TITLE]: {
    key: OPS.PRODUCT_TITLE,
    level: "PRODUCT",
    label: "Title",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: pgSimple("title"),
  },

  [OPS.PRODUCT_VARIANT_COUNT]: {
    key: OPS.PRODUCT_VARIANT_COUNT,
    level: "PRODUCT",
    label: "Variant Count",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    pg: pgSimple("variant_count"),
  },

  [OPS.PRODUCT_VENDOR]: {
    key: OPS.PRODUCT_VENDOR,
    level: "PRODUCT",
    label: "Vendor",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: pgSimple("vendor"),
  },

  [OPS.PRODUCT_VISIBLE_ONLINE_STORE]: {
    key: OPS.PRODUCT_VISIBLE_ONLINE_STORE,
    level: "PRODUCT",
    label: "Visible on Online Store",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    pg: pgSimple("visible_online_store"),
  },

  [OPS.PRODUCT_VISIBLE_POS]: {
    key: OPS.PRODUCT_VISIBLE_POS,
    level: "PRODUCT",
    label: "Visible on POS",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    pg: pgSimple("visible_pos"),
  },

  // ───────────────────────────────────────────────────────────
  // VARIANT-LEVEL FILTERS
  // Base join: product_mirror pm → variant_mirror v
  // ───────────────────────────────────────────────────────────

  [OPS.VARIANT_BARCODE]: {
    key: OPS.VARIANT_BARCODE,
    level: "VARIANT",
    label: "Barcode",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "barcode",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_CHARGE_TAX]: {
    key: OPS.VARIANT_CHARGE_TAX,
    level: "VARIANT",
    label: "Charge tax on this product",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "charge_tax",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_COMPARE_AT_PRICE]: {
    key: OPS.VARIANT_COMPARE_AT_PRICE,
    level: "VARIANT",
    label: "Compare-at Price",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "compare_at_price",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_NAME]: {
    key: OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_NAME,
    level: "VARIANT",
    label: "Connected Inventory Location (Name)",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: {
      tableAlias: "loc",
      column: "name",
      joinHints: JOIN_VARIANT_LOCATION,
    },
  },

  [OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_ID]: {
    key: OPS.VARIANT_CONNECTED_INVENTORY_LOCATION_ID,
    level: "VARIANT",
    label: "Connected Inventory Location (ID)",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    pg: {
      tableAlias: "loc",
      column: "shopify_location_id",
      joinHints: JOIN_VARIANT_LOCATION,
    },
  },

  [OPS.VARIANT_COST]: {
    key: OPS.VARIANT_COST,
    level: "VARIANT",
    label: "Cost",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "cost",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_COUNTRY_OF_ORIGIN]: {
    key: OPS.VARIANT_COUNTRY_OF_ORIGIN,
    level: "VARIANT",
    label: "Country of Origin",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "country_of_origin",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_HS_TARIFF_CODE]: {
    key: OPS.VARIANT_HS_TARIFF_CODE,
    level: "VARIANT",
    label: "HS Tariff Code",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "hs_tariff_code",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_INVENTORY_OUT_OF_STOCK_POLICY]: {
    key: OPS.VARIANT_INVENTORY_OUT_OF_STOCK_POLICY,
    level: "VARIANT",
    label: "Inventory Out of Stock Policy",
    valueType: "ENUM", // deny | continue
    operators: ENUM_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "inventory_out_of_stock_policy",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_OPTION1_VALUE]: {
    key: OPS.VARIANT_OPTION1_VALUE,
    level: "VARIANT",
    label: "Option 1 Value",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "option1_value",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_OPTION2_VALUE]: {
    key: OPS.VARIANT_OPTION2_VALUE,
    level: "VARIANT",
    label: "Option 2 Value",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "option2_value",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_OPTION3_VALUE]: {
    key: OPS.VARIANT_OPTION3_VALUE,
    level: "VARIANT",
    label: "Option 3 Value",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "option3_value",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_PHYSICAL_PRODUCT]: {
    key: OPS.VARIANT_PHYSICAL_PRODUCT,
    level: "VARIANT",
    label: "Physical Product",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "physical_product",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_PRICE]: {
    key: OPS.VARIANT_PRICE,
    level: "VARIANT",
    label: "Price",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "price",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_PROFIT_MARGIN]: {
    key: OPS.VARIANT_PROFIT_MARGIN,
    level: "VARIANT",
    label: "Profit Margin (%)",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "profit_margin_pct",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_SKU]: {
    key: OPS.VARIANT_SKU,
    level: "VARIANT",
    label: "SKU",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "sku",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_TRACK_QUANTITY]: {
    key: OPS.VARIANT_TRACK_QUANTITY,
    level: "VARIANT",
    label: "Track Quantity",
    valueType: "BOOLEAN",
    operators: BOOLEAN_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "track_quantity",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_INVENTORY_QUANTITY]: {
    key: OPS.VARIANT_INVENTORY_QUANTITY,
    level: "VARIANT",
    label: "Variant Inventory Quantity",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "inventory_quantity",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_TITLE]: {
    key: OPS.VARIANT_TITLE,
    level: "VARIANT",
    label: "Variant Title",
    valueType: "STRING",
    operators: STRING_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "title",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_WEIGHT]: {
    key: OPS.VARIANT_WEIGHT,
    level: "VARIANT",
    label: "Weight",
    valueType: "NUMBER",
    operators: NUMBER_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "weight",
      joinHints: [JOIN_VARIANT],
    },
  },

  [OPS.VARIANT_WEIGHT_UNIT]: {
    key: OPS.VARIANT_WEIGHT_UNIT,
    level: "VARIANT",
    label: "Weight Unit",
    valueType: "ENUM", // g | kg | oz | lb
    operators: ENUM_OPERATORS,
    pg: {
      tableAlias: "v",
      column: "weight_unit",
      joinHints: [JOIN_VARIANT],
    },
  },
});

// Default export for convenience in older imports
export default {
  OPS,
  REGISTRY_BY_KEY,
};