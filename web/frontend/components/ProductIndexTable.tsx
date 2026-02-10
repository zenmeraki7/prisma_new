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
  SkeletonBodyText,
  SkeletonThumbnail,
  Button,
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

function formatUpdatedAt(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

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

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(products as any);

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
        updatedAtShopify,
      },
      index,
    ) => {
      const isSelected = selectedResources.includes(id);

      const handleTitleClick = (e: React.MouseEvent) => {
        // don’t let this click toggle the checkbox / row selection
        e.stopPropagation();
        navigate(`/products/${encodeURIComponent(id)}`);
      };

      return (
        <IndexTable.Row
          id={id}
          key={id}
          selected={isSelected}
          position={index}
          // NOTE: no onClick on the Row itself → selection works
        >
          {/* 1. Image / Thumbnail */}
          <IndexTable.Cell>
            <Thumbnail
              source={hasImages ? ImageIcon : ""}
              alt={title}
              size="small"
            />
          </IndexTable.Cell>

          {/* 2. Product title & vendor (title is the clickable link) */}
          <IndexTable.Cell>
            <Button
              variant="plain"
              onClick={handleTitleClick}
              removeUnderline
            >
              <Text variant="bodyMd" fontWeight="bold" as="span">
                {title}
              </Text>
            </Button>
            {vendor && (
              <Text variant="bodySm" tone="subdued" as="span">
                <br />
                {vendor}
              </Text>
            )}
          </IndexTable.Cell>

          {/* 3. Status */}
          <IndexTable.Cell>
            <Badge
              tone={
                status === "ACTIVE"
                  ? "success"
                  : status === "DRAFT"
                  ? "attention"
                  : "info"
              }
            >
              {status}
            </Badge>
          </IndexTable.Cell>

          {/* 4. Inventory */}
          <IndexTable.Cell>
            <Text as="span" numeric>
              {totalInventory != null ? `${totalInventory} in stock` : "—"}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              <br />
              {variantCount != null
                ? `${variantCount} ${
                    variantCount === 1 ? "variant" : "variants"
                  }`
                : "— variants"}
            </Text>
          </IndexTable.Cell>

          {/* 5. Type & tags */}
          <IndexTable.Cell>
            <Text as="span" variant="bodySm">
              {productType || "—"}
            </Text>
            {tags.length > 0 && (
              <div
                style={{
                  marginTop: "4px",
                  display: "flex",
                  gap: "4px",
                  flexWrap: "wrap",
                }}
              >
                {tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} tone="new" size="small">
                    {tag}
                  </Badge>
                ))}
                {tags.length > 3 && (
                  <span style={{ fontSize: "0.8em" }}>
                    +{tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </IndexTable.Cell>

          {/* 6. Last updated */}
          <IndexTable.Cell>
            <Text as="span" variant="bodySm" tone="subdued">
              {formatUpdatedAt(updatedAtShopify)}
            </Text>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  if (loading && products.length === 0) {
    return (
      <Card>
        <IndexTable
          resourceName={resourceName}
          itemCount={10}
          selectedItemsCount={0}
          onSelectionChange={() => {}}
          headings={[
            { title: "" },
            { title: "Product" },
            { title: "Status" },
            { title: "Inventory" },
            { title: "Type & tags" },
            { title: "Last updated" },
          ]}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <IndexTable.Row id={`skel-${i}`} key={i} position={i}>
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
              <IndexTable.Cell>
                <SkeletonBodyText lines={1} />
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    );
  }

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
          { title: "" },
          { title: "Product" },
          { title: "Status" },
          { title: "Inventory" },
          { title: "Type & tags" },
          { title: "Last updated" },
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
