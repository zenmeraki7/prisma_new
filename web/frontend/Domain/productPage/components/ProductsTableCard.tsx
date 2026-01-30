// web/frontend/pages/productsPage/components/ProductsTableCard.tsx
import React, { useMemo } from "react";
import {
  Card,
  Box,
  InlineStack,
  Spinner,
  Text,
  Banner,
  IndexTable,
  Badge,
  Button,
  useIndexResourceState,
} from "@shopify/polaris";

import type { ProductLiteDto } from "../../../queries/bootstrapProducts";

export function ProductsTableCard(props: {
  items: ProductLiteDto[];
  loadingInitial: boolean;
  hasNextPage: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const { items, loadingInitial, hasNextPage, loadingMore, onLoadMore } = props;

  const resourceName = { singular: "product", plural: "products" };

  const productStatusTone: Record<ProductLiteDto["status"], "success" | "warning" | "critical"> = useMemo(
    () => ({
      ACTIVE: "success",
      DRAFT: "warning",
      ARCHIVED: "critical",
    }),
    [],
  );

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(items, {
      resourceIDResolver: (product) => product.id,
    });

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
                  <Text as="p" variant="bodySm" tone="subdued">
                    {product.handle}
                  </Text>
                </IndexTable.Cell>

                <IndexTable.Cell>
                  <Badge tone={productStatusTone[product.status]}>{product.status}</Badge>
                </IndexTable.Cell>

                <IndexTable.Cell>{product.vendor || "—"}</IndexTable.Cell>

                <IndexTable.Cell>{product.productType || "—"}</IndexTable.Cell>

                <IndexTable.Cell>{product.tags.length ? product.tags.join(", ") : "—"}</IndexTable.Cell>

                <IndexTable.Cell>
                  <Badge tone={product.hasImages ? "success" : "critical"}>
                    {product.hasImages ? "Yes" : "No"}
                  </Badge>
                </IndexTable.Cell>

                <IndexTable.Cell>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {product.updatedAtShopify ? new Date(product.updatedAtShopify).toLocaleString() : "—"}
                  </Text>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>

          {hasNextPage && (
            <Box padding="400">
              <InlineStack align="center">
                <Button onClick={onLoadMore} loading={loadingMore}>
                  Load more
                </Button>
              </InlineStack>
            </Box>
          )}
        </>
      )}
    </Card>
  );
}
