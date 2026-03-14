// FILE: web/lib/filters/fastCompiler.ts

import type { Prisma } from "@prisma/client";
import type { FilterExpr, FilterFieldExpr, GroupOp, Operator } from "../../frontend/lib/filters/dsl";
import {
  FILTER_REGISTRY,
  type FilterDefinition,
  type FilterKey,
  type FilterOperator,
} from "./registry";

// We use "any" for the WhereInput types internally because we are building
// dynamic objects based on the Registry. Type safety is ensured by the
// Registry's strict typing of Model/Field pairs.
type AnyWhere = Record<string, any>;

export interface FastCompilerContext {
  shopId: string;
}

/**
 * Compile a FilterExpr into a Prisma ProductLiteWhereInput.
 *
 * ASSUMPTIONS (enforced by astFromJson):
 * - leaf.key is a valid FilterKey present in FILTER_REGISTRY
 * - leaf.op is a canonical Operator ("EQ", "IN", "BETWEEN", ...)
 * - leaf.value is already normalized by valueKind/operator:
 *   - IN/NOT_IN → arrays
 *   - BETWEEN → [min, max] with correct type
 *   - date → Date or Date[]
 *   - boolean → boolean or boolean[]
 */
export function compileFastWhere(
  expr: FilterExpr | null | undefined,
  ctx: FastCompilerContext,
): Prisma.ProductLiteWhereInput {
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
      throw new Error(`FAST compiler: NOT group must have exactly 1 child.`);
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

  throw new Error(`FAST compiler: unknown group op "${op}".`);
}

/* ======================================================================= */
/* Internal – leaf handling                                                */
/* ======================================================================= */

function compileField(leaf: FilterFieldExpr): AnyWhere {
  const def = getFilterDefinition(leaf.key);

  if (def.db.plane !== "FAST") {
    throw new Error(`FAST compiler: filter "${leaf.key}" is not FAST plane.`);
  }

  // Double-safety check; astFromJson already enforced this.
  if (!def.operators.includes(leaf.op as FilterOperator)) {
    throw new Error(
      `FAST compiler: operator "${leaf.op}" not allowed for "${leaf.key}".`,
    );
  }

  // IMPORTANT: value is already normalized by astFromJson based on valueKind + op
  const value = leaf.value;
  const { model, field, relationPath, multiValue, multiValueStrategy } = def.db;

  // ---------------------------------------------------------
  // STRATEGY 1: Array Overlap (Postgres Native Arrays)
  // e.g. ProductLite.tags
  // ---------------------------------------------------------
  if (multiValue && multiValueStrategy === "array_overlap") {
    return buildArrayOverlapWhere(field, leaf.op, value);
  }

  // ---------------------------------------------------------
  // STRATEGY 2: Relation Join (some / exists)
  // e.g. ProductLite -> collections, or VariantLite -> inventoryByLoc
  // ---------------------------------------------------------
  if (multiValue && multiValueStrategy === "relation_some") {
    const inner = buildScalarWhereInner(field, leaf.op, value);

    if (relationPath) {
      // e.g. collections: { some: { collectionTitle: { in: [...] } } }
      return nestRelation(relationPath, { some: inner });
    }
    throw new Error(
      `FAST compiler: relation_some requires relationPath for filter "${leaf.key}".`,
    );
  }

  // ---------------------------------------------------------
  // STRATEGY 3: Standard Scalar (1:1 or Direct)
  // ---------------------------------------------------------

  // Build the scalar check: { price: { gt: 100 } }
  let where = buildScalarWhereInner(field, leaf.op, value);

  // If this field lives on a related model (Rollup, Content, Variants), nest it.
  if (relationPath) {
    if (model === "VariantRollup" || model === "ProductContent") {
      // 1:1 relation from ProductLite
      where = { [relationPath]: where };
    } else if (model === "VariantLite") {
      // ProductLite -> variants (1:N)
      where = { [relationPath]: { some: where } };
    } else if (def.scope === "variant" && model === "VariantInventoryLocation") {
      // ProductLite -> variants (some) -> inventoryByLoc (some)
      // registry: relationPath = "inventoryByLoc"
      const invWhere = { [relationPath]: { some: where } };
      where = { variants: { some: invWhere } };
    }
  }

  return where;
}

// Helper to nest relations dynamically
function nestRelation(path: string, inner: AnyWhere): AnyWhere {
  return { [path]: inner };
}

/* ======================================================================= */
/* Scalar Logic                                                            */
/* ======================================================================= */

function buildScalarWhereInner(
  field: string,
  op: Operator,
  value: unknown,
): AnyWhere {
  switch (op) {
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
      throw new Error(`FAST compiler: unknown op "${op}".`);
  }
}

function buildArrayOverlapWhere(
  field: string,
  op: Operator,
  value: unknown,
): AnyWhere {
  const values = asArray(value).map(String);
  switch (op) {
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
        `FAST compiler: array op "${op}" not supported for field "${field}".`,
      );
  }
}

/* ======================================================================= */
/* Helpers                                                                 */
/* ======================================================================= */

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function isEmptyWhere(w: AnyWhere): boolean {
  return Object.keys(w).length === 0;
}

function getFilterDefinition(key: FilterKey): FilterDefinition {
  const def = FILTER_REGISTRY[key];
  if (!def) {
    throw new Error(`FAST compiler: Unknown filter: "${key}".`);
  }
  return def;
}
