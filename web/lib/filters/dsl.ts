// web/frontend/lib/filters/dsl.ts

export type FilterGroupOp = "and" | "or" | "not";

export type FilterLeafOp =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "is_set"
  | "is_not_set";

/**
 * This must match the backend FILTER_IDS exactly.
 * For now we only *use* a FAST subset in UI, but keep the full union type.
 */
export type FilterId =
  | "product.id"
  | "product.title"
  | "product.handle"
  | "product.status"
  | "product.vendor"
  | "product.productType"
  | "product.tags"
  | "product.collections"
  | "product.hasImages"
  | "product.giftCard"
  | "product.requiresShipping"
  | "product.createdAt"
  | "product.updatedAt"
  | "product.publishedAt"
  | "product.onlineStoreUrl"
  | "product.templateSuffix"
  | "product.totalInventory"
  | "product.variantCount"
  | "variant.sku"
  | "variant.title"
  | "variant.price"
  | "variant.compareAtPrice"
  | "variant.inventoryQuantity"
  | "variant.inventoryPolicy"
  | "variant.requiresShipping"
  | "variant.taxable"
  | "variant.weight"
  | "variant.barcode"
  | "variant.option1"
  | "variant.option2"
  | "variant.option3"
  | "product.metafield"
  | "variant.metafield"
  | "product.search"
  | "product.searchAutocomplete"
  | "product.hasAnyMetafield"
  | "product.hasAnyImage"
  | "product.hasAnyVariant";

export type FilterLeafExpr = {
  type: "leaf";
  filterId: FilterId;
  op: FilterLeafOp;
  value?: unknown;
};

export type FilterGroupExpr =
  | {
      type: "group";
      op: "and" | "or";
      children: FilterExpr[];
    }
  | {
      type: "group";
      op: "not";
      children: [FilterExpr];
    };

export type FilterExpr = FilterLeafExpr | FilterGroupExpr;

/** Helpers for building trees in UI */
export function andGroup(children: FilterExpr[]): FilterExpr | null {
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { type: "group", op: "and", children };
}

export function leaf(
  filterId: FilterId,
  op: FilterLeafOp,
  value?: unknown
): FilterLeafExpr {
  return { type: "leaf", filterId, op, value };
}
