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

  /* 🔥 NEW */
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
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
  selectedIds,
  onSelectionChange,
}) => {
  const navigate = useNavigate();

  const resourceName = { singular: "product", plural: "products" };

  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
  } = useIndexResourceState(products as any, {
    selectedResources: selectedIds,
  });

  React.useEffect(() => {
    onSelectionChange(selectedResources as string[]);
  }, [selectedResources]);

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
          <Button
            variant="plain"
            onClick={() => navigate(`/products/${p.id}`)}
            removeUnderline
          >
            {p.title}
          </Button>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Text as="p" tone={p.vendor ? "base" : "subdued"}>
            {p.vendor || "—"}
          </Text>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Badge tone={statusTone(p.status)}>
            {statusLabel(p.status)}
          </Badge>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Text as="p" numeric>
            {p.totalInventory != null ? `${p.totalInventory} in stock` : "—"}
          </Text>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Text as="p" tone={p.productType ? "base" : "subdued"}>
            {p.productType || "—"}
          </Text>
        </IndexTable.Cell>

        <IndexTable.Cell>
          {p.tags?.slice(0, 3).map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Text as="p" tone="subdued">
            {formatUpdatedAt(p.updatedAtShopify)}
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
        selectedItemsCount={
          allResourcesSelected ? "All" : selectedResources.length
        }
        onSelectionChange={handleSelectionChange}
        headings={headings as any}
        pagination={{ hasNext: hasNextPage, onNext: onLoadMore }}
      >
        {rowMarkup}
      </IndexTable>
    </Card>
  );
};