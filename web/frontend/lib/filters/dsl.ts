// FILE: web/frontend/lib/filters/dsl.ts

import type {
  FilterKey,
  FilterOperator,
} from "../../../lib/filters/registry";

/* ================= TYPES ================= */

export type GroupOp = "AND" | "OR" | "NOT";
export type Operator = FilterOperator;

export interface FilterFieldExpr {
  kind: "field";
  key: FilterKey;
  op: Operator;
  value?: unknown;
}

export type FilterGroupExpr =
  | {
      kind: "group";
      op: Extract<GroupOp, "AND" | "OR">;
      children: FilterExpr[];
    }
  | {
      kind: "group";
      op: Extract<GroupOp, "NOT">;
      children: [FilterExpr];
    };

export type FilterExpr = FilterFieldExpr | FilterGroupExpr;

/* ================= SMART CONSTRUCTORS ================= */

/**
 * Build a single field node
 */
export function field(
  key: FilterKey,
  op: Operator,
  value?: unknown,
): FilterFieldExpr {
  return { kind: "field", key, op, value };
}

/**
 * Alias for field() so UI can use `leaf()`
 */
export const leaf = field;

/**
 * Build an AND group (auto-optimizes null/undefined and single child)
 */
export function andGroup(
  children: (FilterExpr | null | undefined)[],
): FilterExpr | null {
  const valid = children.filter(
    (c): c is FilterExpr => c !== null && c !== undefined,
  );
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  return { kind: "group", op: "AND", children: valid };
}

/**
 * Build an OR group
 */
export function orGroup(
  children: (FilterExpr | null | undefined)[],
): FilterExpr | null {
  const valid = children.filter(
    (c): c is FilterExpr => c !== null && c !== undefined,
  );
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  return { kind: "group", op: "OR", children: valid };
}

/**
 * Build a NOT group
 */
export function notGroup(
  child: FilterExpr | null | undefined,
): FilterExpr | null {
  if (!child) return null;
  return { kind: "group", op: "NOT", children: [child] };
}
