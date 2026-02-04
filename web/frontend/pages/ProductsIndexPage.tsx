// web/frontend/pages/ProductsIndexPage.tsx
import React, { useMemo, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  IndexTable,
  useIndexResourceState,
  Badge,
  Box,
  InlineStack,
  Spinner,
  Banner,
  Tabs,
  TextField,
  Select,
  Button,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { AppBridgeState } from "@shopify/app-bridge-react";
import type { ProductLiteDto } from "../types/product";

import {
  bootstrapProductsRequest,
  type BootstrapStatusDto,
} from "../queries/bootstrapProducts";
import {
  planFilterRequest,
  type FilterExecutionMode,
} from "../queries/planFilter";
import {
  productsByFilterRequest,
  type ProductsByFilterPageDto,
} from "../queries/productsByFilter";
import {
  snapshotRunsRequest,
  snapshotRunEventsRequest,
  type SnapshotRunDto,
  type SnapshotRunEventDto,
} from "../queries/snapshotHistory";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { leaf, andGroup, type FilterExpr } from "../../lib/filters/dsl";

/* ============================
   SHARED HELPERS
============================ */

const productResourceName = {
  singular: "product",
  plural: "products",
};

function productStatusTone(
  status: string,
): "success" | "critical" | "attention" | "subdued" {
  if (status === "ACTIVE") return "success";
  if (status === "DRAFT") return "attention";
  if (status === "ARCHIVED") return "subdued";
  return "subdued";
}

// web/frontend/pages/ProductsIndexPage.tsx

function snapshotStatusTone(
  status: SnapshotRunDto["status"],
): "success" | "critical" | "attention" | "subdued" {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "critical";
    case "RUNNING":
    case "INGESTING":
    case "QUEUED":
      return "attention";
    default:
      return "subdued";
  }
}

/* ============================
   HOOKS
============================ */

function useBootstrapProducts(app: AppBridgeState | undefined) {
  return useInfiniteQuery<
    {
      items: ProductLiteDto[];
      nextCursor: string | null;
      status?: BootstrapStatusDto;
    },
    Error,
    {
      items: ProductLiteDto[];
      nextCursor: string | null;
      status?: BootstrapStatusDto;
    },
    string | null
  >({
    queryKey: ["bootstrapProducts"],
    enabled: !!app,
    queryFn: async ({ pageParam = null }) => {
      if (!app) throw new Error("AppBridge not ready");
      return bootstrapProductsRequest(app, { first: 50, after: pageParam });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null,
  });
}

function usePlanFilter(
  app: AppBridgeState | undefined,
  filterExpr: FilterExpr | null,
) {
  return useQuery({
    queryKey: ["planFilter", filterExpr],
    enabled: !!app && filterExpr !== null,
    queryFn: () => {
      if (!app) throw new Error("AppBridge not ready");
      return planFilterRequest(app, filterExpr);
    },
  });
}

function useProductsByFilter(params: {
  app: AppBridgeState | undefined;
  filterExpr: FilterExpr | null;
  executionMode: FilterExecutionMode | undefined;
  planHash: string | undefined;
}) {
  const { app, filterExpr, executionMode, planHash } = params;
  const enabled = !!app && !!executionMode && filterExpr !== null;

  return useInfiniteQuery<
    ProductsByFilterPageDto,
    Error,
    ProductsByFilterPageDto,
    string | null
  >({
    queryKey: ["productsByFilter", planHash, executionMode],
    enabled,
    queryFn: async ({ pageParam = null }) => {
      if (!app || !executionMode || filterExpr === null) {
        throw new Error("AppBridge, executionMode, or filterExpr not ready");
      }
      return productsByFilterRequest(app, {
        filter: filterExpr,
        mode: executionMode,
        first: 50,
        after: pageParam,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null,
  });
}

function useSnapshotRuns(app: AppBridgeState | undefined) {
  return useInfiniteQuery<
    { runs: SnapshotRunDto[]; nextCursor: string | null },
    Error,
    { runs: SnapshotRunDto[]; nextCursor: string | null },
    string | null
  >({
    queryKey: ["snapshotRuns"],
    enabled: !!app,
    queryFn: async ({ pageParam = null }) => {
      if (!app) throw new Error("AppBridge not ready");
      return snapshotRunsRequest(app, { first: 25, after: pageParam });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null,
  });
}

function useSnapshotRunEvents(
  app: AppBridgeState | undefined,
  runId: string | null,
) {
  return useInfiniteQuery<
    { events: SnapshotRunEventDto[]; nextCursor: string | null },
    Error,
    { events: SnapshotRunEventDto[]; nextCursor: string | null },
    string | null
  >({
    queryKey: ["snapshotRunEvents", runId],
    enabled: !!app && !!runId,
    queryFn: async ({ pageParam = null }) => {
      if (!app || !runId) throw new Error("AppBridge or runId not ready");
      return snapshotRunEventsRequest(app, {
        runId,
        first: 50,
        after: pageParam,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null,
  });
}

/* ============================
   ALL PRODUCTS TAB
============================ */

function AllProductsTab() {
  const app = useAppBridge();
  const query = useBootstrapProducts(app);

  const status = query.data?.pages[0]?.status;
  const allItems: ProductLiteDto[] = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(allItems, { resourceIDResolver: (p) => p.id });

  const loadingInitial = query.isLoading;
  const loadingMore = query.isFetchingNextPage;

  return (
    <Layout.Section>
      <Card>
        <Box padding="400">
          {status && (
            <InlineStack gap="400" align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Badge tone={status.fastReady ? "success" : "critical"}>
                  FAST {status.fastReady ? "ready" : "not ready"}
                </Badge>
                <Text as="span" variant="bodySm" tone="subdued">
                  Rev {status.fastRevision}
                </Text>
                {status.fastLastSyncAt && (
                  <Text as="span" variant="bodySm" tone="subdued">
                    Last sync:{" "}
                    {new Date(status.fastLastSyncAt).toLocaleString()}
                  </Text>
                )}
              </InlineStack>
              {status.syncEnqueued && (
                <Badge tone="attention">Sync enqueued</Badge>
              )}
            </InlineStack>
          )}
          {!status && (
            <Text as="p" variant="bodySm" tone="subdued">
              Loading FAST sync status…
            </Text>
          )}
        </Box>

        <Box padding="400">
          {loadingInitial && (
            <InlineStack align="center" gap="200" blockAlign="center">
              <Spinner />
              <Text as="p" variant="bodyMd">
                Loading products…
              </Text>
            </InlineStack>
          )}

          {!loadingInitial && !allItems.length && (
            <Banner tone="info">
              <p>No products found in FAST plane yet.</p>
              <p>
                If you just installed the app, the initial sync might still be
                running.
              </p>
            </Banner>
          )}
        </Box>

        {!loadingInitial && allItems.length > 0 && (
          <>
            <IndexTable
              resourceName={productResourceName}
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
                    <Badge tone={productStatusTone(product.status)}>
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
                        ? new Date(product.updatedAtShopify).toLocaleString()
                        : "—"}
                    </Text>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>

            <Box padding="400">
              {query.hasNextPage && (
                <InlineStack align="center" blockAlign="center">
                  <Button
                    onClick={() => query.fetchNextPage()}
                    loading={loadingMore}
                    disabled={loadingMore}
                  >
                    Load more
                  </Button>
                </InlineStack>
              )}
            </Box>
          </>
        )}
      </Card>
    </Layout.Section>
  );
}

/* ============================
   FILTERED PRODUCTS TAB
============================ */

function buildFilterExprFromUi(params: {
  status: string;
  vendor: string;
  productType: string;
  tag: string;
  hasImages: string; // "ANY" | "YES" | "NO"
  minTotalInventory: string;
}): FilterExpr | null {
  const children: FilterExpr[] = [];

  // 1) Status
  if (params.status !== "ALL") {
    children.push(leaf("product.status", "eq", params.status.toUpperCase()));
  }

  // 2) Vendor
  if (params.vendor.trim()) {
    children.push(leaf("product.vendor", "contains", params.vendor.trim()));
  }

  // 3) Product type
  if (params.productType.trim()) {
    children.push(
      leaf("product.productType", "contains", params.productType.trim()),
    );
  }

  // 4) Tag
  if (params.tag.trim()) {
    children.push(leaf("product.tags", "contains", params.tag.trim()));
  }

  // 5) Has images
  if (params.hasImages === "YES") {
    children.push(leaf("product.hasImages", "eq", true));
  } else if (params.hasImages === "NO") {
    children.push(leaf("product.hasImages", "eq", false));
  }

  // 6) Min total inventory
  if (params.minTotalInventory.trim()) {
    const parsed = Number(params.minTotalInventory);
    if (!Number.isNaN(parsed)) {
      children.push(leaf("product.totalInventory", "gte", parsed));
    }
  }

  if (children.length === 0) {
    return null;
  }

  return andGroup(children);
}

function FilteredProductsTab() {
  const app = useAppBridge();

  const [status, setStatus] = useState<string>("ALL");
  const [vendor, setVendor] = useState("");
  const [productType, setProductType] = useState("");
  const [tag, setTag] = useState("");
  const [hasImages, setHasImages] = useState<string>("ANY");
  const [minTotalInventory, setMinTotalInventory] = useState("");
  const [appliedFilterExpr, setAppliedFilterExpr] = useState<FilterExpr | null>(
    null,
  );

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

  const planQuery = usePlanFilter(app, appliedFilterExpr);
  const executionMode = planQuery.data?.executionMode;
  const planHash = planQuery.data?.planHash;
  const filterSummary = planQuery.data?.filterSummary;

  const productsQuery = useProductsByFilter({
    app,
    filterExpr: appliedFilterExpr,
    executionMode,
    planHash,
  });

  const allItems: ProductLiteDto[] = useMemo(
    () => productsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [productsQuery.data],
  );

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(allItems, { resourceIDResolver: (p) => p.id });

  const applying = planQuery.isLoading;
  const loadingProducts = productsQuery.isLoading;
  const loadingMore = productsQuery.isFetchingNextPage;
  const showSnapshotBanner =
    executionMode === "SNAPSHOT" && planHash && !loadingProducts;

  const handleApplyFilters = () => {
    setAppliedFilterExpr(uiFilterExpr);
  };

  return (
    <Layout.Section>
      <Card>
        <Box padding="400">
          <InlineStack align="space-between" gap="300" blockAlign="center">
            <InlineStack gap="200">
              <Select
                labelHidden
                label="Status"
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
                labelHidden
                label="Images"
                options={[
                  { label: "Any", value: "ANY" },
                  { label: "Has images", value: "YES" },
                  { label: "No images", value: "NO" },
                ]}
                value={hasImages}
                onChange={setHasImages}
              />
              <TextField
                labelHidden
                label="Vendor"
                placeholder="Vendor"
                value={vendor}
                onChange={setVendor}
              />
              <TextField
                labelHidden
                label="Product type"
                placeholder="Product type"
                value={productType}
                onChange={setProductType}
              />
              <TextField
                labelHidden
                label="Tag"
                placeholder="Tag contains…"
                value={tag}
                onChange={setTag}
              />
              <TextField
                labelHidden
                label="Min total inventory"
                type="number"
                placeholder="Min inventory"
                value={minTotalInventory}
                onChange={setMinTotalInventory}
              />
            </InlineStack>
            <InlineStack gap="200">
              <Button
                variant="primary"
                onClick={handleApplyFilters}
                loading={applying}
              >
                Apply
              </Button>
              {productsQuery.hasNextPage && (
                <Button
                  onClick={() => productsQuery.fetchNextPage()}
                  loading={loadingMore}
                  disabled={loadingMore}
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
                  <code>{planHash}</code>).
                </p>
              </Banner>
            </Box>
          )}
        </Box>

        <Box padding="400">
          {appliedFilterExpr === null && (
            <Text as="p" variant="bodyMd" tone="subdued">
              Set your filters above and click “Apply” to see results.
            </Text>
          )}

          {appliedFilterExpr !== null && loadingProducts && (
            <InlineStack align="center" gap="200" blockAlign="center">
              <Spinner />
              <Text as="p" variant="bodyMd">
                Loading filtered products…
              </Text>
            </InlineStack>
          )}

          {appliedFilterExpr !== null &&
            !loadingProducts &&
            allItems.length === 0 && (
              <Text as="p" variant="bodyMd">
                No products match the current filter.
              </Text>
            )}
        </Box>

        {appliedFilterExpr !== null &&
          !loadingProducts &&
          allItems.length > 0 && (
            <IndexTable
              resourceName={productResourceName}
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
                    <Badge tone={productStatusTone(product.status)}>
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
                        ? new Date(product.updatedAtShopify).toLocaleString()
                        : "—"}
                    </Text>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
      </Card>
    </Layout.Section>
  );
}

/* ============================
   SNAPSHOT JOBS TAB
============================ */

function SnapshotJobsTab() {
  const app = useAppBridge();
  const runsQuery = useSnapshotRuns(app);
  const allRuns = useMemo(
    () => runsQuery.data?.pages.flatMap((p) => p.runs) ?? [],
    [runsQuery.data],
  );

  return (
    <Layout.Section>
      <Card title="Snapshot runs">
        <Box padding="400">
          {runsQuery.isLoading && <Spinner />}
          {!runsQuery.isLoading && !allRuns.length && (
            <Text as="p" tone="subdued">
              No snapshot runs yet.
            </Text>
          )}
          {!runsQuery.isLoading && allRuns.length > 0 && (
            <IndexTable
              resourceName={{
                singular: "snapshot run",
                plural: "snapshot runs",
              }}
              itemCount={allRuns.length}
              headings={[
                { title: "ID" },
                { title: "Started At" },
                { title: "Status" },
              ]}
              selectedItemsCount={0}
              onSelectionChange={() => {}}
            >
              {allRuns.map((run, idx) => (
                <IndexTable.Row key={run.id} id={run.id} position={idx}>
                  <IndexTable.Cell>{run.id}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {new Date(run.createdAt).toLocaleString()}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={snapshotStatusTone(run.status)}>
                      {run.status}
                    </Badge>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Box>
      </Card>
    </Layout.Section>
  );
}

/* ============================
   MAIN PAGE
============================ */

export default function ProductsIndexPage() {
  const tabs = [
    { id: "all", content: "All products", component: <AllProductsTab /> },
    {
      id: "filtered",
      content: "Filtered products",
      component: <FilteredProductsTab />,
    },
    {
      id: "snapshot",
      content: "Snapshot jobs",
      component: <SnapshotJobsTab />,
    },
  ];

  const [selectedTab, setSelectedTab] = useState(0);

  return (
    <Page fullWidth title="Products">
      <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} fitted>
        {tabs[selectedTab].component}
      </Tabs>
    </Page>
  );
}
