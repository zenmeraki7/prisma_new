// FILE: web/graphql/filtering/planSnapshotProductWhere.ts

import { Prisma } from "@prisma/client";
import {
  FILTER_REGISTRY,
  type FullTextConfig,
  type FilterDefinition,
  type FilterKey,
  type FilterOperator,
  type ValueKind,
} from "../../lib/filters/registry";
import type {
  FastProductFilterInput,
  FilterPredicateInput,
} from "../types/filtering";

type SnapshotProductWhere = Prisma.SnapshotProductWhereInput;

/**
 * Planner result for SNAPSHOT-plane filters:
 *
 * - snapshotWhere:
 *     Regular Prisma where that can be passed directly into:
 *       prisma.snapshotProduct.findMany({ where: snapshotWhere, ... })
 *
 * - fullTextFilters:
 *     One entry per registry filter with `fullText` enabled.
 *     These must be applied via raw SQL (tsvector @@ to_tsquery()).
 */
export interface FullTextFilterSpec {
  key: FilterKey;
  operator: FilterOperator;
  query: string; // sanitized tsquery string (no quotes, :*, etc. included)
  negated: boolean;
  fullText: FullTextConfig;
}

export interface SnapshotPlanResult {
  snapshotWhere: SnapshotProductWhere | null;
  fullTextFilters: FullTextFilterSpec[];
}

/**
 * Main entry point for SNAPSHOT-plane planning.
 *
 * - Accepts the same FastProductFilterInput you pass to the FAST-plane planner.
 * - Reads FILTER_REGISTRY to decide:
 *     - which predicates belong to SNAPSHOT plane
 *     - which are full-text (tsvector) vs normal scalar filters
 */
export function planSnapshotProductWhere(
  filter: FastProductFilterInput | null | undefined,
): SnapshotPlanResult {
  if (!filter || !filter.predicates || filter.predicates.length === 0) {
    return {
      snapshotWhere: null,
      fullTextFilters: [],
    };
  }

  const andClauses: SnapshotProductWhere[] = [];
  const fullTextFilters: FullTextFilterSpec[] = [];

  for (const predicate of filter.predicates) {
    const def = FILTER_REGISTRY[predicate.key as FilterKey];

    if (!def) {
      // Unknown key – ignore safely
      // (Frontend should never send this if it uses registry)
      continue;
    }

    // Only snapshot-plane filters are handled here
    if (def.db.plane !== "SNAPSHOT") {
      continue;
    }

    if (isFullTextSnapshotFilter(def)) {
      const spec = toFullTextFilterSpec(def, predicate);
      if (spec) {
        fullTextFilters.push(spec);
      }
    } else {
      const where = buildSnapshotWhereClause(def, predicate);
      if (where && Object.keys(where).length > 0) {
        andClauses.push(where);
      }
    }
  }

  const snapshotWhere =
    andClauses.length > 0 ? ({ AND: andClauses } as SnapshotProductWhere) : null;

  return {
    snapshotWhere,
    fullTextFilters,
  };
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function isFullTextSnapshotFilter(def: FilterDefinition): boolean {
  return Boolean(
    def.fullText &&
      def.fullText.plane === "SNAPSHOT" &&
      typeof def.fullText.vectorField === "string",
  );
}

/**
 * Convert a single FilterPredicateInput for a full-text-enabled registry
 * definition into a FullTextFilterSpec.
 */
function toFullTextFilterSpec(
  def: FilterDefinition,
  predicate: FilterPredicateInput,
): FullTextFilterSpec | null {
  if (!def.fullText || def.fullText.plane !== "SNAPSHOT") return null;

  const rawValue = predicate.value;
  if (rawValue == null) return null;

  const text = String(rawValue).trim();
  if (!text) return null;

  const operator = predicate.operator as FilterOperator;

  // Decide if this is a negated full-text search
  const negated = operator === "NOT_CONTAINS";

  // Build a simple to_tsquery string:
  //   "foo bar" -> "foo:* & bar:*"
  const query = buildTsQueryFromSearchText(text);

  return {
    key: predicate.key as FilterKey,
    operator,
    query,
    negated,
    fullText: def.fullText,
  };
}

/**
 * Build a Prisma where clause for non-full-text snapshot filters.
 *
 * Example:
 *   - product.searchEngineVisibility = visible
 *   - product.description IS_SET
 */
function buildSnapshotWhereClause(
  def: FilterDefinition,
  predicate: FilterPredicateInput,
): SnapshotProductWhere | null {
  const { operator, value } = predicate;
  const field = def.db.field;

  const scalar = mapSnapshotScalarCondition(
    def.valueKind,
    operator as FilterOperator,
    value,
  );

  if (!scalar) return null;

  return {
    [field]: scalar,
  } as SnapshotProductWhere;
}

/**
 * Snapshot-plane scalar operator mapping.
 *
 * Mirrors the FAST-plane mapScalarCondition, but we keep it decoupled
 * since SnapshotProduct has a different schema and we may add extra
 * operators later.
 */
function mapSnapshotScalarCondition(
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
        // NOTE:
        //  - For full-text-enabled fields we prefer to use `fullText`
        //    and avoid adding a redundant ILIKE condition here.
        //  - For plain text fields (no fullText config), this falls
        //    back to ILIKE for compatibility.
        return { contains: value, mode: "insensitive" };
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
      const [min, max] = Array.isArray(value)
        ? value
        : [value?.[0], value?.[1]];
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
      console.warn(
        `[planSnapshotProductWhere] Unhandled operator for snapshot plane: ${op}`,
      );
      return undefined;
  }
}

function coerceNumber(val: any): number {
  const n = Number(val);
  if (Number.isNaN(n)) {
    console.warn(
      `[planSnapshotProductWhere] Expected numeric value, got:`,
      val,
    );
    return 0;
  }
  return n;
}

/**
 * Naive but effective tsquery builder:
 *
 *  "foo bar"   -> "foo:* & bar:*"
 *  "Foo's bar" -> "Foo''s:* & bar:*"
 *
 * You can later swap this for phrase search or lexeme normalization
 * if needed.
 */
function buildTsQueryFromSearchText(text: string): string {
  const tokens = text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (!tokens.length) return "";

  return tokens
    .map((t) => sanitizeTsToken(t) + ":*")
    .join(" & ");
}

/**
 * Escape single quotes for PostgreSQL tsquery.
 */
function sanitizeTsToken(token: string): string {
  return token.replace(/'/g, "''");
}
