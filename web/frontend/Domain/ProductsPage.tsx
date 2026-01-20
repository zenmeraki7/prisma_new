// web/frontend/pages/ProductsPage.tsx
import React from "react";
import {
  Page,
  Layout,
  Card,
  Spinner,
  Banner,
  Text,
  IndexTable,
  useIndexResourceState,
  Badge,
  Button,
  Box,
  InlineStack,
} from "@shopify/polaris";
import { useBootstrapProducts } from "../hooks/useBootstrapProducts";

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function statusToBadge(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "active") {
    return <Badge tone="success">Active</Badge>;
  }
  if (normalized === "draft") {
    return <Badge tone="attention">Draft</Badge>;
  }
  if (normalized === "archived") {
    return <Badge tone="critical">Archived</Badge>;
  }
  return <Badge tone="new">{status}</Badge>;
}

export function ProductsPage() {
  const {
    loading,
    error,
    products,
    syncState,
    status,
    nextCursor,
    reload,
    loadMore,
  } = useBootstrapProducts();

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(products, {
      resourceName: { singular: "product", plural: "products" },
      idForItem: (item) => item.id,
    });

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const syncing =
    syncState.state === "syncing" ||
    (!syncState.state && loading && products.length === 0);

  const primaryAction = nextCursor
    ? {
        content: "Load more",
        onAction: loadMore,
        disabled: loading,
      }
    : undefined;

  return (
    <Page
      title="Products"
      subtitle="Fast plane listing backed by Shopify Bulk Operations"
      primaryAction={primaryAction}
    >
      <Layout>
        <Layout.Section>
          {syncState.state !== "unknown" && (
            <Box paddingBlockEnd="400">
              {syncState.state === "ready" && (
                <Banner tone="success" title="FAST plane ready">
                  <p>
                    Products are served from the optimized FAST plane. Last sync:{" "}
                    {status?.fastLastSyncAt ? (
                      <Text as="span" variant="bodyMd">
                        {formatDateTime(status.fastLastSyncAt)}
                      </Text>
                    ) : (
                      "not recorded"
                    )}
                    . Revision: {status?.fastRevision ?? 0}
                  </p>
                </Banner>
              )}

              {syncState.state === "syncing" && (
                <Banner tone="info" title="Initial sync in progress">
                  <InlineStack gap="200" blockAlign="center">
                    <Spinner size="small" />
                    <Text as="span" variant="bodyMd">
                      We are syncing your catalog from Shopify using Bulk
                      Operations. You can keep this tab open; data will update
                      automatically.
                    </Text>
                  </InlineStack>
                </Banner>
              )}

              {syncState.state === "cold" && (
                <Banner
                  tone="warning"
                  title="FAST plane is not ready yet"
                  action={{ content: "Retry now", onAction: reload }}
                >
                  <p>
                    No FAST plane data is available yet for this shop. A full
                    sync will be queued automatically when needed. You can also
                    trigger a manual reload.
                  </p>
                </Banner>
              )}
            </Box>
          )}

          {error && (
            <Box paddingBlockEnd="400">
              <Banner
                tone="critical"
                title="Failed to load products"
                action={{ content: "Retry", onAction: reload }}
              >
                <p>{error}</p>
              </Banner>
            </Box>
          )}

          <Card>
            {loading && products.length === 0 ? (
              <Box padding="400" inlineAlign="center">
                <Spinner size="large" />
              </Box>
            ) : (
              <>
                <IndexTable
                  resourceName={resourceName}
                  itemCount={products.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Title" },
                    { title: "Status" },
                    { title: "Vendor" },
                    { title: "Type" },
                    { title: "Has images" },
                    { title: "Last updated (Shopify)" },
                  ]}
                >
                  {products.map((product, index) => (
                    <IndexTable.Row
                      id={product.id}
                      key={product.id}
                      position={index}
                      selected={selectedResources.includes(product.id)}
                    >
                      <IndexTable.Cell>
                        <Text as="span" fontWeight="semibold">
                          {product.title || "Untitled product"}
                        </Text>
                        <Text as="div" variant="bodySm" tone="subdued">
                          {product.handle ? `/${product.handle}` : "No handle"}
                        </Text>
                        {product.tags.length > 0 && (
                          <Text as="div" variant="bodySm" tone="subdued">
                            Tags: {product.tags.join(", ")}
                          </Text>
                        )}
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        {statusToBadge(product.status)}
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        {product.vendor || <Text as="span">-</Text>}
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        {product.productType || <Text as="span">-</Text>}
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        {product.hasImages ? (
                          <Badge tone="success">Yes</Badge>
                        ) : (
                          <Badge tone="subdued">No</Badge>
                        )}
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm">
                          {formatDateTime(product.updatedAtShopify)}
                        </Text>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>

                {nextCursor && (
                  <Box padding="400" inlineAlign="center">
                    <Button onClick={loadMore} loading={loading}>
                      Load more products
                    </Button>
                  </Box>
                )}

                {products.length === 0 && !loading && !syncing && (
                  <Box padding="400">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      No products found. If you just installed the app, the
                      initial sync may still be starting.
                    </Text>
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
