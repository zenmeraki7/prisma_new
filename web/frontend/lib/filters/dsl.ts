// FILE: web/frontend/lib/filters/dsl.ts

import type {
  FilterKey,
  FilterOperator,
} from "../../../lib/filters/registry";

/* ================= OPS MAPPING =================
 *
 * UI FilterKey (product.* / variant.*)  ->  OPS key string
 * These OPS keys must match the keys used in:
 *   web/services/productService/filterRegistry.server.js
 * (REGISTRY_BY_KEY / OPS enum there)
 */

// NOTE: we intentionally use Record<string, string> here
// instead of Record<FilterKey, string> because FilterKey’s
// union may not be fully in sync yet (TS would complain).
const KEY_TO_OPS: Record<string, string> = {
  // ── product-level ────────────────────────────────
  "product.category":               "PRODUCT_CATEGORY",
  "product.collectionTitle":        "PRODUCT_COLLECTION_TITLE",
  "product.collectionId":           "PRODUCT_COLLECTION_ID",
  "product.createdAt":              "PRODUCT_CREATED_AT",
  "product.publishedAt":            "PRODUCT_PUBLISHED_AT",
  "product.updatedAt":              "PRODUCT_UPDATED_AT",
  "product.description":            "PRODUCT_DESCRIPTION",
  "product.handle":                 "PRODUCT_HANDLE",
  "product.imageCount":             "PRODUCT_IMAGE_COUNT",
  "product.totalInventory":         "PRODUCT_TOTAL_INVENTORY",
  "product.option1Name":            "PRODUCT_OPTION1_NAME",
  "product.option2Name":            "PRODUCT_OPTION2_NAME",
  "product.option3Name":            "PRODUCT_OPTION3_NAME",
  "product.id":                     "PRODUCT_ID",
  "product.productType":            "PRODUCT_TYPE_CUSTOM",
  "product.seoHidden":              "PRODUCT_SEO_HIDDEN",
  "product.status":                 "PRODUCT_STATUS",
  "product.tag":                    "PRODUCT_TAG",
  "product.themeTemplate":          "PRODUCT_THEME_TEMPLATE",
  "product.title":                  "PRODUCT_TITLE",
  "product.variantCount":           "PRODUCT_VARIANT_COUNT",
  "product.vendor":                 "PRODUCT_VENDOR",
  "product.visibleOnlineStore":     "PRODUCT_VISIBLE_ONLINE_STORE",
  "product.visiblePos":             "PRODUCT_VISIBLE_POS",

  // special virtual key – expanded server-side to title/vendor/handle/type/tag
  "product.search":                 "product.search",

  // ── variant-level ────────────────────────────────
  "variant.availability":                   "VARIANT_AVAILABILITY",
  "variant.barcode":                        "VARIANT_BARCODE",
  "variant.chargeTax":                      "VARIANT_CHARGE_TAX",
  "variant.compareAtPrice":                 "VARIANT_COMPARE_AT_PRICE",
  "variant.connectedInventoryLocationName": "VARIANT_CONNECTED_INVENTORY_LOCATION_NAME",
  "variant.connectedInventoryLocationId":   "VARIANT_CONNECTED_INVENTORY_LOCATION_ID",
  "variant.cost":                           "VARIANT_COST",
  "variant.countryOfOrigin":                "VARIANT_COUNTRY_OF_ORIGIN",
  "variant.fulfillmentService":             "VARIANT_FULFILLMENT_SERVICE",
  "variant.grams":                          "VARIANT_GRAMS",
  "variant.hsTariffCode":                   "VARIANT_HS_TARIFF_CODE",
  "variant.inventoryOutOfStockPolicy":      "VARIANT_INVENTORY_OUT_OF_STOCK_POLICY",
  "variant.option1Value":                   "VARIANT_OPTION1_VALUE",
  "variant.option2Value":                   "VARIANT_OPTION2_VALUE",
  "variant.option3Value":                   "VARIANT_OPTION3_VALUE",
  "variant.physicalProduct":                "VARIANT_PHYSICAL_PRODUCT",
  "variant.price":                          "VARIANT_PRICE",
  "variant.profitMargin":                   "VARIANT_PROFIT_MARGIN",
  "variant.sku":                            "VARIANT_SKU",
  "variant.trackQuantity":                  "VARIANT_TRACK_QUANTITY",
  "variant.inventoryQuantity":              "VARIANT_INVENTORY_QUANTITY",
  "variant.title":                          "VARIANT_TITLE",
  "variant.weight":                         "VARIANT_WEIGHT",
  "variant.weightUnit":                     "VARIANT_WEIGHT_UNIT",
};

/* ================= TYPES ================= */

export type GroupOp = "AND" | "OR" | "NOT";
export type Operator = FilterOperator;

/**
 * NOTE: key is now the **internal** key (OPS string), not FilterKey.
 * We still accept FilterKey at the API boundary and translate in `field()`.
 */
export interface FilterFieldExpr {
  kind: "field";
  key: string;          // OPS key like "PRODUCT_CATEGORY"
  op: Operator;
  value?: unknown;
}

export type FilterGroupExpr =
  | {
      kind: "group";
      op: Extract<GroupOp, "AND" | "OR">;
      children: FilterExpr[];
    }
  | {
      kind: "group";
      op: Extract<GroupOp, "NOT">;
      children: [FilterExpr];
    };

export type FilterExpr = FilterFieldExpr | FilterGroupExpr;

/* ================= SMART CONSTRUCTORS ================= */

/**
 * Translate a UI FilterKey to the internal OPS key.
 * Falls back to the original key if no mapping is found
 * (useful for virtual keys or future extensions).
 */
function toOpsKey(key: FilterKey | "product.search"): string {
  return KEY_TO_OPS[key as string] ?? (key as string);
}

/**
 * Build a single field node
 *  - accepts UI FilterKey
 *  - stores OPS key for the backend
 */
export function field(
  key: FilterKey,
  op: Operator,
  value?: unknown,
): FilterFieldExpr {
  const internalKey = toOpsKey(key);
  return { kind: "field", key: internalKey, op, value };
}

/**
 * Alias for field() so UI can use `leaf()`
 */
export const leaf = field;

/**
 * Build an AND group (auto-optimizes null/undefined and single child)
 */
export function andGroup(
  children: (FilterExpr | null | undefined)[],
): FilterExpr | null {
  const valid = children.filter(
    (c): c is FilterExpr => c !== null && c !== undefined,
  );
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  return { kind: "group", op: "AND", children: valid };
}

/**
 * Build an OR group
 */
export function orGroup(
  children: (FilterExpr | null | undefined)[],
): FilterExpr | null {
  const valid = children.filter(
    (c): c is FilterExpr => c !== null && c !== undefined,
  );
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  return { kind: "group", op: "OR", children: valid };
}

/**
 * Build a NOT group
 */
export function notGroup(
  child: FilterExpr | null | undefined,
): FilterExpr | null {
  if (!child) return null;
  return { kind: "group", op: "NOT", children: [child] };
}