// FILE: web/lib/filters/astFromJson.ts

import type { FilterExpr, FilterFieldExpr, GroupOp, Operator } from "./dsl";
import {
  FILTER_REGISTRY,
  type FilterDefinition,
  type FilterKey,
  type FilterOperator,
  type ValueKind,
} from "./registry";

// ---------------------------------------------------------------------------
// CONFIGURATION / GUARDRAILS
// ---------------------------------------------------------------------------

const MAX_AST_DEPTH = 5;          // Deep enough for complex logic, shallow enough to prevent stack overflow
const MAX_IN_ARRAY_SIZE = 1000;   // Prevent massive SQL params blowing up memory

// ---------------------------------------------------------------------------
// PARSER ENTRY
// ---------------------------------------------------------------------------

export function astFromJson(raw: unknown): FilterExpr | null {
  if (raw === null || raw === undefined) return null;

  if (!isObject(raw)) {
    throw new Error(`Filter AST root must be an object. Got: ${typeof raw}`);
  }

  // Start parsing at depth 0
  return parseNode(raw, 0);
}

/* ======================================================================= */
/* Core Parser                                                             */
/* ======================================================================= */

function parseNode(node: Record<string, unknown>, depth: number): FilterExpr {
  // 1. Guardrail: Recursion Depth
  if (depth > MAX_AST_DEPTH) {
    throw new Error(
      `Filter complexity limit exceeded (max depth ${MAX_AST_DEPTH}). Please simplify your query.`,
    );
  }

  const kind = detectKind(node);

  if (kind === "group") {
    return parseGroupNode(node, depth);
  }
  if (kind === "field") {
    return parseFieldNode(node);
  }

  throw new Error(
    `Invalid AST node: must be "group" or "field". keys=[${Object.keys(node)}]`,
  );
}

function parseGroupNode(
  node: Record<string, unknown>,
  depth: number,
): FilterExpr {
  const opRaw = node.op;
  const op = normalizeGroupOp(opRaw);

  const childrenRaw = node.children;
  if (!Array.isArray(childrenRaw)) {
    throw new Error(`Group node "${op}" missing "children" array.`);
  }

  const children = childrenRaw.map((child, idx) => {
    if (!isObject(child)) {
      throw new Error(`Group "${op}" child at index ${idx} is not an object.`);
    }
    // Recurse with incremented depth
    return parseNode(child, depth + 1);
  });

  return {
    kind: "group",
    op,
    children,
  };
}

function parseFieldNode(node: Record<string, unknown>): FilterFieldExpr {
  // Support both "key" (new) and "filterId" (legacy)
  const keyRaw = (node.key ?? node.filterId) as unknown;

  if (typeof keyRaw !== "string") {
    throw new Error(`Field node missing "key" (or "filterId") string.`);
  }

  const key = normalizeKey(keyRaw);
  const def = getFilterDefinition(key);

  const opRaw = node.op;
  const op = normalizeOperator(opRaw, def);

  // Extract raw value (before validation/normalization)
  let rawValue: unknown = undefined;

  if ("value" in node) {
    rawValue = node.value;
  } else if ("values" in node) {
    rawValue = node.values;
  }

  // Guardrail: unary vs non-unary operators
  if (!UNARY_OPERATORS.has(op as FilterOperator) && rawValue === undefined) {
    throw new Error(
      `Filter "${key}" with operator "${op}" requires a "value" or "values" property.`,
    );
  }

  // Normalize value shape & type based on registry valueKind + op
  const value = normalizeValue(def.valueKind, op, rawValue);

  // Guardrail: array size (after normalization so IN/NOT_IN, BETWEEN, etc. are handled)
  if (Array.isArray(value) && value.length > MAX_IN_ARRAY_SIZE) {
    throw new Error(
      `Filter "${key}" has too many values (${value.length}). Max allowed is ${MAX_IN_ARRAY_SIZE}.`,
    );
  }

  return {
    kind: "field",
    key,
    op,
    value,
  };
}

/* ======================================================================= */
/* Key / Group / Operator Normalization                                    */
/* ======================================================================= */

function normalizeKey(rawKey: string): FilterKey {
  // Single source of truth: FILTER_REGISTRY
  if (!Object.prototype.hasOwnProperty.call(FILTER_REGISTRY, rawKey)) {
    throw new Error(`Unknown filter key: "${rawKey}".`);
  }
  return rawKey as FilterKey;
}

function normalizeGroupOp(raw: unknown): GroupOp {
  if (typeof raw !== "string") {
    throw new Error(`Group "op" must be a string. Got: ${typeof raw}`);
  }

  const normalized = raw.toUpperCase();

  if (normalized === "AND" || normalized === "OR" || normalized === "NOT") {
    return normalized as GroupOp;
  }

  throw new Error(`Invalid group op: "${raw}". Expected "AND" | "OR" | "NOT".`);
}

function normalizeOperator(rawOp: unknown, def: FilterDefinition): Operator {
  if (typeof rawOp !== "string") {
    throw new Error(`Operator must be a string for filter "${def.key}".`);
  }

  const lower = rawOp.toLowerCase();

  // Look up alias/canonical via map
  const mapped = OPERATOR_MAP[lower];

  // If not in map, check if it's already exact canonical (e.g. "EQ")
  const canonical: FilterOperator | undefined =
    mapped ??
    (OPERATOR_CANONICAL_SET.has(rawOp as FilterOperator)
      ? (rawOp as FilterOperator)
      : undefined);

  if (!canonical) {
    throw new Error(
      `Unknown operator "${rawOp}" for filter "${def.key}".`,
    );
  }

  // Validate against registry
  if (!def.operators.includes(canonical)) {
    throw new Error(
      `Operator "${canonical}" not allowed for "${def.key}". Allowed: [${def.operators.join(
        ", ",
      )}]`,
    );
  }

  return canonical as Operator;
}

/* ======================================================================= */
/* Value Normalization / Shape Validation                                  */
/* ======================================================================= */

function normalizeValue(
  kind: ValueKind,
  op: Operator,
  raw: unknown,
): unknown {
  // Unary operators ignore value by definition
  if (UNARY_OPERATORS.has(op as FilterOperator)) {
    return undefined;
  }

  if (raw === undefined || raw === null) {
    throw new Error(`Value required for operator "${op}".`);
  }

  switch (kind) {
    case "string":
    case "text":
    case "enum": {
      if (op === "IN" || op === "NOT_IN") {
        const arr = toArray(raw).map((v) => {
          if (v === null || v === undefined) {
            throw new Error(
              `IN/NOT_IN for ${kind} filters cannot contain null/undefined.`,
            );
          }
          return String(v);
        });
        return arr;
      }
      // Scalar string-ish
      return String(raw);
    }

    case "number": {
      if (op === "BETWEEN") {
        return normalizeBetweenNumeric(raw);
      }

      // IN / NOT_IN multi-number
      if (op === "IN" || op === "NOT_IN") {
        const arr = toArray(raw).map(toNumberStrict);
        return arr;
      }

      // Scalar number
      return toNumberStrict(raw);
    }

    case "boolean": {
      // We accept `true`/`false` or "true"/"false"
      if (op === "IN" || op === "NOT_IN") {
        const arr = toArray(raw).map(toBooleanStrict);
        return arr;
      }
      return toBooleanStrict(raw);
    }

    case "date": {
      if (op === "BETWEEN") {
        return normalizeBetweenDate(raw);
      }

      if (op === "IN" || op === "NOT_IN") {
        const arr = toArray(raw).map(toDateStrict);
        return arr;
      }

      return toDateStrict(raw);
    }

    default: {
      // Exhaustive guard if ValueKind union expands in future
      const _never: never = kind;
      throw new Error(
        `astFromJson: Unsupported valueKind "${String(_never)}" in normalization.`,
      );
    }
  }
}

function normalizeBetweenNumeric(raw: unknown): [number, number] {
  // Accept [min, max] or { min, max }
  if (Array.isArray(raw) && raw.length === 2) {
    const n1 = toNumberStrict(raw[0]);
    const n2 = toNumberStrict(raw[1]);
    return n1 <= n2 ? [n1, n2] : [n2, n1];
  }

  if (
    typeof raw === "object" &&
    raw !== null &&
    "min" in raw &&
    "max" in raw
  ) {
    const obj = raw as { min: unknown; max: unknown };
    const n1 = toNumberStrict(obj.min);
    const n2 = toNumberStrict(obj.max);
    return n1 <= n2 ? [n1, n2] : [n2, n1];
  }

  throw new Error(
    `BETWEEN (number) expects [min,max] array or {min,max} object.`,
  );
}

function normalizeBetweenDate(raw: unknown): [Date, Date] {
  if (Array.isArray(raw) && raw.length === 2) {
    const d1 = toDateStrict(raw[0]);
    const d2 = toDateStrict(raw[1]);
    return d1 <= d2 ? [d1, d2] : [d2, d1];
  }

  if (
    typeof raw === "object" &&
    raw !== null &&
    "from" in raw &&
    "to" in raw
  ) {
    const obj = raw as { from: unknown; to: unknown };
    const d1 = toDateStrict(obj.from);
    const d2 = toDateStrict(obj.to);
    return d1 <= d2 ? [d1, d2] : [d2, d1];
  }

  throw new Error(
    `BETWEEN (date) expects [from,to] array or {from,to} object.`,
  );
}

/* ======================================================================= */
/* Static Data                                                             */
/* ======================================================================= */

const OPERATOR_MAP: Record<string, FilterOperator> = {
  // Canonical names (lowercased)
  eq: "EQ",
  neq: "NEQ",
  in: "IN",
  not_in: "NOT_IN",
  contains: "CONTAINS",
  not_contains: "NOT_CONTAINS",
  starts_with: "STARTS_WITH",
  ends_with: "ENDS_WITH",
  gt: "GT",
  gte: "GTE",
  lt: "LT",
  lte: "LTE",
  between: "BETWEEN",
  is_set: "IS_SET",
  is_not_set: "IS_NOT_SET",

  // Aliases used by UI / legacy payloads
  equals: "EQ",
  not_equals: "NEQ",
  greater_than: "GT",
  greater_than_or_equal: "GTE",
  less_than: "LT",
  less_than_or_equal: "LTE",
};

const OPERATOR_CANONICAL_SET = new Set<FilterOperator>([
  "EQ",
  "NEQ",
  "IN",
  "NOT_IN",
  "CONTAINS",
  "NOT_CONTAINS",
  "STARTS_WITH",
  "ENDS_WITH",
  "GT",
  "GTE",
  "LT",
  "LTE",
  "BETWEEN",
  "IS_SET",
  "IS_NOT_SET",
]);

const UNARY_OPERATORS = new Set<FilterOperator>(["IS_SET", "IS_NOT_SET"]);

/* ======================================================================= */
/* Utilities                                                               */
/* ======================================================================= */

function getFilterDefinition(key: FilterKey): FilterDefinition {
  const def = FILTER_REGISTRY[key];
  if (!def) {
    // Should be impossible after normalizeKey, but keep a guard.
    throw new Error(`No FILTER_REGISTRY entry found for key "${key}".`);
  }
  return def;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Detect "kind" of node from either:
 *   - node.kind: "group" | "field"
 *   - or legacy node.type: "group" | "leaf"
 */
function detectKind(node: Record<string, unknown>): "group" | "field" {
  if (node.kind === "group" || node.kind === "field") {
    return node.kind as "group" | "field";
  }
  if (node.type === "group") return "group";
  if (node.type === "leaf") return "field";

  // Heuristics for mixed shapes:
  if (Array.isArray(node.children)) return "group";
  if (node.key || node.filterId) return "field";

  throw new Error(
    `Ambiguous filter node structure. Missing 'kind', 'type', 'key'/'filterId', or 'children'.`,
  );
}

function toArray(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [val];
}

function toNumberStrict(val: unknown): number {
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n)) {
    throw new Error(`Expected numeric value, got "${String(val)}".`);
  }
  return n;
}

function toBooleanStrict(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const lower = val.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  throw new Error(`Expected boolean (true/false), got "${String(val)}".`);
}

function toDateStrict(val: unknown): Date {
  if (val instanceof Date) {
    if (!Number.isNaN(val.getTime())) return val;
    throw new Error(`Invalid Date instance.`);
  }

  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }

  throw new Error(`Expected date string/number/Date, got "${String(val)}".`);
}
