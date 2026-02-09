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

import type { FilterExpr } from "../lib/filters/dsl";
import { field } from "../lib/filters/dsl";

import { useProductsByFilter } from "../hooks/useProductsByFilter";
import { ProductIndexTable } from "../components/ProductIndexTable";
import { FilterExecutionAlert } from "../components/FilterExecutionAlert";

export const ProductsPage: React.FC = () => {
  // -------------------------------------------------------
  // Local filter state
  // -------------------------------------------------------
  const [searchText, setSearchText] = React.useState("");

  // Build a simple FilterExpr: product.search CONTAINS searchText
  const filterExpr = React.useMemo<FilterExpr | null>(() => {
    const value = searchText.trim();
    if (!value) return null;
    return field("product.search", "CONTAINS", value);
  }, [searchText]);

  // -------------------------------------------------------
  // Data: single-pass filter query (no waterfall)
  // -------------------------------------------------------
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
  const handleSearchChange = (value: string) => {
    setSearchText(value);
  };

  const handleClearFilters = () => {
    setSearchText("");
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
            // TODO: trigger a fast sync mutation here
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
                      label="Search"
                      labelHidden
                      autoComplete="off"
                      placeholder="Search title / description / tags"
                      value={searchText}
                      onChange={handleSearchChange}
                    />
                    {(searchText || filterExpr) && (
                      <Button onClick={handleClearFilters}>Clear</Button>
                    )}
                  </InlineStack>
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

              {/* Merchant-facing execution info (no AST jargon) */}
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
