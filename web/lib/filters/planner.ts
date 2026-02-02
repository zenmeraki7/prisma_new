// FILE: web/lib/filters/planner.ts

import { Prisma } from "@prisma/client";
import {
  FILTER_REGISTRY,
  type FilterKey,
  type FilterOperator,
  type FilterDefinition,
  type DbBinding,
  type ValueKind,
} from "./registry";

// --- Types ---

export interface UserFilter {
  key: FilterKey;
  operator: FilterOperator;
  value: any;
}

/**
 * PlannerResult describes how to execute a set of filters:
 *
 * - fastQuery:
 *     A Prisma.ProductLiteWhereInput that can be passed directly to
 *     prisma.productLite.findMany({ where: fastQuery, ... }).
 *
 * - snapshotTasks:
 *     Filters that live on the SNAPSHOT plane (SnapshotProduct, etc.).
 *     These cannot be resolved from ProductLite alone. Your snapshot
 *     worker / bulk-ops pipeline should consume these.
 *
 * - meta:
 *     Useful debugging / UI telemetry.
 */
export interface PlannerResult {
  fastQuery: Prisma.ProductLiteWhereInput;
  snapshotTasks: UserFilter[];
  meta: {
    fastFiltersApplied: number;
    snapshotDeferred: number;
  };
}

// --- Core Engine ---

export const FilterPlanner = {
  /**
   * Main entry point. Converts UI filters into a backend query strategy.
   */
  plan(filters: UserFilter[]): PlannerResult {
    const fastFilters: UserFilter[] = [];
    const snapshotFilters: UserFilter[] = [];

    // 1. Split by plane (FAST vs SNAPSHOT)
    for (const f of filters) {
      const def = FILTER_REGISTRY[f.key];
      if (!def) {
        console.warn(`[Planner] Unknown filter key: ${f.key}, ignoring.`);
        continue;
      }

      if (def.db.plane === "FAST") {
        fastFilters.push(f);
      } else {
        snapshotFilters.push(f);
      }
    }

    // 2. Build Prisma WhereInput for FAST plane
    const fastQuery = buildPrismaFastQuery(fastFilters);

    return {
      fastQuery,
      snapshotTasks: snapshotFilters,
      meta: {
        fastFiltersApplied: fastFilters.length,
        snapshotDeferred: snapshotFilters.length,
      },
    };
  },
};

// --- Internal Builders ---

/**
 * Builds a Prisma.ProductLiteWhereInput for all FAST-plane filters.
 *
 * - Product-scope filters go directly on ProductLite.
 * - Variant-scope filters are wrapped in:
 *     variants: { some: { AND: [ ...variantConditions ] } }
 *
 * So semantics are:
 *   - ALL product filters must match.
 *   - There exists AT LEAST ONE variant satisfying ALL variant filters.
 */
function buildPrismaFastQuery(
  filters: UserFilter[],
): Prisma.ProductLiteWhereInput {
  if (!filters.length) return {};

  const productConditions: any[] = [];
  const variantConditions: any[] = [];

  for (const filter of filters) {
    const def = FILTER_REGISTRY[filter.key];

    if (def.scope === "product") {
      const cond = buildProductCondition(def, filter);
      if (cond && Object.keys(cond).length > 0) {
        productConditions.push(cond);
      }
    } else {
      const cond = buildVariantCondition(def, filter);
      if (cond && Object.keys(cond).length > 0) {
        variantConditions.push(cond);
      }
    }
  }

  const andClauses: any[] = [];

  if (productConditions.length > 0) {
    andClauses.push(...productConditions);
  }

  if (variantConditions.length > 0) {
    andClauses.push({
      variants: {
        some: {
          AND: variantConditions,
        },
      },
    });
  }

  if (andClauses.length === 0) {
    return {};
  }

  return { AND: andClauses } as Prisma.ProductLiteWhereInput;
}

/**
 * Builds a single condition object for a product-scope filter.
 *
 * Examples:
 *  - Simple:
 *      { title: { contains: "shirt", mode: "insensitive" } }
 *
 *  - Multi-value array (tags):
 *      { tags: { hasSome: ["summer", "sale"] } }
 */
function buildProductCondition(
  def: FilterDefinition,
  filter: UserFilter,
): Record<string, any> | null {
  const { operator, value } = filter;
  const db = def.db;

  // Multi-value array / relation
  if (db.multiValue && db.multiValueStrategy) {
    return buildMultiValueClause("product", def, operator, value);
  }

  // Simple scalar
  const scalar = mapScalarCondition(def.valueKind, operator, value);
  if (!scalar) return null;

  return {
    [db.field]: scalar,
  };
}

/**
 * Builds a single condition object for a variant-scope filter.
 *
 * This will be wrapped in:
 *   variants: { some: { AND: [ ...variantConditions ] } }
 */
function buildVariantCondition(
  def: FilterDefinition,
  filter: UserFilter,
): Record<string, any> | null {
  const { operator, value } = filter;
  const db = def.db;

  // Multi-value (e.g., inventoryLocations.some(...))
  if (db.multiValue && db.multiValueStrategy) {
    return buildMultiValueClause("variant", def, operator, value);
  }

  // Simple scalar: apply directly to VariantLite field
  const scalar = mapScalarCondition(def.valueKind, operator, value);
  if (!scalar) return null;

  return {
    [db.field]: scalar,
  };
}

/**
 * Handles complex multi-value logic:
 *
 * - context: "product" or "variant" (where we're attaching this clause)
 *
 * Strategy mapping:
 * - array_overlap / array_has / array_has_every → Prisma array filters
 * - relation_some → Prisma relation some filters
 */
function buildMultiValueClause(
  context: "product" | "variant",
  def: FilterDefinition,
  op: FilterOperator,
  rawValue: any,
): Record<string, any> {
  const db = def.db;
  const field = db.field;

  // Normalize to array
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];

  // --- Array-backed multiValue (e.g., ProductLite.tags: string[]) ---
  if (
    db.multiValueStrategy === "array_overlap" ||
    db.multiValueStrategy === "array_has" ||
    db.multiValueStrategy === "array_has_every"
  ) {
    const arrayFilter: any = {};

    switch (op) {
      case "IN":
        // Overlap: any of these values
        // tags && ARRAY[values...] → Prisma hasSome
        arrayFilter.hasSome = values;
        break;
      case "EQ":
      case "CONTAINS":
        // Single value containment
        // tags @> ARRAY[value] → Prisma has
        arrayFilter.has = values[0];
        break;
      case "IS_SET":
        arrayFilter.isEmpty = false;
        break;
      case "IS_NOT_SET":
        arrayFilter.isEmpty = true;
        break;
      default:
        console.warn(
          `[Planner] Unsupported array operator '${op}' for multiValue field '${field}'`,
        );
        return {};
    }

    return {
      [field]: arrayFilter,
    };
  }

  // --- Relation-backed multiValue (e.g., VariantInventoryLocation) ---
  if (db.multiValueStrategy === "relation_some") {
    const relation = db.relationPath;
    if (!relation) {
      console.warn(
        `[Planner] relation_some requires relationPath for field '${field}'`,
      );
      return {};
    }

    // We assume string kind for relation_some (e.g., locationName),
    // but you can extend this by inspecting def.valueKind if needed.
    const scalar = mapScalarCondition(def.valueKind, op, rawValue);
    if (!scalar) return {};

    return {
      [relation]: {
        some: {
          [field]: scalar,
        },
      },
    };
  }

  console.warn(
    `[Planner] Unknown multiValueStrategy '${db.multiValueStrategy}' for field '${field}'`,
  );
  return {};
}

/**
 * Maps a single Filter Definition + Operator to a Prisma Condition object.
 */
function mapCondition(
  def: FilterDefinition,
  op: FilterOperator,
  value: any,
): any {
  return mapScalarCondition(def.valueKind, op, value);
}

/**
 * Low-level translator from Registry ops to Prisma filter objects.
 *
 * NOTE:
 * - For now, even TEXT/fullText fields fall back to `contains` (ILIKE).
 *   When you wire full-text search via $queryRaw, you'll instead:
 *     - detect def.fullText here
 *     - *skip* adding to Prisma where
 *     - push into a separate fullTextFilters array
 */
function mapScalarCondition(
  kind: ValueKind,
  op: FilterOperator,
  value: any,
): any {
  switch (op) {
    case "EQ":
      return { equals: value };
    case "NEQ":
      return { not: { equals: value } };
    case "CONTAINS":
      if (kind === "string" || kind === "text") {
        return { contains: value, mode: "insensitive" }; // ILIKE
      }
      return { equals: value };
    case "NOT_CONTAINS":
      if (kind === "string" || kind === "text") {
        return { not: { contains: value, mode: "insensitive" } };
      }
      return { not: { equals: value } };
    case "STARTS_WITH":
      return { startsWith: value, mode: "insensitive" };
    case "ENDS_WITH":
      return { endsWith: value, mode: "insensitive" };
    case "IN":
      return { in: Array.isArray(value) ? value : [value] };
    case "NOT_IN":
      return { notIn: Array.isArray(value) ? value : [value] };
    case "GT":
      return { gt: coerceNumber(value) };
    case "GTE":
      return { gte: coerceNumber(value) };
    case "LT":
      return { lt: coerceNumber(value) };
    case "LTE":
      return { lte: coerceNumber(value) };
    case "BETWEEN": {
      const [min, max] = Array.isArray(value) ? value : [value?.[0], value?.[1]];
      return {
        gte: coerceNumber(min),
        lte: coerceNumber(max),
      };
    }
    case "IS_SET":
      return { not: null };
    case "IS_NOT_SET":
      return { equals: null };
    default:
      console.warn(`[Planner] Unhandled operator: ${op}`);
      return undefined;
  }
}

function coerceNumber(val: any): number {
  const n = Number(val);
  if (Number.isNaN(n)) {
    console.warn(`[Planner] Expected numeric value, got:`, val);
    return 0;
  }
  return n;
}
