// FILE: web/lib/filters/registry.ts

import type {
  ProductLiteField,
  VariantLiteField,
  VariantRollupField,
  ProductContentField,
  ProductCollectionField,
  VariantInventoryLocationField,
  SnapshotProductField,
} from "../../db/schema-types";

// ---------------------------------------------------------
// Core types
// ---------------------------------------------------------

export type FilterScope = "product" | "variant";
export type FilterPlane = "FAST" | "SNAPSHOT";

export type ValueKind =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "enum";

export type FilterOperator =
  | "EQ" | "NEQ" | "IN" | "NOT_IN"
  | "CONTAINS" | "NOT_CONTAINS" | "STARTS_WITH" | "ENDS_WITH"
  | "GT" | "GTE" | "LT" | "LTE" | "BETWEEN"
  | "IS_SET" | "IS_NOT_SET";

export type Operator = FilterOperator;

export type FilterWidget =
  | "text"
  | "textarea"
  | "number"
  | "boolean-toggle"
  | "date"
  | "select";

export interface FullTextConfig {
  vectorField: string;
  config?: string;
}

/**
 * Split FAST-plane models for optimization
 */
export type ModelName =
  | "ProductLite"
  | "VariantLite"
  | "VariantRollup"
  | "ProductContent"
  | "ProductCollection"
  | "SnapshotProduct"
  | "VariantInventoryLocation";

export interface ModelFieldMap {
  ProductLite: ProductLiteField;
  VariantLite: VariantLiteField;
  VariantRollup: VariantRollupField;
  ProductContent: ProductContentField;
  ProductCollection: ProductCollectionField;
  SnapshotProduct: SnapshotProductField;
  VariantInventoryLocation: VariantInventoryLocationField;
}

export type MultiValueStrategy =
  | "relation_some"
  | "array_has"
  | "array_has_every"
  | "array_overlap";

export interface DbBinding<M extends ModelName = ModelName> {
  plane: FilterPlane;
  model: M;
  field: ModelFieldMap[M];

  relationPath?: string;
  multiValue?: boolean;
  multiValueStrategy?: MultiValueStrategy;
  computed?: boolean;
  indexHint?: string;
  requiresSnapshotRunId?: boolean;
}

export interface EnumValue {
  value: string;
  label: string;
}

// ---------------------------------------------------------
// Filter keys
// ---------------------------------------------------------

export type FilterKey =
  // Product
  | "product.category"
  | "product.collection"
  | "product.createdAt"
  | "product.publishedAt"
  | "product.updatedAt"
  | "product.description"
  | "product.handle"
  | "product.inventoryQuantity"
  | "product.option1Name"
  | "product.option2Name"
  | "product.option3Name"
  | "product.id"
  | "product.productType"
  | "product.searchEngineVisibility"
  | "product.status"
  | "product.tag"
  | "product.template"
  | "product.title"
  | "product.search"          // <-- NEW: generic search key
  | "product.variantCount"
  | "product.vendor"
  | "product.visibleOnlineStore"
  | "product.visiblePos"
  | "product.seoTitle"
  | "product.seoDescription"
  // Variant
  | "variant.barcode"
  | "variant.chargeTax"
  | "variant.compareAtPrice"
  | "variant.inventoryLocation"
  | "variant.cost"
  | "variant.countryOfOrigin"
  | "variant.hsTariffCode"
  | "variant.inventoryPolicy"
  | "variant.option1Value"
  | "variant.option2Value"
  | "variant.option3Value"
  | "variant.physicalProduct"
  | "variant.price"
  | "variant.profitMargin"
  | "variant.sku"
  | "variant.trackQuantity"
  | "variant.inventoryQuantity"
  | "variant.title"
  | "variant.weight"
  | "variant.weightUnit";

export interface FilterDefinition<M extends ModelName = ModelName> {
  key: FilterKey;
  label: string;
  scope: FilterScope;
  valueKind: ValueKind;
  operators: FilterOperator[];
  db: DbBinding<M>;
  enumValues?: EnumValue[];
  fullText?: FullTextConfig;
  ui?: {
    widget: FilterWidget;
    multiSelect?: boolean;
    placeholder?: string;
  };
}

export function defineFilter<M extends ModelName>(
  def: FilterDefinition<M>,
): FilterDefinition<M> {
  return def;
}

// ---------------------------------------------------------
// Operator sets (canonical)
// ---------------------------------------------------------

export const STRING_OPERATORS: FilterOperator[] = [
  "EQ",
  "NEQ",
  "IN",
  "NOT_IN",
  "CONTAINS",
  "NOT_CONTAINS",
  "STARTS_WITH",
  "ENDS_WITH",
  "IS_SET",
  "IS_NOT_SET",
];

export const TEXT_LIKE_OPERATORS: FilterOperator[] = [
  "CONTAINS",
  "NOT_CONTAINS",
  "IS_SET",
  "IS_NOT_SET",
];

export const TEXT_FTS_OPERATORS: FilterOperator[] = ["CONTAINS"];

export const NUMBER_OPERATORS: FilterOperator[] = [
  "EQ",
  "NEQ",
  "GT",
  "GTE",
  "LT",
  "LTE",
  "BETWEEN",
  "IN",
  "NOT_IN",
  "IS_SET",
  "IS_NOT_SET",
];

export const BOOLEAN_OPERATORS: FilterOperator[] = [
  "EQ",
  "NEQ",
  "IS_SET",
  "IS_NOT_SET",
];

export const DATE_OPERATORS: FilterOperator[] = [
  "EQ",
  "NEQ",
  "GT",
  "GTE",
  "LT",
  "LTE",
  "BETWEEN",
  "IS_SET",
  "IS_NOT_SET",
];

export const ENUM_OPERATORS: FilterOperator[] = [
  "EQ",
  "NEQ",
  "IN",
  "NOT_IN",
];

export const MULTIVALUE_STRING_OPERATORS: FilterOperator[] = [
  "EQ",
  "NEQ",
  "IN",
  "NOT_IN",
  "IS_SET",
  "IS_NOT_SET",
];

// ---------------------------------------------------------
// MASTER REGISTRY
// ---------------------------------------------------------

export const FILTER_REGISTRY: { [K in FilterKey]: FilterDefinition } = {
  //
  // PRODUCT FIELDS
  //
  "product.category": defineFilter({
    key: "product.category",
    label: "Category",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "category",
      indexHint: "idx_product_lite_category_trgm",
    },
    ui: { widget: "text" },
  }),

  "product.collection": defineFilter({
    key: "product.collection",
    label: "Collection",
    scope: "product",
    valueKind: "string",
    operators: MULTIVALUE_STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductCollection",
      field: "collectionTitle",
      relationPath: "collections",
      multiValue: true,
      multiValueStrategy: "relation_some",
      indexHint: "idx_product_collection_title",
    },
    ui: { widget: "text" },
  }),

  "product.createdAt": defineFilter({
    key: "product.createdAt",
    label: "Date Created",
    scope: "product",
    valueKind: "date",
    operators: DATE_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "createdAtShopify",
      indexHint: "idx_product_lite_shop_created_at",
    },
    ui: { widget: "date" },
  }),

  "product.publishedAt": defineFilter({
    key: "product.publishedAt",
    label: "Date Published",
    scope: "product",
    valueKind: "date",
    operators: DATE_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "publishedAtShopify",
      indexHint: "idx_product_lite_shop_published_at",
    },
    ui: { widget: "date" },
  }),

  "product.updatedAt": defineFilter({
    key: "product.updatedAt",
    label: "Date Updated",
    scope: "product",
    valueKind: "date",
    operators: DATE_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "updatedAtShopify",
      indexHint: "idx_product_lite_shop_updated_at",
    },
    ui: { widget: "date" },
  }),

  "product.description": defineFilter({
    key: "product.description",
    label: "Description",
    scope: "product",
    valueKind: "text",
    operators: TEXT_FTS_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductContent",
      field: "description",
      relationPath: "content",
      indexHint: "idx_product_content_desc_fts",
    },
    fullText: {
      vectorField: "descriptionSearchVector",
      config: "english",
    },
    ui: { widget: "textarea" },
  }),

  "product.handle": defineFilter({
    key: "product.handle",
    label: "Handle",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "handle",
      indexHint: "idx_product_lite_handle_trgm",
    },
    ui: { widget: "text" },
  }),

  "product.inventoryQuantity": defineFilter({
    key: "product.inventoryQuantity",
    label: "Total Inventory",
    scope: "product",
    valueKind: "number",
    operators: NUMBER_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantRollup",
      field: "totalInventory",
      relationPath: "rollup",
      indexHint: "idx_variant_rollup_total_inventory",
    },
    ui: { widget: "number" },
  }),

  "product.option1Name": defineFilter({
    key: "product.option1Name",
    label: "Option 1 Name",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "option1Name",
    },
    ui: { widget: "text" },
  }),

  "product.option2Name": defineFilter({
    key: "product.option2Name",
    label: "Option 2 Name",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "option2Name",
    },
    ui: { widget: "text" },
  }),

  "product.option3Name": defineFilter({
    key: "product.option3Name",
    label: "Option 3 Name",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "option3Name",
    },
    ui: { widget: "text" },
  }),

  "product.id": defineFilter({
    key: "product.id",
    label: "Product ID",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "productId",
    },
    ui: { widget: "text" },
  }),

  "product.productType": defineFilter({
    key: "product.productType",
    label: "Product Type",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "productType",
      indexHint: "idx_product_lite_product_type",
    },
    ui: { widget: "text" },
  }),

  "product.searchEngineVisibility": defineFilter({
    key: "product.searchEngineVisibility",
    label: "SEO Visibility",
    scope: "product",
    valueKind: "enum",
    operators: ENUM_OPERATORS,
    enumValues: [
      { value: "visible", label: "Visible" },
      { value: "hidden", label: "Hidden" },
    ],
    db: {
      plane: "SNAPSHOT",
      model: "SnapshotProduct",
      field: "searchEngineVisibility",
      requiresSnapshotRunId: true,
      indexHint: "idx_snapshot_product_visibility",
    },
    ui: { widget: "select" },
  }),

  "product.status": defineFilter({
    key: "product.status",
    label: "Status",
    scope: "product",
    valueKind: "enum",
    operators: ENUM_OPERATORS,
    enumValues: [
      { value: "active", label: "Active" },
      { value: "draft", label: "Draft" },
      { value: "archived", label: "Archived" },
    ],
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "status",
      indexHint: "idx_product_lite_status",
    },
    ui: { widget: "select" },
  }),

  "product.tag": defineFilter({
    key: "product.tag",
    label: "Tag",
    scope: "product",
    valueKind: "string",
    operators: MULTIVALUE_STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "tags",
      multiValue: true,
      multiValueStrategy: "array_overlap",
      indexHint: "idx_product_lite_tags_gin",
    },
    ui: { widget: "text" },
  }),

  "product.template": defineFilter({
    key: "product.template",
    label: "Template",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "templateSuffix",
    },
    ui: { widget: "text" },
  }),

  "product.title": defineFilter({
    key: "product.title",
    label: "Title",
    scope: "product",
    valueKind: "text",
    operators: TEXT_FTS_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "title",
      indexHint: "idx_product_lite_title_fts",
    },
    fullText: {
      vectorField: "titleSearchVector",
      config: "english",
    },
    ui: { widget: "text" },
  }),

  // NEW: Generic "Search" filter (initially aliases title FTS).
  // Later you can point this at a richer combined FTS column.
  "product.search": defineFilter({
    key: "product.search",
    label: "Search",
    scope: "product",
    valueKind: "text",
    operators: TEXT_FTS_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "title", // alias: same column as product.title for now
      indexHint: "idx_product_lite_title_fts",
    },
    fullText: {
      vectorField: "titleSearchVector",
      config: "english",
    },
    ui: {
      widget: "text",
      placeholder: "Search products…",
    },
  }),

  "product.variantCount": defineFilter({
    key: "product.variantCount",
    label: "Variant Count",
    scope: "product",
    valueKind: "number",
    operators: NUMBER_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantRollup",
      field: "variantCount",
      relationPath: "rollup",
      indexHint: "idx_variant_rollup_variant_count",
    },
    ui: { widget: "number" },
  }),

  "product.vendor": defineFilter({
    key: "product.vendor",
    label: "Vendor",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "vendor",
      indexHint: "idx_product_lite_vendor_trgm",
    },
    ui: { widget: "text" },
  }),

  "product.visibleOnlineStore": defineFilter({
    key: "product.visibleOnlineStore",
    label: "Online Store Visible",
    scope: "product",
    valueKind: "boolean",
    operators: BOOLEAN_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "visibleOnlineStore",
      indexHint: "idx_product_lite_visible_online",
    },
    ui: { widget: "boolean-toggle" },
  }),

  "product.visiblePos": defineFilter({
    key: "product.visiblePos",
    label: "POS Visible",
    scope: "product",
    valueKind: "boolean",
    operators: BOOLEAN_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "visiblePos",
      indexHint: "idx_product_lite_visible_pos",
    },
    ui: { widget: "boolean-toggle" },
  }),

  "product.seoTitle": defineFilter({
    key: "product.seoTitle",
    label: "SEO Title",
    scope: "product",
    valueKind: "text",
    operators: TEXT_FTS_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductContent",
      field: "seoTitle",
      relationPath: "content",
      indexHint: "idx_product_content_seo_title_fts",
    },
    fullText: {
      vectorField: "seoTitleSearchVector",
      config: "english",
    },
    ui: { widget: "text" },
  }),

  "product.seoDescription": defineFilter({
    key: "product.seoDescription",
    label: "SEO Description",
    scope: "product",
    valueKind: "text",
    operators: TEXT_FTS_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductContent",
      field: "seoDescription",
      relationPath: "content",
      indexHint: "idx_product_content_seo_desc_fts",
    },
    fullText: {
      vectorField: "seoDescriptionSearchVector",
      config: "english",
    },
    ui: { widget: "textarea" },
  }),

  //
  // VARIANT FIELDS
  //
  "variant.barcode": defineFilter({
    key: "variant.barcode",
    label: "Barcode",
    scope: "variant",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "barcode",
      relationPath: "variants",
      indexHint: "idx_variant_lite_barcode_trgm",
    },
    ui: { widget: "text" },
  }),

  "variant.chargeTax": defineFilter({
    key: "variant.chargeTax",
    label: "Charge Tax",
    scope: "variant",
    valueKind: "boolean",
    operators: BOOLEAN_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "taxable",
      relationPath: "variants",
    },
    ui: { widget: "boolean-toggle" },
  }),

  "variant.compareAtPrice": defineFilter({
    key: "variant.compareAtPrice",
    label: "Compare At Price",
    scope: "variant",
    valueKind: "number",
    operators: NUMBER_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "compareAtPrice",
      relationPath: "variants",
    },
    ui: { widget: "number" },
  }),

  "variant.inventoryLocation": defineFilter({
    key: "variant.inventoryLocation",
    label: "Inventory Location",
    scope: "variant",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantInventoryLocation",
      field: "locationName",
      relationPath: "inventoryByLoc",
      multiValue: true,
      multiValueStrategy: "relation_some",
      indexHint: "idx_variant_inventory_location_name",
    },
    ui: { widget: "text" },
  }),

  "variant.cost": defineFilter({
    key: "variant.cost",
    label: "Cost",
    scope: "variant",
    valueKind: "number",
    operators: NUMBER_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "cost",
      relationPath: "variants",
    },
    ui: { widget: "number" },
  }),

  "variant.countryOfOrigin": defineFilter({
    key: "variant.countryOfOrigin",
    label: "Country of Origin",
    scope: "variant",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "countryOfOrigin",
      relationPath: "variants",
    },
    ui: { widget: "text" },
  }),

  "variant.hsTariffCode": defineFilter({
    key: "variant.hsTariffCode",
    label: "HS Tariff Code",
    scope: "variant",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "hsTariffCode",
      relationPath: "variants",
    },
    ui: { widget: "text" },
  }),

  "variant.inventoryPolicy": defineFilter({
    key: "variant.inventoryPolicy",
    label: "Inventory Policy",
    scope: "variant",
    valueKind: "enum",
    operators: ENUM_OPERATORS,
    enumValues: [
      { value: "deny", label: "Deny" },
      { value: "continue", label: "Continue" },
    ],
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "inventoryPolicy",
      relationPath: "variants",
    },
    ui: { widget: "select" },
  }),

  "variant.option1Value": defineFilter({
    key: "variant.option1Value",
    label: "Option 1 Value",
    scope: "variant",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "option1Value",
      relationPath: "variants",
    },
    ui: { widget: "text" },
  }),

  "variant.option2Value": defineFilter({
    key: "variant.option2Value",
    label: "Option 2 Value",
    scope: "variant",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "option2Value",
      relationPath: "variants",
    },
    ui: { widget: "text" },
  }),

  "variant.option3Value": defineFilter({
    key: "variant.option3Value",
    label: "Option 3 Value",
    scope: "variant",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "option3Value",
      relationPath: "variants",
    },
    ui: { widget: "text" },
  }),

  "variant.physicalProduct": defineFilter({
    key: "variant.physicalProduct",
    label: "Requires Shipping",
    scope: "variant",
    valueKind: "boolean",
    operators: BOOLEAN_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "requiresShipping",
      relationPath: "variants",
      indexHint: "idx_variant_lite_requires_shipping",
    },
    ui: { widget: "boolean-toggle" },
  }),

  "variant.price": defineFilter({
    key: "variant.price",
    label: "Price",
    scope: "variant",
    valueKind: "number",
    operators: NUMBER_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "price",
      relationPath: "variants",
    },
    ui: { widget: "number" },
  }),

  "variant.profitMargin": defineFilter({
    key: "variant.profitMargin",
    label: "Profit Margin",
    scope: "variant",
    valueKind: "number",
    operators: NUMBER_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "profitMargin",
      relationPath: "variants",
      computed: true,
      indexHint: "idx_variant_lite_profit_margin",
    },
    ui: { widget: "number" },
  }),

  "variant.sku": defineFilter({
    key: "variant.sku",
    label: "SKU",
    scope: "variant",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "sku",
      relationPath: "variants",
      indexHint: "idx_variant_lite_sku_trgm",
    },
    ui: { widget: "text" },
  }),

  "variant.trackQuantity": defineFilter({
    key: "variant.trackQuantity",
    label: "Track Quantity",
    scope: "variant",
    valueKind: "boolean",
    operators: BOOLEAN_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "trackQuantity",
      relationPath: "variants",
    },
    ui: { widget: "boolean-toggle" },
  }),

  "variant.inventoryQuantity": defineFilter({
    key: "variant.inventoryQuantity",
    label: "Inventory Quantity",
    scope: "variant",
    valueKind: "number",
    operators: NUMBER_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "inventoryQty",
      relationPath: "variants",
      indexHint: "idx_variant_lite_inventory_qty",
    },
    ui: { widget: "number" },
  }),

  "variant.title": defineFilter({
    key: "variant.title",
    label: "Variant Title",
    scope: "variant",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "title",
      relationPath: "variants",
    },
    ui: { widget: "text" },
  }),

  "variant.weight": defineFilter({
    key: "variant.weight",
    label: "Weight",
    scope: "variant",
    valueKind: "number",
    operators: NUMBER_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "weightGrams",
      relationPath: "variants",
      indexHint: "idx_variant_lite_weight_grams",
    },
    ui: { widget: "number" },
  }),

  "variant.weightUnit": defineFilter({
    key: "variant.weightUnit",
    label: "Weight Unit",
    scope: "variant",
    valueKind: "enum",
    operators: ENUM_OPERATORS,
    enumValues: [
      { value: "g", label: "Grams" },
      { value: "kg", label: "Kilograms" },
      { value: "oz", label: "Ounces" },
      { value: "lb", label: "Pounds" },
    ],
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "weightUnit",
      relationPath: "variants",
    },
    ui: { widget: "select" },
  }),
};

// ---------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------

export const ALL_FILTER_KEYS = Object.keys(
  FILTER_REGISTRY,
) as FilterKey[];

export const FAST_FILTER_KEYS = ALL_FILTER_KEYS.filter(
  (key) => FILTER_REGISTRY[key].db.plane === "FAST",
);

export const SNAPSHOT_FILTER_KEYS = ALL_FILTER_KEYS.filter(
  (key) => FILTER_REGISTRY[key].db.plane === "SNAPSHOT",
);

// ---------------------------------------------------------
// Runtime invariants (fail-fast if registry is misconfigured)
// ---------------------------------------------------------

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[FILTER_REGISTRY] ${message}`);
  }
}

function validateRegistry() {
  for (const key of ALL_FILTER_KEYS) {
    const def = FILTER_REGISTRY[key];

    // 1) Scope vs key prefix
    if (def.scope === "product") {
      assert(
        key.startsWith("product."),
        `Filter "${key}" has scope "product" but key does not start with "product."`,
      );
    } else if (def.scope === "variant") {
      assert(
        key.startsWith("variant."),
        `Filter "${key}" has scope "variant" but key does not start with "variant."`,
      );
    }

    // 2) FTS filters: only TEXT_FTS_OPERATORS
    if (def.fullText) {
      for (const op of def.operators) {
        assert(
          TEXT_FTS_OPERATORS.includes(op),
          `Filter "${key}" is FTS-backed but uses unsupported operator "${op}".`,
        );
      }
    }

    // 3) multiValue fields must define a strategy
    if (def.db.multiValue) {
      assert(
        !!def.db.multiValueStrategy,
        `Filter "${key}" has multiValue=true but no multiValueStrategy.`,
      );
    }

    // 4) relation_some must have relationPath
    if (def.db.multiValueStrategy === "relation_some") {
      assert(
        !!def.db.relationPath,
        `Filter "${key}" uses multiValueStrategy="relation_some" but has no relationPath.`,
      );
    }

    // 5) SNAPSHOT-plane filters must require snapshotRunId
    if (def.db.plane === "SNAPSHOT") {
      assert(
        def.db.requiresSnapshotRunId === true,
        `Snapshot filter "${key}" must set db.requiresSnapshotRunId=true to avoid cross-run scans.`,
      );
    }
  }
}

validateRegistry();
