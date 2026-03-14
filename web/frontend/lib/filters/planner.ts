// FILE: web/lib/filters/planner.ts

import type { Prisma } from "@prisma/client";
import type { FilterExpr } from "./dsl";
import {
  compileFastWhere,
  type FastCompilerContext,
} from "../../../../web/lib/filters/fastCompiler";

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
  plan(expr: FilterExpr | null, ctx: PlannerContext): PlannerResult {
    const meta = {
      fastFiltersCount: countLeaves(expr),
      astDepth: getAstDepth(expr),
    };

    const fastCtx: FastCompilerContext = { shopId: ctx.shopId };
    const fastQuery = compileFastWhere(expr, fastCtx);

    return {
      fastQuery,
      meta,
    };
  },
};

// ---------------------------------------------------------
// Utils
// ---------------------------------------------------------

function countLeaves(expr: FilterExpr | null): number {
  if (!expr) return 0;
  if (expr.kind === "field") return 1;
  return expr.children.reduce((acc, child) => acc + countLeaves(child), 0);
}

function getAstDepth(expr: FilterExpr | null): number {
  if (!expr) return 0;
  if (expr.kind === "field") return 1;
  if (!expr.children.length) return 1;
  return 1 + Math.max(...expr.children.map(getAstDepth));
}