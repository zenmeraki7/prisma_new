// FILE: web/frontend/lib/filters/buildFilterExpr.ts

import type { FilterExpr, FilterLeafOp } from "../filters/dsl";

/**
 * UI filter shape (what Polaris / UI produces and what we convert to backend FilterExpr).
 */
export type UiFilter = {
  filterId: string; // must match backend FilterId strings like "product.status"
  op: FilterLeafOp;
  value?: unknown;
};

/**
 * Convert UI filters → FilterExpr AST (backend-readable)
 */
export function buildFilterExpr(uiFilters: UiFilter[]): FilterExpr | null {
  if (!uiFilters || uiFilters.length === 0) {
    return null;
  }

  return {
    type: "group",
    op: "and",
    children: uiFilters.map((f) => ({
      type: "leaf",
      // We trust the caller to use valid filterId strings matching backend FilterId.
      filterId: f.filterId as any,
      op: f.op,
      value: f.value,
    })),
  };
}
