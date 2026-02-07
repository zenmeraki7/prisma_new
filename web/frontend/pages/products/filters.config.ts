// web/frontend/pages/products/filters.config.ts

export type UiFilterConfig = {
  id: string;
  label: string;
  valueKind: "string" | "number" | "boolean";
  operators: readonly string[];
};

export const FILTERS: readonly UiFilterConfig[] = [
  { id: "product.status", label: "Status", valueKind: "string", operators: ["eq"] },
  { id: "product.vendor", label: "Vendor", valueKind: "string", operators: ["contains"] },
  { id: "product.productType", label: "Product type", valueKind: "string", operators: ["contains"] },
  { id: "product.tags", label: "Tag", valueKind: "string", operators: ["contains"] },
  { id: "product.hasImages", label: "Has images", valueKind: "boolean", operators: ["eq"] },
  { id: "product.totalInventory", label: "Total inventory", valueKind: "number", operators: ["gte"] },
];
