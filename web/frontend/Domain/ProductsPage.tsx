// FILE: web/frontend/pages/ProductsPage.tsx

import React from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  InlineStack,
  BlockStack,
  Button,
  Text,
  Spinner,
  Divider,
} from "@shopify/polaris";

// IMPORTANT: we no longer use the DSL here.
// import type { FilterExpr } from "../lib/filters/dsl";
// import { field } from "../lib/filters/dsl";

import { useProductsByFilter } from "../hooks/useProductsByFilter";
import { ProductIndexTable } from "../components/ProductIndexTable";
import { FilterExecutionAlert } from "../components/FilterExecutionAlert";

export const ProductsPage: React.FC = () => {
  // What the user is typing
  const [searchInput, setSearchInput] = React.useState("");

  // What is actually applied to the query
  const [searchQuery, setSearchQuery] = React.useState("");

  // For the hook we send either a string or null.
  // Cast to any so types that expect FilterExpr don't complain.
  const filterExpr = React.useMemo<any>(() => {
    const v = searchQuery.trim();
    return v === "" ? null : v;
  }, [searchQuery]);

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
    filterExpr,
    pageSize: 50,
    enabled: true,
  });

  // -------------------------------------------------------
  // Handlers
  // -------------------------------------------------------

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
  };

  const applySearch = () => {
    setSearchQuery(searchInput);
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setSearchQuery("");
  };

  const handleSearchKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (
    event,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applySearch();
    }
  };

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  return (
    <Page
      title="Products"
      subtitle="Search, filter and bulk edit your catalog"
      fullWidth
      primaryAction={
        <Button
          variant="primary"
          disabled={loading}
          onClick={() => {
            // TODO: wire to your fast sync trigger endpoint
          }}
        >
          Sync from Shopify
        </Button>
      }
    >
      <Layout>
        {/* Filters & execution info */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack
                gap="200"
                align="space-between"
                blockAlign="center"
              >
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm">
                    Filters
                  </Text>

                  <InlineStack gap="200" blockAlign="center">
                    <TextField
                      label="Search title / description / vendor / tags"
                      labelHidden
                      autoComplete="off"
                      placeholder="Search by product title, vendor, type, tags…"
                      value={searchInput}
                      onChange={handleSearchInputChange}
                      onKeyDown={handleSearchKeyDown}
                    />
                    <Button variant="primary" onClick={applySearch}>
                      Search
                    </Button>
                    {(searchInput || searchQuery) && (
                      <Button onClick={handleClearFilters}>Clear</Button>
                    )}
                  </InlineStack>

                  {searchQuery && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Showing results for: <strong>{searchQuery}</strong>
                    </Text>
                  )}
                </BlockStack>

                {loading && (
                  <InlineStack gap="100" blockAlign="center">
                    <Spinner size="small" />
                    <Text as="span" variant="bodySm" tone="subdued">
                      Loading products…
                    </Text>
                  </InlineStack>
                )}
              </InlineStack>

              <Divider />

              <FilterExecutionAlert
                mode={mode}
                guardrail={guardrail}
                warnings={warnings}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Product table */}
        <Layout.Section>
          {error ? (
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Something went wrong
                </Text>
                <Text as="p" variant="bodySm" tone="critical">
                  {(error as Error).message}
                </Text>
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
            <BlockStack gap="100" align="center">
              <Spinner size="small" />
              <Text as="span" variant="bodySm" tone="subdued">
                Loading more products…
              </Text>
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default ProductsPage;
