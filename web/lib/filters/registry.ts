// FILE: web/lib/filters/registry.ts

/**
 * Single source of truth for all product/variant filters.
 *
 * - Backend:
 *   - Planner uses this to map FilterKey → plane/model/field/valueKind/operators.
 *   - Snapshot vs Fast plane is explicit and type-checked.
 * - Frontend:
 *   - A generator script can read this file and emit FILTERS.ts for UI widgets.
 * - GraphQL:
 *   - FilterKey, operators, and value kinds can be derived from these types to avoid drift.
 */

import type {
  ProductLiteField,
  VariantLiteField,
  SnapshotProductField,
  VariantInventoryLocationField,
} from "../../db/schema-types"; // you define this, types-only

export type FilterScope = "product" | "variant";

/**
 * Which plane the filter is natively evaluated on.
 * - FAST: ProductLite / VariantLite / VariantRollup / etc.
 * - SNAPSHOT: SnapshotProduct / SnapshotVariant (bulk-op plane).
 */
export type FilterPlane = "FAST" | "SNAPSHOT";

/**
 * Primitive type of the value this filter operates on.
 * - "text" vs "string":
 *   - "text" typically means free-form description/title, often tied to full-text search.
 */
export type ValueKind =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "enum";

/**
 * Core operator vocabulary.
 */
export type FilterOperator =
  | "EQ"
  | "NEQ"
  | "IN"
  | "NOT_IN"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "STARTS_WITH"
  | "ENDS_WITH"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "BETWEEN"
  | "IS_SET"
  | "IS_NOT_SET";

/**
 * UI hint. This is *only* used by the frontend generator; backend should not rely on this.
 */
export type FilterWidget =
  | "text"
  | "textarea"
  | "number"
  | "boolean-toggle"
  | "date"
  | "select";

/**
 * Optional full-text search wiring.
 * This lets the planner route some filters to tsvector @@ to_tsquery(...)
 * instead of plain ILIKE, especially for large catalogs.
 */
export interface FullTextConfig {
  /**
   * Plane hosting the tsvector column.
   */
  plane: FilterPlane;

  /**
   * Underlying Prisma model name that contains the tsvector column.
   * Example: "SnapshotProduct".
   */
  model: ModelName;

  /**
   * Prisma field name for the tsvector column, e.g. "descriptionSearchVector".
   */
  vectorField: string;

  /**
   * PostgreSQL text search configuration ("english", "simple", etc.).
   */
  config?: string;
}

/**
 * Prisma model names we expose to the registry.
 */
export type ModelName =
  | "ProductLite"
  | "VariantLite"
  | "SnapshotProduct"
  | "VariantInventoryLocation";

/**
 * Map each model to its allowed field names (from schema-types.d.ts).
 */
export interface ModelFieldMap {
  ProductLite: ProductLiteField;
  VariantLite: VariantLiteField;
  SnapshotProduct: SnapshotProductField;
  VariantInventoryLocation: VariantInventoryLocationField;
}

/**
 * For fields that can contain multiple values.
 *
 * - "relation_some" → child relation with `some` / EXISTS
 * - "array_has"     → array @> scalar
 * - "array_has_every" → array @> array
 * - "array_overlap" → array && array
 */
export type MultiValueStrategy =
  | "relation_some"
  | "array_has"
  | "array_has_every"
  | "array_overlap";

/**
 * Where this filter actually reads from in Postgres.
 *
 * This is strongly typed: model/field pairs are checked against ModelFieldMap.
 */
export interface DbBinding<M extends ModelName = ModelName> {
  /**
   * Logical plane (FAST vs SNAPSHOT).
   */
  plane: FilterPlane;

  /**
   * Prisma model name, e.g. "ProductLite", "VariantLite".
   */
  model: M;

  /**
   * Column/field name on that model.
   * Type-safe via ModelFieldMap.
   */
  field: ModelFieldMap[M];

  /**
   * Optional relation path (for planners that want to know join shape),
   * e.g. "variants", "product", etc.
   */
  relationPath?: string;

  /**
   * If true, this field is stored in a multi-valued way (arrays / join tables),
   * so planner should use ANY/EXISTS semantics (e.g. tags, collections).
   */
  multiValue?: boolean;

  /**
   * How multiValue is represented in Postgres/Prisma.
   */
  multiValueStrategy?: MultiValueStrategy;

  /**
   * If true, this field is derived/computed rather than raw from Shopify.
   */
  computed?: boolean;

  /**
   * Canonical SQL expression for computed fields.
   * For views / $queryRaw, not necessarily used at runtime everywhere,
   * but this prevents drift by centralizing the formula.
   */
  sqlExpression?: string;

  /**
   * Optional hint for index name (for EXPLAIN / migrations docs).
   * Not used at runtime, but nice for tooling and audits.
   */
  indexHint?: string;
}

/**
 * Enumerated options for enum-valued filters (status, visibility, etc.).
 */
export interface EnumValue {
  value: string;
  label: string;
}

/**
 * FilterKey is a fully-qualified, stable identifier.
 *
 * IMPORTANT:
 * - This is what your GraphQL & frontend should use.
 * - Never break/change these without a migration for saved filters.
 */
export type FilterKey =
  // Product-scope filters
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
  | "product.variantCount"
  | "product.vendor"
  | "product.visibleOnlineStore"
  | "product.visiblePos"
  | "product.seoTitle"
  | "product.seoDescription"
  // Variant-scope filters
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

  /**
   * Where/how to read from Postgres, with type-safe model/field pairing.
   */
  db: DbBinding<M>;

  /**
   * Optional enum values; if present you can auto-render a <Select>.
   */
  enumValues?: EnumValue[];

  /**
   * Optional full-text search wiring.
   */
  fullText?: FullTextConfig;

  /**
   * UI hints for generator script (not used by backend).
   */
  ui?: {
    widget: FilterWidget;
    /**
     * If true, UI should show a multi-select control (for "IN"/"NOT_IN").
     */
    multiSelect?: boolean;
    /**
     * Optional placeholder string.
     */
    placeholder?: string;
  };
}

/**
 * Helper so each registry entry is type-checked:
 * - `model` must be a valid ModelName
 * - `field` must be valid for that model
 */
export function defineFilter<M extends ModelName>(
  def: FilterDefinition<M>,
): FilterDefinition<M> {
  return def;
}

/**
 * Reusable operator sets by value kind.
 */
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

export const TEXT_OPERATORS: FilterOperator[] = [
  "CONTAINS",
  "NOT_CONTAINS",
  "IS_SET",
  "IS_NOT_SET",
];

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

/**
 * MASTER REGISTRY
 *
 * IMPORTANT:
 * - This object is the **only** place you should add/rename filters.
 * - Backend planner, GraphQL types, and frontend config generator should all
 *   derive from here.
 */
export const FILTER_REGISTRY: Record<FilterKey, FilterDefinition> = {
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
    },
    ui: {
      widget: "text",
      placeholder: "e.g. Apparel & Accessories",
    },
  }),

  "product.collection": defineFilter({
    key: "product.collection",
    label: "Collection",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "collections", // string[] column
      multiValue: true,
      multiValueStrategy: "array_overlap", // GIN index: tags && ARRAY[...]
      indexHint: "idx_product_lite_collections_gin",
    },
    ui: {
      widget: "text",
      placeholder: "Collection name",
    },
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
    },
    ui: {
      widget: "date",
    },
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
    },
    ui: {
      widget: "date",
    },
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
    },
    ui: {
      widget: "date",
    },
  }),

  // Normal product description: SNAPSHOT + full-text
  "product.description": defineFilter({
    key: "product.description",
    label: "Description",
    scope: "product",
    valueKind: "text",
    operators: TEXT_OPERATORS,
    db: {
      plane: "SNAPSHOT",
      model: "SnapshotProduct",
      field: "description",
    },
    fullText: {
      plane: "SNAPSHOT",
      model: "SnapshotProduct",
      vectorField: "descriptionSearchVector",
      config: "english",
    },
    ui: {
      widget: "textarea",
      placeholder: "Text in description",
    },
  }),

  "product.handle": defineFilter({
    key: "product.handle",
    label: "Handle (URL)",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "handle",
    },
    ui: {
      widget: "text",
      placeholder: "e.g. my-product-handle",
    },
  }),

  "product.inventoryQuantity": defineFilter({
    key: "product.inventoryQuantity",
    label: "Inventory Quantity",
    scope: "product",
    valueKind: "number",
    operators: NUMBER_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "totalInventory",
      computed: false, // stored denormalized column
      indexHint: "idx_product_lite_total_inventory",
    },
    ui: {
      widget: "number",
    },
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
    ui: {
      widget: "text",
      placeholder: "e.g. Size",
    },
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
    ui: {
      widget: "text",
      placeholder: "e.g. Color",
    },
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
    ui: {
      widget: "text",
    },
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
    ui: {
      widget: "text",
      placeholder: "Shopify product ID",
    },
  }),

  "product.productType": defineFilter({
    key: "product.productType",
    label: "Product Type (Custom)",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "productType",
    },
    ui: {
      widget: "text",
      placeholder: "e.g. T-Shirt",
    },
  }),

  // SNAPSHOT SEO visibility
  "product.searchEngineVisibility": defineFilter({
    key: "product.searchEngineVisibility",
    label: "Search Engine Visibility (SEO)",
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
    },
    ui: {
      widget: "select",
    },
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
    },
    ui: {
      widget: "select",
    },
  }),

  "product.tag": defineFilter({
    key: "product.tag",
    label: "Tag",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "tags", // string[] column
      multiValue: true,
      multiValueStrategy: "array_overlap",
      indexHint: "idx_product_lite_tags_gin", // GIN (tags)
    },
    ui: {
      widget: "text",
      placeholder: "Tag value",
    },
  }),

  "product.template": defineFilter({
    key: "product.template",
    label: "Theme Template",
    scope: "product",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "templateSuffix",
    },
    ui: {
      widget: "text",
      placeholder: "e.g. featured",
    },
  }),

  "product.title": defineFilter({
    key: "product.title",
    label: "Title",
    scope: "product",
    valueKind: "text",
    operators: TEXT_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "title",
    },
    fullText: {
      plane: "FAST",
      model: "ProductLite",
      vectorField: "titleSearchVector",
      config: "english",
    },
    ui: {
      widget: "text",
      placeholder: "Text in title",
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
      model: "ProductLite",
      field: "variantCount",
      computed: false, // stored denormalized column
      indexHint: "idx_product_lite_variant_count",
    },
    ui: {
      widget: "number",
    },
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
    },
    ui: {
      widget: "text",
      placeholder: "Vendor name",
    },
  }),

  "product.visibleOnlineStore": defineFilter({
    key: "product.visibleOnlineStore",
    label: "Visible on Online Store (web)",
    scope: "product",
    valueKind: "boolean",
    operators: BOOLEAN_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "onlineStoreVisible",
    },
    ui: {
      widget: "boolean-toggle",
    },
  }),

  "product.visiblePos": defineFilter({
    key: "product.visiblePos",
    label: "Visible on Point of Sale (POS)",
    scope: "product",
    valueKind: "boolean",
    operators: BOOLEAN_OPERATORS,
    db: {
      plane: "FAST",
      model: "ProductLite",
      field: "posVisible",
    },
    ui: {
      widget: "boolean-toggle",
    },
  }),

  // SNAPSHOT SEO title (full-text)
  "product.seoTitle": defineFilter({
    key: "product.seoTitle",
    label: "SEO Title",
    scope: "product",
    valueKind: "text",
    operators: TEXT_OPERATORS,
    db: {
      plane: "SNAPSHOT",
      model: "SnapshotProduct",
      field: "seoTitle",
    },
    fullText: {
      plane: "SNAPSHOT",
      model: "SnapshotProduct",
      vectorField: "seoTitleSearchVector",
      config: "english",
    },
    ui: {
      widget: "text",
      placeholder: "Text in SEO title",
    },
  }),

  // SNAPSHOT SEO description (full-text)
  "product.seoDescription": defineFilter({
    key: "product.seoDescription",
    label: "SEO Description",
    scope: "product",
    valueKind: "text",
    operators: TEXT_OPERATORS,
    db: {
      plane: "SNAPSHOT",
      model: "SnapshotProduct",
      field: "seoDescription",
    },
    fullText: {
      plane: "SNAPSHOT",
      model: "SnapshotProduct",
      vectorField: "seoDescriptionSearchVector",
      config: "english",
    },
    ui: {
      widget: "textarea",
      placeholder: "Text in SEO description",
    },
  }),

  //
  // VARIANT FIELDS
  //
  "variant.barcode": defineFilter({
    key: "variant.barcode",
    label: "Barcode (ISBN, UPC, GTIN, etc.)",
    scope: "variant",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "barcode",
      relationPath: "variants",
    },
    ui: {
      widget: "text",
    },
  }),

  "variant.chargeTax": defineFilter({
    key: "variant.chargeTax",
    label: "Charge tax on this product",
    scope: "variant",
    valueKind: "boolean",
    operators: BOOLEAN_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "taxable",
      relationPath: "variants",
    },
    ui: {
      widget: "boolean-toggle",
    },
  }),

  "variant.compareAtPrice": defineFilter({
    key: "variant.compareAtPrice",
    label: "Compare-at Price",
    scope: "variant",
    valueKind: "number",
    operators: NUMBER_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "compareAtPrice",
      relationPath: "variants",
    },
    ui: {
      widget: "number",
    },
  }),

  "variant.inventoryLocation": defineFilter({
    key: "variant.inventoryLocation",
    label: "Connected Inventory Location",
    scope: "variant",
    valueKind: "string",
    operators: STRING_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantInventoryLocation",
      field: "locationName",
      relationPath: "inventoryLocations",
      multiValue: true,
      multiValueStrategy: "relation_some",
    },
    ui: {
      widget: "text",
      placeholder: "Location name",
    },
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
    ui: {
      widget: "number",
    },
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
    ui: {
      widget: "text",
      placeholder: "ISO country name/code",
    },
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
    ui: {
      widget: "text",
    },
  }),

  "variant.inventoryPolicy": defineFilter({
    key: "variant.inventoryPolicy",
    label: "Inventory Out of Stock Policy",
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
    ui: {
      widget: "select",
    },
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
      field: "option1",
      relationPath: "variants",
    },
    ui: {
      widget: "text",
    },
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
      field: "option2",
      relationPath: "variants",
    },
    ui: {
      widget: "text",
    },
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
      field: "option3",
      relationPath: "variants",
    },
    ui: {
      widget: "text",
    },
  }),

  "variant.physicalProduct": defineFilter({
    key: "variant.physicalProduct",
    label: "Physical Product",
    scope: "variant",
    valueKind: "boolean",
    operators: BOOLEAN_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "requiresShipping",
      relationPath: "variants",
    },
    ui: {
      widget: "boolean-toggle",
    },
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
    ui: {
      widget: "number",
    },
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
      sqlExpression:
        "(CASE WHEN price IS NULL OR price = 0 THEN NULL ELSE (price - cost) / price * 100 END)",
    },
    ui: {
      widget: "number",
    },
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
      indexHint: "idx_variant_lite_sku_trgm", // suggest trigram/GIN for CONTAINS
    },
    ui: {
      widget: "text",
      placeholder: "SKU contains…",
    },
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
    ui: {
      widget: "boolean-toggle",
    },
  }),

  "variant.inventoryQuantity": defineFilter({
    key: "variant.inventoryQuantity",
    label: "Variant Inventory Quantity",
    scope: "variant",
    valueKind: "number",
    operators: NUMBER_OPERATORS,
    db: {
      plane: "FAST",
      model: "VariantLite",
      field: "inventoryQuantity",
      relationPath: "variants",
    },
    ui: {
      widget: "number",
    },
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
    ui: {
      widget: "text",
    },
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
      field: "weight",
      relationPath: "variants",
    },
    ui: {
      widget: "number",
    },
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
    ui: {
      widget: "select",
    },
  }),
};

/**
 * Convenience helpers for planner / generator.
 */
export const ALL_FILTER_KEYS = Object.keys(
  FILTER_REGISTRY,
) as FilterKey[];

export const FAST_FILTER_KEYS = ALL_FILTER_KEYS.filter(
  (key) => FILTER_REGISTRY[key].db.plane === "FAST",
);

export const SNAPSHOT_FILTER_KEYS = ALL_FILTER_KEYS.filter(
  (key) => FILTER_REGISTRY[key].db.plane === "SNAPSHOT",
);
