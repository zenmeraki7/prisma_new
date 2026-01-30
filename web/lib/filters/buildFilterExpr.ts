import type { FilterExpr, FilterLeafOp } from "../filters/dsl";

/**
 * UI filter shape (what Polaris / UI produces)
 */
export type UiFilter = {
  filterId: string;
  op: FilterLeafOp;
  value?: unknown;
};

/**
 * Convert UI filters → FilterExpr AST (backend-readable)
 */
export function buildFilterExpr(
  uiFilters: UiFilter[]
): FilterExpr | null {
  if (!uiFilters || uiFilters.length === 0) {
    return null;
  }

  return {
    type: "group",
    op: "and",
    children: uiFilters.map((f) => ({
      type: "leaf",
      filterId: f.filterId,
      op: f.op,
      value: f.value,
    })),
  };
}
