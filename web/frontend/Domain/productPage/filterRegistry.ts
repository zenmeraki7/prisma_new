// web/frontend/pages/productsPage/filterRegistry.ts
import type { FieldDef, FilterKind } from "./filterTypes";

export const PRODUCT_FIELDS: FieldDef[] = [
  { key: "product.category", label: "Category", group: "product", kind: "string", supportedNow: false },
  { key: "product.collection", label: "Collection", group: "product", kind: "string", supportedNow: false },
  { key: "product.createdAt", label: "Date Created", group: "product", kind: "date", supportedNow: false },
  { key: "product.publishedAt", label: "Date Published", group: "product", kind: "date", supportedNow: false },
  { key: "product.updatedAt", label: "Date Updated", group: "product", kind: "date", supportedNow: true }, // maps to updatedAtShopify
  { key: "product.description", label: "Description", group: "product", kind: "string", supportedNow: false },
  { key: "product.handle", label: "Handle (URL)", group: "product", kind: "string", supportedNow: true },
  { key: "product.inventoryQuantity", label: "Inventory Quantity", group: "product", kind: "number", supportedNow: false },
  { key: "product.option1Name", label: "Option 1 Name", group: "product", kind: "string", supportedNow: false },
  { key: "product.option2Name", label: "Option 2 Name", group: "product", kind: "string", supportedNow: false },
  { key: "product.option3Name", label: "Option 3 Name", group: "product", kind: "string", supportedNow: false },
  { key: "product.id", label: "Product ID", group: "product", kind: "string", supportedNow: false },
  { key: "product.productType", label: "Product Type (Custom)", group: "product", kind: "string", supportedNow: true },
  { key: "product.seoVisibility", label: "Search Engine Visibility (SEO)", group: "product", kind: "enum", supportedNow: false },
  { key: "product.status", label: "Status", group: "product", kind: "enum", supportedNow: true },
  { key: "product.tag", label: "Tag", group: "product", kind: "string", supportedNow: true }, // maps to tags[]
  { key: "product.themeTemplate", label: "Theme Template", group: "product", kind: "string", supportedNow: false },
  { key: "product.title", label: "Title", group: "product", kind: "string", supportedNow: true },
  { key: "product.variantCount", label: "Variant Count", group: "product", kind: "number", supportedNow: false },
  { key: "product.vendor", label: "Vendor", group: "product", kind: "string", supportedNow: true },
  { key: "product.visibleOnlineStore", label: "Visible on Online Store (web)", group: "product", kind: "boolean", supportedNow: false },
  { key: "product.visiblePOS", label: "Visible on Point of Sale (POS)", group: "product", kind: "boolean", supportedNow: false },
];

export const VARIANT_FIELDS: FieldDef[] = [
  { key: "variant.barcode", label: "Barcode (ISBN, UPC, GTIN, etc.)", group: "variant", kind: "string", supportedNow: false },
  { key: "variant.chargeTax", label: "Charge tax on this product", group: "variant", kind: "boolean", supportedNow: false },
  { key: "variant.compareAtPrice", label: "Compare-at Price", group: "variant", kind: "number", supportedNow: false },
  { key: "variant.connectedInventoryLocation", label: "Connected Inventory Location", group: "variant", kind: "string", supportedNow: false },
  { key: "variant.cost", label: "Cost", group: "variant", kind: "number", supportedNow: false },
  { key: "variant.countryOfOrigin", label: "Country of Origin", group: "variant", kind: "string", supportedNow: false },
  { key: "variant.hsTariffCode", label: "HS Tariff Code", group: "variant", kind: "string", supportedNow: false },
  { key: "variant.outOfStockPolicy", label: "Inventory Out of Stock Policy", group: "variant", kind: "enum", supportedNow: false },
  { key: "variant.option1Value", label: "Option 1 Value", group: "variant", kind: "string", supportedNow: false },
  { key: "variant.option2Value", label: "Option 2 Value", group: "variant", kind: "string", supportedNow: false },
  { key: "variant.option3Value", label: "Option 3 Value", group: "variant", kind: "string", supportedNow: false },
  { key: "variant.physicalProduct", label: "Physical Product", group: "variant", kind: "boolean", supportedNow: false },
  { key: "variant.price", label: "Price", group: "variant", kind: "number", supportedNow: false },
  { key: "variant.profitMargin", label: "Profit Margin", group: "variant", kind: "number", supportedNow: false },
  { key: "variant.sku", label: "SKU", group: "variant", kind: "string", supportedNow: false },
  { key: "variant.trackQuantity", label: "Track Quantity", group: "variant", kind: "boolean", supportedNow: false },
  { key: "variant.inventoryQuantity", label: "Variant Inventory Quantity", group: "variant", kind: "number", supportedNow: false },
  { key: "variant.title", label: "Variant Title", group: "variant", kind: "string", supportedNow: false },
  { key: "variant.weight", label: "Weight", group: "variant", kind: "number", supportedNow: false },
  { key: "variant.weightUnit", label: "Weight Unit", group: "variant", kind: "enum", supportedNow: false },
];

export const ALL_FIELDS: FieldDef[] = [...PRODUCT_FIELDS, ...VARIANT_FIELDS];

export function fieldLabel(key: string): string {
  return ALL_FIELDS.find((f) => f.key === key)?.label ?? key;
}

export function fieldKind(key: string): FilterKind {
  return ALL_FIELDS.find((f) => f.key === key)?.kind ?? "string";
}

export function fieldSupportedNow(key: string): boolean {
  return ALL_FIELDS.find((f) => f.key === key)?.supportedNow ?? false;
}
