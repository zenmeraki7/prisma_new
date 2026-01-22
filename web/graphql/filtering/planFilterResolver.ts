// web/graphql/filtering/planFilterResolver.ts

import crypto from "crypto";
import type { FilterExpr, FilterLeafExpr } from "../../lib/filters/dsl.js";
import { FILTER_REGISTRY, getFilterDef, type FilterRegistry } from "../../lib/filters/registry.js";

type FilterExecutionMode = "FAST_ONLY" | "SNAPSHOT";

type PlanFilterArgs = {
  input: {
    filter: any; // JSON from GraphQL
  };
};

type GraphQLContext = {
  shopId: string;
};

// Bump this if you change registry semantics in a breaking way.
const REGISTRY_VERSION = "v1";

export async function planFilterResolver(
  _parent: unknown,
  args: PlanFilterArgs,
  _ctx: GraphQLContext
) {
  const raw = args.input?.filter;
  if (!raw || typeof raw !== "object") {
    throw new Error("planFilter: input.filter must be a non-null JSON object.");
  }

  const expr = raw as FilterExpr;

  // Validate against registry + detect planes
  const { mode, filterSummary } = analyzeFilter(expr, FILTER_REGISTRY);

  const planHash = computePlanHash(expr, mode, REGISTRY_VERSION);

  return {
    planHash,
    executionMode: mode,
    filterSummary,
  };
}

/* =======================================================================
 * ANALYSIS
 * ==================================================================== */

function analyzeFilter(expr: FilterExpr, registry: FilterRegistry): {
  mode: FilterExecutionMode;
  filterSummary: string;
} {
  const leafPlanes: ("FAST" | "SNAPSHOT")[] = [];
  const parts: string[] = [];

  traverse(expr, (leaf) => {
    const def = getFilterDef(leaf.filterId);
    leafPlanes.push(def.plane);
    parts.push(renderLeaf(def.label, leaf));
  });

  const hasSnapshot = leafPlanes.some((p) => p === "SNAPSHOT");
  const mode: FilterExecutionMode = hasSnapshot ? "SNAPSHOT" : "FAST_ONLY";

  const filterSummary =
    parts.length === 0 ? "No filter (match all products)" : parts.join(" ∧ ");

  return { mode, filterSummary };
}

function traverse(expr: FilterExpr, visitLeaf: (leaf: FilterLeafExpr) => void) {
  if (expr.type === "leaf") {
    visitLeaf(expr);
    return;
  }
  if (!expr.children || expr.children.length === 0) return;
  for (const child of expr.children) {
    traverse(child as FilterExpr, visitLeaf);
  }
}

function renderLeaf(label: string, leaf: FilterLeafExpr): string {
  const op = leaf.op;
  const v = leaf.value;

  if (op === "is_set") return `${label} is set`;
  if (op === "is_not_set") return `${label} is not set`;

  const vStr =
    v === undefined || v === null
      ? "null"
      : Array.isArray(v)
      ? JSON.stringify(v)
      : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);

  return `${label} ${op} ${vStr}`;
}

/* =======================================================================
 * PLAN HASH
 * ==================================================================== */

function computePlanHash(
  expr: FilterExpr,
  mode: FilterExecutionMode,
  registryVersion: string
): string {
  const payload = JSON.stringify({
    registryVersion,
    mode,
    filter: expr,
  });

  const hash = crypto.createHash("sha256");
  hash.update(payload);
  return hash.digest("hex");
}
