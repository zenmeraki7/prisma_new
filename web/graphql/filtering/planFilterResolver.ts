// web/graphql/filtering/planFilterResolver.ts

import type { GraphQLFieldResolver } from "graphql";
import {
  mapPlanFiltersInputToAst,
  type FilterGroupAst,
  type PlanFiltersInput,
} from "./filterInputMapper.js";
import { fieldSupportedNow } from "../../lib/filters/registry.js";

/**
 * Must match your SDL:
 *
 * enum FilterExecutionMode {
 *   FAST_ONLY
 *   SNAPSHOT
 * }
 */
type FilterExecutionMode = "FAST_ONLY" | "SNAPSHOT";

/**
 * input PlanFilterInput {
 *   filter: PlanFiltersInput!
 * }
 */
interface PlanFilterInput {
  filter: PlanFiltersInput;
}

/**
 * type PlanFilterPayload {
 *   planHash: String!
 *   executionMode: FilterExecutionMode!
 *   filterSummary: String
 * }
 */
interface PlanFilterPayload {
  planHash: string;
  executionMode: FilterExecutionMode;
  filterSummary: string | null;
}

/**
 * Context – keep it minimal here to avoid circular imports with schema.ts.
 * Your actual Yoga context has at least shopId.
 */
interface GraphQLContext {
  shopId: string;
}

/* ============================================================
   Helpers
   ============================================================ */

/**
 * Flatten all AppliedFilters in the AST so we can inspect used fields.
 */
function collectAllFilters(ast: FilterGroupAst | null): string[] {
  if (!ast) return [];
  const keys = new Set<string>();

  function walk(node: FilterGroupAst) {
    for (const clause of node.clauses) {
      keys.add(clause.key);
    }
    for (const child of node.groups) {
      walk(child);
    }
  }

  walk(ast);
  return Array.from(keys);
}

/**
 * Decide execution mode:
 * - FAST_ONLY  → all fields are supportedNow
 * - SNAPSHOT  → at least one field is NOT supportedNow
 */
function decideExecutionMode(ast: FilterGroupAst | null): FilterExecutionMode {
  if (!ast) {
    return "FAST_ONLY";
  }

  const keys = collectAllFilters(ast);
  if (keys.length === 0) {
    return "FAST_ONLY";
  }

  const hasUnsupported = keys.some((key) => !fieldSupportedNow(key));
  return hasUnsupported ? "SNAPSHOT" : "FAST_ONLY";
}

/**
 * Very simple deterministic hash of the filter AST.
 * No external libs; stable enough for planHash usage.
 */
function computePlanHash(ast: FilterGroupAst | null): string {
  const json = JSON.stringify(ast ?? null);
  let hash = 0;
  for (let i = 0; i < json.length; i += 1) {
    const chr = json.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // convert to 32-bit int
  }
  // encode as hex string with a prefix so it's obvious what it is
  return `pf_${(hash >>> 0).toString(16)}`;
}

/**
 * Human-readable summary of the filter plan.
 */
function summarizeFilters(ast: FilterGroupAst | null): string {
  if (!ast) return "No filters";

  let clauseCount = 0;
  let groupCount = 0;

  function walk(node: FilterGroupAst) {
    clauseCount += node.clauses.length;
    groupCount += 1;
    for (const child of node.groups) {
      walk(child);
    }
  }

  walk(ast);

  const parts: string[] = [];
  parts.push(`${clauseCount} filter${clauseCount === 1 ? "" : "s"}`);
  parts.push(`${groupCount} group${groupCount === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/* ============================================================
   Resolver
   ============================================================ */

/**
 * Resolver for:
 *
 *   planFilter(input: PlanFilterInput!): PlanFilterPayload!
 */
export const planFilterResolver: GraphQLFieldResolver<
  unknown,
  GraphQLContext,
  { input: PlanFilterInput }
> = async (_parent, { input }, _ctx): Promise<PlanFilterPayload> => {
  const filtersInput = input.filter;

  // Normalize GraphQL input → internal AST
  const ast = mapPlanFiltersInputToAst(filtersInput);

  const executionMode = decideExecutionMode(ast);
  const planHash = computePlanHash(ast);
  const filterSummary = summarizeFilters(ast);

  return {
    planHash,
    executionMode,
    filterSummary,
  };
};
