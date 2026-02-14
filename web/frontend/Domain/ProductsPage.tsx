// FILE: web/frontend/pages/ProductsPage.tsx
import React from "react";
import { Page, Layout, Card, BlockStack, Button } from "@shopify/polaris";

import type { FilterExpr } from "../lib/filters/dsl";
import { andGroup, field } from "../lib/filters/dsl";

import { useProductsByFilter } from "../hooks/useProductsByFilter";
import { ProductIndexTable } from "../components/ProductIndexTable";
import { FilterExecutionAlert } from "../components/FilterExecutionAlert";

import type { DraftFilter } from "../components/ProductsFilterBar";
import { ProductsFilterBar } from "../components/ProductsFilterBar";

export const ProductsPage: React.FC = () => {
  const [searchText, setSearchText] = React.useState("");
  const [draftFilters, setDraftFilters] = React.useState<DraftFilter[]>([]);
  const [appliedExpr, setAppliedExpr] = React.useState<FilterExpr | null>(null);
  const [requestKey, setRequestKey] = React.useState(0);

 const buildExpr = React.useCallback((): FilterExpr | null => {
  const leaves: FilterExpr[] = [];

  const s = searchText.trim();
  if (s) {
    // ✅ multi-field search (handled by backend)
    leaves.push(field("product.search" as any, "CONTAINS" as any, s));
  }

  for (const f of draftFilters) {
    leaves.push(field(f.key as any, f.op as any, f.value));
  }

  if (leaves.length === 0) return null;
  return andGroup(leaves);
}, [searchText, draftFilters]);

  const onApply = React.useCallback(() => {
    setAppliedExpr(buildExpr());
    setRequestKey((x) => x + 1);
  }, [buildExpr]);

  const onReset = React.useCallback(() => {
    setSearchText("");
    setDraftFilters([]);
    setAppliedExpr(null);
    setRequestKey((x) => x + 1);
  }, []);

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

  return (
    <Page
      title="Products"
      subtitle="Search, filter and bulk edit your catalog"
      fullWidth
      primaryAction={
        <Button variant="primary" disabled={loading} onClick={() => {}}>
          Sync from Shopify
        </Button>
      }
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <ProductsFilterBar
              searchText={searchText}
              onSearchTextChange={setSearchText}
              draftFilters={draftFilters}
              onDraftFiltersChange={setDraftFilters}
              onApply={onApply}
              onReset={onReset}
              loading={loading}
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
              onLoadMore={loadMore}
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
