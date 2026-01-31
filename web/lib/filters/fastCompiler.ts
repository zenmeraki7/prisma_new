// FILE: web/lib/filters/fastCompiler.ts

import type { Prisma } from "@prisma/client";
import type { FilterExpr, FilterLeafExpr, FilterLeafOp } from "./dsl";
import type {
  FilterRegistry,
  FilterDefinition,
  FilterValueKind,
} from "./registry";
import { getFilterDef } from "./registry";

type ProductWhere = Prisma.ProductLiteWhereInput;

/**
 * Compile a FilterExpr into a Prisma ProductLiteWhereInput for FAST plane.
 * Throws if any leaf is not plane=FAST.
 */
export function compileFastWhere(
  expr: FilterExpr | null | undefined,
  registry: FilterRegistry,
): ProductWhere {
  if (!expr) return {};
  return compileExpr(expr, registry);
}

/* =======================================================================
 * Internal – expression dispatcher
 * ==================================================================== */

function compileExpr(expr: FilterExpr, registry: FilterRegistry): ProductWhere {
  if (expr.type === "group") {
    return compileGroup(expr, registry);
  }
  return compileLeaf(expr, registry);
}

function compileGroup(
  group: Extract<FilterExpr, { type: "group" }>,
  registry: FilterRegistry,
): ProductWhere {
  const { op, children } = group;

  if (!children || children.length === 0) {
    // Empty group – treat as no-op
    return {};
  }

  if (op === "not") {
    if (children.length !== 1) {
      throw new Error(`FAST compiler: NOT group must have exactly 1 child.`);
    }
    const childWhere = compileExpr(children[0], registry);
    return { NOT: childWhere };
  }

  const compiledChildren = children.map((child) =>
    compileExpr(child, registry),
  );

  if (op === "and") {
    return { AND: compiledChildren };
  }
  if (op === "or") {
    return { OR: compiledChildren };
  }

  throw new Error(`FAST compiler: Unknown group op: ${op}`);
}

/* =======================================================================
 * Internal – leaf handling
 * ==================================================================== */

function compileLeaf(
  leaf: FilterLeafExpr,
  registry: FilterRegistry,
): ProductWhere {
  const def = getFilterDef(leaf.filterId);

  if (def.plane !== "FAST") {
    throw new Error(
      `FAST compiler: filterId "${def.id}" is plane=${def.plane}, cannot compile into FAST plane.`,
    );
  }

  if (!def.fastField) {
    throw new Error(
      `FAST compiler: filterId "${def.id}" has plane=FAST but missing fastField descriptor.`,
    );
  }

  if (!def.operators.includes(leaf.op)) {
    throw new Error(
      `FAST compiler: operator "${leaf.op}" not allowed for filterId "${def.id}".`,
    );
  }

  // Validate & normalize value according to valueKind
  const value = normalizeValue(def.valueKind, leaf.op, leaf.value);

  switch (def.fastField.model) {
    case "ProductLite":
      return compileProductLiteField(def, leaf.op, value);
    case "ProductTag":
      return compileProductTagField(def, leaf.op, value);
    case "ProductCollection":
      return compileProductCollectionField(def, leaf.op, value);
    case "VariantRollup":
      return compileVariantRollupField(def, leaf.op, value);
    default:
      throw new Error(
        `FAST compiler: Unsupported fastField model "${def.fastField.model}" for filterId "${def.id}".`,
      );
  }
}

/* =======================================================================
 * Value normalization / validation
 * ==================================================================== */

function normalizeValue(
  kind: FilterValueKind,
  op: FilterLeafOp,
  raw: unknown,
): unknown {
  // Unary ops do not require a value
  if (op === "is_set" || op === "is_not_set") {
    return undefined;
  }

  if (raw === undefined || raw === null) {
    throw new Error(
      `FAST compiler: value is required for operator "${op}" (valueKind=${kind}).`,
    );
  }

  switch (kind) {
    case "string":
      if (typeof raw !== "string") {
        throw new Error(
          `FAST compiler: expected string value, got ${typeof raw}.`,
        );
      }
      return raw;

    case "stringList":
      if (Array.isArray(raw)) {
        const allStrings = raw.every((v) => typeof v === "string");
        if (!allStrings) {
          throw new Error(
            `FAST compiler: expected string[] for stringList filter, got non-string element.`,
          );
        }
        return raw;
      }
      if (typeof raw === "string") return [raw];
      throw new Error(
        `FAST compiler: expected string|string[] for stringList filter, got ${typeof raw}.`,
      );

    case "number":
    case "int": {
      if (op === "between") {
        const [from, to] = normalizeBetweenNumeric(raw);
        return [from, to];
      }
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        throw new Error(
          `FAST compiler: expected numeric value for ${kind}, got ${String(
            raw,
          )}.`,
        );
      }
      if (kind === "int" && !Number.isInteger(num)) {
        throw new Error(
          `FAST compiler: expected integer value, got ${num}.`,
        );
      }
      return num;
    }

    case "boolean":
      if (typeof raw !== "boolean") {
        throw new Error(
          `FAST compiler: expected boolean value, got ${typeof raw}.`,
        );
      }
      return raw;

    case "datetime": {
      if (op === "between") {
        const [from, to] = normalizeBetweenDate(raw);
        return [from, to];
      }

      const d =
        raw instanceof Date
          ? raw
          : typeof raw === "string"
          ? new Date(raw)
          : null;
      if (!d || Number.isNaN(d.getTime())) {
        throw new Error(
          `FAST compiler: expected datetime (string or Date), got: ${String(
            raw,
          )}.`,
        );
      }
      return d;
    }

    case "id":
      if (Array.isArray(raw)) {
        const ids = raw.map((v) => {
          if (typeof v !== "string") {
            throw new Error(
              `FAST compiler: id list must be string[], got non-string element.`,
            );
          }
          return v;
        });
        return ids;
      }
      if (typeof raw === "string") return raw;
      throw new Error(
        `FAST compiler: expected string|string[] for id valueKind, got ${typeof raw}.`,
      );

    // FAST plane should not see metafield/fulltext, but guard anyway.
    case "metafield":
    case "fulltext":
      throw new Error(
        `FAST compiler: valueKind "${kind}" should not be compiled in FAST plane.`,
      );

    default: {
      // Exhaustive guard
      const _never: never = kind;
      throw new Error(
        `FAST compiler: unsupported valueKind "${String(_never)}".`,
      );
    }
  }
}

function normalizeBetweenNumeric(raw: unknown): [number, number] {
  if (Array.isArray(raw) && raw.length === 2) {
    const [a, b] = raw;
    const n1 = Number(a);
    const n2 = Number(b);
    if (!Number.isFinite(n1) || !Number.isFinite(n2)) {
      throw new Error(
        `FAST compiler: "between" for numeric must be [number, number].`,
      );
    }
    return n1 <= n2 ? [n1, n2] : [n2, n1];
  }
  if (typeof raw === "object" && raw !== null && "min" in raw && "max" in raw) {
    const anyRaw = raw as { min: unknown; max: unknown };
    const n1 = Number(anyRaw.min);
    const n2 = Number(anyRaw.max);
    if (!Number.isFinite(n1) || !Number.isFinite(n2)) {
      throw new Error(
        `FAST compiler: "between" for numeric must be { min, max } with numeric values.`,
      );
    }
    return n1 <= n2 ? [n1, n2] : [n2, n1];
  }
  throw new Error(
    `FAST compiler: "between" for numeric expects [min,max] or {min,max}.`,
  );
}

function normalizeBetweenDate(raw: unknown): [Date, Date] {
  if (Array.isArray(raw) && raw.length === 2) {
    const [a, b] = raw;
    const d1 = toDate(a);
    const d2 = toDate(b);
    return d1 <= d2 ? [d1, d2] : [d2, d1];
  }
  if (typeof raw === "object" && raw !== null && "from" in raw && "to" in raw) {
    const anyRaw = raw as { from: unknown; to: unknown };
    const d1 = toDate(anyRaw.from);
    const d2 = toDate(anyRaw.to);
    return d1 <= d2 ? [d1, d2] : [d2, d1];
  }
  throw new Error(
    `FAST compiler: "between" for datetime expects [from,to] or {from,to}.`,
  );
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new Error(
    `FAST compiler: invalid datetime value in "between": ${String(value)}.`,
  );
}

/* =======================================================================
 * Model-specific compilers
 * ==================================================================== */

function compileProductLiteField(
  def: FilterDefinition,
  op: FilterLeafOp,
  value: unknown,
): ProductWhere {
  const field = def.fastField!.field as keyof Prisma.ProductLiteWhereInput;

  switch (op) {
    case "eq":
      return { [field]: value } as ProductWhere;
    case "neq":
      return { NOT: { [field]: value } } as ProductWhere;

    case "in":
      return { [field]: { in: asArray(value) } } as ProductWhere;
    case "not_in":
      return { [field]: { notIn: asArray(value) } } as ProductWhere;

    case "contains":
      return {
        [field]: { contains: value as string, mode: "insensitive" },
      } as ProductWhere;
    case "not_contains":
      return {
        NOT: {
          [field]: { contains: value as string, mode: "insensitive" },
        },
      } as ProductWhere;

    case "starts_with":
      return {
        [field]: { startsWith: value as string, mode: "insensitive" },
      } as ProductWhere;
    case "ends_with":
      return {
        [field]: { endsWith: value as string, mode: "insensitive" },
      } as ProductWhere;

    case "gt":
      return { [field]: { gt: value } } as ProductWhere;
    case "gte":
      return { [field]: { gte: value } } as ProductWhere;
    case "lt":
      return { [field]: { lt: value } } as ProductWhere;
    case "lte":
      return { [field]: { lte: value } } as ProductWhere;

    case "between": {
      const [from, to] = value as [unknown, unknown];
      return { [field]: { gte: from, lte: to } } as ProductWhere;
    }

    case "is_set":
      return { NOT: { [field]: null } } as ProductWhere;
    case "is_not_set":
      return { [field]: null } as ProductWhere;

    default:
      throw new Error(
        `FAST compiler: unsupported op "${op}" for ProductLite field "${field}".`,
      );
  }
}

/**
 * Tags live in ProductTag join table.
 *
 * product.tags:
 *  - contains / in: at least one tag in the provided list(s)
 *  - not_contains / not_in: no tag in the provided list(s)
 */
function compileProductTagField(
  def: FilterDefinition,
  op: FilterLeafOp,
  value: unknown,
): ProductWhere {
  const values = asArray(value).map((v) => String(v));

  // We don't rely on the TS type here because some generated clients
  // (older schema) may not yet expose `tagsJoin` on ProductLiteWhereInput.
  const relation = {
    some: { tag: { in: values } },
  };
  const noneRelation = {
    none: { tag: { in: values } },
  };

  switch (op) {
    case "contains":
    case "in":
      return { tagsJoin: relation } as ProductWhere;
    case "not_contains":
    case "not_in":
      return { tagsJoin: noneRelation } as ProductWhere;
    default:
      throw new Error(
        `FAST compiler: unsupported op "${op}" for ProductTag-based filter "${def.id}".`,
      );
  }
}

/**
 * Collections live in ProductCollection join table.
 */
function compileProductCollectionField(
  def: FilterDefinition,
  op: FilterLeafOp,
  value: unknown,
): ProductWhere {
  const values = asArray(value).map((v) => String(v));
  const relation: Prisma.ProductLiteWhereInput["collections"] = {
    some: { collectionId: { in: values } },
  };
  const noneRelation: Prisma.ProductLiteWhereInput["collections"] = {
    none: { collectionId: { in: values } },
  };

  switch (op) {
    case "in":
      return { collections: relation };
    case "not_in":
      return { collections: noneRelation };
    default:
      throw new Error(
        `FAST compiler: unsupported op "${op}" for ProductCollection-based filter "${def.id}".`,
      );
  }
}

/**
 * VariantRollup is a 1-1 relation from ProductLite used for numeric aggregations
 * like totalInventory, minPrice, maxPrice, etc.
 */
function compileVariantRollupField(
  def: FilterDefinition,
  op: FilterLeafOp,
  value: unknown,
): ProductWhere {
  const field =
    def.fastField!.field as keyof Prisma.VariantRollupWhereInput;

  const make = (inner: Prisma.VariantRollupWhereInput): ProductWhere => ({
    variantRollup: inner,
  });

  switch (op) {
    case "eq":
      return make({ [field]: value } as Prisma.VariantRollupWhereInput);
    case "neq":
      return make({
        NOT: { [field]: value } as Prisma.VariantRollupWhereInput,
      });

    case "in":
      return make({
        [field]: { in: asArray(value) },
      } as Prisma.VariantRollupWhereInput);
    case "not_in":
      return make({
        [field]: { notIn: asArray(value) },
      } as Prisma.VariantRollupWhereInput);

    case "gt":
      return make({ [field]: { gt: value } } as Prisma.VariantRollupWhereInput);
    case "gte":
      return make({
        [field]: { gte: value },
      } as Prisma.VariantRollupWhereInput);
    case "lt":
      return make({ [field]: { lt: value } } as Prisma.VariantRollupWhereInput);
    case "lte":
      return make({
        [field]: { lte: value },
      } as Prisma.VariantRollupWhereInput);

    case "between": {
      const [from, to] = value as [unknown, unknown];
      return make({
        [field]: { gte: from, lte: to },
      } as Prisma.VariantRollupWhereInput);
    }

    case "is_set":
      return make({
        [field]: { not: null },
      } as Prisma.VariantRollupWhereInput);
    case "is_not_set":
      return make({
        [field]: null,
      } as Prisma.VariantRollupWhereInput);

    default:
      throw new Error(
        `FAST compiler: unsupported op "${op}" for VariantRollup-based filter "${def.id}".`,
      );
  }
}

/* =======================================================================
 * Helpers
 * ==================================================================== */

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}
