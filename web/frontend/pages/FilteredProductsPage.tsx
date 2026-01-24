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
  Banner,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  useInfiniteQuery,
  useQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from "@tanstack/react-query";

import type { AppBridgeState } from "@shopify/app-bridge-react";
import {
  leaf,
  andGroup,
  type FilterExpr,
  type FilterId,
} from "../../lib/filters/dsl";
import {
  planFilterRequest,
  type FilterExecutionMode,
} from "../queries/planFilter";
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

  return andGroup(children);
}

/**
 * Plan hook – wraps planFilterRequest in react-query.
 */
function usePlanFilter(
  app: AppBridgeState | undefined,
  filterExpr: FilterExpr | null,
) {
  return useQuery({
    queryKey: ["planFilter", filterExpr],
    enabled: !!app,
    queryFn: () => {
      if (!app) throw new Error("AppBridge not ready");
      return planFilterRequest(app, filterExpr);
    },
  });
}

/**
 * Products hook – wraps productsByFilter with infinite scroll.
 */
function useProductsByFilter(params: {
  app: AppBridgeState | undefined;
  filterExpr: FilterExpr | null;
  executionMode: FilterExecutionMode | undefined;
  planHash: string | undefined;
}): UseInfiniteQueryResult<
  InfiniteData<ProductsByFilterPageDto, string | null>,
  Error
> {
  const { app, filterExpr, executionMode, planHash } = params;

  const enabled = !!app && !!executionMode; // Allow null filter to show all products

  return useInfiniteQuery<ProductsByFilterPageDto, Error, InfiniteData<ProductsByFilterPageDto, string | null>>({
    queryKey: ["productsByFilter", planHash, executionMode],
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!app || !executionMode) {
        throw new Error("AppBridge or executionMode not ready");
      }

      // Use empty filter if filterExpr is null (shows all products)
      const actualFilter = filterExpr || { type: "group", op: "and", children: [] };

      return productsByFilterRequest(app, {
        filter: actualFilter,
        mode: executionMode,
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

  // Plan for the *applied* filter
  const planQuery = usePlanFilter(app, appliedFilterExpr);
  const executionMode = planQuery.data?.executionMode;
  const planHash = planQuery.data?.planHash;
  const filterSummary = planQuery.data?.filterSummary;

  // Products for that plan
  const productsQuery = useProductsByFilter({
    app,
    filterExpr: appliedFilterExpr,
    executionMode,
    planHash,
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

  const applying = planQuery.isLoading;
  const loadingProducts = productsQuery.isLoading;

  const showSnapshotBanner =
    executionMode === "SNAPSHOT" && planHash && !loadingProducts;

  const handleApplyFilters = () => {
    const newFilter = uiFilterExpr || { type: "group", op: "and", children: [] };
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
              {filterSummary && (
                <Box paddingBlockStart="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Plan: {executionMode ?? "—"} · {filterSummary}
                  </Text>
                </Box>
              )}
              {showSnapshotBanner && (
                <Box paddingBlockStart="200">
                  <Banner tone="info">
                    <p>
                      This filter requires SNAPSHOT mode (planHash{" "}
                      <code>{planHash}</code>). The backend will evaluate it via
                      BulkOperations and materialize the result.
                    </p>
                  </Banner>
                </Box>
              )}
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="400">
              {!hasApplied && (
                <Text as="p" variant="bodyMd" tone="subdued">
                  Set your filters above and click "Apply filters" to see results.
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