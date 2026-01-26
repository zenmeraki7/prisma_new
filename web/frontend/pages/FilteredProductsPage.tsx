// web/frontend/pages/FilteredProductsPage.tsx
import React, { useMemo, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  IndexTable,
  useIndexResourceState,
  Badge,
  Button,
  InlineStack,
  Spinner,
  Box,
  TextField,
  Select,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from "@tanstack/react-query";

import type { AppBridgeState } from "@shopify/app-bridge-react";
import {
  leaf,
  andGroup,
  type FilterExpr,
} from "../../lib/filters/dsl";
import {
  productsByFilterRequest,
  type ProductLiteDto,
  type ProductsByFilterPageDto,
} from "../queries/productsByFilter";

/**
 * Build a FilterExpr from the UI state.
 * All filters here are FAST-plane: status, vendor, productType, tags, hasImages, minTotalInventory.
 */
function buildFilterExprFromUi(params: {
  status: string;
  vendor: string;
  productType: string;
  tag: string;
  hasImages: string; // "ANY" | "YES" | "NO"
  minTotalInventory: string;
}): FilterExpr | null {
  const children: FilterExpr[] = [];

  if (params.status !== "ALL") {
    children.push(leaf("product.status", "eq", params.status.toUpperCase()));
  }

  if (params.vendor.trim()) {
    children.push(leaf("product.vendor", "contains", params.vendor.trim()));
  }

  if (params.productType.trim()) {
    children.push(
      leaf("product.productType", "contains", params.productType.trim()),
    );
  }

  if (params.tag.trim()) {
    children.push(leaf("product.tags", "contains", params.tag.trim()));
  }

  if (params.hasImages === "YES") {
    children.push(leaf("product.hasImages", "eq", true));
  } else if (params.hasImages === "NO") {
    children.push(leaf("product.hasImages", "eq", false));
  }

  if (params.minTotalInventory.trim()) {
    const parsed = Number(params.minTotalInventory);
    if (!Number.isNaN(parsed)) {
      children.push(leaf("product.totalInventory", "gte", parsed));
    }
  }

  // If we have no children at all, return null so caller can decide
  if (children.length === 0) return null;

  return andGroup(children);
}

/**
 * Products hook – wraps productsByFilter with infinite scroll.
 * We always use FAST_ONLY on this page.
 */
function useProductsByFilter(params: {
  app: AppBridgeState | undefined;
  filterExpr: FilterExpr | null;
  hasApplied: boolean;
}): UseInfiniteQueryResult<
  InfiniteData<ProductsByFilterPageDto, string | null>,
  Error
> {
  const { app, filterExpr, hasApplied } = params;

  const enabled = !!app && hasApplied;

  return useInfiniteQuery<
    ProductsByFilterPageDto,
    Error,
    InfiniteData<ProductsByFilterPageDto, string | null>
  >({
    queryKey: ["productsByFilter", filterExpr],
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!app) {
        throw new Error("AppBridge not ready");
      }

      // Use empty AND group if filterExpr is null (show all products)
      const actualFilter =
        filterExpr || ({ type: "group", op: "and", children: [] } as FilterExpr);

      return productsByFilterRequest(app, {
        filter: actualFilter,
        mode: "FAST_ONLY",
        first: 50,
        after: (pageParam as string | null) ?? null,
      });
    },
    getNextPageParam: (lastPage) =>
      lastPage.nextCursor ? lastPage.nextCursor : undefined,
  });
}

export default function FilteredProductsPage() {
  const app = useAppBridge();

  // UI state for FAST filters
  const [status, setStatus] = useState<string>("ALL");
  const [vendor, setVendor] = useState("");
  const [productType, setProductType] = useState("");
  const [tag, setTag] = useState("");
  const [hasImages, setHasImages] = useState<string>("ANY");
  const [minTotalInventory, setMinTotalInventory] = useState("");

  // Start with null - no products shown until user clicks Apply
  const [appliedFilterExpr, setAppliedFilterExpr] =
    useState<FilterExpr | null>(null);

  // Track if user has applied filters at least once
  const [hasApplied, setHasApplied] = useState(false);

  const uiFilterExpr = useMemo(
    () =>
      buildFilterExprFromUi({
        status,
        vendor,
        productType,
        tag,
        hasImages,
        minTotalInventory,
      }),
    [status, vendor, productType, tag, hasImages, minTotalInventory],
  );

  // Products for the applied filter
  const productsQuery = useProductsByFilter({
    app,
    filterExpr: appliedFilterExpr,
    hasApplied,
  });

  const allItems: ProductLiteDto[] = useMemo(() => {
    if (!productsQuery.data) return [];
    return productsQuery.data.pages.flatMap((p) => p.items);
  }, [productsQuery.data]);

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(allItems, {
      resourceIDResolver: (product) => product.id,
    });

  const applying = productsQuery.isFetching && hasApplied;
  const loadingProducts = productsQuery.isLoading && hasApplied;

  const handleApplyFilters = () => {
    // If UI filter is null, we send an empty AND group to mean "no filter"
    const newFilter =
      uiFilterExpr || ({ type: "group", op: "and", children: [] } as FilterExpr);
    setAppliedFilterExpr(newFilter);
    setHasApplied(true);
  };

  return (
    <Page
      title="Products (FAST filters)"
      primaryAction={{
        content: "Apply filters",
        onAction: handleApplyFilters,
        loading: applying,
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="400">
              <InlineStack align="space-between" gap="300" blockAlign="center">
                <InlineStack gap="200">
                  <Select
                    label="Status"
                    labelHidden
                    options={[
                      { label: "All", value: "ALL" },
                      { label: "Active", value: "ACTIVE" },
                      { label: "Draft", value: "DRAFT" },
                      { label: "Archived", value: "ARCHIVED" },
                    ]}
                    value={status}
                    onChange={setStatus}
                  />
                  <Select
                    label="Images"
                    labelHidden
                    options={[
                      { label: "Any", value: "ANY" },
                      { label: "Has images", value: "YES" },
                      { label: "No images", value: "NO" },
                    ]}
                    value={hasImages}
                    onChange={setHasImages}
                  />
                  <TextField
                    label="Vendor"
                    labelHidden
                    placeholder="Vendor"
                    value={vendor}
                    onChange={setVendor}
                    autoComplete="off"
                  />
                  <TextField
                    label="Product type"
                    labelHidden
                    placeholder="Product type"
                    value={productType}
                    onChange={setProductType}
                    autoComplete="off"
                  />
                  <TextField
                    label="Tag"
                    labelHidden
                    placeholder="Tag contains…"
                    value={tag}
                    onChange={setTag}
                    autoComplete="off"
                  />
                  <TextField
                    label="Min total inventory"
                    labelHidden
                    type="number"
                    placeholder="Min inventory"
                    value={minTotalInventory}
                    onChange={setMinTotalInventory}
                    autoComplete="off"
                  />
                </InlineStack>
                <InlineStack gap="200">
                  <Button
                    onClick={handleApplyFilters}
                    loading={applying}
                    variant="primary"
                  >
                    Apply
                  </Button>
                  {productsQuery.hasNextPage && (
                    <Button
                      onClick={() => productsQuery.fetchNextPage()}
                      loading={productsQuery.isFetchingNextPage}
                      disabled={productsQuery.isFetchingNextPage}
                    >
                      Load more
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="400">
              {!hasApplied && (
                <Text as="p" variant="bodyMd" tone="subdued">
                  Set your filters above and click "Apply filters" to see
                  results.
                </Text>
              )}
              {hasApplied && loadingProducts && (
                <InlineStack align="center" blockAlign="center" gap="200">
                  <Spinner />
                  <Text as="p" variant="bodyMd">
                    Loading products…
                  </Text>
                </InlineStack>
              )}
              {hasApplied && !loadingProducts && allItems.length === 0 && (
                <Text as="p" variant="bodyMd">
                  No products match the current filter.
                </Text>
              )}
            </Box>

            {hasApplied && !loadingProducts && allItems.length > 0 && (
              <IndexTable
                resourceName={resourceName}
                itemCount={allItems.length}
                selectedItemsCount={
                  allResourcesSelected ? "All" : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: "Title" },
                  { title: "Status" },
                  { title: "Vendor" },
                  { title: "Type" },
                  { title: "Tags" },
                  { title: "Images" },
                  { title: "Updated" },
                ]}
              >
                {allItems.map((product, index) => (
                  <IndexTable.Row
                    id={product.id}
                    key={product.id}
                    position={index}
                    selected={selectedResources.includes(product.id)}
                  >
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold">
                        {product.title}
                      </Text>
                      <Text as="div" variant="bodySm" tone="subdued">
                        {product.handle}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge
                        tone={
                          product.status === "ACTIVE" ? "success" : "subdued"
                        }
                      >
                        {product.status}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span">{product.vendor || "—"}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span">{product.productType || "—"}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span">
                        {product.tags.length ? product.tags.join(", ") : "—"}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {product.hasImages ? (
                        <Badge tone="success">Yes</Badge>
                      ) : (
                        <Badge tone="critical">No</Badge>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {product.updatedAtShopify
                          ? new Date(
                              product.updatedAtShopify,
                            ).toLocaleString()
                          : "—"}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
