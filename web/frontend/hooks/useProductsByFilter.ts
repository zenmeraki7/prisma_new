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
  totalMatched: number;
  shownCount: number;
  pageSize: number;
  hasMore: boolean;
  limited: boolean;
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
  guardrail: FilterGuardrailInfo | null;
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
        totalMatched
        shownCount
        pageSize
        hasMore
        limited
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
  const {
    requestKey = 0,
    filterExpr,
    snapshotRunId,
    pageSize = 50,
    enabled = true,
  } = options;

  const filterKey = useMemo(
    () => JSON.stringify(filterExpr ?? null),
    [filterExpr],
  );

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
    queryKey: [
      "productsByFilter",
      requestKey,
      pageSize,
      snapshotRunId ?? null,
      filterKey,
    ],
    enabled,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    queryFn: async ({ pageParam }) => {
      const payload = {
        ...baseInput,
        after: (pageParam as string | null) ?? null,
      };

      const response = await graphqlRequest<{
        productsByFilter: ProductsByFilterPage;
      }>(PRODUCTS_BY_FILTER_QUERY, { input: payload });

      return response.productsByFilter;
    },
  });

  const pages = query.data?.pages ?? [];
  const items: ProductLiteNode[] = pages.flatMap((p) => p.items);
  const lastPage = pages.length > 0 ? pages[pages.length - 1] : undefined;

  const mergedGuardrail: FilterGuardrailInfo | null = useMemo(() => {
    if (!pages.length) return null;

    const firstNonNullGuardrail =
      pages.find((p) => p.guardrail != null)?.guardrail ?? null;

    if (!firstNonNullGuardrail) return null;

    return {
      totalMatched: firstNonNullGuardrail.totalMatched ?? items.length,
      shownCount: items.length,
      pageSize: firstNonNullGuardrail.pageSize ?? pageSize,
      hasMore: Boolean(lastPage?.nextCursor),
      limited:
        typeof firstNonNullGuardrail.limited === "boolean"
          ? firstNonNullGuardrail.limited
          : Boolean(lastPage?.nextCursor),
    };
  }, [pages, items.length, pageSize, lastPage?.nextCursor]);

  const mergedWarnings = useMemo(() => {
    const all = pages.flatMap((p) => p.warnings ?? []);
    return [...new Set(all)];
  }, [pages]);

  return {
    items,
    mode: lastPage?.mode ?? "AUTO",
    guardrail: mergedGuardrail,
    warnings: mergedWarnings,
    hasNextPage: query.hasNextPage,
    loadMore: query.fetchNextPage,
    loading: query.isLoading,
    loadingMore: query.isFetchingNextPage,
    error: query.error,
  };
}