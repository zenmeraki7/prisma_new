// FILE: web/frontend/pages/ProductsPage.tsx

import React, { useMemo, useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  IndexTable,
  useIndexResourceState,
  Badge,
  Box,
  InlineStack,
  Spinner,
  Banner,
  Button,
  Filters,
  ChoiceList,
  Select,
  TextField,
  Autocomplete,
  DatePicker,
  type FiltersProps,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";

import type { AppBridgeState } from "@shopify/app-bridge-react";

import {
  bootstrapProductsRequest,
  type ProductLiteDto,
  type BootstrapProductsPageDto,
} from "../queries/bootstrapProducts";

import {
  productsByFilterRequest,
  type ProductsByFilterPageDto,
} from "../queries/productsByFilter";

import {
  buildFilterExpr,
  type UiFilter,
} from "../../lib/filters/buildFilterExpr";

// NEW: FAST plane sync hook
import { useFastPlaneSync } from "../queries/syncProductsToDb";

/* ----------------------- */
/* React Query             */
/* ----------------------- */

function useBootstrapProducts(
  app: AppBridgeState | undefined,
): UseInfiniteQueryResult<BootstrapProductsPageDto, Error> {
  return useInfiniteQuery({
    queryKey: ["bootstrapProducts"],
    enabled: !!app,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!app) throw new Error("AppBridge not ready");
      return bootstrapProductsRequest(app, {
        first: 50,
        after: pageParam ?? null,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  });
}

/**
 * Backend-filtered products fetcher using productsByFilter.
 * We key the query by a JSON-serialized filterExpr so changes reset pagination.
 */
function useProductsByFilter(
  app: AppBridgeState | undefined,
  filterExpr: unknown,
): UseInfiniteQueryResult<ProductsByFilterPageDto, Error> {
  const filterKey = filterExpr ? JSON.stringify(filterExpr) : "NONE";

  return useInfiniteQuery({
    queryKey: ["productsByFilter", filterKey],
    enabled: !!app,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!app) throw new Error("AppBridge not ready");
      return productsByFilterRequest(app, {
        first: 50,
        after: pageParam ?? null,
        filter: filterExpr,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  });
}

/* ----------------------- */
/* Status → Badge tone map */
/* ----------------------- */

const STATUS_TONE: Record<
  ProductLiteDto["status"],
  "success" | "warning" | "critical"
> = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "critical",
};

/* ----------------------- */
/* Sort types              */
/* ----------------------- */

type SortField =
  | "none"
  | "title"
  | "status"
  | "vendor"
  | "productType"
  | "tags"
  | "images"
  | "updatedAtShopify";
type SortDirection = "asc" | "desc";

/* ----------------------- */
/* Filter config types     */
/* ----------------------- */

/**
 * Text "contains" filters on product/variant fields
 */
type StringFilterKey =
  // Product fields
  | "category"
  | "collection"
  | "description"
  | "handle"
  | "productId"
  | "productType"
  | "templateSuffix"
  | "title"
  | "vendor"
  | "option1Name"
  | "option2Name"
  | "option3Name"
  | "tagContains"
  // Variant fields (any variant)
  | "variantSku"
  | "variantBarcode"
  | "variantTitle"
  | "variantCountryOfOrigin"
  | "variantHsTariffCode"
  | "variantInventoryPolicy"
  | "variantOption1Value"
  | "variantOption2Value"
  | "variantOption3Value"
  // Connected inventory location
  | "inventoryLocationId";

type StringFilterConfig = {
  key: StringFilterKey;
  label: string;
  section: "Product Fields" | "Variant Fields";
};

const STRING_FILTER_CONFIG: StringFilterConfig[] = [
  // Product fields
  { key: "category", label: "Category", section: "Product Fields" },
  { key: "collection", label: "Collection", section: "Product Fields" },
  { key: "description", label: "Description", section: "Product Fields" },
  { key: "handle", label: "Handle (URL)", section: "Product Fields" },
  { key: "productId", label: "Product ID", section: "Product Fields" },
  {
    key: "productType",
    label: "Product Type (Custom)",
    section: "Product Fields",
  },
  {
    key: "templateSuffix",
    label: "Theme Template",
    section: "Product Fields",
  },
  { key: "title", label: "Title", section: "Product Fields" },
  { key: "vendor", label: "Vendor", section: "Product Fields" },
  {
    key: "option1Name",
    label: "Option 1 Name",
    section: "Product Fields",
  },
  {
    key: "option2Name",
    label: "Option 2 Name",
    section: "Product Fields",
  },
  {
    key: "option3Name",
    label: "Option 3 Name",
    section: "Product Fields",
  },
  { key: "tagContains", label: "Tag", section: "Product Fields" },

  // Variant fields
  { key: "variantSku", label: "SKU", section: "Variant Fields" },
  {
    key: "variantBarcode",
    label: "Barcode (ISBN, UPC, GTIN, etc.)",
    section: "Variant Fields",
  },
  { key: "variantTitle", label: "Variant Title", section: "Variant Fields" },
  {
    key: "variantCountryOfOrigin",
    label: "Country of Origin",
    section: "Variant Fields",
  },
  {
    key: "variantHsTariffCode",
    label: "HS Tariff Code",
    section: "Variant Fields",
  },
  {
    key: "variantInventoryPolicy",
    label: "Inventory Out of Stock Policy",
    section: "Variant Fields",
  },
  {
    key: "variantOption1Value",
    label: "Option 1 Value",
    section: "Variant Fields",
  },
  {
    key: "variantOption2Value",
    label: "Option 2 Value",
    section: "Variant Fields",
  },
  {
    key: "variantOption3Value",
    label: "Option 3 Value",
    section: "Variant Fields",
  },
  {
    key: "inventoryLocationId",
    label: "Connected Inventory Location",
    section: "Variant Fields",
  },
];

/* String operators for ALL string filters */
type StringOp = "contains" | "equals" | "startsWith" | "endsWith";

/** Numeric filters: operator + number */
type NumericFilterKey =
  | "totalInventory"
  | "variantCount"
  | "price"
  | "compareAtPrice"
  | "cost"
  | "profitMargin"
  | "variantInventoryQty"
  | "weightGrams";

type NumericOp = "eq" | "gt" | "gte" | "lt" | "lte";

type NumericFilterState = {
  op: NumericOp;
  value: string;
};

type NumericFilterConfig = {
  key: NumericFilterKey;
  label: string;
  section: "Product Fields" | "Variant Fields";
};

const NUMERIC_FILTER_CONFIG: NumericFilterConfig[] = [
  {
    key: "totalInventory",
    label: "Inventory Quantity",
    section: "Product Fields",
  },
  {
    key: "variantCount",
    label: "Variant Count",
    section: "Product Fields",
  },
  { key: "price", label: "Price", section: "Variant Fields" },
  {
    key: "compareAtPrice",
    label: "Compare-at Price",
    section: "Variant Fields",
  },
  { key: "cost", label: "Cost", section: "Variant Fields" },
  { key: "profitMargin", label: "Profit Margin", section: "Variant Fields" },
  {
    key: "variantInventoryQty",
    label: "Variant Inventory Quantity",
    section: "Variant Fields",
  },
  { key: "weightGrams", label: "Weight", section: "Variant Fields" },
];

/** Boolean filters (Yes / No) */
type BooleanFilterKey =
  | "isSearchable"
  | "visibleOnlineStore"
  | "visiblePos"
  | "chargeTaxOnProduct"
  | "physicalProduct"
  | "trackQuantity"
  | "hasImages";

type BooleanFilterConfig = {
  key: BooleanFilterKey;
  label: string;
  section: "Product Fields" | "Variant Fields";
};

const BOOLEAN_FILTER_CONFIG: BooleanFilterConfig[] = [
  {
    key: "isSearchable",
    label: "Search Engine Visibility (SEO)",
    section: "Product Fields",
  },
  {
    key: "visibleOnlineStore",
    label: "Visible on Online Store (web)",
    section: "Product Fields",
  },
  {
    key: "visiblePos",
    label: "Visible on Point of Sale (POS)",
    section: "Product Fields",
  },
  {
    key: "chargeTaxOnProduct",
    label: "Charge tax on this product",
    section: "Variant Fields",
  },
  {
    key: "physicalProduct",
    label: "Physical Product",
    section: "Variant Fields",
  },
  {
    key: "trackQuantity",
    label: "Track Quantity",
    section: "Variant Fields",
  },
  {
    key: "hasImages",
    label: "Has images",
    section: "Product Fields",
  },
];

/* Date filters (absolute) */
type DateOp = "after" | "before" | "on";

type DateFilterState = {
  op: DateOp;
  date: Date | null;
};

/* ----------------------- */
/* Initial filter helpers  */
/* ----------------------- */

const makeInitialStringFilters = (): Record<StringFilterKey, string> => ({
  category: "",
  collection: "",
  description: "",
  handle: "",
  productId: "",
  productType: "",
  templateSuffix: "",
  title: "",
  vendor: "",
  option1Name: "",
  option2Name: "",
  option3Name: "",
  tagContains: "",
  variantSku: "",
  variantBarcode: "",
  variantTitle: "",
  variantCountryOfOrigin: "",
  variantHsTariffCode: "",
  variantInventoryPolicy: "",
  variantOption1Value: "",
  variantOption2Value: "",
  variantOption3Value: "",
  inventoryLocationId: "",
});

const makeInitialStringOps = (): Record<StringFilterKey, StringOp> => ({
  category: "contains",
  collection: "contains",
  description: "contains",
  handle: "contains",
  productId: "contains",
  productType: "contains",
  templateSuffix: "contains",
  title: "contains",
  vendor: "contains",
  option1Name: "contains",
  option2Name: "contains",
  option3Name: "contains",
  tagContains: "contains",
  variantSku: "contains",
  variantBarcode: "contains",
  variantTitle: "contains",
  variantCountryOfOrigin: "contains",
  variantHsTariffCode: "contains",
  variantInventoryPolicy: "contains",
  variantOption1Value: "contains",
  variantOption2Value: "contains",
  variantOption3Value: "contains",
  inventoryLocationId: "contains",
});

const makeInitialNumericFilters = (): Record<
  NumericFilterKey,
  NumericFilterState
> => ({
  totalInventory: { op: "gt", value: "" },
  variantCount: { op: "gt", value: "" },
  price: { op: "gt", value: "" },
  compareAtPrice: { op: "gt", value: "" },
  cost: { op: "gt", value: "" },
  profitMargin: { op: "gt", value: "" },
  variantInventoryQty: { op: "gt", value: "" },
  weightGrams: { op: "gt", value: "" },
});

const makeInitialBooleanFilters = (): Record<
  BooleanFilterKey,
  "true" | "false" | ""
> => ({
  isSearchable: "",
  visibleOnlineStore: "",
  visiblePos: "",
  chargeTaxOnProduct: "",
  physicalProduct: "",
  trackQuantity: "",
  hasImages: "",
});

const makeInitialDateFilter = (): DateFilterState => ({
  op: "after",
  date: null,
});

/* ----------------------- */
/* String matching helper  */
/* ----------------------- */

function matchStringValue(
  raw: unknown,
  filterLower: string,
  op: StringOp,
): boolean {
  const s = String(raw ?? "").toLowerCase();
  if (!filterLower) return false;

  switch (op) {
    case "contains":
      return s.includes(filterLower);
    case "equals":
      return s === filterLower;
    case "startsWith":
      return s.startsWith(filterLower);
    case "endsWith":
      return s.endsWith(filterLower);
    default:
      return false;
  }
}

/* Date matching helper */

function matchDate(
  raw: string | Date | null | undefined,
  filter: DateFilterState,
): boolean {
  if (!raw || !filter.date) return false;

  const valueDate = new Date(raw);
  if (Number.isNaN(valueDate.getTime())) return false;

  const lhs = new Date(valueDate);
  lhs.setHours(0, 0, 0, 0);

  const rhs = new Date(filter.date);
  rhs.setHours(0, 0, 0, 0);

  switch (filter.op) {
    case "after":
      return lhs > rhs;
    case "before":
      return lhs < rhs;
    case "on":
      return lhs.getTime() === rhs.getTime();
    default:
      return true;
  }
}

/* ----------------------- */
/* Page                    */
/* ----------------------- */

export default function ProductsPage() {
  const app = useAppBridge() as AppBridgeState | undefined;

  /* ----------------------- */
  /* Search state            */
  /* ----------------------- */

  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  /* ----------------------- */
  /* Filter + sort state     */
  /* ----------------------- */

  // Status
  const [statusFilterInput, setStatusFilterInput] = useState<
    ProductLiteDto["status"] | null
  >(null);
  const [appliedStatusFilter, setAppliedStatusFilter] = useState<
    ProductLiteDto["status"] | null
  >(null);

  // Absolute date filters (created / updated / published)
  const [createdDateInput, setCreatedDateInput] = useState<DateFilterState>(
    makeInitialDateFilter,
  );
  const [appliedCreatedDate, setAppliedCreatedDate] = useState<DateFilterState>(
    makeInitialDateFilter,
  );

  const [updatedDateInput, setUpdatedDateInput] = useState<DateFilterState>(
    makeInitialDateFilter,
  );
  const [appliedUpdatedDate, setAppliedUpdatedDate] = useState<DateFilterState>(
    makeInitialDateFilter,
  );

  const [publishedDateInput, setPublishedDateInput] = useState<DateFilterState>(
    makeInitialDateFilter,
  );
  const [appliedPublishedDate, setAppliedPublishedDate] =
    useState<DateFilterState>(makeInitialDateFilter);

  // String filters (value + operator)
  const [stringFiltersInput, setStringFiltersInput] = useState<
    Record<StringFilterKey, string>
  >(makeInitialStringFilters);
  const [appliedStringFilters, setAppliedStringFilters] = useState<
    Record<StringFilterKey, string>
  >(makeInitialStringFilters);

  const [stringOpsInput, setStringOpsInput] =
    useState<Record<StringFilterKey, StringOp>>(makeInitialStringOps);
  const [appliedStringOps, setAppliedStringOps] =
    useState<Record<StringFilterKey, StringOp>>(makeInitialStringOps);

  // Numeric filters
  const [numericFiltersInput, setNumericFiltersInput] = useState<
    Record<NumericFilterKey, NumericFilterState>
  >(makeInitialNumericFilters);
  const [appliedNumericFilters, setAppliedNumericFilters] = useState<
    Record<NumericFilterKey, NumericFilterState>
  >(makeInitialNumericFilters);

  // Boolean filters
  const [booleanFiltersInput, setBooleanFiltersInput] = useState<
    Record<BooleanFilterKey, "true" | "false" | "">
  >(makeInitialBooleanFilters);
  const [appliedBooleanFilters, setAppliedBooleanFilters] = useState<
    Record<BooleanFilterKey, "true" | "false" | "">
  >(makeInitialBooleanFilters);

  // Sort (draft vs applied)
  const [sortFieldInput, setSortFieldInput] = useState<SortField>("none");
  const [sortDirectionInput, setSortDirectionInput] =
    useState<SortDirection>("asc");
  const [appliedSortField, setAppliedSortField] = useState<SortField>("none");
  const [appliedSortDirection, setAppliedSortDirection] =
    useState<SortDirection>("asc");

  /* ----------------------- */
  /* Backend status & data   */
  /* ----------------------- */

  // 1) Use bootstrapProducts only for FAST sync status (ignore its items)
  const bootstrapQuery = useBootstrapProducts(app);
  const status = bootstrapQuery.data?.pages[0]?.status;

  // FAST plane sync hook
  const fastSync = useFastPlaneSync(app);

  // 2) Build UI filters → FilterExpr for backend productsByFilter
  const uiFilters: UiFilter[] = useMemo(() => {
    const filters: UiFilter[] = [];

    // Backend mapping is conservative: only send what buildProductWhereFromFilter supports:
    // - product.status (eq)
    // - product.vendor (contains)
    // - product.productType (contains)
    // - product.tags (contains)
    // - product.hasImages (eq)
    // - product.totalInventory (gte)

    // Status (exact)
    if (appliedStatusFilter) {
      filters.push({
        filterId: "product.status",
        op: "eq",
        value: appliedStatusFilter,
      });
    }

    // Vendor (contains)
    const vendorVal = appliedStringFilters.vendor.trim();
    if (vendorVal && appliedStringOps.vendor === "contains") {
      filters.push({
        filterId: "product.vendor",
        op: "contains",
        value: vendorVal,
      });
    }

    // Product type (contains)
    const productTypeVal = appliedStringFilters.productType.trim();
    if (productTypeVal && appliedStringOps.productType === "contains") {
      filters.push({
        filterId: "product.productType",
        op: "contains",
        value: productTypeVal,
      });
    }

    // Tag (contains)
    const tagVal = appliedStringFilters.tagContains.trim();
    if (tagVal && appliedStringOps.tagContains === "contains") {
      filters.push({
        filterId: "product.tags",
        op: "contains",
        value: tagVal,
      });
    }

    // Has images (boolean)
    const hasImages = appliedBooleanFilters.hasImages;
    if (hasImages) {
      filters.push({
        filterId: "product.hasImages",
        op: "eq",
        value: hasImages === "true",
      });
    }

    // Total inventory (>=)
    const totalInv = appliedNumericFilters.totalInventory;
    if (totalInv.value.trim() && totalInv.op === "gte") {
      filters.push({
        filterId: "product.totalInventory",
        op: "gte",
        value: Number(totalInv.value),
      });
    }

    return filters;
  }, [
    appliedStatusFilter,
    appliedStringFilters,
    appliedStringOps,
    appliedBooleanFilters,
    appliedNumericFilters,
  ]);

  const filterExpr = useMemo(() => buildFilterExpr(uiFilters), [uiFilters]);

  // 3) Backend-filtered product list
  const productsQuery = useProductsByFilter(app, filterExpr);
  const loadingInitial = productsQuery.isLoading;
  const loadingMore = productsQuery.isFetchingNextPage;

  /* ----------------------- */
  /* Suggestions base lists  */
  /* ----------------------- */

  // Vendor suggestions
  const vendorOptions = useMemo(() => {
    if (!productsQuery.data) return [];
    const set = new Set<string>();
    for (const page of productsQuery.data.pages) {
      for (const item of page.items) {
        if (item.vendor) set.add(item.vendor);
      }
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }, [productsQuery.data]);

  // Collection suggestions
  const collectionOptions = useMemo(() => {
    if (!productsQuery.data) return [];
    const set = new Set<string>();
    for (const page of productsQuery.data.pages) {
      for (const item of page.items) {
        const collections = ((item as any).collections ?? []) as any[];
        for (const c of collections) {
          const title = (c.collectionTitle ?? "") as string;
          if (title) set.add(title);
        }
      }
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }, [productsQuery.data]);

  // Category suggestions
  const categoryOptions = useMemo(() => {
    if (!productsQuery.data) return [];
    const set = new Set<string>();
    for (const page of productsQuery.data.pages) {
      for (const item of page.items) {
        const cat = ((item as any).category ?? "") as string;
        if (cat) set.add(cat);
      }
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }, [productsQuery.data]);

  // Product type suggestions
  const productTypeOptions = useMemo(() => {
    if (!productsQuery.data) return [];
    const set = new Set<string>();
    for (const page of productsQuery.data.pages) {
      for (const item of page.items) {
        const t = item.productType ?? "";
        if (t) set.add(t);
      }
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }, [productsQuery.data]);

  // Option name suggestions
  const optionNameOptions = useMemo(() => {
    if (!productsQuery.data)
      return {
        option1Name: [] as { value: string; label: string }[],
        option2Name: [] as { value: string; label: string }[],
        option3Name: [] as { value: string; label: string }[],
      };
    const s1 = new Set<string>();
    const s2 = new Set<string>();
    const s3 = new Set<string>();
    for (const page of productsQuery.data.pages) {
      for (const item of page.items) {
        const pAny = item as any;
        if (pAny.option1Name) s1.add(pAny.option1Name as string);
        if (pAny.option2Name) s2.add(pAny.option2Name as string);
        if (pAny.option3Name) s3.add(pAny.option3Name as string);
      }
    }
    const toOptions = (s: Set<string>) =>
      Array.from(s)
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v }));

    return {
      option1Name: toOptions(s1),
      option2Name: toOptions(s2),
      option3Name: toOptions(s3),
    };
  }, [productsQuery.data]);

  // Variant option value suggestions
  const variantOptionValueOptions = useMemo(() => {
    if (!productsQuery.data)
      return {
        variantOption1Value: [] as { value: string; label: string }[],
        variantOption2Value: [] as { value: string; label: string }[],
        variantOption3Value: [] as { value: string; label: string }[],
      };
    const s1 = new Set<string>();
    const s2 = new Set<string>();
    const s3 = new Set<string>();
    for (const page of productsQuery.data.pages) {
      for (const item of page.items) {
        const variants = ((item as any).variants ?? []) as any[];
        for (const v of variants) {
          if (v.option1Value) s1.add(v.option1Value as string);
          if (v.option2Value) s2.add(v.option2Value as string);
          if (v.option3Value) s3.add(v.option3Value as string);
        }
      }
    }
    const toOptions = (s: Set<string>) =>
      Array.from(s)
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v }));

    return {
      variantOption1Value: toOptions(s1),
      variantOption2Value: toOptions(s2),
      variantOption3Value: toOptions(s3),
    };
  }, [productsQuery.data]);

  // Theme template suggestions
  const templateSuffixOptions = useMemo(() => {
    if (!productsQuery.data) return [];
    const set = new Set<string>();
    for (const page of productsQuery.data.pages) {
      for (const item of page.items) {
        const tpl = ((item as any).templateSuffix ?? "") as string;
        if (tpl) set.add(tpl);
      }
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }, [productsQuery.data]);

  // Tag suggestions
  const tagOptions = useMemo(() => {
    if (!productsQuery.data) return [];
    const set = new Set<string>();
    for (const page of productsQuery.data.pages) {
      for (const item of page.items) {
        const tags = (item.tags ?? []) as string[];
        for (const t of tags) {
          if (t) set.add(t);
        }
      }
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }, [productsQuery.data]);

  /* ----------------------- */
  /* Filtered + sorted items */
  /* ----------------------- */

  const allItems: ProductLiteDto[] = useMemo(() => {
    if (!productsQuery.data) return [];
    let result = productsQuery.data.pages.flatMap((p) => p.items);

    // Search term (client-side for now)
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter((p) => {
        const title = (p.title ?? "").toLowerCase();
        const handle = (p.handle ?? "").toLowerCase();
        const vendor = (p.vendor ?? "").toLowerCase();
        const type = (p.productType ?? "").toLowerCase();
        const tagsStr = (p.tags ?? []).join(", ").toLowerCase();

        return (
          title.includes(q) ||
          handle.includes(q) ||
          vendor.includes(q) ||
          type.includes(q) ||
          tagsStr.includes(q)
        );
      });
    }

    // Status
    if (appliedStatusFilter) {
      result = result.filter((p) => p.status === appliedStatusFilter);
    }

    // Absolute date filters
    if (appliedCreatedDate.date) {
      result = result.filter((p) =>
        matchDate(p.createdAtShopify as any, appliedCreatedDate),
      );
    }
    if (appliedUpdatedDate.date) {
      result = result.filter((p) =>
        matchDate(p.updatedAtShopify as any, appliedUpdatedDate),
      );
    }
    if (appliedPublishedDate.date) {
      result = result.filter((p) =>
        matchDate(p.publishedAtShopify as any, appliedPublishedDate),
      );
    }

    // String filters (with operators) – still applied client-side for now
    for (const cfg of STRING_FILTER_CONFIG) {
      const { key } = cfg;
      const val = appliedStringFilters[key].trim().toLowerCase();
      if (!val) continue;
      const op = appliedStringOps[key];

      result = result.filter((p) => {
        const tags = (p.tags ?? []) as string[];
        const variants = ((p as any).variants ?? []) as any[];
        const collections = ((p as any).collections ?? []) as any[];
        const inventoryByLoc = ((p as any).inventoryByLoc ?? []) as any[];

        switch (key) {
          // Product-level simple fields
          case "category":
          case "description":
          case "handle":
          case "productId":
          case "productType":
          case "templateSuffix":
          case "title":
          case "vendor":
          case "option1Name":
          case "option2Name":
          case "option3Name": {
            const raw = (p as any)[key];
            return matchStringValue(raw, val, op);
          }

          case "collection":
            return collections.some((c) =>
              matchStringValue(c.collectionTitle ?? "", val, op),
            );

          case "tagContains":
            return tags.some((t) => matchStringValue(t, val, op));

          // Variant-level
          case "variantSku":
            return variants.some((v) =>
              matchStringValue(v.sku ?? "", val, op),
            );
          case "variantBarcode":
            return variants.some((v) =>
              matchStringValue(v.barcode ?? "", val, op),
            );
          case "variantTitle":
            return variants.some((v) =>
              matchStringValue(v.title ?? "", val, op),
            );
          case "variantCountryOfOrigin":
            return variants.some((v) =>
              matchStringValue(v.countryOfOrigin ?? "", val, op),
            );
          case "variantHsTariffCode":
            return variants.some((v) =>
              matchStringValue(v.hsTariffCode ?? "", val, op),
            );
          case "variantInventoryPolicy":
            return variants.some((v) =>
              matchStringValue(v.inventoryPolicy ?? "", val, op),
            );
          case "variantOption1Value":
            return variants.some((v) =>
              matchStringValue(v.option1Value ?? "", val, op),
            );
          case "variantOption2Value":
            return variants.some((v) =>
              matchStringValue(v.option2Value ?? "", val, op),
            );
          case "variantOption3Value":
            return variants.some((v) =>
              matchStringValue(v.option3Value ?? "", val, op),
            );
          case "inventoryLocationId":
            return inventoryByLoc.some((loc) =>
              matchStringValue(loc.locationId ?? "", val, op),
            );

          default:
            return true;
        }
      });
    }

    // Boolean filters (client-side)
    for (const cfg of BOOLEAN_FILTER_CONFIG) {
      const { key } = cfg;
      const want = appliedBooleanFilters[key];
      if (!want) continue;
      const expected = want === "true";

      result = result.filter((p) => {
        const rollup = (p as any).variantRollup as any | undefined;
        const variants = ((p as any).variants ?? []) as any[];

        switch (key) {
          case "isSearchable":
          case "visibleOnlineStore":
          case "visiblePos":
            return Boolean((p as any)[key]) === expected;

          case "chargeTaxOnProduct":
            return Boolean(rollup?.anyTaxable) === expected;

          case "physicalProduct":
            return Boolean(rollup?.hasPhysical) === expected;

          case "trackQuantity":
            if (!variants.length) return false;
            return variants.some((v) => Boolean(v.trackQuantity) === expected);

          case "hasImages":
            return Boolean((p as any).hasImages) === expected;

          default:
            return true;
        }
      });
    }

    // Numeric filters (client-side)
    for (const cfg of NUMERIC_FILTER_CONFIG) {
      const { key } = cfg;
      const f = appliedNumericFilters[cfg.key];
      if (!f.value.trim()) continue;

      result = result.filter((p) => {
        const rollup = (p as any).variantRollup as any | undefined;
        const variants = ((p as any).variants ?? []) as any[];

        const evalNumeric = (
          actual: number | null | undefined,
          filt: NumericFilterState,
        ): boolean => {
          if (actual == null) return false;
          const v = Number(filt.value);
          if (!Number.isFinite(v)) return false;
          switch (filt.op) {
            case "eq":
              return actual === v;
            case "gt":
              return actual > v;
            case "gte":
              return actual >= v;
            case "lt":
              return actual < v;
            case "lte":
              return actual <= v;
            default:
              return true;
          }
        };

        switch (key) {
          case "totalInventory":
            return evalNumeric((p as any).totalInventory ?? null, f);
          case "variantCount":
            return evalNumeric((p as any).variantCount ?? null, f);
          case "price":
            return evalNumeric(rollup?.minPrice ?? null, f);
          case "compareAtPrice":
            return evalNumeric(rollup?.minCompareAtPrice ?? null, f);
          case "cost":
            return evalNumeric(rollup?.minCost ?? null, f);
          case "profitMargin":
            return evalNumeric(rollup?.minMargin ?? null, f);
          case "variantInventoryQty":
            if (!variants.length) return false;
            return variants.some((v) => evalNumeric(v.inventoryQty ?? null, f));
          case "weightGrams":
            return evalNumeric(rollup?.minWeightGrams ?? null, f);

          default:
            return true;
        }
      });
    }

    // Sort (applied AFTER all filters)
    if (appliedSortField !== "none") {
      const dir = appliedSortDirection === "asc" ? 1 : -1;

      result = [...result].sort((a, b) => {
        let av: string | number | null = null;
        let bv: string | number | null = null;

        switch (appliedSortField) {
          case "title":
            av = a.title ?? "";
            bv = b.title ?? "";
            break;
          case "status":
            av = a.status ?? "";
            bv = b.status ?? "";
            break;
          case "vendor":
            av = a.vendor ?? "";
            bv = b.vendor ?? "";
            break;
          case "productType":
            av = a.productType ?? "";
            bv = b.productType ?? "";
            break;
          case "tags": {
            const at = a.tags && a.tags.length ? a.tags.join(", ") : "";
            const bt = b.tags && b.tags.length ? b.tags.join(", ") : "";
            av = at;
            bv = bt;
            break;
          }
          case "images":
            av = a.hasImages ? 1 : 0;
            bv = b.hasImages ? 1 : 0;
            break;
          case "updatedAtShopify": {
            const at = a.updatedAtShopify
              ? new Date(a.updatedAtShopify).getTime()
              : 0;
            const bt = b.updatedAtShopify
              ? new Date(b.updatedAtShopify).getTime()
              : 0;
            av = Number.isNaN(at) ? 0 : at;
            bv = Number.isNaN(bt) ? 0 : bt;
            break;
          }
          case "none":
          default:
            av = "";
            bv = "";
            break;
        }

        if (av == null) av = "";
        if (bv == null) bv = "";

        const as = String(av).toLowerCase();
        const bs = String(bv).toLowerCase();

        if (as < bs) return -1 * dir;
        if (as > bs) return 1 * dir;
        return 0;
      });
    }

    return result;
  }, [
    productsQuery.data,
    searchTerm,
    appliedStatusFilter,
    appliedCreatedDate,
    appliedUpdatedDate,
    appliedPublishedDate,
    appliedStringFilters,
    appliedStringOps,
    appliedBooleanFilters,
    appliedNumericFilters,
    appliedSortField,
    appliedSortDirection,
  ]);

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(allItems, {
      resourceIDResolver: (p) => p.id,
    });

  /* ----------------------- */
  /* Clear all               */
  /* ----------------------- */

  const clearAll = useCallback(() => {
    setSearchInput("");
    setSearchTerm("");

    setStatusFilterInput(null);
    setAppliedStatusFilter(null);

    const resetDate = makeInitialDateFilter();
    setCreatedDateInput(resetDate);
    setAppliedCreatedDate(resetDate);
    setUpdatedDateInput(resetDate);
    setAppliedUpdatedDate(resetDate);
    setPublishedDateInput(resetDate);
    setAppliedPublishedDate(resetDate);

    const resetString = makeInitialStringFilters();
    const resetStringOps = makeInitialStringOps();
    const resetNumeric = makeInitialNumericFilters();
    const resetBoolean = makeInitialBooleanFilters();

    setStringFiltersInput(resetString);
    setAppliedStringFilters(resetString);

    setStringOpsInput(resetStringOps);
    setAppliedStringOps(resetStringOps);

    setNumericFiltersInput(resetNumeric);
    setAppliedNumericFilters(resetNumeric);

    setBooleanFiltersInput(resetBoolean);
    setAppliedBooleanFilters(resetBoolean);

    setSortFieldInput("none");
    setAppliedSortField("none");
    setSortDirectionInput("asc");
    setAppliedSortDirection("asc");
  }, []);

  /* ----------------------- */
  /* Apply filters (draft -> applied) */
  /* ----------------------- */

  const applyAllFilters = useCallback(() => {
    setAppliedStatusFilter(statusFilterInput);

    setAppliedCreatedDate(createdDateInput);
    setAppliedUpdatedDate(updatedDateInput);
    setAppliedPublishedDate(publishedDateInput);

    setAppliedStringFilters(stringFiltersInput);
    setAppliedStringOps(stringOpsInput);

    setAppliedNumericFilters(numericFiltersInput);
    setAppliedBooleanFilters(booleanFiltersInput);

    // also sync sort when "Add filter" pressed inside any filter card
    setAppliedSortField(sortFieldInput);
    setAppliedSortDirection(sortDirectionInput);
  }, [
    statusFilterInput,
    createdDateInput,
    updatedDateInput,
    publishedDateInput,
    stringFiltersInput,
    stringOpsInput,
    numericFiltersInput,
    booleanFiltersInput,
    sortFieldInput,
    sortDirectionInput,
  ]);

  /* ----------------------- */
  /* Applied filters chips   */
  /* ----------------------- */

  const appliedFilters: FiltersProps["appliedFilters"] = [];

  if (searchTerm) {
    appliedFilters.push({
      key: "search",
      label: `Search: "${searchTerm}"`,
      onRemove: () => {
        setSearchInput("");
        setSearchTerm("");
      },
    });
  }

  if (appliedStatusFilter) {
    appliedFilters.push({
      key: "status",
      label: `Status: ${appliedStatusFilter}`,
      onRemove: () => {
        setStatusFilterInput(null);
        setAppliedStatusFilter(null);
      },
    });
  }

  const stringOpChipLabel: Record<StringOp, string> = {
    contains: "contains",
    equals: "equals",
    startsWith: "starts with",
    endsWith: "ends with",
  };

  const dateOpChipLabel: Record<DateOp, string> = {
    after: "is after",
    before: "is before",
    on: "is on",
  };

  const formatDate = (d: Date) => d.toISOString().slice(0, 10);

  if (appliedCreatedDate.date) {
    appliedFilters.push({
      key: "createdAt",
      label: `Date Created ${
        dateOpChipLabel[appliedCreatedDate.op]
      } ${formatDate(appliedCreatedDate.date)}`,
      onRemove: () => {
        const reset = makeInitialDateFilter();
        setCreatedDateInput(reset);
        setAppliedCreatedDate(reset);
      },
    });
  }
  if (appliedUpdatedDate.date) {
    appliedFilters.push({
      key: "updatedAt",
      label: `Date Updated ${
        dateOpChipLabel[appliedUpdatedDate.op]
      } ${formatDate(appliedUpdatedDate.date)}`,
      onRemove: () => {
        const reset = makeInitialDateFilter();
        setUpdatedDateInput(reset);
        setAppliedUpdatedDate(reset);
      },
    });
  }
  if (appliedPublishedDate.date) {
    appliedFilters.push({
      key: "publishedAt",
      label: `Date Published ${
        dateOpChipLabel[appliedPublishedDate.op]
      } ${formatDate(appliedPublishedDate.date)}`,
      onRemove: () => {
        const reset = makeInitialDateFilter();
        setPublishedDateInput(reset);
        setAppliedPublishedDate(reset);
      },
    });
  }

  // String filter chips
  for (const cfg of STRING_FILTER_CONFIG) {
    const value = appliedStringFilters[cfg.key].trim();
    if (!value) continue;
    const op = appliedStringOps[cfg.key];
    appliedFilters.push({
      key: cfg.key,
      label: `${cfg.label} ${stringOpChipLabel[op]} "${value}"`,
      onRemove: () => {
        setStringFiltersInput((prev) => ({ ...prev, [cfg.key]: "" }));
        setAppliedStringFilters((prev) => ({ ...prev, [cfg.key]: "" }));
      },
    });
  }

  // Numeric chips
  const numericOpChipLabel: Record<NumericOp, string> = {
    eq: "is",
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
  };
  for (const cfg of NUMERIC_FILTER_CONFIG) {
    const f = appliedNumericFilters[cfg.key];
    if (!f.value.trim()) continue;
    appliedFilters.push({
      key: cfg.key,
      label: `${cfg.label} ${numericOpChipLabel[f.op]} ${f.value}`,
      onRemove: () => {
        setNumericFiltersInput((prev) => ({
          ...prev,
          [cfg.key]: { ...prev[cfg.key], value: "" },
        }));
        setAppliedNumericFilters((prev) => ({
          ...prev,
          [cfg.key]: { ...prev[cfg.key], value: "" },
        }));
      },
    });
  }

  // Boolean chips
  for (const cfg of BOOLEAN_FILTER_CONFIG) {
    const v = appliedBooleanFilters[cfg.key];
    if (!v) continue;
    appliedFilters.push({
      key: cfg.key,
      label: `${cfg.label}: ${v === "true" ? "Yes" : "No"}`,
      onRemove: () => {
        setBooleanFiltersInput((prev) => ({ ...prev, [cfg.key]: "" }));
        setAppliedBooleanFilters((prev) => ({ ...prev, [cfg.key]: "" }));
      },
    });
  }

  /* ----------------------- */
  /* Date filter UI control  */
  /* ----------------------- */

  const DateFilterControl: React.FC<{
    label: string;
    state: DateFilterState;
    onChange: (next: DateFilterState) => void;
  }> = ({ label, state, onChange }) => {
    const initial = state.date ?? new Date();
    const [month, setMonth] = useState(initial.getMonth());
    const [year, setYear] = useState(initial.getFullYear());

    const handleMonthChange = (month: number, year: number) => {
      setMonth(month);
      setYear(year);
    };

    const handleDateChange = (range: any) => {
      const start: Date | undefined = range?.start;
      if (start) {
        onChange({ ...state, date: start });
        setMonth(start.getMonth());
        setYear(start.getFullYear());
      } else {
        onChange({ ...state, date: null });
      }
    };

    return (
      <Box>
        <Box paddingBlockEnd="200">
          <Select
            label={label}
            labelHidden
            options={[
              { label: "Is after", value: "after" },
              { label: "Is before", value: "before" },
              { label: "Is on", value: "on" },
            ]}
            value={state.op}
            onChange={(value) => onChange({ ...state, op: value as DateOp })}
          />
        </Box>
        <DatePicker
          month={month}
          year={year}
          onChange={handleDateChange}
          onMonthChange={handleMonthChange}
          selected={
            state.date ? { start: state.date, end: state.date } : undefined
          }
        />
        <Box paddingBlockStart="200">
          <Button
            fullWidth
            size="slim"
            onClick={applyAllFilters}
            disabled={!state.date}
          >
            Add filter
          </Button>
        </Box>
      </Box>
    );
  };

  /* ----------------------- */
  /* Filters config (UI)     */
  /* ----------------------- */

  const filtersConfig: FiltersProps["filters"] = [
    // Status
    {
      key: "status",
      label: "Status",
      section: "Product Fields",
      filter: (
        <Box>
          <ChoiceList
            titleHidden
            choices={[
              { label: "Active", value: "ACTIVE" },
              { label: "Draft", value: "DRAFT" },
              { label: "Archived", value: "ARCHIVED" },
            ]}
            selected={statusFilterInput ? [statusFilterInput] : []}
            onChange={(selected) => {
              const value =
                (selected[0] as ProductLiteDto["status"] | undefined) ?? null;
              setStatusFilterInput(value);
            }}
          />
          <Box paddingBlockStart="200">
            <Button
              fullWidth
              size="slim"
              onClick={applyAllFilters}
              disabled={!statusFilterInput}
            >
              Add filter
            </Button>
          </Box>
        </Box>
      ),
    },

    // Date created/updated/published (absolute)
    {
      key: "createdAt",
      label: "Date Created",
      section: "Product Fields",
      filter: (
        <DateFilterControl
          label="Date Created"
          state={createdDateInput}
          onChange={setCreatedDateInput}
        />
      ),
    },
    {
      key: "updatedAt",
      label: "Date Updated",
      section: "Product Fields",
      filter: (
        <DateFilterControl
          label="Date Updated"
          state={updatedDateInput}
          onChange={setUpdatedDateInput}
        />
      ),
    },
    {
      key: "publishedAt",
      label: "Date Published",
      section: "Product Fields",
      filter: (
        <DateFilterControl
          label="Date Published"
          state={publishedDateInput}
          onChange={setPublishedDateInput}
        />
      ),
    },

    // STRING filters – with operator + suggestions + Add filter
    ...STRING_FILTER_CONFIG.map((cfg) => {
      const key = cfg.key;
      const text = stringFiltersInput[key];
      const lower = text.toLowerCase();

      let baseOptions: { value: string; label: string }[] | null = null;

      if (key === "vendor") {
        baseOptions = vendorOptions;
      } else if (key === "collection") {
        baseOptions = collectionOptions;
      } else if (key === "category") {
        baseOptions = categoryOptions;
      } else if (key === "productType") {
        baseOptions = productTypeOptions;
      } else if (key === "templateSuffix") {
        baseOptions = templateSuffixOptions;
      } else if (key === "tagContains") {
        baseOptions = tagOptions;
      } else if (
        key === "option1Name" ||
        key === "option2Name" ||
        key === "option3Name"
      ) {
        baseOptions = optionNameOptions[key];
      } else if (
        key === "variantOption1Value" ||
        key === "variantOption2Value" ||
        key === "variantOption3Value"
      ) {
        baseOptions = variantOptionValueOptions[key];
      }

      const options =
        baseOptions && lower
          ? baseOptions.filter((o) => o.label.toLowerCase().includes(lower))
          : [];

      const showSuggestions = !!lower && options.length > 0;

      const operatorSelect = (
        <Select
          label="Operator"
          labelHidden
          options={[
            { label: "contains", value: "contains" },
            { label: "equals", value: "equals" },
            { label: "starts with", value: "startsWith" },
            { label: "ends with", value: "endsWith" },
          ]}
          value={stringOpsInput[key]}
          onChange={(value) =>
            setStringOpsInput((prev) => ({
              ...prev,
              [key]: value as StringOp,
            }))
          }
        />
      );

      const inputControl = baseOptions ? (
        <Autocomplete
          options={showSuggestions ? options : []}
          selected={text ? [text] : []}
          onSelect={(selected) => {
            const value = (selected[0] as string | undefined) ?? "";
            setStringFiltersInput((prev) => ({
              ...prev,
              [key]: value,
            }));
          }}
          textField={
            <Autocomplete.TextField
              label={cfg.label}
              labelHidden
              value={text}
              onChange={(value) =>
                setStringFiltersInput((prev) => ({
                  ...prev,
                  [key]: value,
                }))
              }
              autoComplete="off"
              placeholder={
                key === "collection"
                  ? "Start typing a collection name"
                  : key === "category"
                  ? "Start typing a category"
                  : key === "templateSuffix"
                  ? "Start typing a theme template"
                  : key === "tagContains"
                  ? "Start typing a tag"
                  : `Start typing ${cfg.label.toLowerCase()}`
              }
            />
          }
        />
      ) : (
        <TextField
          label={cfg.label}
          labelHidden
          value={text}
          onChange={(value) =>
            setStringFiltersInput((prev) => ({ ...prev, [key]: value }))
          }
          autoComplete="off"
          placeholder={`Start typing ${cfg.label.toLowerCase()}`}
        />
      );

      return {
        key,
        label: cfg.label,
        section: cfg.section,
        filter: (
          <Box>
            <Box paddingBlockEnd="200">{operatorSelect}</Box>
            {inputControl}
            <Box paddingBlockStart="200">
              <Button
                fullWidth
                size="slim"
                onClick={applyAllFilters}
                disabled={!stringFiltersInput[key].trim()}
              >
                Add filter
              </Button>
            </Box>
          </Box>
        ),
      } as FiltersProps["filters"][number];
    }),

    // NUMERIC filters – operator + value + Add filter button
    ...NUMERIC_FILTER_CONFIG.map((cfg) => ({
      key: cfg.key,
      label: cfg.label,
      section: cfg.section,
      filter: (
        <Box>
          <InlineStack gap="200" align="start">
            <Select
              label="Operator"
              labelHidden
              options={[
                { label: "<", value: "lt" },
                { label: "≤", value: "lte" },
                { label: "=", value: "eq" },
                { label: "≥", value: "gte" },
                { label: ">", value: "gt" },
              ]}
              value={numericFiltersInput[cfg.key].op}
              onChange={(value) =>
                setNumericFiltersInput((prev) => ({
                  ...prev,
                  [cfg.key]: {
                    ...prev[cfg.key],
                    op: value as NumericOp,
                  },
                }))
              }
            />
            <TextField
              label={cfg.label}
              labelHidden
              type="number"
              value={numericFiltersInput[cfg.key].value}
              onChange={(value) =>
                setNumericFiltersInput((prev) => ({
                  ...prev,
                  [cfg.key]: { ...prev[cfg.key], value },
                }))
              }
              autoComplete="off"
            />
          </InlineStack>
          <Box paddingBlockStart="200">
            <Button
              fullWidth
              size="slim"
              onClick={applyAllFilters}
              disabled={!numericFiltersInput[cfg.key].value.trim()}
            >
              Add filter
            </Button>
          </Box>
        </Box>
      ),
    })),

    // Boolean filters – now also have Add filter button
    ...BOOLEAN_FILTER_CONFIG.map((cfg) => ({
      key: cfg.key,
      label: cfg.label,
      section: cfg.section,
      filter: (
        <Box>
          <ChoiceList
            titleHidden
            choices={[
              { label: "Yes", value: "true" },
              { label: "No", value: "false" },
            ]}
            selected={
              booleanFiltersInput[cfg.key] ? [booleanFiltersInput[cfg.key]] : []
            }
            onChange={(selected) => {
              const value = selected[0] as "true" | "false" | undefined;
              setBooleanFiltersInput((prev) => ({
                ...prev,
                [cfg.key]: value ?? "",
              }));
            }}
          />
          <Box paddingBlockStart="200">
            <Button
              fullWidth
              size="slim"
              onClick={applyAllFilters}
              disabled={!booleanFiltersInput[cfg.key]}
            >
              Add filter
            </Button>
          </Box>
        </Box>
      ),
    })),
  ];

  /* ----------------------- */
  /* Render                  */
  /* ----------------------- */

  return (
    <Page fullWidth title="Products (FAST plane)">
      <Layout>
        {/* FAST sync status card */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              {status ? (
                <InlineStack
                  gap="400"
                  align="space-between"
                  blockAlign="center"
                >
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={status.fastReady ? "success" : "critical"}>
                      FAST {status.fastReady ? "ready" : "not ready"}
                    </Badge>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Rev {status.fastRevision}
                    </Text>
                    {status.fastLastSyncAt && (
                      <Text as="span" variant="bodySm" tone="subdued">
                        Last sync:{" "}
                        {new Date(status.fastLastSyncAt).toLocaleString()}
                      </Text>
                    )}
                  </InlineStack>

                  <InlineStack gap="200" blockAlign="center">
                    {status.syncEnqueued && (
                      <Badge tone="attention">Sync enqueued</Badge>
                    )}
                    <Button
                      size="slim"
                      onClick={() => fastSync.mutate()}
                      loading={fastSync.isPending}
                    >
                      Sync FAST plane
                    </Button>
                  </InlineStack>
                </InlineStack>
              ) : (
                <Text as="p" variant="bodySm" tone="subdued">
                  Loading FAST sync status…
                </Text>
              )}
            </Box>
          </Card>
        </Layout.Section>

        {/* Filters + Sort block */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Filters
                queryValue={searchInput}
                queryPlaceholder="Search by title, vendor, type, tag…"
                onQueryChange={setSearchInput}
                onQueryClear={() => {
                  setSearchInput("");
                  setSearchTerm("");
                }}
                filters={filtersConfig}
                appliedFilters={appliedFilters}
                onClearAll={clearAll}
              >
                <InlineStack align="end" gap="200">
                  <Button
                    size="slim"
                    onClick={() => setSearchTerm(searchInput.trim())}
                    disabled={!searchInput.trim()}
                  >
                    Search
                  </Button>

                  <Select
                    label="Sort field"
                    labelHidden
                    options={[
                      { label: "Sort by", value: "none" },
                      { label: "Title", value: "title" },
                      { label: "Status", value: "status" },
                      { label: "Vendor", value: "vendor" },
                      { label: "Product type", value: "productType" },
                      { label: "Tags", value: "tags" },
                      { label: "Images", value: "images" },
                      { label: "Updated", value: "updatedAtShopify" },
                    ]}
                    value={sortFieldInput}
                    onChange={(value) => {
                      const v = value as SortField;
                      setSortFieldInput(v);
                      setAppliedSortField(v); // apply sort immediately
                    }}
                  />
                  <Select
                    label="Sort direction"
                    labelHidden
                    options={[
                      { label: "Ascending", value: "asc" },
                      { label: "Descending", value: "desc" },
                    ]}
                    value={sortDirectionInput}
                    onChange={(value) => {
                      const v = value as SortDirection;
                      setSortDirectionInput(v);
                      setAppliedSortDirection(v); // apply sort immediately
                    }}
                  />
                </InlineStack>
              </Filters>
            </Box>
          </Card>
        </Layout.Section>

        {/* Table */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              {loadingInitial && (
                <InlineStack gap="200">
                  <Spinner />
                  <Text>Loading products…</Text>
                </InlineStack>
              )}
              {!loadingInitial && allItems.length === 0 && (
                <Banner tone="info">No products found.</Banner>
              )}
            </Box>

            {!loadingInitial && allItems.length > 0 && (
              <>
                <IndexTable
                  resourceName={{ singular: "product", plural: "products" }}
                  itemCount={allItems.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Title" },
                    { title: "Status" },
                    { title: "Vendor" },
                    { title: "Type" },
                    { title: "Tags" },
                    { title: "Images" },
                    { title: "Updated" },
                  ]}
                >
                  {allItems.map((product, index) => (
                    <IndexTable.Row
                      id={product.id}
                      key={product.id}
                      position={index}
                      selected={selectedResources.includes(product.id)}
                    >
                      <IndexTable.Cell>
                        <Text fontWeight="semibold">{product.title}</Text>
                        <Text variant="bodySm" tone="subdued">
                          {product.handle}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={STATUS_TONE[product.status]}>
                          {product.status}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{product.vendor || "—"}</IndexTable.Cell>
                      <IndexTable.Cell>
                        {product.productType || "—"}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {product.tags && product.tags.length
                          ? product.tags.join(", ")
                          : "—"}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge
                          tone={product.hasImages ? "success" : "critical"}
                        >
                          {product.hasImages ? "Yes" : "No"}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text variant="bodySm" tone="subdued">
                          {product.updatedAtShopify
                            ? new Date(
                                product.updatedAtShopify,
                              ).toLocaleString()
                            : "—"}
                        </Text>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>

                {productsQuery.hasNextPage && (
                  <Box padding="400">
                    <InlineStack align="center">
                      <Button
                        onClick={() => productsQuery.fetchNextPage()}
                        loading={loadingMore}
                      >
                        Load more
                      </Button>
                    </InlineStack>
                  </Box>
                )}
              </>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
