// FILE: web/types/bulkEditPayload.ts

export type BulkEditTargetLevel = "PRODUCT" | "VARIANT";

/**
 * Top-level payload stored in bulk_jobs.input_payload (JSONB).
 */
export interface BulkEditPayloadV1 {
  version: 1;
  targetLevel: BulkEditTargetLevel;
  operations: BulkEditOperation[];
}

/**
 * Supported operations for V1.
 * You can add more fields/ops later without breaking old jobs.
 */
export type BulkEditOperation =
  // ── PRODUCT fields ───────────────────────────────────────────
  | {
      target: "PRODUCT";
      field:
        | "PRODUCT_TITLE"
        | "PRODUCT_STATUS"
        | "PRODUCT_VENDOR"
        | "PRODUCT_PRODUCT_TYPE"
        | "PRODUCT_TAGS"
        | "PRODUCT_TEMPLATE_SUFFIX"
        | "PRODUCT_SEO"; // title + description together
      op: "SET";
      value: string | string[] | ProductSeoValue;
    }
  // ── VARIANT price fields ─────────────────────────────────────
  | {
      target: "VARIANT";
      field: "VARIANT_PRICE" | "VARIANT_COMPARE_AT_PRICE";
      op: "SET" | "INCREMENT_PERCENT" | "INCREMENT_ABSOLUTE";
      value: number; // e.g. 10 => +10% or +10 currency units
      roundTo?: number; // decimal places (e.g. 2 for money)
    };

/**
 * For SEO bulk ops, we always send both fields to avoid Shopify’s
 * “update only title/description clears the other” behaviour.
 * (See Shopify docs + community threads.) :contentReference[oaicite:0]{index=0}
 */
export interface ProductSeoValue {
  title: string;
  description: string;
}