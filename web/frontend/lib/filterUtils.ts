// FILE: web/frontend/lib/filterUtils.ts
//
// Runtime type guards, assertion helpers, and money/display utilities
// for working with ProductRow, VariantRow, and the filter DSL.
//
// None of these touch the network — pure data utilities.

import type {
  FilterOperator,
  FilterGroupInput,
  FilterConditionInput,
  ProductRow,
  VariantRow,
  ProductStatus,
  WeightUnit,
  VariantAvailability,
  PageInfo,
  FilterDefinition,
} from "../../types/filter.types";

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

/** True if the value looks like a ProductRow (has shopifyProductId and no variantId) */
export function isProductRow(row: ProductRow | VariantRow): row is ProductRow {
  return "shopifyProductId" in row && !("variantId" in row);
}

/** True if the value looks like a VariantRow (has variantId) */
export function isVariantRow(row: ProductRow | VariantRow): row is VariantRow {
  return "variantId" in row;
}

/** Type guard for ProductStatus */
export function isProductStatus(value: unknown): value is ProductStatus {
  return value === "active" || value === "draft" || value === "archived";
}

/** Type guard for WeightUnit */
export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === "g" || value === "kg" || value === "oz" || value === "lb";
}

/** Type guard for VariantAvailability */
export function isVariantAvailability(value: unknown): value is VariantAvailability {
  return value === "in_stock" || value === "out_of_stock" || value === "on_backorder";
}

/** Type guard for FilterGroupInput */
export function isFilterGroupInput(value: unknown): value is FilterGroupInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v["operator"] === "AND" || v["operator"] === "OR";
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if a FilterGroupInput has at least one real condition.
 * Use this to skip the query when the filter builder is empty.
 */
export function isFilterEmpty(filter: FilterGroupInput | null | undefined): boolean {
  if (!filter) return true;
  const conditions = filter.conditions ?? [];
  const groups     = filter.groups     ?? [];
  if (conditions.length > 0) return false;
  return groups.every((g) => isFilterEmpty(g));
}

/**
 * Count total conditions in a filter group tree.
 */
export function countFilterConditions(filter: FilterGroupInput | null | undefined): number {
  if (!filter) return 0;
  const own = (filter.conditions ?? []).length;
  const nested = (filter.groups ?? []).reduce(
    (sum, g) => sum + countFilterConditions(g),
    0,
  );
  return own + nested;
}

/**
 * Flatten all leaf conditions from a filter tree into a flat array.
 * Useful for displaying a summary of active filters.
 */
export function flattenFilterConditions(
  filter: FilterGroupInput | null | undefined,
): ReadonlyArray<FilterConditionInput> {
  if (!filter) return [];
  const own    = filter.conditions ?? [];
  const nested = (filter.groups ?? []).flatMap(flattenFilterConditions);
  return [...own, ...nested];
}

/**
 * Human-readable labels for filter operators.
 */
export const OPERATOR_LABELS: Readonly<Record<FilterOperator, string>> = {
  EQ:            "is",
  NEQ:           "is not",
  GT:            "greater than",
  GTE:           "greater than or equal to",
  LT:            "less than",
  LTE:           "less than or equal to",
  BETWEEN:       "is between",
  IN:            "is one of",
  NOT_IN:        "is not one of",
  CONTAINS:      "contains",
  NOT_CONTAINS:  "does not contain",
  STARTS_WITH:   "starts with",
  ENDS_WITH:     "ends with",
  IS_EMPTY:      "is empty",
  IS_NOT_EMPTY:  "is not empty",
  IS:            "is",
  ON:            "on",
  BEFORE:        "before",
  AFTER:         "after",
};

/**
 * Returns a human-readable summary of a single filter condition.
 * Useful for displaying active filter chips in the UI.
 *
 * @example
 * describeCondition({ key: "PRODUCT_STATUS", operator: "EQ", value: "active" }, registry)
 * // → "Status is active"
 */
export function describeCondition(
  condition: FilterConditionInput,
  registry:  ReadonlyArray<FilterDefinition>,
): string {
  const def      = registry.find((d) => d.key === condition.key);
  const label    = def?.label ?? condition.key;
  const opLabel  = OPERATOR_LABELS[condition.operator as FilterOperator] ?? condition.operator;

  if (condition.operator === "IS_EMPTY")     return `${label} is empty`;
  if (condition.operator === "IS_NOT_EMPTY") return `${label} is not empty`;

  if (condition.value == null) return `${label} ${opLabel}`;

  if (Array.isArray(condition.value)) {
    if (condition.operator === "BETWEEN") {
      return `${label} ${opLabel} ${condition.value[0]} and ${condition.value[1]}`;
    }
    return `${label} ${opLabel} [${(condition.value as unknown[]).join(", ")}]`;
  }

  return `${label} ${opLabel} ${String(condition.value)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Money utilities  —  price fields are string to avoid float precision loss
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a Shopify money string to a number.
 * Returns null if the input is null/undefined/empty.
 */
export function parseMoney(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Format a money string for display using Intl.NumberFormat.
 *
 * @param value     Raw money string from ProductRow/VariantRow
 * @param currency  ISO 4217 currency code (default: "USD")
 * @param locale    BCP 47 locale tag (default: "en-US")
 */
export function formatMoney(
  value:    string | null | undefined,
  currency: string = "USD",
  locale:   string = "en-US",
): string {
  const n = parseMoney(value);
  if (n == null) return "—";
  return new Intl.NumberFormat(locale, {
    style:    "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

/**
 * Calculate the effective discount percentage between price and compare-at price.
 * Returns null if either value is missing or compare-at <= price.
 */
export function calcDiscountPct(
  price:          string | null | undefined,
  compareAtPrice: string | null | undefined,
): number | null {
  const p  = parseMoney(price);
  const cp = parseMoney(compareAtPrice);
  if (p == null || cp == null || cp <= p || cp <= 0) return null;
  return Math.round(((cp - p) / cp) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an array of page numbers for a pagination widget.
 * Always includes first, last, and a window around the current page.
 *
 * @example
 * getPaginationRange(5, 20, 2)
 * // → [1, 2, null, 4, 5, 6, null, 19, 20]  (null = ellipsis)
 */
export function getPaginationRange(
  current:    number,
  total:      number,
  windowSize: number = 2,
): Array<number | null> {
  if (total <= 1) return [1];

  const range = new Set<number>();
  range.add(1);
  range.add(total);

  for (let i = Math.max(1, current - windowSize); i <= Math.min(total, current + windowSize); i++) {
    range.add(i);
  }

  const sorted = Array.from(range).sort((a, b) => a - b);
  const result: Array<number | null> = [];

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) {
      result.push(null); // ellipsis
    }
    result.push(sorted[i]!);
  }

  return result;
}

/**
 * Returns true if a PageInfo indicates there are more pages after the current one.
 */
export function canGoNext(pageInfo: PageInfo | null): boolean {
  return pageInfo?.hasNextPage ?? false;
}

/**
 * Returns true if a PageInfo indicates there are pages before the current one.
 */
export function canGoPrev(pageInfo: PageInfo | null): boolean {
  return pageInfo?.hasPrevPage ?? false;
}

// ─────────────────────────────────────────────────────────────────────────────
// ProductRow / VariantRow display helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the Shopify admin URL for a product.
 * @param row        ProductRow or VariantRow
 * @param shopDomain e.g. "my-store.myshopify.com"
 */
export function productAdminUrl(
  row:        ProductRow | VariantRow,
  shopDomain: string,
): string {
  // Both ProductRow and VariantRow expose shopifyProductId (GID)
  const productGid = row.shopifyProductId;
  const numericId  = productGid.replace(/^gid:\/\/shopify\/Product\//, "");
  return `https://${shopDomain}/admin/products/${numericId}`;
}

/**
 * Return the Shopify admin URL for a variant.
 */
export function variantAdminUrl(
  row:        VariantRow,
  shopDomain: string,
): string {
  const productId = row.shopifyProductId.replace(/^gid:\/\/shopify\/Product\//, "");
  const variantId = row.shopifyVariantId.replace(/^gid:\/\/shopify\/ProductVariant\//, "");
  return `https://${shopDomain}/admin/products/${productId}/variants/${variantId}`;
}

/**
 * Returns variant option values as a formatted string.
 * e.g. "M / Red / Cotton"
 */
export function formatVariantOptions(row: VariantRow): string {
  return [row.option1Value, row.option2Value, row.option3Value]
    .filter(Boolean)
    .join(" / ");
}

/**
 * Returns a display-friendly inventory status label.
 */
export function inventoryStatusLabel(row: VariantRow): string {
  if (!row.trackQuantity) return "Not tracked";
  if (row.inventoryQuantity > 0) return `${row.inventoryQuantity} in stock`;
  if (row.inventoryPolicy === "continue") return "Out of stock (backorder on)";
  return "Out of stock";
}