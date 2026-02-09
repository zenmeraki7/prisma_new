// FILE: web/lib/filters/snapshotCompiler.ts

import type { Prisma } from "@prisma/client";
import type { FilterExpr, FilterFieldExpr, GroupOp, Operator } from "./dsl";
import {
  FILTER_REGISTRY,
  type FilterDefinition,
  type FilterKey,
  type ValueKind,
  type FilterOperator,
} from "./registry";

// Strict Prisma type for SnapshotProduct to catch drift
type SnapshotWhere = Prisma.SnapshotProductWhereInput;

export interface SnapshotCompilerContext {
  shopId: string;
  snapshotRunId: bigint | number | string;
}

/**
 * Compile a FilterExpr into a Prisma SnapshotProductWhereInput.
 *
 * ASSUMPTIONS (enforced by astFromJson):
 * - Operators are canonical and allowed per FILTER_REGISTRY.
 * - Values are already normalized by valueKind/operator.
 *
 * SECURITY:
 * - Always enforces shopId and snapshotRunId to avoid cross-tenant leaks
 *   and unbounded snapshot scans.
 */
export function compileSnapshotWhere(
  expr: FilterExpr | null | undefined,
  ctx: SnapshotCompilerContext,
): SnapshotWhere {
  const snapshotRunId = normalizeSnapshotRunId(ctx.snapshotRunId);

  // 1. Root partitioning (CRITICAL for performance)
  const base: SnapshotWhere = {
    shopId: ctx.shopId,
    snapshotRunId,
  };

  if (!expr) return base;

  const compiled = compileNode(expr);

  if (isEmptyWhere(compiled)) {
    return base;
  }

  // 2. AND(partition, filters)
  return {
    AND: [base, compiled],
  };
}

/* ======================================================================= */
/* Internal – Dispatcher                                                   */
/* ======================================================================= */

function compileNode(expr: FilterExpr): SnapshotWhere {
  if (expr.kind === "group") {
    return compileGroup(expr);
  }
  return compileField(expr);
}

function compileGroup(
  group: { kind: "group"; op: GroupOp; children: FilterExpr[] },
): SnapshotWhere {
  const { op, children } = group;

  if (!children || children.length === 0) return {};

  // Prune empty branches early
  const compiledChildren = children
    .map(compileNode)
    .filter((w) => !isEmptyWhere(w));

  if (compiledChildren.length === 0) return {};

  if (op === "NOT") {
    if (compiledChildren.length !== 1) {
      throw new Error(
        `SNAPSHOT compiler: NOT group requires exactly 1 valid child.`,
      );
    }
    return { NOT: compiledChildren[0] };
  }

  if (op === "AND") return { AND: compiledChildren };
  if (op === "OR") return { OR: compiledChildren };

  throw new Error(`SNAPSHOT compiler: unknown group op "${op}".`);
}

/* ======================================================================= */
/* Internal – Leaf Handling                                                */
/* ======================================================================= */

function compileField(leaf: FilterFieldExpr): SnapshotWhere {
  const def = getFilterDefinition(leaf.key);

  // 1. Plane Safety Check
  if (def.db.plane !== "SNAPSHOT") {
    throw new Error(
      `SNAPSHOT compiler: Filter "${leaf.key}" belongs to plane="${def.db.plane}". Cannot execute on Snapshot plane.`,
    );
  }

  // 2. Partition Safety Check
  if (def.db.requiresSnapshotRunId !== true) {
    throw new Error(
      `SNAPSHOT compiler: Filter "${leaf.key}" is missing 'requiresSnapshotRunId: true'. This is required to prevent full-table scans.`,
    );
  }

  // 3. Operator Safety Check (double guard with astFromJson)
  if (!def.operators.includes(leaf.op as FilterOperator)) {
    throw new Error(
      `SNAPSHOT compiler: Operator "${leaf.op}" is not allowed for filter "${leaf.key}".`,
    );
  }

  // 4. Model Strictness
  if (def.db.model !== "SnapshotProduct") {
    throw new Error(
      `SNAPSHOT compiler: Invalid model "${def.db.model}" for filter "${def.key}". Snapshot plane only supports "SnapshotProduct".`,
    );
  }

  const value = leaf.value; // already normalized
  const field = def.db.field as keyof SnapshotWhere;

  return buildScalarWhereInner(field, leaf.op, value);
}

/* ======================================================================= */
/* Scalar Logic (mirrors FastCompiler semantics)                           */
/* ======================================================================= */

function buildScalarWhereInner(
  field: keyof SnapshotWhere,
  op: Operator,
  value: unknown,
): SnapshotWhere {
  const f = field as string;

  switch (op) {
    case "EQ":
      return { [f]: value };
    case "NEQ":
      return { NOT: { [f]: value } };

    case "IN":
      return { [f]: { in: asArray(value) } };
    case "NOT_IN":
      return { [f]: { notIn: asArray(value) } };

    case "CONTAINS":
      return { [f]: { contains: value as string, mode: "insensitive" } };
    case "NOT_CONTAINS":
      return {
        NOT: { [f]: { contains: value as string, mode: "insensitive" } },
      };

    case "STARTS_WITH":
      return { [f]: { startsWith: value as string, mode: "insensitive" } };
    case "ENDS_WITH":
      return { [f]: { endsWith: value as string, mode: "insensitive" } };

    case "GT":
      return { [f]: { gt: value } };
    case "GTE":
      return { [f]: { gte: value } };
    case "LT":
      return { [f]: { lt: value } };
    case "LTE":
      return { [f]: { lte: value } };

    case "BETWEEN": {
      const [from, to] = value as [unknown, unknown];
      return { [f]: { gte: from, lte: to } };
    }

    case "IS_SET":
      return { NOT: { [f]: null } };
    case "IS_NOT_SET":
      return { [f]: null };

    default:
      throw new Error(`SNAPSHOT compiler: Unsupported op "${op}"`);
  }
}

/* ======================================================================= */
/* Helpers                                                                 */
/* ======================================================================= */

function asArray(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [val];
}

function isEmptyWhere(where: SnapshotWhere): boolean {
  return Object.keys(where).length === 0;
}

function normalizeSnapshotRunId(
  value: bigint | number | string,
): bigint | number {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return value;
  if (typeof value === "string") return BigInt(value);
  throw new Error(
    `SNAPSHOT compiler: Invalid snapshotRunId type "${typeof value}".`,
  );
}

function getFilterDefinition(key: FilterKey): FilterDefinition {
  const def = FILTER_REGISTRY[key];
  if (!def) {
    throw new Error(`SNAPSHOT compiler: Unknown filter key "${key}".`);
  }
  return def;
}
