import React from "react";
import {
  Page,
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
  if (normalized === "active") return <Badge tone="success">Active</Badge>;
  if (normalized === "draft") return <Badge tone="attention">Draft</Badge>;
  if (normalized === "archived") return <Badge tone="critical">Archived</Badge>;
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

  return (
    <Page
      fullWidth
      title="Products"
      subtitle="Fast plane listing backed by Shopify Bulk Operations"
    >
      {/* Status banner */}
      <Box paddingBlockEnd="400">
        {syncState.state === "ready" && (
          <Banner tone="success" title="FAST plane ready">
            <p>
              Last sync:{" "}
              {status?.fastLastSyncAt
                ? formatDateTime(status.fastLastSyncAt)
                : "not recorded"}{" "}
              · Revision {status?.fastRevision ?? 0}
            </p>
          </Banner>
        )}
      </Box>

      {error && (
        <Banner
          tone="critical"
          title="Failed to load products"
          action={{ content: "Retry", onAction: reload }}
        >
          <p>{error}</p>
        </Banner>
      )}

      <Card padding="0">
        {loading && products.length === 0 ? (
          <Box padding="600" inlineAlign="center">
            <Spinner size="large" />
          </Box>
        ) : (
          <>
            <IndexTable
              resourceName={{ singular: "product", plural: "products" }}
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
                { title: "Last updated" },
              ]}
            >
              {products.map((product, index) => (
                <IndexTable.Row
                  id={product.id}
                  key={product.id}
                  position={index}
                >
                  <IndexTable.Cell>
                    <Text fontWeight="semibold">{product.title}</Text>
                    <Text tone="subdued" variant="bodySm">
                      /{product.handle}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    {statusToBadge(product.status)}
                  </IndexTable.Cell>

                  <IndexTable.Cell>{product.vendor || "-"}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {product.productType || "-"}
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Badge tone={product.hasImages ? "success" : "subdued"}>
                      {product.hasImages ? "Yes" : "No"}
                    </Badge>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    {formatDateTime(product.updatedAtShopify)}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>

            {nextCursor && (
              <Box paddingBlockStart="200" paddingInlineStart="800">
                <InlineStack align="start">
                  <Button
                    variant="primary"
                    onClick={loadMore}
                    loading={loading}
                    disabled={!nextCursor}
                  >
                    Load more products
                  </Button>
                </InlineStack>
              </Box>
            )}
          </>
        )}
      </Card>
    </Page>
  );
}
