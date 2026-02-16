// FILE: web/frontend/pages/ProductsPage.tsx

import React from "react";
import { Page, Layout, Card, BlockStack } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

import type { FilterExpr } from "../lib/filters/dsl";
import { andGroup, field } from "../lib/filters/dsl";

import { useProductsByFilter } from "../hooks/useProductsByFilter";
import { ProductIndexTable } from "../components/ProductIndexTable";
import { FilterExecutionAlert } from "../components/FilterExecutionAlert";

import type { DraftFilter } from "../components/ProductsFilterBar";
import { ProductsFilterBar } from "../components/ProductsFilterBar";

import { useFastPlaneSync } from "../queries/syncProductsToDb";

export const ProductsPage: React.FC = () => {
  const app = useAppBridge();

  const [draftFilters, setDraftFilters] = React.useState<DraftFilter[]>([]);
  const [searchText, setSearchText] = React.useState<string>("");

  const [appliedExpr, setAppliedExpr] = React.useState<FilterExpr | null>(null);
  const [requestKey, setRequestKey] = React.useState(0);

  const buildExprFrom = React.useCallback(
    (search: string, filters: DraftFilter[]): FilterExpr | null => {
      const leaves: FilterExpr[] = [];

      const s = (search ?? "").trim();
      if (s) {
        // ✅ backend expands product.search across title/vendor/handle/type/tags
        leaves.push(field("product.search" as any, "CONTAINS" as any, s));
      }

      for (const f of Array.isArray(filters) ? filters : []) {
        leaves.push(field(f.key as any, f.op as any, f.value));
      }

      return leaves.length ? andGroup(leaves) : null;
    },
    [],
  );

  /**
   * ✅ SEARCH APPLY (single click)
   * We accept nextSearch so we never read stale state.
   */
  const onApplySearch = React.useCallback(
    (nextSearch: string) => {
      setSearchText(nextSearch);
      setAppliedExpr(buildExprFrom(nextSearch, draftFilters));
      setRequestKey((x) => x + 1);
    },
    [buildExprFrom, draftFilters],
  );

  /**
   * ✅ SEARCH RESET ONLY
   */
  const onResetSearchOnly = React.useCallback(() => {
    const nextSearch = "";
    setSearchText(nextSearch);
    setAppliedExpr(buildExprFrom(nextSearch, draftFilters));
    setRequestKey((x) => x + 1);
  }, [buildExprFrom, draftFilters]);

  /**
   * ✅ FILTERS APPLY IMMEDIATELY
   */
  const onDraftFiltersChangeApplyNow = React.useCallback(
    (next: DraftFilter[]) => {
      const safe = Array.isArray(next) ? next : [];
      setDraftFilters(safe);

      // compute from NEXT filters (no stale)
      setAppliedExpr(buildExprFrom(searchText, safe));
      setRequestKey((x) => x + 1);
    },
    [buildExprFrom, searchText],
  );

  const fetchSuggestions = React.useCallback(async (key: string, q: string) => {
    const resp = await fetch("/api/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query FilterSuggestions($input: FilterSuggestionsInput!) {
            filterSuggestions(input: $input)
          }
        `,
        variables: { input: { key, q, limit: 10 } },
      }),
    });

    if (!resp.ok) return [];
    const json = await resp.json();
    return (json?.data?.filterSuggestions || []) as string[];
  }, []);

  const {
    items,
    mode,
    guardrail,
    warnings,
    hasNextPage,
    loadMore,
    loading,
    loadingMore,
    error,
  } = useProductsByFilter({
    requestKey,
    filterExpr: appliedExpr,
    pageSize: 50,
    enabled: true,
  });

  const syncMutation = useFastPlaneSync(app as any);

  return (
    <Page
      title="Products"
      subtitle="Search, filter and bulk edit your catalog"
      fullWidth
      primaryAction={{
        content: "Sync from Shopify",
        onAction: () => syncMutation.mutate(),
        loading: syncMutation.isPending,
        disabled: syncMutation.isPending || loading,
      }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <ProductsFilterBar
              searchText={searchText}
              onSearchTextChange={setSearchText}
              onApplySearch={onApplySearch}
              onResetSearch={onResetSearchOnly}
              loading={loading}
              draftFilters={draftFilters}
              onDraftFiltersChange={onDraftFiltersChangeApplyNow}
              fetchSuggestions={fetchSuggestions}
            />

            <div style={{ padding: 16 }}>
              <FilterExecutionAlert mode={mode} guardrail={guardrail} warnings={warnings} />
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {error ? (
            <Card>
              <BlockStack gap="200">
                <div style={{ color: "var(--p-color-text-critical)" }}>
                  {(error as Error).message}
                </div>
              </BlockStack>
            </Card>
          ) : (
            <ProductIndexTable
              products={items}
              loading={loading && items.length === 0}
              hasNextPage={Boolean(hasNextPage)}
              onLoadMore={() => loadMore()}
            />
          )}

          {loadingMore && items.length > 0 && (
            <div style={{ paddingTop: 12, textAlign: "center" }}>Loading more…</div>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default ProductsPage;
