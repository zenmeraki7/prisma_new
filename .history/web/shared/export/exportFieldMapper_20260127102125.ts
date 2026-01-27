// web/shared/export/exportFieldMapper.ts
//
// Single source of truth for export field semantics across FAST + BulkOps.
//
// Both engines must normalize their data into ExportProductShape and then call
// buildExportRecordFromShape(fieldKeys, product).

/* ========================================================================== *
 * Types
 * ========================================================================== */

export type ExportVariantShape = {
  id: string;
  price?: string | null;
  compareAtPrice?: string | null;
  sku?: string | null;
  barcode?: string | null;
  weight?: string | number | null;
};

export type ExportProductShape = {
  /** Shopify Product GID */
  id: string;

  title?: string | null;
  status?: string | null;
  vendor?: string | null;
  productType?: string | null;
  tags?: string[] | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  handle?: string | null;
  inventoryQuantity?: number | null;

  /** All variants for this product (used to select primary variant). */
  variants?: ExportVariantShape[] | null;
};

/* ========================================================================== *
 * Variant selection semantics
 * ========================================================================== */

/**
 * Keys that are backed by variant-level data (primary variant projection).
 */
export const VARIANT_FIELD_KEYS = new Set<string>([
  "price",
  "comparePrice",
  "sku",
  "barcode",
  "weight",
]);

/**
 * Parse a price string into a number, treating invalid/missing values as +∞.
 * This guarantees deterministic ordering in pickPrimaryVariant.
 */
function parsePriceOrInfinity(raw: string | null | undefined): number {
  if (raw == null) return Number.POSITIVE_INFINITY;
  const num = Number(raw);
  return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY;
}

/**
 * Pick the "primary variant" for a product:
 *  - Lowest numeric price (invalid / missing prices are treated as +∞).
 *  - Ties broken by lexicographically smallest id.
 */
export function pickPrimaryVariant(
  variants: ExportVariantShape[] | null | undefined,
): ExportVariantShape | null {
  if (!variants || variants.length === 0) return null;

  let primary: ExportVariantShape | null = null;
  let primaryPrice = Number.POSITIVE_INFINITY;

  for (const v of variants) {
    if (!v) continue;

    const priceNum = parsePriceOrInfinity(v.price ?? null);

    if (!primary) {
      primary = v;
      primaryPrice = priceNum;
      continue;
    }

    if (priceNum < primaryPrice) {
      primary = v;
      primaryPrice = priceNum;
    } else if (priceNum === primaryPrice) {
      // Stable tie-breaker on id so output is deterministic.
      if (v.id < primary.id) {
        primary = v;
        primaryPrice = priceNum;
      }
    }
  }

  return primary;
}

/* ========================================================================== *
 * Record mapping: ExportProductShape → fieldKeys → record
 * ========================================================================== */

/**
 * Normalize dates to ISO strings so FAST (Date) and BulkOps (string) behave the same.
 */
function normalizeDateToIso(value?: string | Date | null): string {
  if (!value) return "";
  if (value instanceof Date) {
    return value.toISOString();
  }
  // Assume Shopify ISO string (or at least a string representation)
  return value;
}

/**
 * Normalize "numeric-ish" values (string | number | null) into a clean string,
 * avoiding "NaN" leaking into exports.
 */
function normalizeNumericToString(
  value: string | number | null | undefined,
): string {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  // string case
  const trimmed = value.trim();
  if (trimmed === "") return "";
  const num = Number(trimmed);
  return Number.isFinite(num) ? trimmed : "";
}

/**
 * Map a normalized ExportProductShape into a record keyed by fieldKeys.
 * Semantics are identical across engines.
 */
export function buildExportRecordFromShape(
  product: ExportProductShape,
  fieldKeys: string[],
): Record<string, string> {
  const record: Record<string, string> = {};

  const needsVariant = fieldKeys.some((k) => VARIANT_FIELD_KEYS.has(k));
  const primaryVariant = needsVariant
    ? pickPrimaryVariant(product.variants ?? null)
    : null;

  const tagsJoined = Array.isArray(product.tags)
    ? product.tags.join(", ")
    : "";

  for (const key of fieldKeys) {
    let value = "";

    switch (key) {
      // Product-level fields
      case "title":
        value = product.title ?? "";
        break;
      case "status":
        value = product.status ?? "";
        break;
      case "vendor":
        value = product.vendor ?? "";
        break;
      case "type":
      case "productType":
        value = product.productType ?? "";
        break;
      case "createdAt":
        value = normalizeDateToIso(product.createdAt);
        break;
      case "updatedAt":
        value = normalizeDateToIso(product.updatedAt);
        break;
      case "handle":
        value = product.handle ?? "";
        break;
      case "id":
        value = product.id ?? "";
        break;
      case "inventory":
        value =
          product.inventoryQuantity != null
            ? String(product.inventoryQuantity)
            : "";
        break;
      case "tags":
        value = tagsJoined;
        break;

      // Variant-level fields from primary variant
      case "price":
        value = normalizeNumericToString(primaryVariant?.price ?? null);
        break;
      case "comparePrice":
        value = normalizeNumericToString(
          primaryVariant?.compareAtPrice ?? null,
        );
        break;
      case "sku":
        value = primaryVariant?.sku ?? "";
        break;
      case "barcode":
        value = primaryVariant?.barcode ?? "";
        break;
      case "weight":
        value = normalizeNumericToString(primaryVariant?.weight ?? null);
        break;

      default:
        // Unknown keys stay empty; this keeps v1 robust while you evolve fields.
        value = "";
        break;
    }

    record[key] = value;
  }

  return record;
}
