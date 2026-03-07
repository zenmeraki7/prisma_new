// FILE: web/frontend/components/ProductIndexTable.tsx

import React from "react";
import {
  IndexTable,
  Card,
  useIndexResourceState,
  Text,
  Badge,
  Thumbnail,
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

function normalizeStatus(status: string | null | undefined): string {
  return String(status || "").trim().toLowerCase();
}

function statusTone(status: string): "success" | "attention" | "info" {
  const s = normalizeStatus(status);
  if (s === "active") return "success";
  if (s === "draft") return "attention";
  return "info";
}

function statusLabel(status: string): string {
  const s = normalizeStatus(status);
  if (!s) return "—";
  return s.toUpperCase();
}

export const ProductIndexTable: React.FC<ProductIndexTableProps> = ({
  products,
  loading,
  hasNextPage,
  onLoadMore,
}) => {
  const navigate = useNavigate();

  const resourceName = { singular: "product", plural: "products" };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(products as any);

  const headings = [
    { title: "" },
    { title: "Title" },
    { title: "Vendor" },
    { title: "Status" },
    { title: "Inventory" },
    { title: "Product type" },
    { title: "Tags" },
    { title: "Last updated" },
  ] as const;

  const rowMarkup = products.map((p, index) => {
    const isSelected = selectedResources.includes(p.id);

    const handleTitleClick = () => {
      navigate(`/products/${encodeURIComponent(p.id)}`);
    };

    return (
      <IndexTable.Row
        id={p.id}
        key={p.id}
        selected={isSelected}
        position={index}
      >
        <IndexTable.Cell>
          <Thumbnail
            source={p.hasImages ? ImageIcon : ""}
            alt={p.title}
            size="small"
          />
        </IndexTable.Cell>

        <IndexTable.Cell>
          <div onClick={(e) => e.stopPropagation()}>
            <Button
              variant="plain"
              onClick={handleTitleClick}
              removeUnderline
            >
              {p.title}
            </Button>
          </div>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Text
            as="span"
            variant="bodySm"
            tone={p.vendor ? "base" : "subdued"}
          >
            {p.vendor || "—"}
          </Text>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Text as="span" numeric>
            {p.totalInventory != null ? `${p.totalInventory} in stock` : "—"}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            <br />
            {p.variantCount != null
              ? `${p.variantCount} ${p.variantCount === 1 ? "variant" : "variants"}`
              : "— variants"}
          </Text>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Text
            as="span"
            variant="bodySm"
            tone={p.productType ? "base" : "subdued"}
          >
            {p.productType || "—"}
          </Text>
        </IndexTable.Cell>

        <IndexTable.Cell>
          {p.tags?.length ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {p.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} tone="new" size="small">
                  {tag}
                </Badge>
              ))}
              {p.tags.length > 3 && (
                <Text as="span" variant="bodySm" tone="subdued">
                  +{p.tags.length - 3}
                </Text>
              )}
            </div>
          ) : (
            <Text as="span" variant="bodySm" tone="subdued">
              —
            </Text>
          )}
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Text as="span" variant="bodySm" tone="subdued">
            {formatUpdatedAt(p.updatedAtShopify)}
          </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  if (loading && products.length === 0) {
    return (
      <Card>
        <IndexTable
          resourceName={resourceName}
          itemCount={10}
          selectedItemsCount={0}
          onSelectionChange={() => {}}
          headings={headings as any}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <IndexTable.Row id={`skel-${i}`} key={i} position={i}>
              <IndexTable.Cell>
                <SkeletonThumbnail size="small" />
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

  return (
    <Card padding="0">
      <IndexTable
        resourceName={resourceName}
        itemCount={products.length}
        selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
        onSelectionChange={handleSelectionChange}
        headings={headings as any}
        pagination={{ hasNext: hasNextPage, onNext: onLoadMore }}
      >
        {rowMarkup}
      </IndexTable>
    </Card>
  );
};