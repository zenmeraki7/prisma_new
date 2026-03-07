// FILE: web/frontend/lib/filters/dsl.ts

import type {
  FilterKey,
  FilterOperator,
} from "./uiRegistry";

export type GroupOp = "AND" | "OR" | "NOT";
export type Operator = FilterOperator;

/**
 * IMPORTANT:
 * For the CURRENT live backend (/api/graphql in web/index.js),
 * send RAW UI KEYS like:
 *   product.handle
 *   product.title
 *   variant.sku
 *
 * Do NOT translate to OPS keys here.
 */
export interface FilterFieldExpr {
  kind: "field";
  key: string;
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

export function field(
  key: FilterKey | "product.search",
  op: Operator,
  value?: unknown,
): FilterFieldExpr {
  return { kind: "field", key: String(key), op, value };
}

export const leaf = field;

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

export function notGroup(
  child: FilterExpr | null | undefined,
): FilterExpr | null {
  if (!child) return null;
  return { kind: "group", op: "NOT", children: [child] };
}