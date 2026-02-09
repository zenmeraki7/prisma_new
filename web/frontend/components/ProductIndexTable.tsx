// FILE: web/frontend/components/ProductIndexTable.tsx

import React from "react";
import {
  IndexTable,
  Card,
  useIndexResourceState,
  Text,
  Badge,
  Thumbnail,
  InlineStack,
  BlockStack,
  SkeletonBodyText,
  SkeletonThumbnail,
  Box,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { useNavigate } from "react-router-dom";
import type { ProductLiteNode } from "../hooks/useProductsByFilter";

interface ProductIndexTableProps {
  products: ProductLiteNode[];
  loading: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
}

/**
 * ProductIndexTable
 *
 * - Assumes ProductLiteNode is aligned with bootstrapProducts / productsByFilter:
 *   id, title, status, hasImages, vendor, productType, tags,
 *   totalInventory?, variantCount?
 *
 * - Uses Polaris IndexTable for a familiar Shopify admin feel.
 * - Handles loading skeletons, empty state, and cursor pagination.
 */
export const ProductIndexTable: React.FC<ProductIndexTableProps> = ({
  products,
  loading,
  hasNextPage,
  onLoadMore,
}) => {
  const navigate = useNavigate();

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
  } = useIndexResourceState(products as any);

  // -------------------------------------------------------
  // Skeleton (Initial Loading)
  // -------------------------------------------------------
  if (loading && products.length === 0) {
    return (
      <Card>
        <IndexTable
          resourceName={resourceName}
          itemCount={5}
          selectable={false}
          selectedItemsCount={0}
          onSelectionChange={() => {}}
          headings={[
            { title: "" },
            { title: "Product" },
            { title: "Status" },
            { title: "Inventory" },
            { title: "Type" },
          ]}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <IndexTable.Row id={`skeleton-${i}`} key={i} position={i}>
              <IndexTable.Cell>
                <SkeletonThumbnail size="small" />
              </IndexTable.Cell>
              <IndexTable.Cell>
                <SkeletonBodyText lines={2} />
              </IndexTable.Cell>
              <IndexTable.Cell>
                <SkeletonBodyText lines={1} />
              </IndexTable.Cell>
              <IndexTable.Cell>
                <SkeletonBodyText lines={1} />
              </IndexTable.Cell>
              <IndexTable.Cell>
                <SkeletonBodyText lines={1} />
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    );
  }

  // -------------------------------------------------------
  // Empty State (No Products After Load)
  // -------------------------------------------------------
  if (!loading && products.length === 0) {
    return (
      <Card>
        <Box padding="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">
              No products found
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Try adjusting your filters or syncing products from Shopify.
            </Text>
          </BlockStack>
        </Box>
      </Card>
    );
  }

  // -------------------------------------------------------
  // Row Markup
  // -------------------------------------------------------
  const rowMarkup = products.map(
    (
      {
        id,
        title,
        status,
        hasImages,
        vendor,
        productType,
        tags,
        totalInventory,
        variantCount,
      },
      index,
    ) => {
      const isSelected = selectedResources.includes(id);

      const handleClick = () => {
        navigate(`/products/${encodeURIComponent(id)}`);
      };

      const inventoryValue =
        typeof totalInventory === "number" ? totalInventory : 0;
      const variantValue =
        typeof variantCount === "number" ? variantCount : 0;

      return (
        <IndexTable.Row
          id={id}
          key={id}
          selected={isSelected}
          position={index}
          onClick={handleClick}
        >
          {/* 1. Image / Thumbnail */}
          <IndexTable.Cell>
            <Thumbnail
              source={hasImages ? ImageIcon : ImageIcon}
              alt={title}
              size="small"
            />
          </IndexTable.Cell>

          {/* 2. Title & Vendor */}
          <IndexTable.Cell>
            <BlockStack gap="050">
              <Text variant="bodyMd" fontWeight="bold" as="span">
                {title}
              </Text>
              {vendor && (
                <Text variant="bodySm" tone="subdued" as="span">
                  {vendor}
                </Text>
              )}
            </BlockStack>
          </IndexTable.Cell>

          {/* 3. Status */}
          <IndexTable.Cell>
            <Badge
              tone={
                status === "ACTIVE"
                  ? "success"
                  : status === "DRAFT"
                  ? "warning"
                  : "info"
              }
            >
              {status}
            </Badge>
          </IndexTable.Cell>

          {/* 4. Inventory (FAST rollup) */}
          <IndexTable.Cell>
            <BlockStack gap="025">
              <Text as="span" variant="bodyMd">
                {inventoryValue} in stock
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {variantValue} variants
              </Text>
            </BlockStack>
          </IndexTable.Cell>

          {/* 5. Type & Tags */}
          <IndexTable.Cell>
            <BlockStack gap="050">
              <Text as="span" variant="bodySm">
                {productType || "—"}
              </Text>
              {tags && tags.length > 0 && (
                <InlineStack gap="050" wrap>
                  {tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} tone="new" size="small">
                      {tag}
                    </Badge>
                  ))}
                  {tags.length > 3 && (
                    <Text as="span" variant="bodyXs" tone="subdued">
                      +{tags.length - 3}
                    </Text>
                  )}
                </InlineStack>
              )}
            </BlockStack>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  // -------------------------------------------------------
  // Main Render
  // -------------------------------------------------------
  return (
    <Card padding="0">
      <IndexTable
        resourceName={resourceName}
        itemCount={products.length}
        selectedItemsCount={
          allResourcesSelected ? "All" : selectedResources.length
        }
        onSelectionChange={handleSelectionChange}
        headings={[
          { title: "" }, // Image
          { title: "Product" },
          { title: "Status" },
          { title: "Inventory" },
          { title: "Type & tags" },
        ]}
        pagination={{
          hasNext: hasNextPage,
          onNext: onLoadMore,
        }}
      >
        {rowMarkup}
      </IndexTable>
    </Card>
  );
};
