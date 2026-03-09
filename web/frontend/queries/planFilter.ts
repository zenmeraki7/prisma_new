// web/frontend/queries/planFilter.ts
import { graphqlRequest } from "../../lib/graphqlClient";
import type { AppBridgeState } from "@shopify/app-bridge-react";
import type { FilterExpr } from "../lib/filters/dsl";

export type FilterExecutionMode = "FAST_ONLY" | "SNAPSHOT";

export type PlanFilterResponse = {
  planFilter: {
    planHash: string;
    executionMode: FilterExecutionMode;
    filterSummary?: string | null;
  };
};

const PLAN_FILTER_QUERY = `
  query PlanFilter($input: PlanFilterInput!) {
    planFilter(input: $input) {
      planHash
      executionMode
      filterSummary
    }
  }
`;

export async function planFilterRequest(
  app: AppBridgeState,
  filter: FilterExpr | null
): Promise<PlanFilterResponse["planFilter"]> {
  const input = {
    filter: filter ?? { type: "group", op: "and", children: [] },
  };

  const res = await graphqlRequest<PlanFilterResponse>(app, PLAN_FILTER_QUERY, {
    input,
  });

  return res.planFilter;
}
