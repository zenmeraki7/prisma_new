import React, { useMemo } from "react";
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
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type QueryFunctionContext,
} from "@tanstack/react-query";

import type { AppBridgeState } from "@shopify/app-bridge-react";
import {
  bootstrapProductsRequest,
  type ProductLiteDto,
  type BootstrapProductsPageDto,
} from "../queries/bootstrapProducts";

/* ----------------------- */
/* React Query data hook   */
/* ----------------------- */
function useBootstrapProducts(
  app: AppBridgeState | undefined,
): UseInfiniteQueryResult<BootstrapProductsPageDto, Error> {
  return useInfiniteQuery<
    BootstrapProductsPageDto,
    Error,
    BootstrapProductsPageDto,
    ["bootstrapProducts"],
    string | null
  >({
    queryKey: ["bootstrapProducts"],
    enabled: !!app,
    initialPageParam: null,
    queryFn: async ({
      pageParam,
    }: QueryFunctionContext<["bootstrapProducts"], string | null>) => {
      if (!app) throw new Error("AppBridge not ready");

      return bootstrapProductsRequest(app, {
        first: 50,
        after: pageParam,
      });
    },
    getNextPageParam: (lastPage) =>
      lastPage.nextCursor ?? null,
  });
}

/* ----------------------- */
/* Page component          */
/* ----------------------- */
export default function ProductsPage() {
  const app = useAppBridge();
  const query = useBootstrapProducts(app);

  const status = query.data?.pages[0]?.status;

  const allItems: ProductLiteDto[] = useMemo(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((p) => p.items);
  }, [query.data]);

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(allItems, {
      resourceIDResolver: (product) => product.id,
    });

  const loadingInitial = query.isLoading;
  const loadingMore = query.isFetchingNextPage;

  return (
    <Page fullWidth title="Products (FAST plane)">
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="400">
              {status ? (
                <InlineStack
                  gap="400"
                  align="space-between"
                  blockAlign="center"
                >
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
              ) : (
                <Text as="p" variant="bodySm" tone="subdued">
                  Loading FAST sync status…
                </Text>
              )}
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="400">
              {loadingInitial && (
                <InlineStack align="center" gap="200" blockAlign="center">
                  <Spinner />
                  <Text as="p">Loading products…</Text>
                </InlineStack>
              )}

              {!loadingInitial && !allItems.length && (
                <Banner tone="info">
                  <p>No products found in FAST plane yet.</p>
                  <p>The initial sync might still be running.</p>
                </Banner>
              )}
            </Box>

            {!loadingInitial && allItems.length > 0 && (
              <>
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
                            product.status === "ACTIVE"
                              ? "success"
                              : "subdued"
                          }
                        >
                          {product.status}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {product.vendor || "—"}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {product.productType || "—"}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {product.tags.length
                          ? product.tags.join(", ")
                          : "—"}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={product.hasImages ? "success" : "critical"}>
                          {product.hasImages ? "Yes" : "No"}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text variant="bodySm" tone="subdued">
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

                {query.hasNextPage && (
                  <Box padding="400">
                    <InlineStack align="center">
                      <button
                        type="button"
                        onClick={() => query.fetchNextPage()}
                        disabled={loadingMore}
                      >
                        {loadingMore ? "Loading…" : "Load more"}
                      </button>
                    </InlineStack>
                  </Box>
                )}
              </>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
