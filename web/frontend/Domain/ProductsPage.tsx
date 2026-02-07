// FILE: web/frontend/pages/products/ProductsPage.tsx

import {
  Page,
  Layout,
  Card,
  Filters,
  IndexTable,
  Text,
  Badge,
  Spinner,
  Button,
  Box,
  Banner,
  InlineStack,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

import { useProductFilters } from "../pages/products/useProductFilters";
import { useProductQuery } from "../pages/products/useProductQuery";
import { useFastPlaneSync } from "../queries/syncProductsToDb";

// Small helper to format ISO strings / Dates into something readable
function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(); // uses browser locale
}

// Helper to map status to Polaris Badge tone
function getStatusTone(status: string) {
  switch (status.toLowerCase()) {
    case "active":
      return "success"; // green
    case "archived":
      return "critical"; // red
    case "draft":
      return "attention"; // yellow/orange
    default:
      return "neutral"; // gray
  }
}

export default function ProductsPage() {
  const app = useAppBridge();
  const filters = useProductFilters();

  const query = useProductQuery(app, {
    filterExpr: filters.filterExpr,
  });

  const firstPage = query.data?.pages[0];
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  const executionMode = firstPage?.executionMode;
  const planHash = firstPage?.planHash;

  // FAST plane sync mutation
  const fastSync = useFastPlaneSync(app);

  return (
    <Page title="Products" fullWidth>
      <Layout>
        {/* 🔥 FAST plane Sync banner */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <Box>
                  <Text as="h3" variant="headingSm">
                    FAST plane sync
                  </Text>
                  <Text as="p" variant="bodySm">
                    Pulls products from Shopify into the FAST database tables
                    (ProductLite, VariantRollup, ProductTag).
                  </Text>
                  {fastSync.isSuccess && (
                    <Text as="p" variant="bodySm">
                      Synced <strong>{fastSync.data?.totalSynced ?? 0}</strong>{" "}
                      products.
                    </Text>
                  )}
                  {fastSync.isError && (
                    <Banner tone="critical" title="FAST sync failed">
                      <Text as="p" variant="bodySm">
                        {String((fastSync.error as Error).message)}
                      </Text>
                    </Banner>
                  )}
                </Box>
                <Button
                  primary
                  loading={fastSync.isPending}
                  onClick={() => fastSync.mutate()}
                >
                  {fastSync.isPending ? "Syncing…" : "Sync FAST plane"}
                </Button>
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* 🔥 Execution Plan Banner */}
        {executionMode && (
          <Layout.Section>
            <Banner
              tone={executionMode === "FAST" ? "success" : "warning"}
              title={
                executionMode === "FAST"
                  ? "FAST execution plan"
                  : "SNAPSHOT execution plan"
              }
            >
              <InlineStack gap="200">
                <Text variant="bodySm">
                  Mode: <strong>{executionMode}</strong>
                </Text>
                <Text variant="bodySm">
                  Plan hash: <code>{planHash}</code>
                </Text>
              </InlineStack>
            </Banner>
          </Layout.Section>
        )}

        {/* Filters */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Filters
                filters={filters.filtersConfig.map((f) => ({
                  key: f.id,
                  label: f.label,
                  filter: (
                    <input
                      value={String(filters.draft[f.id] ?? "")}
                      onChange={(e) =>
                        filters.setDraft((prev) => ({
                          ...prev,
                          [f.id]: e.target.value,
                        }))
                      }
                    />
                  ),
                }))}
                appliedFilters={filters.appliedFilters}
                onClearAll={filters.clearAll}
              >
                <Button onClick={filters.apply}>Apply</Button>
              </Filters>
            </Box>
          </Card>
        </Layout.Section>

        {/* Table */}
        <Layout.Section>
          <Card>
            {query.isLoading && (
              <Box padding="400">
                <Spinner />
              </Box>
            )}

            {!query.isLoading && items.length === 0 && (
              <Box padding="400">
                <Text>No products found</Text>
              </Box>
            )}

            {items.length > 0 && (
              <>
                <IndexTable
                  resourceName={{ singular: "product", plural: "products" }}
                  itemCount={items.length}
                  headings={[
                    { title: "Title" },
                    { title: "Status" },
                    { title: "Vendor" },
                    { title: "Product type" },
                    { title: "Tags" },
                    { title: "Images" },
                    { title: "Updated at" },
                  ]}
                >
                  {items.map((p: any, i: number) => (
                    <IndexTable.Row id={p.id} key={p.id} position={i}>
                      {/* Title */}
                      <IndexTable.Cell>
                        <Text fontWeight="semibold">{p.title}</Text>
                      </IndexTable.Cell>

                      {/* Status */}
                      <IndexTable.Cell>
                        <Badge tone={getStatusTone(p.status)}>
                          {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </Badge>
                      </IndexTable.Cell>

                      {/* Vendor */}
                      <IndexTable.Cell>{p.vendor ?? "—"}</IndexTable.Cell>

                      {/* Product type */}
                      <IndexTable.Cell>{p.productType ?? "—"}</IndexTable.Cell>

                      {/* Tags */}
                      <IndexTable.Cell>
                        {Array.isArray(p.tags) && p.tags.length > 0 ? (
                          <Text variant="bodySm">{p.tags.join(", ")}</Text>
                        ) : (
                          <Text variant="bodySm" tone="subdued">
                            —
                          </Text>
                        )}
                      </IndexTable.Cell>

                      {/* Images */}
                      <IndexTable.Cell>
                        {p.hasImages ? (
                          <Badge tone="success">Has image</Badge>
                        ) : (
                          <Badge tone="attention">No image</Badge>
                        )}
                      </IndexTable.Cell>

                      {/* Updated at */}
                      <IndexTable.Cell>
                        <Text variant="bodySm">
                          {formatDateTime(p.updatedAtShopify)}
                        </Text>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>

                {query.hasNextPage && (
                  <Box padding="400">
                    <Button onClick={() => query.fetchNextPage()}>Load more</Button>
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
