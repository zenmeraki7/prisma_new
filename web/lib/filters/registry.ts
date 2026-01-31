// FILE: web/lib/filters/registry.ts

import type { FilterId, FilterLeafOp } from "./dsl";

/* ============================
   TYPES
   ============================ */

export type FilterPlane = "FAST" | "SNAPSHOT";

export type FilterScope = "product" | "variant";

export type FilterValueKind =
  | "string"
  | "stringList"
  | "number"
  | "int"
  | "boolean"
  | "datetime"
  | "id"
  | "metafield"
  | "fulltext";

/**
 * Where a FAST-plane filter lives in the DB.
 */
export type FastFieldModel =
  | "ProductLite"
  | "ProductTag"
  | "ProductCollection"
  | "VariantRollup";

export type FastFieldDescriptor = {
  model: FastFieldModel;
  /**
   * Column name (for ProductLite / VariantRollup)
   * or logical field (for join tables like ProductTag/ProductCollection).
   */
  field: string;
};

/**
 * Where a SNAPSHOT-plane filter pulls its value from in the Shopify
 * BulkOperation payload.
 */
export type SnapshotFieldDescriptor = {
  /**
   * Logical path for snapshot evaluator; you’ll map this to actual
   * JSON fields when streaming BulkOps payloads.
   *
   * Examples:
   *  - "product.title"
   *  - "product.tags"
   *  - "variant.sku"
   *  - "product.metafields"
   */
  shopifyPath: string;
};

export type FilterDefinition = {
  id: FilterId;
  label: string;
  plane: FilterPlane;
  scope: FilterScope;
  operators: FilterLeafOp[];
  valueKind: FilterValueKind;
  fastField?: FastFieldDescriptor;
  snapshotField?: SnapshotFieldDescriptor;
};

export type FilterRegistry = Record<FilterId, FilterDefinition>;

/* ============================
   REGISTRY
   ============================ */

export const FILTER_REGISTRY: FilterRegistry = {
  /* ===== PRODUCT CORE IDENTITY (mostly FAST) ===== */

  "product.id": {
    id: "product.id",
    label: "Product ID",
    plane: "FAST",
    scope: "product",
    operators: ["eq", "in"],
    valueKind: "id",
    // IMPORTANT: in your Prisma schema, the Shopify id is `productId`,
    // and `id` is the BigInt PK. We filter on productId here.
    fastField: { model: "ProductLite", field: "productId" },
  },

  "product.title": {
    id: "product.title",
    label: "Product title",
    plane: "FAST",
    scope: "product",
    operators: ["contains", "not_contains", "starts_with", "eq", "neq"],
    valueKind: "string",
    fastField: { model: "ProductLite", field: "title" },
  },

  "product.handle": {
    id: "product.handle",
    label: "Handle",
    plane: "FAST",
    scope: "product",
    operators: ["contains", "starts_with", "eq", "neq"],
    valueKind: "string",
    fastField: { model: "ProductLite", field: "handle" },
  },

  "product.status": {
    id: "product.status",
    label: "Status",
    plane: "FAST",
    scope: "product",
    operators: ["eq", "neq", "in", "not_in"],
    valueKind: "string", // "ACTIVE" | "DRAFT" | "ARCHIVED"
    fastField: { model: "ProductLite", field: "status" },
  },

  "product.vendor": {
    id: "product.vendor",
    label: "Vendor",
    plane: "FAST",
    scope: "product",
    operators: ["contains", "not_contains", "eq", "neq", "in", "not_in"],
    valueKind: "string",
    fastField: { model: "ProductLite", field: "vendor" },
  },

  "product.productType": {
    id: "product.productType",
    label: "Product type",
    plane: "FAST",
    scope: "product",
    operators: ["contains", "not_contains", "eq", "neq", "in", "not_in"],
    valueKind: "string",
    fastField: { model: "ProductLite", field: "productType" },
  },

  /* ===== PRODUCT ASSOCIATIONS (FAST via join tables) ===== */

  "product.tags": {
    id: "product.tags",
    label: "Tags",
    plane: "FAST",
    scope: "product",
    operators: ["contains", "not_contains", "in", "not_in"],
    valueKind: "stringList",
    // Logical model is ProductTag join; fastCompiler will translate to
    // the ProductLite.tagsJoin relation.
    fastField: { model: "ProductTag", field: "tag" },
  },

  "product.collections": {
    id: "product.collections",
    label: "Collections",
    plane: "FAST",
    scope: "product",
    operators: ["in", "not_in"],
    valueKind: "id", // collection GIDs or legacy IDs as strings
    fastField: { model: "ProductCollection", field: "collectionId" },
  },

  /* ===== PRODUCT FLAGS / BOOLEANS ===== */

  "product.hasImages": {
    id: "product.hasImages",
    label: "Has images",
    plane: "FAST",
    scope: "product",
    operators: ["eq"],
    valueKind: "boolean",
    fastField: { model: "ProductLite", field: "hasImages" },
  },

  "product.giftCard": {
    id: "product.giftCard",
    label: "Is gift card",
    plane: "SNAPSHOT",
    scope: "product",
    operators: ["eq"],
    valueKind: "boolean",
    snapshotField: { shopifyPath: "product.isGiftCard" },
  },

  "product.requiresShipping": {
    id: "product.requiresShipping",
    label: "Requires shipping (any variant)",
    plane: "SNAPSHOT",
    scope: "product",
    operators: ["eq"],
    valueKind: "boolean",
    snapshotField: { shopifyPath: "product.variants.requiresShipping" },
  },

  /* ===== PRODUCT TIMESTAMPS ===== */

  "product.createdAt": {
    id: "product.createdAt",
    label: "Created at",
    plane: "SNAPSHOT", // you *could* flip this to FAST via createdAtShopify later
    scope: "product",
    operators: ["gt", "gte", "lt", "lte", "between"],
    valueKind: "datetime",
    snapshotField: { shopifyPath: "product.createdAt" },
  },

  "product.updatedAt": {
    id: "product.updatedAt",
    label: "Updated at",
    plane: "FAST", // mapped to ProductLite.updatedAtShopify
    scope: "product",
    operators: ["gt", "gte", "lt", "lte", "between"],
    valueKind: "datetime",
    fastField: { model: "ProductLite", field: "updatedAtShopify" },
  },

  "product.publishedAt": {
    id: "product.publishedAt",
    label: "Published at",
    plane: "SNAPSHOT", // you have publishedAtShopify; can flip to FAST if you want
    scope: "product",
    operators: ["gt", "gte", "lt", "lte", "between", "is_set", "is_not_set"],
    valueKind: "datetime",
    snapshotField: { shopifyPath: "product.publishedAt" },
  },

  /* ===== PRODUCT MISC ===== */

  "product.onlineStoreUrl": {
    id: "product.onlineStoreUrl",
    label: "Online store URL",
    plane: "SNAPSHOT",
    scope: "product",
    operators: ["contains", "not_contains", "is_set", "is_not_set"],
    valueKind: "string",
    snapshotField: { shopifyPath: "product.onlineStoreUrl" },
  },

  "product.templateSuffix": {
    id: "product.templateSuffix",
    label: "Template suffix",
    plane: "SNAPSHOT",
    scope: "product",
    operators: ["eq", "neq", "in", "not_in", "is_set", "is_not_set"],
    valueKind: "string",
    snapshotField: { shopifyPath: "product.templateSuffix" },
  },

  /* ===== PRODUCT AGGREGATIONS (FAST via VariantRollup) ===== */

  "product.totalInventory": {
    id: "product.totalInventory",
    label: "Total inventory (all variants)",
    plane: "FAST",
    scope: "product",
    operators: ["gt", "gte", "lt", "lte", "between", "eq"],
    valueKind: "int",
    fastField: { model: "VariantRollup", field: "totalInventory" },
  },

  "product.variantCount": {
    id: "product.variantCount",
    label: "Variant count",
    plane: "SNAPSHOT", // easiest to compute in snapshot evaluator initially
    scope: "product",
    operators: ["gt", "gte", "lt", "lte", "between", "eq"],
    valueKind: "int",
    snapshotField: { shopifyPath: "product.variants.length" },
  },

  /* ===== VARIANT-SCOPE: IDENTITY & PRICING ===== */

  "variant.sku": {
    id: "variant.sku",
    label: "Variant SKU",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["contains", "not_contains", "starts_with", "eq", "neq", "in"],
    valueKind: "string",
    snapshotField: { shopifyPath: "variant.sku" },
  },

  "variant.title": {
    id: "variant.title",
    label: "Variant title",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["contains", "not_contains", "starts_with", "eq", "neq"],
    valueKind: "string",
    snapshotField: { shopifyPath: "variant.title" },
  },

  "variant.price": {
    id: "variant.price",
    label: "Variant price",
    plane: "SNAPSHOT", // can later roll up into FAST if needed
    scope: "variant",
    operators: ["gt", "gte", "lt", "lte", "between", "eq"],
    valueKind: "number",
    snapshotField: { shopifyPath: "variant.price" },
  },

  "variant.compareAtPrice": {
    id: "variant.compareAtPrice",
    label: "Compare-at price",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["gt", "gte", "lt", "lte", "between", "eq", "is_set", "is_not_set"],
    valueKind: "number",
    snapshotField: { shopifyPath: "variant.compareAtPrice" },
  },

  /* ===== VARIANT-SCOPE: INVENTORY & FLAGS ===== */

  "variant.inventoryQuantity": {
    id: "variant.inventoryQuantity",
    label: "Variant inventory quantity",
    plane: "SNAPSHOT", // product.totalInventory is FAST
    scope: "variant",
    operators: ["gt", "gte", "lt", "lte", "between", "eq"],
    valueKind: "int",
    snapshotField: { shopifyPath: "variant.inventoryQuantity" },
  },

  "variant.inventoryPolicy": {
    id: "variant.inventoryPolicy",
    label: "Inventory policy",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["eq", "neq", "in", "not_in"],
    valueKind: "string", // e.g. DENY / CONTINUE
    snapshotField: { shopifyPath: "variant.inventoryPolicy" },
  },

  "variant.requiresShipping": {
    id: "variant.requiresShipping",
    label: "Variant requires shipping",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["eq"],
    valueKind: "boolean",
    snapshotField: { shopifyPath: "variant.requiresShipping" },
  },

  "variant.taxable": {
    id: "variant.taxable",
    label: "Variant taxable",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["eq"],
    valueKind: "boolean",
    snapshotField: { shopifyPath: "variant.taxable" },
  },

  "variant.weight": {
    id: "variant.weight",
    label: "Variant weight",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["gt", "gte", "lt", "lte", "between", "eq"],
    valueKind: "number",
    snapshotField: { shopifyPath: "variant.weight" },
  },

  "variant.barcode": {
    id: "variant.barcode",
    label: "Variant barcode",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["contains", "not_contains", "eq", "neq", "in"],
    valueKind: "string",
    snapshotField: { shopifyPath: "variant.barcode" },
  },

  /* ===== VARIANT-SCOPE: OPTIONS ===== */

  "variant.option1": {
    id: "variant.option1",
    label: "Option 1",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["contains", "not_contains", "eq", "neq", "in"],
    valueKind: "string",
    snapshotField: { shopifyPath: "variant.selectedOptions[0].value" },
  },

  "variant.option2": {
    id: "variant.option2",
    label: "Option 2",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["contains", "not_contains", "eq", "neq", "in"],
    valueKind: "string",
    snapshotField: { shopifyPath: "variant.selectedOptions[1].value" },
  },

  "variant.option3": {
    id: "variant.option3",
    label: "Option 3",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["contains", "not_contains", "eq", "neq", "in"],
    valueKind: "string",
    snapshotField: { shopifyPath: "variant.selectedOptions[2].value" },
  },

  /* ===== METAFIELDS & SEARCH ===== */

  "product.metafield": {
    id: "product.metafield",
    label: "Product metafield (namespace/key)",
    plane: "SNAPSHOT",
    scope: "product",
    operators: ["eq", "contains", "not_contains", "is_set", "is_not_set"],
    valueKind: "metafield",
    snapshotField: { shopifyPath: "product.metafields" },
  },

  "variant.metafield": {
    id: "variant.metafield",
    label: "Variant metafield (namespace/key)",
    plane: "SNAPSHOT",
    scope: "variant",
    operators: ["eq", "contains", "not_contains", "is_set", "is_not_set"],
    valueKind: "metafield",
    snapshotField: { shopifyPath: "variant.metafields" },
  },

  "product.search": {
    id: "product.search",
    label: "Search (title, body, SKU, etc.)",
    plane: "SNAPSHOT",
    scope: "product",
    operators: ["contains"],
    valueKind: "fulltext",
    snapshotField: { shopifyPath: "product" }, // snapshot evaluator will implement fulltext search over product payload
  },

  "product.searchAutocomplete": {
    id: "product.searchAutocomplete",
    label: "Search autocomplete (client-only)",
    plane: "SNAPSHOT",
    scope: "product",
    operators: ["contains"],
    valueKind: "fulltext",
    snapshotField: { shopifyPath: "product" },
  },

  "product.hasAnyMetafield": {
    id: "product.hasAnyMetafield",
    label: "Has any metafield",
    plane: "SNAPSHOT",
    scope: "product",
    operators: ["eq"],
    valueKind: "boolean",
    snapshotField: { shopifyPath: "product.metafields" },
  },

  "product.hasAnyImage": {
    id: "product.hasAnyImage",
    label: "Has any image",
    plane: "FAST", // alias of product.hasImages
    scope: "product",
    operators: ["eq"],
    valueKind: "boolean",
    fastField: { model: "ProductLite", field: "hasImages" },
  },

  "product.hasAnyVariant": {
    id: "product.hasAnyVariant",
    label: "Has any variant",
    plane: "SNAPSHOT",
    scope: "product",
    operators: ["eq"],
    valueKind: "boolean",
    snapshotField: { shopifyPath: "product.variants" },
  },
};

/* ============================
   ACCESSOR
   ============================ */

export function getFilterDef(filterId: FilterId): FilterDefinition {
  const def = FILTER_REGISTRY[filterId];
  if (!def) {
    throw new Error(`Unknown filterId: ${filterId}`);
  }
  return def;
}
