// FILE: web/frontend/filters/FILTERS.ts

// All known filter IDs. Keep these in sync with backend registry when you wire
// them to real FilterExpr / compileFastWhere.
export type FilterId =
  // Product fields
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
  | "product.searchVisibility"
  | "product.status"
  | "product.tag"
  | "product.template"
  | "product.title"
  | "product.variantCount"
  | "product.vendor"
  | "product.visibleOnlineStore"
  | "product.visiblePos"
  // Variant fields
  | "variant.barcode"
  | "variant.taxable"
  | "variant.compareAtPrice"
  | "variant.connectedInventoryLocation"
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

export type FilterGroupLabel = "Product Fields" | "Variant Fields";

export type FilterConfig = {
  id: FilterId;
  label: string;
  groupLabel: FilterGroupLabel;
};

export const FILTERS: FilterConfig[] = [
  // ------------------------
  // Product Fields
  // ------------------------
  {
    id: "product.category",
    label: "Category",
    groupLabel: "Product Fields",
  },
  {
    id: "product.collection",
    label: "Collection",
    groupLabel: "Product Fields",
  },
  {
    id: "product.createdAt",
    label: "Date Created",
    groupLabel: "Product Fields",
  },
  {
    id: "product.publishedAt",
    label: "Date Published",
    groupLabel: "Product Fields",
  },
  {
    id: "product.updatedAt",
    label: "Date Updated",
    groupLabel: "Product Fields",
  },
  {
    id: "product.description",
    label: "Description",
    groupLabel: "Product Fields",
  },
  {
    id: "product.handle",
    label: "Handle (URL)",
    groupLabel: "Product Fields",
  },
  {
    id: "product.inventoryQuantity",
    label: "Inventory Quantity",
    groupLabel: "Product Fields",
  },
  {
    id: "product.option1Name",
    label: "Option 1 Name",
    groupLabel: "Product Fields",
  },
  {
    id: "product.option2Name",
    label: "Option 2 Name",
    groupLabel: "Product Fields",
  },
  {
    id: "product.option3Name",
    label: "Option 3 Name",
    groupLabel: "Product Fields",
  },
  {
    id: "product.id",
    label: "Product ID",
    groupLabel: "Product Fields",
  },
  {
    id: "product.productType",
    label: "Product Type (Custom)",
    groupLabel: "Product Fields",
  },
  {
    id: "product.searchVisibility",
    label: "Search Engine Visibility (SEO)",
    groupLabel: "Product Fields",
  },
  {
    id: "product.status",
    label: "Status",
    groupLabel: "Product Fields",
  },
  {
    id: "product.tag",
    label: "Tag",
    groupLabel: "Product Fields",
  },
  {
    id: "product.template",
    label: "Theme Template",
    groupLabel: "Product Fields",
  },
  {
    id: "product.title",
    label: "Title",
    groupLabel: "Product Fields",
  },
  {
    id: "product.variantCount",
    label: "Variant Count",
    groupLabel: "Product Fields",
  },
  {
    id: "product.vendor",
    label: "Vendor",
    groupLabel: "Product Fields",
  },
  {
    id: "product.visibleOnlineStore",
    label: "Visible on Online Store (web)",
    groupLabel: "Product Fields",
  },
  {
    id: "product.visiblePos",
    label: "Visible on Point of Sale (POS)",
    groupLabel: "Product Fields",
  },

  // ------------------------
  // Variant Fields
  // ------------------------
  {
    id: "variant.barcode",
    label: "Barcode (ISBN, UPC, GTIN, etc.)",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.taxable",
    label: "Charge tax on this product",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.compareAtPrice",
    label: "Compare-at Price",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.connectedInventoryLocation",
    label: "Connected Inventory Location",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.cost",
    label: "Cost",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.countryOfOrigin",
    label: "Country of Origin",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.hsTariffCode",
    label: "HS Tariff Code",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.inventoryPolicy",
    label: "Inventory Out of Stock Policy",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.option1Value",
    label: "Option 1 Value",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.option2Value",
    label: "Option 2 Value",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.option3Value",
    label: "Option 3 Value",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.physicalProduct",
    label: "Physical Product",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.price",
    label: "Price",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.profitMargin",
    label: "Profit Margin",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.sku",
    label: "SKU",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.trackQuantity",
    label: "Track Quantity",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.inventoryQuantity",
    label: "Variant Inventory Quantity",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.title",
    label: "Variant Title",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.weight",
    label: "Weight",
    groupLabel: "Variant Fields",
  },
  {
    id: "variant.weightUnit",
    label: "Weight Unit",
    groupLabel: "Variant Fields",
  },
];
