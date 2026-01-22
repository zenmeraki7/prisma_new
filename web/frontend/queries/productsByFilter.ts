// web/frontend/queries/productsByFilter.ts
import { graphqlRequest } from "../../lib/graphqlClient";
import type { AppBridgeState } from "@shopify/app-bridge-react";
import type { FilterExpr } from "../../lib/filters/dsl";
import type { ProductLiteDto } from "../types/product";
import type { FilterExecutionMode } from "./planFilter";

export type ProductsByFilterPageDto = {
  items: ProductLiteDto[];
  nextCursor: string | null;
  planHash?: string | null;
};

export type ProductsByFilterResponse = {
  productsByFilter: ProductsByFilterPageDto;
};

const PRODUCTS_BY_FILTER_QUERY = `
  query ProductsByFilter($input: ProductsByFilterInput!) {
    productsByFilter(input: $input) {
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
      planHash
    }
  }
`;

export async function productsByFilterRequest(
  app: AppBridgeState,
  params: {
    filter: FilterExpr | null;
    mode: FilterExecutionMode;
    first: number;
    after?: string | null;
  }
): Promise<ProductsByFilterPageDto> {
  const input = {
    filter:
      params.filter ?? { type: "group", op: "and" as const, children: [] },
    mode: params.mode,
    first: params.first,
    after: params.after ?? null,
  };

  const res = await graphqlRequest<ProductsByFilterResponse>(
    app,
    PRODUCTS_BY_FILTER_QUERY,
    { input }
  );

  return res.productsByFilter;
}
export { ProductLiteDto }; // if using regular `type` export
