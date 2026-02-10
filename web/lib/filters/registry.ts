// web/lib/filters/registry.ts

/* ============================================================
   Core filter types (shared across FE + BE)
   ============================================================ */

export type FilterKind = "string" | "number" | "date" | "enum" | "boolean";

/* ----------------------------
   Operator sets
---------------------------- */

export type StringOp =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "containsAny"
  | "startsWith"
  | "notStartsWith"
  | "endsWith"
  | "containsCi"
  | "equalsCi";

export type NumberOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between";

export type DateOp = "before" | "after" | "on";

export type EnumOp = "is" | "isNot";

export type BooleanOp = "is";

/* ============================================================
   Applied filter (runtime form)
   ============================================================ */

export type AppliedFilter =
  | {
      key: string;
      kind: "string";
      op: StringOp;
      value: string;
    }
  | {
      key: string;
      kind: "number";
      op: NumberOp;
      value: number;
      value2?: number;
    }
  | {
      key: string;
      kind: "date";
      op: DateOp;
      value: string; // yyyy-mm-dd
    }
  | {
      key: string;
      kind: "enum";
      op: EnumOp;
      value: string;
    }
  | {
      key: string;
      kind: "boolean";
      op: BooleanOp;
      value: boolean;
    };

/* ============================================================
   Field registry definition
   ============================================================ */

export type FilterEntity = "product" | "variant" | "order" | "customer";

export type FieldDef = {
  /** Stable internal key used everywhere (planner, UI, SQL compiler) */
  key: string;

  /** Human-readable label (UI only) */
  label: string;

  /** Logical entity this field belongs to */
  entity: FilterEntity;

  /** Type of filter */
  kind: FilterKind;

  /**
   * Whether this field is currently available in the FAST plane.
   * - true  → can be filtered server-side immediately
   * - false → UI-visible but planner must ignore or snapshot
   */
  supportedNow: boolean;

  /**
   * Execution plane: FAST = ProductLite/DB, SNAPSHOT = evaluated via Bulk Ops / variant data.
   * Used by snapshot evaluator and fast compiler.
   */
  plane?: "FAST" | "SNAPSHOT";

  /** For SNAPSHOT: product-level vs variant-level (e.g. variant.sku is "variant"). */
  scope?: "product" | "variant";

  /** For SNAPSHOT: path to read from Shopify Bulk API node (e.g. "variant.sku"). */
  snapshotField?: { shopifyPath: string };

  /** Value type for operators: "string" | "number" | "datetime" | "boolean" etc. */
  valueKind?: string;
};

/* ============================================================
   PRODUCT fields
   ============================================================ */

export const PRODUCT_FIELDS: readonly FieldDef[] = [
  {
    key: "product.id",
    label: "Product ID",
    entity: "product",
    kind: "string",
    supportedNow: true,
  },
  {
    key: "product.title",
    label: "Title",
    entity: "product",
    kind: "string",
    supportedNow: true,
  },
  {
    key: "product.handle",
    label: "Handle (URL)",
    entity: "product",
    kind: "string",
    supportedNow: true,
  },
  {
    key: "product.vendor",
    label: "Vendor",
    entity: "product",
    kind: "string",
    supportedNow: true,
  },
  {
    key: "product.productType",
    label: "Product Type",
    entity: "product",
    kind: "string",
    supportedNow: true,
  },
  {
    key: "product.status",
    label: "Status",
    entity: "product",
    kind: "enum",
    supportedNow: true,
  },
  {
    key: "product.tag",
    label: "Tag",
    entity: "product",
    kind: "string",
    supportedNow: true,
  },
  {
    key: "product.createdAt",
    label: "Date Created",
    entity: "product",
    kind: "date",
    supportedNow: false,
  },
  {
    key: "product.updatedAt",
    label: "Date Updated",
    entity: "product",
    kind: "date",
    supportedNow: true, // maps to updatedAtShopify
  },
  {
    key: "product.inventoryQuantity",
    label: "Inventory Quantity",
    entity: "product",
    kind: "number",
    supportedNow: false, // requires VariantRollup join
  },
];

/* ============================================================
   VARIANT fields (FAST-plane ready later)
   ============================================================ */

export const VARIANT_FIELDS: readonly FieldDef[] = [
  {
    key: "variant.sku",
    label: "SKU",
    entity: "variant",
    kind: "string",
    supportedNow: false,
    plane: "SNAPSHOT",
    scope: "variant",
    snapshotField: { shopifyPath: "variant.sku" },
    valueKind: "string",
  },
  {
    key: "variant.price",
    label: "Price",
    entity: "variant",
    kind: "number",
    supportedNow: false,
    plane: "SNAPSHOT",
    scope: "variant",
    snapshotField: { shopifyPath: "variant.price" },
    valueKind: "number",
  },
  {
    key: "variant.inventoryQuantity",
    label: "Variant Inventory Quantity",
    entity: "variant",
    kind: "number",
    supportedNow: false,
    plane: "SNAPSHOT",
    scope: "variant",
    snapshotField: { shopifyPath: "variant.inventoryQuantity" },
    valueKind: "number",
  },
];

/* ============================================================
   Registry (single source of truth)
   ============================================================ */

export const FILTER_REGISTRY: readonly FieldDef[] = [
  ...PRODUCT_FIELDS,
  ...VARIANT_FIELDS,
];

/* ============================================================
   Lookup helpers (used everywhere)
   ============================================================ */

export function getFieldDef(key: string): FieldDef | undefined {
  return FILTER_REGISTRY.find((f) => f.key === key);
}

/** Alias for snapshot evaluator and fast compiler (lookup by filterId/key). */
export function getFilterDef(key: string): FieldDef | undefined {
  return getFieldDef(key);
}

export function fieldLabel(key: string): string {
  return getFieldDef(key)?.label ?? key;
}

export function fieldKind(key: string): FilterKind {
  return getFieldDef(key)?.kind ?? "string";
}

export function fieldEntity(key: string): FilterEntity | undefined {
  return getFieldDef(key)?.entity;
}

export function fieldSupportedNow(key: string): boolean {
  return getFieldDef(key)?.supportedNow ?? false;
}

/* ============================================================
   Grouping helpers (UI convenience)
   ============================================================ */

export function getFieldsForEntity(entity: FilterEntity): FieldDef[] {
  return FILTER_REGISTRY.filter((f) => f.entity === entity);
}

export function getSupportedFields(): FieldDef[] {
  return FILTER_REGISTRY.filter((f) => f.supportedNow);
}
