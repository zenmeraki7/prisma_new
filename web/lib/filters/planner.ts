// FILE: web/lib/filters/planner.ts

import type { Prisma } from "@prisma/client";
import type { FilterExpr } from "../../frontend/lib/filters/dsl";
import {
  compileFastWhere,
  type FastCompilerContext,
} from "./fastCompiler";
import {
  compileSnapshotWhere,
  type SnapshotCompilerContext,
} from "./snapshotCompiler";
import { FILTER_REGISTRY } from "./registry";

// ---------------------------------------------------------
// Public Types
// ---------------------------------------------------------

export interface PlannerResult {
  fastQuery: Prisma.ProductLiteWhereInput;
  snapshotQuery: Prisma.SnapshotProductWhereInput;
  meta: {
    fastFiltersCount: number;
    snapshotFiltersCount: number;
    astDepth: number;
  };
}

export interface PlannerContext {
  shopId: string;
  /**
   * Optional for analysis / FAST-only resolvers.
   * If omitted and snapshot filters are present:
   *  - meta.snapshotFiltersCount is still correct
   *  - snapshotQuery stays {}
   *  - Caller is expected to act on meta (e.g. error or fallback)
   */
  snapshotRunId?: string | bigint;
}

// ---------------------------------------------------------
// Core Engine
// ---------------------------------------------------------

export const FilterPlanner = {
  /**
   * Main entry point.
   *
   * - Splits the AST into FAST and SNAPSHOT subtrees.
   * - Always compiles FAST subtree.
   * - Compiles SNAPSHOT subtree **only if** snapshotRunId is provided.
   *
   * This lets you:
   *   - Use it in FAST-only endpoints (no snapshotRunId) just to see
   *     whether any snapshot filters exist (via meta).
   *   - Use it in HYBRID endpoints (productsByFilter) to fully compile both.
   */
  plan(expr: FilterExpr | null, ctx: PlannerContext): PlannerResult {
    const meta = {
      fastFiltersCount: 0,
      snapshotFiltersCount: 0,
      astDepth: 0,
    };

    // 1. Split AST (FAST vs SNAPSHOT)
    const { fastExpr, snapshotExpr, depth } = splitAst(expr);
    meta.astDepth = depth;

    meta.fastFiltersCount = countLeaves(fastExpr);
    meta.snapshotFiltersCount = countLeaves(snapshotExpr);

    // 2. Compile FAST query (always)
    const fastCtx: FastCompilerContext = { shopId: ctx.shopId };
    const fastQuery = compileFastWhere(fastExpr, fastCtx);

    // 3. Compile SNAPSHOT query (only if we have runId + expr)
    let snapshotQuery: Prisma.SnapshotProductWhereInput = {};

    if (snapshotExpr && ctx.snapshotRunId != null) {
      const snapCtx: SnapshotCompilerContext = {
        shopId: ctx.shopId,
        snapshotRunId: ctx.snapshotRunId,
      };
      snapshotQuery = compileSnapshotWhere(snapshotExpr, snapCtx);
    }

    // NOTE:
    // - If snapshotExpr exists but snapshotRunId is missing, snapshotQuery
    //   remains {} and meta.snapshotFiltersCount > 0.
    // - Callers like fastProducts can enforce FAST-only via meta, without
    //   touching snapshotQuery at all.

    return {
      fastQuery,
      snapshotQuery,
      meta,
    };
  },
};

// ---------------------------------------------------------
// AST Splitter
// ---------------------------------------------------------

interface SplitResult {
  fastExpr: FilterExpr | null;
  snapshotExpr: FilterExpr | null;
  depth: number;
}

function splitAst(expr: FilterExpr | null, currentDepth = 1): SplitResult {
  if (!expr) {
    return { fastExpr: null, snapshotExpr: null, depth: currentDepth };
  }

  if (expr.kind === "group") {
    const fastChildren: FilterExpr[] = [];
    const snapshotChildren: FilterExpr[] = [];
    let maxChildDepth = currentDepth;

    for (const child of expr.children) {
      const result = splitAst(child, currentDepth + 1);

      if (result.fastExpr) fastChildren.push(result.fastExpr);
      if (result.snapshotExpr) snapshotChildren.push(result.snapshotExpr);

      maxChildDepth = Math.max(maxChildDepth, result.depth);
    }

    let fastExpr: FilterExpr | null = null;
    if (fastChildren.length > 0) {
      if (expr.op === "NOT") {
        fastExpr = { kind: "group", op: "NOT", children: [fastChildren[0]] };
      } else {
        fastExpr = { kind: "group", op: expr.op, children: fastChildren };
      }
    }

    let snapshotExpr: FilterExpr | null = null;
    if (snapshotChildren.length > 0) {
      if (expr.op === "NOT") {
        snapshotExpr = {
          kind: "group",
          op: "NOT",
          children: [snapshotChildren[0]],
        };
      } else {
        snapshotExpr = {
          kind: "group",
          op: expr.op,
          children: snapshotChildren,
        };
      }
    }

    return { fastExpr, snapshotExpr, depth: maxChildDepth };
  }

  // field / leaf
  if (expr.kind === "field") {
    const def = FILTER_REGISTRY[expr.key];
    if (!def) {
      console.warn(`[FilterPlanner] Dropping unknown filter key "${expr.key}"`);
      return { fastExpr: null, snapshotExpr: null, depth: currentDepth };
    }

    if (def.db.plane === "FAST") {
      return { fastExpr: expr, snapshotExpr: null, depth: currentDepth };
    } else {
      return { fastExpr: null, snapshotExpr: expr, depth: currentDepth };
    }
  }

  return { fastExpr: null, snapshotExpr: null, depth: currentDepth };
}

// ---------------------------------------------------------
// Utils
// ---------------------------------------------------------

function countLeaves(expr: FilterExpr | null): number {
  if (!expr) return 0;
  if (expr.kind === "field") return 1;
  return expr.children.reduce((acc, child) => acc + countLeaves(child), 0);
}
