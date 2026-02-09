// FILE: web/graphql/filtering/planFilterResolver.ts

import type { GraphQLContext } from "../schema.js";
import { astFromJson } from "../../lib/filters/astFromJson.js";
import {
  analyzeFilterExpr,
  type FilterExecutionMode,
} from "../../lib/filters/planner.js";
import type { FilterExpr } from "../../frontend/lib/filters/dsl.js";

type PlanFilterArgs = {
  input: {
    filter: unknown;            // JSON tree from client
  };
};

type PlanFilterPayload = {
  mode: FilterExecutionMode;
  fastFiltersCount: number;
  snapshotFiltersCount: number;
  astDepth: number;
  warnings: string[];
};

export async function planFilterResolver(
  _parent: unknown,
  args: PlanFilterArgs,
  _ctx: GraphQLContext,
): Promise<PlanFilterPayload> {
  const { filter: rawFilter } = args.input;

  let expr: FilterExpr | null;
  try {
    expr = astFromJson(rawFilter);
  } catch (err) {
    // For planning we surface the error directly – this is a user-facing "your filter is invalid"
    throw new Error(`Invalid filter AST: ${(err as Error).message}`);
  }

  const {
    fastFiltersCount,
    snapshotFiltersCount,
    astDepth,
    recommendedMode,
  } = analyzeFilterExpr(expr);

  const warnings: string[] = [];

  if (snapshotFiltersCount > 0) {
    warnings.push(
      "Snapshot-plane filters detected. Execution may require a precomputed snapshot run.",
    );
  }

  if (astDepth > 5) {
    warnings.push(
      "Filter tree is very deep; consider simplifying complex AND/OR/NOT nesting.",
    );
  }

  return {
    mode: recommendedMode,
    fastFiltersCount,
    snapshotFiltersCount,
    astDepth,
    warnings,
  };
}
