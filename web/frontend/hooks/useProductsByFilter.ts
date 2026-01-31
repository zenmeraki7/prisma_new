// web/frontend/hooks/useProductsByFilter.ts
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { ProductLiteDto } from "../queries/bootstrapProducts";

export type FilterMode = "FAST_ONLY" | "SNAPSHOT";

export interface ProductsByFilterInput {
  filter: any;
  mode: FilterMode;
  first?: number;
}

export interface ProductsByFilterPage {
  items: ProductLiteDto[];
  nextCursor: string | null;
  planHash: string | null;
}

/**
 * Fetches products using filter with optional snapshot mode
 */
export function useProductsByFilter(input: ProductsByFilterInput | null) {
  const app = useAppBridge();

  return useInfiniteQuery({
    queryKey: ["productsByFilter", input],
    enabled: !!app && !!input?.filter,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      if (!app) throw new Error("AppBridge not ready");
      if (!input) throw new Error("No filter input provided");

      // Get session token
      const token = await app.idToken();

      // Make request to your GraphQL endpoint
      const response = await fetch("/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `
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
          `,
          variables: {
            input: {
              filter: input.filter,
              mode: input.mode,
              first: input.first ?? 50,
              after: pageParam,
            },
          },
        }),
      });

      const json = await response.json();

      if (json.errors) {
        throw new Error(json.errors[0]?.message ?? "GraphQL error");
      }

      return json.data.productsByFilter as ProductsByFilterPage;
    },
    getNextPageParam: (lastPage: ProductsByFilterPage) => 
      lastPage.nextCursor ?? null,
  });
}