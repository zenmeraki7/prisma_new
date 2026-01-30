// web/frontend/components/products/ProductsTable.tsx

import React from "react";
import {
  Card,
  Box,
  InlineStack,
  Spinner,
  Text,
  Banner,
  IndexTable,
  useIndexResourceState,
  Badge,
} from "@shopify/polaris";

import type { ProductLiteDto } from "../../queries/bootstrapProducts";

export interface ProductsTableProps {
  items: ProductLiteDto[];
  loadingInitial: boolean;
  loadingMore: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
}

export function ProductsTable({
  items,
  loadingInitial,
  loadingMore,
  hasNextPage,
  onLoadMore,
}: ProductsTableProps) {
  const resourceName = { singular: "product", plural: "products" };

  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
  } = useIndexResourceState(items, {
    resourceIDResolver: (product) => product.id,
  });

  const productStatusTone: Record<
    ProductLiteDto["status"],
    "success" | "warning" | "critical"
  > = {
    ACTIVE: "success",
    DRAFT: "warning",
    ARCHIVED: "critical",
  };

  return (
    <Card>
      <Box padding="400">
        {loadingInitial && (
          <InlineStack align="center" gap="200">
            <Spinner />
            <Text as="p">Loading products…</Text>
          </InlineStack>
        )}

        {!loadingInitial && items.length === 0 && (
          <Banner tone="info">
            <p>No products found in FAST plane yet.</p>
            <p>The initial sync might still be running, or your search / filters are too specific.</p>
          </Banner>
        )}
      </Box>

      {!loadingInitial && items.length > 0 && (
        <>
          <IndexTable
            resourceName={resourceName}
            itemCount={items.length}
            selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
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
            {items.map((product, index) => (
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
                  <Badge tone={productStatusTone[product.status]}>{product.status}</Badge>
                </IndexTable.Cell>

                <IndexTable.Cell>{product.vendor || "—"}</IndexTable.Cell>

                <IndexTable.Cell>{product.productType || "—"}</IndexTable.Cell>

                <IndexTable.Cell>
                  {product.tags.length ? product.tags.join(", ") : "—"}
                </IndexTable.Cell>

                <IndexTable.Cell>
                  <Badge tone={product.hasImages ? "success" : "critical"}>
                    {product.hasImages ? "Yes" : "No"}
                  </Badge>
                </IndexTable.Cell>

                <IndexTable.Cell>
                  <Text variant="bodySm" tone="subdued">
                    {product.updatedAtShopify
                      ? new Date(product.updatedAtShopify).toLocaleString()
                      : "—"}
                  </Text>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>

          {hasNextPage && (
            <Box padding="400">
              <InlineStack align="center">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  style={{
                    border: "1px solid var(--p-color-border, #c9cccf)",
                    borderRadius: "999px",
                    padding: "6px 16px",
                    background: "white",
                    cursor: loadingMore ? "default" : "pointer",
                  }}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </InlineStack>
            </Box>
          )}
        </>
      )}
    </Card>
  );
}
