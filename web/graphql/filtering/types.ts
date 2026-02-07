export type PlanExplainReason =
  | {
      code: "UNSUPPORTED_FAST_FILTER";
      filterId: string;
      detail?: string;
    }
  | {
      code: "VARIANT_LEVEL_FILTER";
      filterId: string;
    }
  | {
      code: "FULL_TEXT_SEARCH";
      filterId: string;
    }
  | {
      code: "SORT_NOT_INDEXED";
      field: string;
    };

export type PlannedProductQuery = {
  plan: ProductQueryPlan;
  planHash: string;
  explain: PlanExplainReason[];
};
