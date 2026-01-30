// web/frontend/pages/productsPage/useBootstrapProducts.ts
import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type QueryFunctionContext,
} from "@tanstack/react-query";
import type { AppBridgeState } from "@shopify/app-bridge-react";

import {
  bootstrapProductsRequest,
  type BootstrapProductsPageDto,
} from "../../queries/bootstrapProducts";

export function useBootstrapProducts(
  app: AppBridgeState | undefined,
  search: string | null,
): UseInfiniteQueryResult<BootstrapProductsPageDto, Error> {
  return useInfiniteQuery<
    BootstrapProductsPageDto,
    Error,
    BootstrapProductsPageDto,
    ["bootstrapProducts", { search: string | null }],
    string | null
  >({
    queryKey: ["bootstrapProducts", { search }],
    enabled: !!app,
    initialPageParam: null,
    queryFn: async ({
      pageParam,
    }: QueryFunctionContext<
      ["bootstrapProducts", { search: string | null }],
      string | null
    >) => {
      if (!app) throw new Error("AppBridge not ready");

      return bootstrapProductsRequest(app, {
        first: 50,
        after: pageParam ?? null,
        // backend can optionally use this search param
        search: search ?? undefined,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  });
}
