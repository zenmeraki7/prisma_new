// web/graphql/filtering/planFilterResolver.ts
import type { FilterExpr } from "../../lib/filters/dsl.js";
import {
  FILTER_REGISTRY,
  type FilterRegistry,
  type FilterDefinition,
} from "../../lib/filters/registry.js";
import { astFromJson } from "../../lib/filters/astFromJson.js";

export type FilterExecutionMode = "FAST_ONLY" | "SNAPSHOT";

type PlanFilterArgs = {
  input: {
    filter: unknown; // JSON from client
  };
};

// Context shape (matches GraphQLContext in schema.ts for what we use here)
type Context = {
  shopId: string;
};

export async function planFilterResolver(
  _parent: unknown,
  args: PlanFilterArgs,
  _ctx: Context,
) {
  // Parse JSON → FilterExpr
  const expr: FilterExpr | null = astFromJson(args.input.filter);

  // Decide FAST vs SNAPSHOT based on registry
  const executionMode: FilterExecutionMode =
    expr && expressionUsesSnapshot(expr, FILTER_REGISTRY)
      ? "SNAPSHOT"
      : "FAST_ONLY";

  // Compute deterministic hash of the AST (non-crypto)
  const planHash = expr ? computePlanHash(expr) : "default";

  // Produce a human-readable summary
  const filterSummary = expr
    ? summarizeFilter(expr, FILTER_REGISTRY)
    : "No filter";

  return {
    planHash,
    executionMode,
    filterSummary,
  };
}

/* ---------------- internal helpers ---------------- */

function expressionUsesSnapshot(
  expr: FilterExpr,
  registry: FilterRegistry,
): boolean {
  if (expr.type === "group") {
    return expr.children.some((child) =>
      expressionUsesSnapshot(child, registry),
    );
  }

  const def: FilterDefinition | undefined = registry[expr.filterId];
  if (!def) return false;
  return def.plane === "SNAPSHOT";
}

function computePlanHash(expr: FilterExpr): string {
  const json = JSON.stringify(expr);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash * 31 + json.charCodeAt(i)) | 0;
  }
  // Unsigned and hex
  return `p_${(hash >>> 0).toString(16)}`;
}

function summarizeFilter(
  expr: FilterExpr,
  registry: FilterRegistry,
): string {
  const parts: string[] = [];
  collectSummary(expr, registry, parts);
  return parts.length ? parts.join(" · ") : "No filter";
}

function collectSummary(
  expr: FilterExpr,
  registry: FilterRegistry,
  parts: string[],
): void {
  if (expr.type === "group") {
    expr.children.forEach((c) => collectSummary(c, registry, parts));
    return;
  }

  const def = registry[expr.filterId];
  const label = def?.label ?? expr.filterId;
  parts.push(label);
}
