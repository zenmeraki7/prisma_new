// web/frontend/pages/products/useProductQuery.ts

import { useInfiniteQuery } from "@tanstack/react-query";
import type { AppBridgeState } from "@shopify/app-bridge-react";
import { productsByFilterRequest } from "../../queries/productsByFilter";

export type ExecutionMode = "FAST" | "SNAPSHOT";

export function useProductQuery(
  app: AppBridgeState | undefined,
  params: {
    filterExpr: unknown;
    sort?: { field: string; direction: "asc" | "desc" };
  },
) {
  return useInfiniteQuery({
    enabled: !!app,
    queryKey: ["productsByFilter", params.filterExpr, params.sort],
    initialPageParam: null as string | null,

    queryFn: async ({ pageParam }) => {
      if (!app) throw new Error("AppBridge not ready");

      return productsByFilterRequest(app, {
        first: 50,
        after: pageParam,
        filter: params.filterExpr,
        sort: params.sort,
      });
    },

    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  });
}
