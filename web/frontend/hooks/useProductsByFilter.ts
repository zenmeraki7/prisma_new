// FILE: web/frontend/hooks/useProductsByFilter.ts
import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { graphqlRequest } from "../../utils/graphqlClient";
import type { FilterExpr } from "../lib/filters/dsl";

export type FilterExecutionMode = "AUTO" | "FAST_ONLY" | "SNAPSHOT_ONLY" | "HYBRID";

export interface FilterGuardrailInfo {
  candidateCount: number;
  candidateLimit: number;
  candidateLimitHit: boolean;
}

export interface ProductLiteNode {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  hasImages: boolean;
  totalInventory: number | null;
  variantCount: number | null;
  updatedAtShopify: string | null;
}

export interface ProductsByFilterPage {
  items: ProductLiteNode[];
  nextCursor: string | null;
  mode: FilterExecutionMode;
  guardrail: FilterGuardrailInfo;
  warnings?: string[];
}

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
        totalInventory
        variantCount
        updatedAtShopify
      }
      nextCursor
      mode
      guardrail {
        candidateCount
        candidateLimit
        candidateLimitHit
      }
      warnings
    }
  }
`;

export interface UseProductsByFilterOptions {
  requestKey?: number;
  filterExpr: FilterExpr | null;
  snapshotRunId?: string | null;
  pageSize?: number;
  enabled?: boolean;
}

export function useProductsByFilter(options: UseProductsByFilterOptions) {
  const { requestKey = 0, filterExpr, snapshotRunId, pageSize = 50, enabled = true } = options;

  const filterKey = useMemo(() => JSON.stringify(filterExpr ?? null), [filterExpr]);

  const baseInput = useMemo(
    () => ({
      filter: filterExpr,
      mode: "AUTO" as const,
      first: pageSize,
      snapshotRunId: snapshotRunId ?? undefined,
    }),
    [filterExpr, pageSize, snapshotRunId],
  );

  const query = useInfiniteQuery<ProductsByFilterPage>({
    queryKey: ["productsByFilter", requestKey, pageSize, snapshotRunId ?? null, filterKey],
    enabled,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    queryFn: async ({ pageParam }) => {
      const payload = { ...baseInput, after: (pageParam as string) ?? null };
      const response = await graphqlRequest<{ productsByFilter: ProductsByFilterPage }>(
        PRODUCTS_BY_FILTER_QUERY,
        { input: payload },
      );
      return response.productsByFilter;
    },

    // ✅ IMPORTANT: remove placeholderData, otherwise UI keeps showing old filtered results
    // placeholderData: (prev) => prev,
  });

  const pages = query.data?.pages ?? [];
  const items: ProductLiteNode[] = pages.flatMap((p) => p.items);
  const lastPage = pages.length ? pages[pages.length - 1] : undefined;

  return {
    items,
    mode: lastPage?.mode ?? "AUTO",
    guardrail: lastPage?.guardrail ?? null,
    warnings: lastPage?.warnings ?? [],
    hasNextPage: query.hasNextPage,
    loadMore: query.fetchNextPage,
    loading: query.isLoading,
    loadingMore: query.isFetchingNextPage,
    error: query.error,
  };
}
