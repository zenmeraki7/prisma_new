// FILE: web/frontend/queries/productsByFilter.ts

import type { AppBridgeState } from "@shopify/app-bridge-react";
import { graphqlRequest } from "../../lib/graphqlClient";
import type { ProductLiteDto } from "../types/product";

export type ProductsByFilterMode = "FAST_ONLY" | "SNAPSHOT" | "HYBRID";

export type ProductsByFilterPageDto = {
  items: ProductLiteDto[];
  nextCursor: string | null;
  mode: ProductsByFilterMode;
};

type ProductsByFilterResponse = {
  productsByFilter: {
    items: ProductLiteDto[];
    nextCursor: string | null;
    mode: ProductsByFilterMode;
  };
};

const PRODUCTS_BY_FILTER_QUERY = /* GraphQL */ `
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
      mode
    }
  }
`;

type ProductsByFilterRequestParams = {
  first: number;
  after?: string | null;
  /**
   * FilterExpr JSON AST produced by buildFilterExpr on the frontend.
   */
  filter?: unknown;
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
        mode: "FAST_ONLY",                 // 👈 IMPORTANT
        first: params.first,
        after: params.after ?? null,
        filter: params.filter ?? null,
      },
    },
  );

  return {
    items: res.productsByFilter.items,
    nextCursor: res.productsByFilter.nextCursor,
    mode: res.productsByFilter.mode,
  };
}
