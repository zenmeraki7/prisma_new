// FILE: web/lib/filters/planner.ts

import type { Prisma } from "@prisma/client";
import type { FilterExpr } from "../../frontend/lib/filters/dsl";
import {
  compileFastWhere,
  type FastCompilerContext,
} from "./fastCompiler";
import { FILTER_REGISTRY } from "./registry";

// ---------------------------------------------------------
// Public Types
// ---------------------------------------------------------

export interface PlannerResult {
  fastQuery: Prisma.ProductLiteWhereInput;
  meta: {
    fastFiltersCount: number;
    astDepth: number;
  };
}

export interface PlannerContext {
  shopId: string;
}

// ---------------------------------------------------------
// Core Engine
// ---------------------------------------------------------

export const FilterPlanner = {
  /**
   * FAST-only planner.
   *
   * - Validates/keeps only FAST-plane filters.
   * - Compiles FAST subtree into Prisma ProductLiteWhereInput.
   * - Returns simple metadata for debugging / UI.
   */
  plan(expr: FilterExpr | null, ctx: PlannerContext): PlannerResult {
    const { fastExpr, depth } = extractFastAst(expr);

    const meta = {
      fastFiltersCount: countLeaves(fastExpr),
      astDepth: depth,
    };

    const fastCtx: FastCompilerContext = { shopId: ctx.shopId };
    const fastQuery = compileFastWhere(fastExpr, fastCtx);

    return {
      fastQuery,
      meta,
    };
  },
};

// ---------------------------------------------------------
// FAST AST extractor
// ---------------------------------------------------------

interface ExtractFastResult {
  fastExpr: FilterExpr | null;
  depth: number;
}

function extractFastAst(
  expr: FilterExpr | null,
  currentDepth = 1,
): ExtractFastResult {
  if (!expr) {
    return { fastExpr: null, depth: currentDepth };
  }

  if (expr.kind === "group") {
    const fastChildren: FilterExpr[] = [];
    let maxChildDepth = currentDepth;

    for (const child of expr.children) {
      const result = extractFastAst(child, currentDepth + 1);

      if (result.fastExpr) {
        fastChildren.push(result.fastExpr);
      }

      maxChildDepth = Math.max(maxChildDepth, result.depth);
    }

    let fastExpr: FilterExpr | null = null;

    if (fastChildren.length > 0) {
      if (expr.op === "NOT") {
        fastExpr = {
          kind: "group",
          op: "NOT",
          children: [fastChildren[0]],
        };
      } else {
        fastExpr = {
          kind: "group",
          op: expr.op,
          children: fastChildren,
        };
      }
    }

    return { fastExpr, depth: maxChildDepth };
  }

  if (expr.kind === "field") {
    const def = FILTER_REGISTRY[expr.key];

    if (!def) {
      console.warn(`[FilterPlanner] Dropping unknown filter key "${expr.key}"`);
      return { fastExpr: null, depth: currentDepth };
    }

    if (def.db.plane !== "FAST") {
      console.warn(
        `[FilterPlanner] Dropping non-FAST filter key "${expr.key}" from FAST-only planner`,
      );
      return { fastExpr: null, depth: currentDepth };
    }

    return { fastExpr: expr, depth: currentDepth };
  }

  return { fastExpr: null, depth: currentDepth };
}

// ---------------------------------------------------------
// Utils
// ---------------------------------------------------------

function countLeaves(expr: FilterExpr | null): number {
  if (!expr) return 0;
  if (expr.kind === "field") return 1;
  return expr.children.reduce((acc, child) => acc + countLeaves(child), 0);
}