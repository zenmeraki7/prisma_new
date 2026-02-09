// FILE: web/frontend/components/ProductIndexTable.tsx

import React from "react";
import {
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  Thumbnail,
  Icon,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";

export interface ProductRow {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor?: string | null;
  productType?: string | null;
  tags: string[];
  hasImages: boolean;
  updatedAtShopify: string | null;
  totalInventory?: number | null;
  variantCount?: number | null;
  // optional future: featuredImageUrl?: string | null;
}

interface ProductIndexTableProps {
  products: ProductRow[];
  loading: boolean;
  hasNextPage: boolean;
  onLoadMore?: () => void;
}

/**
 * Map product status to Polaris Badge tone
 */
function getStatusTone(status: string): "success" | "subdued" | "attention" | "info" | "critical" {
  switch (status.toLowerCase()) {
    case "active":
      return "success";    // green
    case "draft":
      return "attention";  // yellow
    case "archived":
      return "critical";   // red-ish to clearly show archived
    default:
      return "info";       // blue fallback
  }
}


/**
 * Format inventory number for display
 */
function formatInventory(totalInventory?: number | null): string {
  if (totalInventory == null) return "—";
  return `${totalInventory} in stock`;
}

/**
 * Format variant count for display
 */
function formatVariantCount(variantCount?: number | null): string {
  if (variantCount == null) return "— variants";
  if (variantCount === 1) return "1 variant";
  return `${variantCount} variants`;
}

/**
 * Format updated date/time for display
 */
function formatUpdatedAt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export const ProductIndexTable: React.FC<ProductIndexTableProps> = ({
  products,
  loading,
  hasNextPage,
  onLoadMore,
}) => {
  const resourceName = { singular: "product", plural: "products" };

  const rowsMarkup = products.map((product, index) => {
    const {
      id,
      title,
      vendor,
      status,
      productType,
      tags,
      hasImages,
      updatedAtShopify,
      totalInventory,
      variantCount,
    } = product;

    const tagBadges = tags.slice(0, 3);
    const extraTagCount = tags.length > 3 ? tags.length - 3 : 0;

    // Normalize status for badge text
    const normalizedStatus = status?.toLowerCase() || "";
    const displayStatus = normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);

    return (
      <IndexTable.Row id={id} key={id} position={index}>
        {/* 1. Image */}
        <IndexTable.Cell>
          <Thumbnail
            size="small"
            source={hasImages ? <Icon source={ImageIcon} /> : <Icon source={ImageIcon} />}
            alt={title || "Product image"}
          />
        </IndexTable.Cell>

        {/* 2. Product title + vendor */}
        <IndexTable.Cell>
          <BlockStack gap="025">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {title || "Untitled product"}
            </Text>
            {vendor && (
              <Text as="span" variant="bodySm" tone="subdued">
                {vendor}
              </Text>
            )}
          </BlockStack>
        </IndexTable.Cell>

        {/* 3. Status */}
        <IndexTable.Cell>
          <Badge tone={getStatusTone(normalizedStatus)}>{displayStatus}</Badge>
        </IndexTable.Cell>

        {/* 4. Inventory */}
        <IndexTable.Cell>
          <BlockStack gap="025">
            <Text as="span" variant="bodySm">
              {formatInventory(totalInventory)}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {formatVariantCount(variantCount)}
            </Text>
          </BlockStack>
        </IndexTable.Cell>

        {/* 5. Type & tags */}
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" variant="bodySm">
              {productType || "—"}
            </Text>
            {tagBadges.length > 0 && (
              <InlineStack gap="050" wrap>
                {tagBadges.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
                {extraTagCount > 0 && <Badge tone="subdued">+{extraTagCount}</Badge>}
              </InlineStack>
            )}
          </BlockStack>
        </IndexTable.Cell>

        {/* 6. Last updated */}
        <IndexTable.Cell>
          <Text as="span" variant="bodySm" tone="subdued">
            {formatUpdatedAt(updatedAtShopify)}
          </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Card padding="0">
      <IndexTable
        resourceName={resourceName}
        itemCount={products.length}
        selectable={false}
        loading={loading}
        headings={[
          { title: "" }, // image
          { title: "Product" },
          { title: "Status" },
          { title: "Inventory" },
          { title: "Type & tags" },
          { title: "Last updated" },
        ]}
      >
        {rowsMarkup}
      </IndexTable>

      {hasNextPage && onLoadMore && (
        <div style={{ padding: "12px 16px" }}>
          <InlineStack align="center">
            <Button onClick={onLoadMore} disabled={loading}>
              Load more
            </Button>
          </InlineStack>
        </div>
      )}
    </Card>
  );
};
