// FILE: web/lib/filters/fastVariantCompiler.ts

import type { Prisma } from "@prisma/client";
import type { FilterExpr, FilterFieldExpr, GroupOp, Operator } from "../../frontend/lib/filters/dsl";
import {
  FILTER_REGISTRY,
  type FilterDefinition,
  type FilterKey,
  type FilterOperator,
} from "./registry";

type AnyWhere = Record<string, any>;

export interface FastVariantCompilerContext {
  shopId: string;
}

/**
 * Compile a FilterExpr into a Prisma VariantLiteWhereInput.
 *
 * Design:
 * - Root model is VariantLite
 * - Variant fields compile directly at top level
 * - Product fields compile through product: { ... }
 * - Product rollups compile through product: { variantRollup: ... }
 */
export function compileFastVariantWhere(
  expr: FilterExpr | null | undefined,
  ctx: FastVariantCompilerContext,
): Prisma.VariantLiteWhereInput {
  const base: AnyWhere = { shopId: ctx.shopId };

  if (!expr) return base;

  const compiled = compileNode(expr);

  if (isEmptyWhere(compiled)) {
    return base;
  }

  return {
    AND: [base, compiled],
  };
}

/* ======================================================================= */
/* Internal – expression dispatcher                                        */
/* ======================================================================= */

function compileNode(expr: FilterExpr): AnyWhere {
  if (expr.kind === "group") {
    return compileGroup(expr);
  }
  return compileField(expr);
}

function compileGroup(
  group: { kind: "group"; op: GroupOp; children: FilterExpr[] },
): AnyWhere {
  const { op, children } = group;

  if (!children || children.length === 0) return {};

  if (op === "NOT") {
    if (children.length !== 1) {
      throw new Error(`FAST variant compiler: NOT group must have exactly 1 child.`);
    }
    const childWhere = compileNode(children[0]);
    if (isEmptyWhere(childWhere)) return {};
    return { NOT: childWhere };
  }

  const compiledChildren = children
    .map(compileNode)
    .filter((w) => !isEmptyWhere(w));

  if (compiledChildren.length === 0) return {};

  if (op === "AND") return { AND: compiledChildren };
  if (op === "OR") return { OR: compiledChildren };

  throw new Error(`FAST variant compiler: unknown group op "${op}".`);
}

/* ======================================================================= */
/* Internal – leaf handling                                                */
/* ======================================================================= */

function compileField(leaf: FilterFieldExpr): AnyWhere {
  const def = getFilterDefinition(leaf.key);

  if (def.db.plane !== "FAST") {
    throw new Error(`FAST variant compiler: filter "${leaf.key}" is not FAST plane.`);
  }

  if (!def.operators.includes(leaf.op as FilterOperator)) {
    throw new Error(
      `FAST variant compiler: operator "${leaf.op}" not allowed for "${leaf.key}".`,
    );
  }

  const value = leaf.value;
  const { model, field, relationPath, multiValue, multiValueStrategy } = def.db;

  // ---------------------------------------------------------
  // STRATEGY 1: Array Overlap
  // ---------------------------------------------------------
  if (multiValue && multiValueStrategy === "array_overlap") {
    if (model === "VariantLite") {
      return buildArrayOverlapWhere(field, leaf.op, value);
    }

    if (model === "ProductLite") {
      return {
        product: buildArrayOverlapWhere(field, leaf.op, value),
      };
    }

    throw new Error(
      `FAST variant compiler: array_overlap unsupported for model "${model}" on "${leaf.key}".`,
    );
  }

  // ---------------------------------------------------------
  // STRATEGY 2: Relation Join (some / exists)
  // ---------------------------------------------------------
  if (multiValue && multiValueStrategy === "relation_some") {
    const inner = buildScalarWhereInner(field, leaf.op, value);

    if (!relationPath) {
      throw new Error(
        `FAST variant compiler: relation_some requires relationPath for "${leaf.key}".`,
      );
    }

    if (model === "VariantLite") {
      return { [relationPath]: { some: inner } };
    }

    if (model === "ProductLite") {
      return {
        product: {
          [relationPath]: { some: inner },
        },
      };
    }

    throw new Error(
      `FAST variant compiler: relation_some unsupported for model "${model}" on "${leaf.key}".`,
    );
  }

  // ---------------------------------------------------------
  // STRATEGY 3: Standard Scalar
  // ---------------------------------------------------------
  let where = buildScalarWhereInner(field, leaf.op, value);

  // Rooted directly on VariantLite
  if (model === "VariantLite") {
    if (!relationPath) {
      return where;
    }

    // Example future case: inventoryByLoc on VariantLite
    return { [relationPath]: { some: where } };
  }

  // Product fields reachable via VariantLite.product
  if (model === "ProductLite") {
    if (!relationPath) {
      return { product: where };
    }

    // Example: product.collections.some(...)
    return {
      product: {
        [relationPath]: { some: where },
      },
    };
  }

  // Product rollup reachable via VariantLite.product.variantRollup
  if (model === "VariantRollup") {
    if (!relationPath) {
      throw new Error(
        `FAST variant compiler: VariantRollup-backed filter "${leaf.key}" requires relationPath.`,
      );
    }

    return {
      product: {
        [relationPath]: where,
      },
    };
  }

  // Any product-adjacent 1:1 child model
  if (model === "ProductContent") {
    if (!relationPath) {
      throw new Error(
        `FAST variant compiler: ProductContent-backed filter "${leaf.key}" requires relationPath.`,
      );
    }

    return {
      product: {
        [relationPath]: where,
      },
    };
  }

  // Variant child relation, e.g. inventoryByLoc.some(...)
  if (model === "VariantInventoryLocation") {
    if (!relationPath) {
      throw new Error(
        `FAST variant compiler: VariantInventoryLocation-backed filter "${leaf.key}" requires relationPath.`,
      );
    }

    return {
      [relationPath]: { some: where },
    };
  }

  throw new Error(
    `FAST variant compiler: unsupported model "${model}" for filter "${leaf.key}".`,
  );
}

/* ======================================================================= */
/* Scalar Logic                                                            */
/* ======================================================================= */

function buildScalarWhereInner(
  field: string,
  op: Operator,
  value: unknown,
): AnyWhere {
  const normalizedOp = normalizeOperator(op);

  switch (normalizedOp) {
    case "EQ":
      return { [field]: value };

    case "NEQ":
      return { NOT: { [field]: value } };

    case "IN":
      return { [field]: { in: asArray(value) } };

    case "NOT_IN":
      return { [field]: { notIn: asArray(value) } };

    case "CONTAINS":
      return {
        [field]: { contains: value as string, mode: "insensitive" },
      };

    case "NOT_CONTAINS":
      return {
        NOT: {
          [field]: { contains: value as string, mode: "insensitive" },
        },
      };

    case "STARTS_WITH":
      return {
        [field]: { startsWith: value as string, mode: "insensitive" },
      };

    case "ENDS_WITH":
      return {
        [field]: { endsWith: value as string, mode: "insensitive" },
      };

    case "GT":
      return { [field]: { gt: value } };

    case "GTE":
      return { [field]: { gte: value } };

    case "LT":
      return { [field]: { lt: value } };

    case "LTE":
      return { [field]: { lte: value } };

    case "BETWEEN": {
      const [from, to] = value as [unknown, unknown];
      return { [field]: { gte: from, lte: to } };
    }

    case "IS_SET":
      return { NOT: { [field]: null } };

    case "IS_NOT_SET":
      return { [field]: null };

    default:
      throw new Error(`FAST variant compiler: unknown op "${op}".`);
  }
}

function buildArrayOverlapWhere(
  field: string,
  op: Operator,
  value: unknown,
): AnyWhere {
  const normalizedOp = normalizeOperator(op);
  const values = asArray(value).map(String);

  switch (normalizedOp) {
    case "EQ":
    case "IN":
      return { [field]: { hasSome: values } };

    case "NEQ":
    case "NOT_IN":
      return { NOT: { [field]: { hasSome: values } } };

    case "IS_SET":
      return { [field]: { isEmpty: false } };

    case "IS_NOT_SET":
      return { [field]: { isEmpty: true } };

    default:
      throw new Error(
        `FAST variant compiler: array op "${op}" not supported for field "${field}".`,
      );
  }
}

/* ======================================================================= */
/* Helpers                                                                 */
/* ======================================================================= */

function normalizeOperator(op: Operator): Operator {
  if (op === "ON") return "EQ" as Operator;
  if (op === "BEFORE") return "LT" as Operator;
  if (op === "AFTER") return "GT" as Operator;
  if (op === "IS_EMPTY") return "IS_NOT_SET" as Operator;
  if (op === "IS_NOT_EMPTY") return "IS_SET" as Operator;
  if (op === "IS") return "EQ" as Operator;
  return op;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function isEmptyWhere(w: AnyWhere): boolean {
  return Object.keys(w).length === 0;
}

function getFilterDefinition(key: FilterKey): FilterDefinition {
  const def = FILTER_REGISTRY[key];
  if (!def) {
    throw new Error(`FAST variant compiler: Unknown filter "${key}".`);
  }
  return def;
}