// web/frontend/hooks/useBootstrapProducts.ts
import { useInfiniteQuery, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { AppBridgeState } from "@shopify/app-bridge-react";

import {
  bootstrapProductsRequest,
  type BootstrapProductsPageDto,
} from "../queries/bootstrapProducts";

/**
 * Central FAST-plane products fetcher.
 *
 * - Fetches ProductLiteDto pages via bootstrapProductsRequest
 * - Supports a simple "search" string that backend may use
 */
export function useBootstrapProducts(
  search: string | null,
): UseInfiniteQueryResult<BootstrapProductsPageDto, Error> {
  const app = useAppBridge() as AppBridgeState | undefined;

  return useInfiniteQuery<
    BootstrapProductsPageDto,
    Error,
    BootstrapProductsPageDto,
    ["bootstrapProducts", { search: string | null }],
    string | null
  >({
    queryKey: ["bootstrapProducts", { search }],
    enabled: !!app, // do nothing until AppBridge is ready
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
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
