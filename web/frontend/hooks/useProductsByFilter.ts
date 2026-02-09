import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { graphqlRequest } from "../../utils/graphqlClient";
import type { FilterExpr } from "../lib/filters/dsl";

export type FilterExecutionMode =
  | "AUTO"
  | "FAST_ONLY"
  | "SNAPSHOT_ONLY"
  | "HYBRID";

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
  updatedAtShopify: string;
  totalInventory: number | null;
  variantCount: number | null;
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
      updatedAtShopify
      totalInventory
      variantCount
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
  filterExpr: FilterExpr | null;
  snapshotRunId?: string | null;
  pageSize?: number;
  enabled?: boolean;
}

export function useProductsByFilter(options: UseProductsByFilterOptions) {
  const { filterExpr, snapshotRunId, pageSize = 50, enabled = true } = options;

  const queryInput = useMemo(
    () => ({
      filter: filterExpr,
      mode: "AUTO" as const,
      first: pageSize,
      snapshotRunId: snapshotRunId ?? undefined,
    }),
    [filterExpr, pageSize, snapshotRunId]
  );

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
  } = useInfiniteQuery<ProductsByFilterPage>({
    queryKey: ["productsByFilter", queryInput],
    enabled,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    queryFn: async ({ pageParam }) => {
      const payload = { ...queryInput, after: (pageParam as string) ?? null };
      const response = await graphqlRequest<{ productsByFilter: ProductsByFilterPage }>(
        PRODUCTS_BY_FILTER_QUERY,
        { input: payload }
      );
      return response.productsByFilter;
    },
    placeholderData: (prev) => prev,
  });

  const items: ProductLiteNode[] = data?.pages.flatMap((p) => p.items) ?? [];

  const lastPage = data?.pages[data.pages.length - 1];

  // Safely read mode, guardrail, warnings from last page
  const mode: FilterExecutionMode = lastPage?.mode ?? "AUTO";
  const guardrail: FilterGuardrailInfo | null = lastPage?.guardrail ?? null;
  const warnings: string[] = lastPage?.warnings ?? [];

  return {
    // Data
    items,

    // Execution meta
    mode,
    guardrail,
    warnings,

    // Pagination
    hasNextPage,
    loadMore: fetchNextPage,

    // Status
    loading: isLoading,
    loadingMore: isFetchingNextPage,
    error,
  };
}
