import type { AppBridgeState } from "@shopify/app-bridge-react";
import { graphqlRequest } from "../../lib/graphqlClient";
import type { ProductLiteDto } from "../types/product";

/* -----------------------------
   Execution plan types
----------------------------- */

export type ExecutionMode = "FAST" | "SNAPSHOT";

export type PlanExplain = {
  code:
    | "UNSUPPORTED_FAST_FILTER"
    | "VARIANT_LEVEL_FILTER"
    | "FULL_TEXT_SEARCH"
    | "SORT_NOT_INDEXED";
  filterId?: string;
  field?: string;
  detail?: string;
};

/* -----------------------------
   DTO
----------------------------- */

export type ProductsByFilterPageDto = {
  planHash: string;
  executionMode: ExecutionMode;
  explain: PlanExplain[];

  items: ProductLiteDto[];
  nextCursor: string | null;
};

/* -----------------------------
   GraphQL
----------------------------- */

type ProductsByFilterResponse = {
  productsByFilter: ProductsByFilterPageDto;
};

const PRODUCTS_BY_FILTER_QUERY = /* GraphQL */ `
  query ProductsByFilter($input: ProductsByFilterInput!) {
    productsByFilter(input: $input) {
      planHash
      executionMode
      explain {
        code
        filterId
        field
        detail
      }
      items {
        id
        title
        handle
        status
        vendor
        productType
        tags
        hasImages
        updatedAtShopify
      }
      nextCursor
    }
  }
`;

/* -----------------------------
   Request
----------------------------- */

type ProductsByFilterRequestParams = {
  first: number;
  after?: string | null;

  /**
   * FilterExpr JSON AST produced by buildFilterExpr
   */
  filter?: unknown;

  /**
   * Optional sort (planner-aware)
   */
  sort?: {
    field: string;
    direction: "asc" | "desc";
  };
};

export async function productsByFilterRequest(
  app: AppBridgeState,
  params: ProductsByFilterRequestParams,
): Promise<ProductsByFilterPageDto> {
  const res = await graphqlRequest<ProductsByFilterResponse>(
    app,
    PRODUCTS_BY_FILTER_QUERY,
    {
      input: {
        first: params.first,
        after: params.after ?? null,
        filter: params.filter ?? null,
        sort: params.sort ?? null,
      },
    },
  );

  return res.productsByFilter;
}
