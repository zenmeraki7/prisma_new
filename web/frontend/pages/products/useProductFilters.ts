// FILE: web/frontend/pages/products/useProductFilters.ts

import { useMemo, useState } from "react";

/**
 * Minimal filter AST that both frontend and backend understand.
 */

export type FilterLeafExpr = {
  type: "leaf";
  filterId: string;
  op: string;
  value: unknown;
};

export type FilterGroupExpr = {
  type: "group";
  op: "AND" | "OR";
  children: Array<FilterExpr>;
};

export type FilterExpr = FilterLeafExpr | FilterGroupExpr;

type FilterValueKind = "string" | "number" | "boolean" | "date";

export type UiFilterConfig = {
  id: string;
  label: string;
  valueKind: FilterValueKind;
  placeholder?: string;
};

/**
 * All filters supported by the backend (buildProductWhereFromFilter).
 * IDs MUST match the switch cases there.
 */
export const FILTERS_CONFIG: UiFilterConfig[] = [
  // ── PRODUCT FIELDS ────────────────────────────────────────────────
  { id: "product.category", label: "Category", valueKind: "string" },
  { id: "product.collection", label: "Collection", valueKind: "string" },
  {
    id: "product.createdAt",
    label: "Date Created (>=)",
    valueKind: "date",
    placeholder: "YYYY-MM-DD",
  },
  {
    id: "product.publishedAt",
    label: "Date Published (>=)",
    valueKind: "date",
    placeholder: "YYYY-MM-DD",
  },
  {
    id: "product.updatedAt",
    label: "Date Updated (>=)",
    valueKind: "date",
    placeholder: "YYYY-MM-DD",
  },
  { id: "product.description", label: "Description", valueKind: "string" },
  { id: "product.handle", label: "Handle (URL)", valueKind: "string" },
  {
    id: "product.inventoryQuantity",
    label: "Inventory Quantity ≥",
    valueKind: "number",
  },
  { id: "product.option1Name", label: "Option 1 Name", valueKind: "string" },
  { id: "product.option2Name", label: "Option 2 Name", valueKind: "string" },
  { id: "product.option3Name", label: "Option 3 Name", valueKind: "string" },
  { id: "product.productId", label: "Product ID", valueKind: "string" },
  {
    id: "product.productType",
    label: "Product Type (Custom)",
    valueKind: "string",
  },
  {
    id: "product.isSearchable",
    label: "Search Engine Visibility (SEO)",
    valueKind: "boolean",
    placeholder: "true / false",
  },
  { id: "product.status", label: "Status", valueKind: "string" },
  { id: "product.tag", label: "Tag", valueKind: "string" },
  {
    id: "product.templateSuffix",
    label: "Theme Template",
    valueKind: "string",
  },
  { id: "product.title", label: "Title", valueKind: "string" },
  {
    id: "product.variantCount",
    label: "Variant Count ≥",
    valueKind: "number",
  },
  { id: "product.vendor", label: "Vendor", valueKind: "string" },
  {
    id: "product.visibleOnlineStore",
    label: "Visible on Online Store (web)",
    valueKind: "boolean",
    placeholder: "true / false",
  },
  {
    id: "product.visiblePos",
    label: "Visible on Point of Sale (POS)",
    valueKind: "boolean",
    placeholder: "true / false",
  },

  // ── VARIANT / ROLLUP FIELDS ───────────────────────────────────────
  {
    id: "variant.barcode",
    label: "Variant Barcode (ISBN, UPC, GTIN, etc.)",
    valueKind: "string",
  },
  {
    id: "variant.taxable",
    label: "Charge tax on this product",
    valueKind: "boolean",
    placeholder: "true / false",
  },
  {
    id: "variant.compareAtPrice",
    label: "Compare-at Price ≥",
    valueKind: "number",
  },
  {
    id: "variant.inventoryLocation",
    label: "Connected Inventory Location",
    valueKind: "string",
  },
  { id: "variant.cost", label: "Cost ≥", valueKind: "number" },
  {
    id: "variant.countryOfOrigin",
    label: "Country of Origin",
    valueKind: "string",
  },
  {
    id: "variant.hsTariffCode",
    label: "HS Tariff Code",
    valueKind: "string",
  },
  {
    id: "variant.inventoryPolicy",
    label: "Inventory Out of Stock Policy",
    valueKind: "string",
  },
  {
    id: "variant.option1Value",
    label: "Variant Option 1 Value",
    valueKind: "string",
  },
  {
    id: "variant.option2Value",
    label: "Variant Option 2 Value",
    valueKind: "string",
  },
  {
    id: "variant.option3Value",
    label: "Variant Option 3 Value",
    valueKind: "string",
  },
  {
    id: "variant.physical",
    label: "Physical Product",
    valueKind: "boolean",
    placeholder: "true / false",
  },
  {
    id: "variant.price",
    label: "Price ≥ (any variant)",
    valueKind: "number",
  },
  {
    id: "variant.profitMargin",
    label: "Profit Margin ≥ (any variant)",
    valueKind: "number",
  },
  { id: "variant.sku", label: "SKU", valueKind: "string" },
  {
    id: "variant.trackQuantity",
    label: "Track Quantity",
    valueKind: "boolean",
    placeholder: "true / false",
  },
  {
    id: "variant.inventoryQty",
    label: "Variant Inventory Quantity ≥",
    valueKind: "number",
  },
  {
    id: "variant.title",
    label: "Variant Title",
    valueKind: "string",
  },
  {
    id: "variant.weightGrams",
    label: "Weight (grams) ≥",
    valueKind: "number",
  },
  {
    id: "variant.weightUnit",
    label: "Weight Unit",
    valueKind: "string",
  },
];

type DraftState = Record<string, string>;

function parseBoolean(value: string): boolean {
  const s = value.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

export function useProductFilters() {
  const [draft, setDraft] = useState<DraftState>({});
  const [applied, setApplied] = useState<DraftState>({});

  const filtersConfig = FILTERS_CONFIG;

  const appliedFilters = useMemo(
    () =>
      Object.entries(applied)
        .filter(([_, v]) => v != null && v !== "")
        .map(([key, value]) => {
          const def = filtersConfig.find((f) => f.id === key);
          return {
            key,
            label: def?.label ?? key,
            value,
          };
        }),
    [applied, filtersConfig],
  );

  const filterExpr: FilterExpr | null = useMemo(() => {
    const leaves: FilterLeafExpr[] = [];

    for (const [key, raw] of Object.entries(applied)) {
      if (raw == null || raw === "") continue;

      const def = filtersConfig.find((f) => f.id === key);
      if (!def) continue;

      let op: string;
      let value: unknown = raw;

      switch (def.valueKind) {
        case "number": {
          const n = Number(raw);
          if (!Number.isFinite(n)) continue;
          op = "gte"; // ≥ for numeric filters
          value = n;
          break;
        }
        case "date": {
          const d = new Date(raw);
          if (Number.isNaN(d.getTime())) continue;
          op = "gte"; // ≥ date
          value = d.toISOString();
          break;
        }
        case "boolean": {
          op = "eq";
          value = parseBoolean(raw);
          break;
        }
        default: {
          // string
          op = "contains";
          value = raw;
        }
      }

      leaves.push({
        type: "leaf",
        filterId: key,
        op,
        value,
      });
    }

    if (!leaves.length) return null;

    return {
      type: "group",
      op: "AND",
      children: leaves,
    };
  }, [applied, filtersConfig]);

  function apply() {
    setApplied(draft);
  }

  function clearAll() {
    setDraft({});
    setApplied({});
  }

  return {
    filtersConfig,
    draft,
    setDraft,
    appliedFilters,
    apply,
    clearAll,
    filterExpr,
  };
}
