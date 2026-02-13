// FILE: web/frontend/lib/filters/uiRegistry.ts

export type FilterScope = "product" | "variant";
export type ValueKind = "string" | "text" | "number" | "boolean" | "date" | "enum";

export type FilterOperator =
  | "EQ" | "NEQ" | "IN" | "NOT_IN"
  | "CONTAINS" | "NOT_CONTAINS" | "STARTS_WITH" | "ENDS_WITH"
  | "GT" | "GTE" | "LT" | "LTE" | "BETWEEN"
  | "IS_SET" | "IS_NOT_SET";

export type FilterKey =
  // Product
  | "product.category"
  | "product.collection"
  | "product.createdAt"
  | "product.publishedAt"
  | "product.updatedAt"
  | "product.description"
  | "product.handle"
  | "product.inventoryQuantity"
  | "product.option1Name"
  | "product.option2Name"
  | "product.option3Name"
  | "product.id"
  | "product.productType"
  | "product.searchEngineVisibility"
  | "product.status"
  | "product.tag"
  | "product.template"
  | "product.title"
  | "product.variantCount"
  | "product.vendor"
  | "product.visibleOnlineStore"
  | "product.visiblePos"
  // Variant
  | "variant.barcode"
  | "variant.chargeTax"
  | "variant.compareAtPrice"
  | "variant.inventoryLocation"
  | "variant.cost"
  | "variant.countryOfOrigin"
  | "variant.hsTariffCode"
  | "variant.inventoryPolicy"
  | "variant.option1Value"
  | "variant.option2Value"
  | "variant.option3Value"
  | "variant.physicalProduct"
  | "variant.price"
  | "variant.profitMargin"
  | "variant.sku"
  | "variant.trackQuantity"
  | "variant.inventoryQuantity"
  | "variant.title"
  | "variant.weight"
  | "variant.weightUnit";

export type FilterWidget = "text" | "textarea" | "number" | "boolean" | "date" | "select";

export interface EnumValue {
  value: string;
  label: string;
}

export interface UiFilterDef {
  key: FilterKey;
  label: string;
  scope: FilterScope;
  valueKind: ValueKind;
  widget: FilterWidget;
  operators: FilterOperator[];
  enumValues?: EnumValue[];
}

export const UI_FILTERS: UiFilterDef[] = [
  // ─────────────── Product fields ───────────────
  { key: "product.category", label: "Category", scope: "product", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "product.collection", label: "Collection", scope: "product", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "product.createdAt", label: "Date Created", scope: "product", valueKind: "date", widget: "date", operators: ["GTE", "LTE", "BETWEEN"] },
  { key: "product.publishedAt", label: "Date Published", scope: "product", valueKind: "date", widget: "date", operators: ["GTE", "LTE", "BETWEEN"] },
  { key: "product.updatedAt", label: "Date Updated", scope: "product", valueKind: "date", widget: "date", operators: ["GTE", "LTE", "BETWEEN"] },
  { key: "product.description", label: "Description", scope: "product", valueKind: "text", widget: "textarea", operators: ["CONTAINS"] },
  { key: "product.handle", label: "Handle (URL)", scope: "product", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "product.inventoryQuantity", label: "Inventory Quantity", scope: "product", valueKind: "number", widget: "number", operators: ["GTE", "LTE", "BETWEEN", "EQ"] },
  { key: "product.option1Name", label: "Option 1 Name", scope: "product", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "product.option2Name", label: "Option 2 Name", scope: "product", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "product.option3Name", label: "Option 3 Name", scope: "product", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "product.id", label: "Product ID", scope: "product", valueKind: "string", widget: "text", operators: ["EQ", "CONTAINS"] },
  { key: "product.productType", label: "Product Type (Custom)", scope: "product", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ", "IN"] },

  {
    key: "product.searchEngineVisibility",
    label: "Search Engine Visibility (SEO)",
    scope: "product",
    valueKind: "enum",
    widget: "select",
    operators: ["EQ", "IN"],
    enumValues: [
      { value: "visible", label: "Visible" },
      { value: "hidden", label: "Hidden" },
    ],
  },

  {
    key: "product.status",
    label: "Status",
    scope: "product",
    valueKind: "enum",
    widget: "select",
    operators: ["EQ", "IN"],
    enumValues: [
      { value: "active", label: "Active" },
      { value: "draft", label: "Draft" },
      { value: "archived", label: "Archived" },
    ],
  },

  { key: "product.tag", label: "Tag", scope: "product", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ", "IN"] },
  { key: "product.template", label: "Theme Template", scope: "product", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "product.title", label: "Title", scope: "product", valueKind: "text", widget: "text", operators: ["CONTAINS", "STARTS_WITH", "EQ"] },
  { key: "product.variantCount", label: "Variant Count", scope: "product", valueKind: "number", widget: "number", operators: ["GTE", "LTE", "BETWEEN", "EQ"] },
  { key: "product.vendor", label: "Vendor", scope: "product", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ", "IN"] },
  { key: "product.visibleOnlineStore", label: "Visible on Online Store (web)", scope: "product", valueKind: "boolean", widget: "boolean", operators: ["EQ"] },
  { key: "product.visiblePos", label: "Visible on Point of Sale (POS)", scope: "product", valueKind: "boolean", widget: "boolean", operators: ["EQ"] },

  // ─────────────── Variant fields ───────────────
  { key: "variant.barcode", label: "Barcode (ISBN, UPC, GTIN, etc.)", scope: "variant", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "variant.chargeTax", label: "Charge tax on this product", scope: "variant", valueKind: "boolean", widget: "boolean", operators: ["EQ"] },
  { key: "variant.compareAtPrice", label: "Compare-at Price", scope: "variant", valueKind: "number", widget: "number", operators: ["GTE", "LTE", "BETWEEN", "EQ"] },
  { key: "variant.inventoryLocation", label: "Connected Inventory Location", scope: "variant", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "variant.cost", label: "Cost", scope: "variant", valueKind: "number", widget: "number", operators: ["GTE", "LTE", "BETWEEN", "EQ"] },
  { key: "variant.countryOfOrigin", label: "Country of Origin", scope: "variant", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "variant.hsTariffCode", label: "HS Tariff Code", scope: "variant", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },

  {
    key: "variant.inventoryPolicy",
    label: "Inventory Out of Stock Policy",
    scope: "variant",
    valueKind: "enum",
    widget: "select",
    operators: ["EQ", "IN"],
    enumValues: [
      { value: "deny", label: "Deny" },
      { value: "continue", label: "Continue" },
    ],
  },

  { key: "variant.option1Value", label: "Option 1 Value", scope: "variant", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "variant.option2Value", label: "Option 2 Value", scope: "variant", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "variant.option3Value", label: "Option 3 Value", scope: "variant", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "variant.physicalProduct", label: "Physical Product", scope: "variant", valueKind: "boolean", widget: "boolean", operators: ["EQ"] },
  { key: "variant.price", label: "Price", scope: "variant", valueKind: "number", widget: "number", operators: ["GTE", "LTE", "BETWEEN", "EQ"] },
  { key: "variant.profitMargin", label: "Profit Margin", scope: "variant", valueKind: "number", widget: "number", operators: ["GTE", "LTE", "BETWEEN", "EQ"] },
  { key: "variant.sku", label: "SKU", scope: "variant", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "variant.trackQuantity", label: "Track Quantity", scope: "variant", valueKind: "boolean", widget: "boolean", operators: ["EQ"] },
  { key: "variant.inventoryQuantity", label: "Variant Inventory Quantity", scope: "variant", valueKind: "number", widget: "number", operators: ["GTE", "LTE", "BETWEEN", "EQ"] },
  { key: "variant.title", label: "Variant Title", scope: "variant", valueKind: "string", widget: "text", operators: ["CONTAINS", "EQ"] },
  { key: "variant.weight", label: "Weight", scope: "variant", valueKind: "number", widget: "number", operators: ["GTE", "LTE", "BETWEEN", "EQ"] },

  {
    key: "variant.weightUnit",
    label: "Weight Unit",
    scope: "variant",
    valueKind: "enum",
    widget: "select",
    operators: ["EQ", "IN"],
    enumValues: [
      { value: "g", label: "Grams" },
      { value: "kg", label: "Kilograms" },
      { value: "oz", label: "Ounces" },
      { value: "lb", label: "Pounds" },
    ],
  },
];

export const UI_FILTERS_BY_KEY = new Map(UI_FILTERS.map((d) => [d.key, d]));
