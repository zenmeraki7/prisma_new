// web/frontend/pages/ProductsPage.tsx
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
  TextField,
  Select,
  ButtonGroup,
  Tag,
  Modal,
  ActionList,
  ChoiceList,
  Divider,
} from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type QueryFunctionContext,
} from "@tanstack/react-query";

import type { AppBridgeState } from "@shopify/app-bridge-react";
import {
  bootstrapProductsRequest,
  type ProductLiteDto,
  type BootstrapProductsPageDto,
} from "../queries/bootstrapProducts";

/* ----------------------- */
/* React Query data hook   */
/* ----------------------- */

function useBootstrapProducts(
  app: AppBridgeState | undefined,
  search: string | null,
): UseInfiniteQueryResult<BootstrapProductsPageDto, Error> {
  return useInfiniteQuery<
    BootstrapProductsPageDto,
    Error,
    BootstrapProductsPageDto,
    ["bootstrapProducts", { search: string | null }],
    string | null
  >({
    queryKey: ["bootstrapProducts", { search }],
    enabled: !!app,
    initialPageParam: null,
    queryFn: async ({
      pageParam,
    }: QueryFunctionContext<
      ["bootstrapProducts", { search: string | null }],
      string | null
    >) => {
      if (!app) throw new Error("AppBridge not ready");

      return bootstrapProductsRequest(app, {
        first: 50,
        after: pageParam ?? null,
        // backend can optionally use this search param
        search: search ?? undefined,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  });
}

/* ----------------------- */
/* Filter definitions      */
/* ----------------------- */

type FilterKind = "string" | "number" | "date" | "enum" | "boolean";

type StringOp =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "containsAny"
  | "endsWith"
  | "startsWith"
  | "notStartsWith"
  | "containsCi"
  | "equalsCi";

type NumberOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between";
type DateOp = "before" | "after" | "on";
type EnumOp = "is" | "isNot";
type BooleanOp = "is";

type FieldDef = {
  key: string;
  label: string;
  group: "product" | "variant";
  kind: FilterKind;
  /**
   * FAST-plane support right now (client-side filtering works only for supported keys).
   * You can keep all the fields in UI, but only some will actually filter until data exists.
   */
  supportedNow: boolean;
};

const PRODUCT_FIELDS: FieldDef[] = [
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

const VARIANT_FIELDS: FieldDef[] = [
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

const ALL_FIELDS: FieldDef[] = [...PRODUCT_FIELDS, ...VARIANT_FIELDS];

function fieldLabel(key: string): string {
  return ALL_FIELDS.find((f) => f.key === key)?.label ?? key;
}

function fieldKind(key: string): FilterKind {
  return ALL_FIELDS.find((f) => f.key === key)?.kind ?? "string";
}

function fieldSupportedNow(key: string): boolean {
  return ALL_FIELDS.find((f) => f.key === key)?.supportedNow ?? false;
}

/* ----------------------- */
/* Filter state model      */
/* ----------------------- */

type AppliedFilter =
  | { key: string; kind: "string"; op: StringOp; value: string }
  | { key: string; kind: "number"; op: NumberOp; value: number; value2?: number }
  | { key: string; kind: "date"; op: DateOp; value: string } // yyyy-mm-dd
  | { key: string; kind: "enum"; op: EnumOp; value: string }
  | { key: string; kind: "boolean"; op: BooleanOp; value: boolean };

function stringOpLabel(op: StringOp): string {
  switch (op) {
    case "equals":
      return "Equals";
    case "notEquals":
      return "Not Equals";
    case "contains":
      return "Contains";
    case "notContains":
      return "Does not contain";
    case "containsAny":
      return "Contains any of the words";
    case "endsWith":
      return "Ends with";
    case "startsWith":
      return "Starts with";
    case "notStartsWith":
      return "Does not start with";
    case "containsCi":
      return "Contains (case insensitive)";
    case "equalsCi":
      return "Equals (case insensitive)";
    default:
      return op;
  }
}

function numberOpLabel(op: NumberOp): string {
  switch (op) {
    case "eq":
      return "Equals";
    case "neq":
      return "Not equals";
    case "gt":
      return "Greater than";
    case "gte":
      return "Greater than or equal";
    case "lt":
      return "Less than";
    case "lte":
      return "Less than or equal";
    case "between":
      return "Between";
    default:
      return op;
  }
}

function dateOpLabel(op: DateOp): string {
  switch (op) {
    case "before":
      return "Is before";
    case "after":
      return "Is after";
    case "on":
      return "Is on";
    default:
      return op;
  }
}

function enumOpLabel(op: EnumOp): string {
  return op === "is" ? "Is" : "Is not";
}

/* ----------------------- */
/* Client-side evaluation  */
/* ----------------------- */

function normalizeStr(v: string | null | undefined): string {
  return (v ?? "").toString();
}

function applyStringOp(input: string, op: StringOp, needle: string): boolean {
  const value = normalizeStr(input);
  const term = normalizeStr(needle);
  const trimmed = term.trim();
  if (!trimmed) return true;

  switch (op) {
    case "equals":
      return value === term;
    case "notEquals":
      return value !== term;
    case "contains":
      return value.includes(term);
    case "notContains":
      return !value.includes(term);
    case "containsAny": {
      const words = term.split(/\s+/).filter(Boolean);
      if (!words.length) return true;
      const lower = value.toLowerCase();
      return words.some((w) => lower.includes(w.toLowerCase()));
    }
    case "startsWith":
      return value.startsWith(term);
    case "notStartsWith":
      return !value.startsWith(term);
    case "endsWith":
      return value.endsWith(term);
    case "containsCi":
      return value.toLowerCase().includes(term.toLowerCase());
    case "equalsCi":
      return value.toLowerCase() === term.toLowerCase();
    default:
      return true;
  }
}

function applyNumberOp(input: number | null | undefined, op: NumberOp, a: number, b?: number): boolean {
  if (input == null || Number.isNaN(input)) return true; // if we don't have data yet, don't filter
  switch (op) {
    case "eq":
      return input === a;
    case "neq":
      return input !== a;
    case "gt":
      return input > a;
    case "gte":
      return input >= a;
    case "lt":
      return input < a;
    case "lte":
      return input <= a;
    case "between":
      if (b == null || Number.isNaN(b)) return true;
      return input >= Math.min(a, b) && input <= Math.max(a, b);
    default:
      return true;
  }
}

function applyDateOp(inputIso: string | null | undefined, op: DateOp, dateYmd: string): boolean {
  if (!inputIso) return true; // if we don't have data yet, don't filter
  const inputDate = new Date(inputIso);
  if (Number.isNaN(inputDate.getTime())) return true;

  const selected = new Date(dateYmd);
  if (Number.isNaN(selected.getTime())) return true;

  // compare at day granularity
  const inY = inputDate.getFullYear();
  const inM = inputDate.getMonth();
  const inD = inputDate.getDate();

  const sY = selected.getFullYear();
  const sM = selected.getMonth();
  const sD = selected.getDate();

  const inputDay = new Date(inY, inM, inD).getTime();
  const selectedDay = new Date(sY, sM, sD).getTime();

  if (op === "on") return inputDay === selectedDay;
  if (op === "before") return inputDay < selectedDay;
  if (op === "after") return inputDay > selectedDay;
  return true;
}

function applyEnumOp(input: string | null | undefined, op: EnumOp, value: string): boolean {
  const v = normalizeStr(input);
  if (!value) return true;
  if (op === "is") return v === value;
  return v !== value;
}

function applyBooleanOp(input: boolean | null | undefined, value: boolean): boolean {
  if (input == null) return true; // if we don't have data yet, don't filter
  return input === value;
}

/* ----------------------- */
/* Page component          */
/* ----------------------- */

export default function ProductsPage() {
  const app = useAppBridge();

  // Search (top bar)
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string | null>(null);

  // Sort
  const [sortBy, setSortBy] = useState<string>("sort");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Filters
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilter[]>([]);

  // Modal 1: Add Filter (picker)
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");

  // Modal 2: Configure filter
  const [configOpen, setConfigOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // config fields (shared)
  const [stringOp, setStringOp] = useState<StringOp>("contains");
  const [stringValue, setStringValue] = useState("");

  const [numberOp, setNumberOp] = useState<NumberOp>("eq");
  const [numberA, setNumberA] = useState<string>("");
  const [numberB, setNumberB] = useState<string>("");

  const [dateOp, setDateOp] = useState<DateOp>("before");
  const [dateValue, setDateValue] = useState<string>(""); // yyyy-mm-dd

  const [enumOp, setEnumOp] = useState<EnumOp>("is");
  const [enumValue, setEnumValue] = useState<string>("");

  const [boolValue, setBoolValue] = useState<boolean>(true);

  const query = useBootstrapProducts(app as AppBridgeState | undefined, searchTerm);
  const fastStatus = query.data?.pages[0]?.status;

  const loadingInitial = query.isLoading;
  const loadingMore = query.isFetchingNextPage;

  const resourceName = { singular: "product", plural: "products" };

  /* ----- Status → Badge tone map ----- */
  const productStatusTone: Record<ProductLiteDto["status"], "success" | "warning" | "critical"> = {
    ACTIVE: "success",
    DRAFT: "warning",
    ARCHIVED: "critical",
  };

  /* ----------------------- */
  /* Helpers                 */
  /* ----------------------- */

  const handleSearchClick = useCallback(() => {
    const trimmed = searchInput.trim();
    setSearchTerm(trimmed.length > 0 ? trimmed : null);
  }, [searchInput]);

  const handleClearAll = useCallback(() => {
    setSearchInput("");
    setSearchTerm(null);
    setAppliedFilters([]);
    setSortBy("sort");
    setSortDirection("desc");
  }, []);

  const handleSortByChange = useCallback((value: string) => setSortBy(value), []);
  const handleSortDirectionChange = useCallback((value: string) => setSortDirection(value as "asc" | "desc"), []);

  function getProductFieldValue(product: ProductLiteDto, key: string): unknown {
    // Only map what exists in ProductLiteDto today.
    switch (key) {
      case "product.title":
        return product.title ?? "";
      case "product.vendor":
        return product.vendor ?? "";
      case "product.productType":
        return product.productType ?? "";
      case "product.status":
        return product.status ?? "";
      case "product.handle":
        return product.handle ?? "";
      case "product.tag":
        return product.tags ?? [];
      case "product.updatedAt":
        return product.updatedAtShopify ?? null;
      default:
        return undefined; // unknown/not in FAST-plane DTO yet
    }
  }

  function filterPredicate(product: ProductLiteDto, f: AppliedFilter): boolean {
    // If this field isn't supported yet (no data), we do NOT filter out rows.
    const supported = fieldSupportedNow(f.key);
    if (!supported) return true;

    const raw = getProductFieldValue(product, f.key);

    switch (f.kind) {
      case "string": {
        if (f.key === "product.tag") {
          const tags = Array.isArray(raw) ? (raw as string[]) : [];
          // treat "contains" etc. as matching any tag
          const joined = tags.join(" ");
          return applyStringOp(joined, f.op, f.value);
        }
        return applyStringOp(typeof raw === "string" ? raw : String(raw ?? ""), f.op, f.value);
      }
      case "number":
        return applyNumberOp(typeof raw === "number" ? raw : (raw as number | null | undefined), f.op, f.value, f.value2);
      case "date":
        return applyDateOp(typeof raw === "string" ? raw : (raw as string | null | undefined), f.op, f.value);
      case "enum":
        return applyEnumOp(typeof raw === "string" ? raw : String(raw ?? ""), f.op, f.value);
      case "boolean":
        return applyBooleanOp(typeof raw === "boolean" ? raw : (raw as boolean | null | undefined), f.value);
      default:
        return true;
    }
  }

  /* ----------------------- */
  /* Data: filtered + sorted */
  /* ----------------------- */

  const allItems: ProductLiteDto[] = useMemo(() => {
    if (!query.data) return [];
    const raw = query.data.pages.flatMap((p) => p.items);

    // main search term: match vendor OR title OR handle
    let result = raw;
    if (searchTerm && searchTerm.trim() !== "") {
      const needle = searchTerm.toLowerCase();
      result = result.filter((p) => {
        const vendor = (p.vendor ?? "").toLowerCase();
        const title = (p.title ?? "").toLowerCase();
        const handle = (p.handle ?? "").toLowerCase();
        return (
          vendor.includes(needle) ||
          title.includes(needle) ||
          handle.includes(needle)
        );
      });
    }

    // applied filters
    if (appliedFilters.length > 0) {
      for (const f of appliedFilters) {
        result = result.filter((p) => filterPredicate(p, f));
      }
    }

    // sort
    const sorted = [...result];
    const directionFactor = sortDirection === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "title") {
        cmp = (a.title ?? "").localeCompare(b.title ?? "");
      } else {
        const aTime = a.updatedAtShopify ? new Date(a.updatedAtShopify).getTime() : 0;
        const bTime = b.updatedAtShopify ? new Date(b.updatedAtShopify).getTime() : 0;
        cmp = aTime - bTime;
      }
      return cmp * directionFactor;
    });

    return sorted;
  }, [query.data, searchTerm, appliedFilters, sortBy, sortDirection]);

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(allItems, {
      resourceIDResolver: (product) => product.id,
    });

  /* ----------------------- */
  /* Modal 1: Add Filter     */
  /* ----------------------- */

  const openAddFilter = useCallback(() => {
    setAddFilterOpen(true);
  }, []);

  const closeAddFilter = useCallback(() => {
    setAddFilterOpen(false);
    setFilterSearch("");
  }, []);

  const filteredProductFields = useMemo(() => {
    const needle = filterSearch.trim().toLowerCase();
    const list = PRODUCT_FIELDS;
    if (!needle) return list;
    return list.filter((f) => f.label.toLowerCase().includes(needle));
  }, [filterSearch]);

  const filteredVariantFields = useMemo(() => {
    const needle = filterSearch.trim().toLowerCase();
    const list = VARIANT_FIELDS;
    if (!needle) return list;
    return list.filter((f) => f.label.toLowerCase().includes(needle));
  }, [filterSearch]);

  const openConfigForKey = useCallback(
    (key: string) => {
      setActiveKey(key);

      const kind = fieldKind(key);
      const existing = appliedFilters.find((f) => f.key === key);

      // default config
      setStringOp("contains");
      setStringValue("");

      setNumberOp("eq");
      setNumberA("");
      setNumberB("");

      setDateOp("before");
      setDateValue("");

      setEnumOp("is");
      setEnumValue("");

      setBoolValue(true);

      if (existing) {
        if (existing.kind === "string") {
          setStringOp(existing.op);
          setStringValue(existing.value);
        } else if (existing.kind === "number") {
          setNumberOp(existing.op);
          setNumberA(String(existing.value ?? ""));
          setNumberB(String(existing.value2 ?? ""));
        } else if (existing.kind === "date") {
          setDateOp(existing.op);
          setDateValue(existing.value);
        } else if (existing.kind === "enum") {
          setEnumOp(existing.op);
          setEnumValue(existing.value);
        } else if (existing.kind === "boolean") {
          setBoolValue(existing.value);
        }
      } else {
        // sensible defaults per kind
        if (kind === "enum" && key === "product.status") {
          setEnumOp("is");
          setEnumValue("ACTIVE");
        }
        if (kind === "boolean") {
          setBoolValue(true);
        }
      }

      // keep Add Filter modal open and stack config modal
      setConfigOpen(true);
    },
    [appliedFilters],
  );

  /* ----------------------- */
  /* Modal 2: Config Filter  */
  /* ----------------------- */

  const closeConfig = useCallback(() => {
    setConfigOpen(false);
  }, []);

  const removeFilter = useCallback((key: string) => {
    setAppliedFilters((prev) => prev.filter((f) => f.key !== key));
  }, []);

  const applyConfig = useCallback(() => {
    if (!activeKey) return;
    const kind = fieldKind(activeKey);

    setAppliedFilters((prev) => {
      const others = prev.filter((f) => f.key !== activeKey);

      // If empty -> remove filter
      if (kind === "string") {
        const v = stringValue.trim();
        if (!v) return others;
        const next: AppliedFilter = { key: activeKey, kind: "string", op: stringOp, value: v };
        return [...others, next];
      }

      if (kind === "number") {
        const a = Number(numberA);
        const b = Number(numberB);
        if (Number.isNaN(a)) return others;

        if (numberOp === "between") {
          if (Number.isNaN(b)) return others;
          const next: AppliedFilter = { key: activeKey, kind: "number", op: numberOp, value: a, value2: b };
          return [...others, next];
        }

        const next: AppliedFilter = { key: activeKey, kind: "number", op: numberOp, value: a };
        return [...others, next];
      }

      if (kind === "date") {
        const v = dateValue.trim();
        if (!v) return others;
        const next: AppliedFilter = { key: activeKey, kind: "date", op: dateOp, value: v };
        return [...others, next];
      }

      if (kind === "enum") {
        const v = enumValue.trim();
        if (!v) return others;
        const next: AppliedFilter = { key: activeKey, kind: "enum", op: enumOp, value: v };
        return [...others, next];
      }

      if (kind === "boolean") {
        const next: AppliedFilter = { key: activeKey, kind: "boolean", op: "is", value: boolValue };
        return [...others, next];
      }

      return others;
    });

    setConfigOpen(false);
  }, [
    activeKey,
    stringOp,
    stringValue,
    numberOp,
    numberA,
    numberB,
    dateOp,
    dateValue,
    enumOp,
    enumValue,
    boolValue,
  ]);

  const configTitle = activeKey ? `Filter by ${fieldLabel(activeKey)}` : "Filter";

  const configKind: FilterKind = activeKey ? fieldKind(activeKey) : "string";

  const configDisabled = useMemo(() => {
    if (!activeKey) return true;

    if (configKind === "string") return stringValue.trim() === "";
    if (configKind === "number") {
      const a = Number(numberA);
      if (Number.isNaN(a)) return true;
      if (numberOp === "between") return Number.isNaN(Number(numberB));
      return false;
    }
    if (configKind === "date") return dateValue.trim() === "";
    if (configKind === "enum") return enumValue.trim() === "";
    if (configKind === "boolean") return false;
    return true;
  }, [activeKey, configKind, stringValue, numberA, numberB, numberOp, dateValue, enumValue]);

  /* ----------------------- */
  /* Render                  */
  /* ----------------------- */

  return (
    <Page fullWidth title="Products (FAST plane)">
      <Layout>
        {/* ===== FAST Status Card ===== */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              {fastStatus ? (
                <InlineStack gap="400" align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={fastStatus.fastReady ? "success" : "critical"}>
                      {`FAST ${fastStatus.fastReady ? "ready" : "not ready"}`}
                    </Badge>

                    <Text as="span" variant="bodySm" tone="subdued">
                      Rev {fastStatus.fastRevision}
                    </Text>

                    {fastStatus.fastLastSyncAt && (
                      <Text as="span" variant="bodySm" tone="subdued">
                        Last sync: {new Date(fastStatus.fastLastSyncAt).toLocaleString()}
                      </Text>
                    )}
                  </InlineStack>

                  {fastStatus.syncEnqueued && <Badge tone="attention">Sync enqueued</Badge>}
                </InlineStack>
              ) : (
                <Text as="p" variant="bodySm" tone="subdued">
                  Loading FAST sync status…
                </Text>
              )}
            </Box>
          </Card>
        </Layout.Section>

        {/* ===== Filters + Sort Card ===== */}
        <Layout.Section>
          <Card>
            <Box padding="400" background="bg-surface-secondary">
              <InlineStack align="space-between" gap="400" wrap blockAlign="start">
                {/* LEFT */}
                <Box>
                  <Tag>default</Tag>

                  <Box paddingBlockStart="300">
                    <InlineStack gap="200" wrap>
                      <Box minWidth="360px">
                        <TextField
                          labelHidden
                          label="Search"
                          placeholder="Search products by title, vendor, or handle…"
                          autoComplete="off"
                          value={searchInput}
                          onChange={(value) => setSearchInput(value)}
                        />
                      </Box>
                      <Button onClick={handleSearchClick} loading={query.isFetching && !!searchTerm}>
                        Search
                      </Button>
                    </InlineStack>
                  </Box>

                  <Box paddingBlockStart="300">
                    <ButtonGroup>
                      <Button icon={PlusIcon} onClick={openAddFilter}>
                        Add Filter
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleClearAll}
                        disabled={
                          !searchInput &&
                          !searchTerm &&
                          appliedFilters.length === 0 &&
                          sortBy === "sort" &&
                          sortDirection === "desc"
                        }
                      >
                        Clear
                      </Button>
                    </ButtonGroup>
                  </Box>

                  {/* Applied filters as removable tags */}
                  {appliedFilters.length > 0 && (
                    <Box paddingBlockStart="300">
                      <InlineStack gap="200" wrap>
                        {appliedFilters.map((f) => {
                          let desc = "";
                          if (f.kind === "string") desc = `${stringOpLabel(f.op)}: "${f.value}"`;
                          else if (f.kind === "number")
                            desc =
                              f.op === "between"
                                ? `${numberOpLabel(f.op)}: ${f.value}–${f.value2}`
                                : `${numberOpLabel(f.op)}: ${f.value}`;
                          else if (f.kind === "date") desc = `${dateOpLabel(f.op)}: ${f.value}`;
                          else if (f.kind === "enum") desc = `${enumOpLabel(f.op)}: ${f.value}`;
                          else if (f.kind === "boolean") desc = `Is: ${f.value ? "Yes" : "No"}`;

                          return (
                            <Tag key={f.key} onRemove={() => removeFilter(f.key)}>
                              {fieldLabel(f.key)} — {desc}
                            </Tag>
                          );
                        })}
                      </InlineStack>
                    </Box>
                  )}
                </Box>

                {/* RIGHT */}
                <Box>
                  <InlineStack gap="200">
                    <Box minWidth="160px">
                      <Select
                        labelHidden
                        label="Sort By"
                        options={[
                          { label: "sortBy", value: "sort" },
                          { label: "Title", value: "title" },
                          { label: "Updated", value: "updated" },
                        ]}
                        value={sortBy}
                        onChange={handleSortByChange}
                      />
                    </Box>

                    <Box minWidth="160px">
                      <Select
                        labelHidden
                        label="Order"
                        options={[
                          { label: "Descending", value: "desc" },
                          { label: "Ascending", value: "asc" },
                        ]}
                        value={sortDirection}
                        onChange={handleSortDirectionChange}
                      />
                    </Box>
                  </InlineStack>
                </Box>
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* ===== Products Table Card ===== */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              {loadingInitial && (
                <InlineStack align="center" gap="200">
                  <Spinner />
                  <Text as="p">Loading products…</Text>
                </InlineStack>
              )}

              {!loadingInitial && allItems.length === 0 && (
                <Banner tone="info">
                  <p>No products found in FAST plane yet.</p>
                  <p>The initial sync might still be running, or your search / filters are too specific.</p>
                </Banner>
              )}
            </Box>

            {!loadingInitial && allItems.length > 0 && (
              <>
                <IndexTable
                  resourceName={resourceName}
                  itemCount={allItems.length}
                  selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
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
                        <Text as="span" fontWeight="semibold">
                          {product.title}
                        </Text>
                        <Text as="div" variant="bodySm" tone="subdued">
                          {product.handle}
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Badge tone={productStatusTone[product.status]}>{product.status}</Badge>
                      </IndexTable.Cell>

                      <IndexTable.Cell>{product.vendor || "—"}</IndexTable.Cell>

                      <IndexTable.Cell>{product.productType || "—"}</IndexTable.Cell>

                      <IndexTable.Cell>{product.tags.length ? product.tags.join(", ") : "—"}</IndexTable.Cell>

                      <IndexTable.Cell>
                        <Badge tone={product.hasImages ? "success" : "critical"}>
                          {product.hasImages ? "Yes" : "No"}
                        </Badge>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text variant="bodySm" tone="subdued">
                          {product.updatedAtShopify ? new Date(product.updatedAtShopify).toLocaleString() : "—"}
                        </Text>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>

                {query.hasNextPage && (
                  <Box padding="400">
                    <InlineStack align="center">
                      <Button onClick={() => query.fetchNextPage()} loading={loadingMore}>
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

      {/* ===================== */}
      {/* Modal 1: Add Filter   */}
      {/* ===================== */}
      <Modal
        open={addFilterOpen}
        onClose={closeAddFilter}
        title="Add Filter"
        size="large"
        secondaryActions={[{ content: "Cancel", onAction: closeAddFilter }]}
      >
        <Modal.Section>
          <Box paddingBlockEnd="200">
            <TextField
              label="Search filters"
              labelHidden
              placeholder="Search filters"
              autoComplete="off"
              value={filterSearch}
              onChange={setFilterSearch}
              prefix={<span style={{ display: "inline-flex" }}>{/* Polaris icon spacing */}</span>}
            />
          </Box>

          <Divider />

          <Box paddingBlockStart="300" paddingBlockEnd="200">
            <Text as="h3" variant="headingSm">
              Product Fields
            </Text>
          </Box>

          <ActionList
            items={filteredProductFields.map((f) => ({
              content: f.label,
              onAction: () => openConfigForKey(f.key),
            }))}
          />

          <Box paddingBlockStart="300">
            <Text as="h3" variant="headingSm">
              Variant Fields
            </Text>
          </Box>

          <ActionList
            items={filteredVariantFields.map((f) => ({
              content: f.label,
              onAction: () => openConfigForKey(f.key),
            }))}
          />
        </Modal.Section>
      </Modal>

      {/* =============================== */}
      {/* Modal 2: Configure field filter */}
      {/* =============================== */}
      <Modal
        open={configOpen}
        onClose={closeConfig}
        title={configTitle}
        size="large"
        primaryAction={{
          content:
            fieldKind(activeKey ?? "") === "enum" && (activeKey ?? "") === "product.status"
              ? "Add Filter"
              : "Apply Filter",
          onAction: applyConfig,
          disabled: configDisabled,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: closeConfig,
          },
        ]}
      >
        <Modal.Section>
          {/* STRING */}
          {activeKey && configKind === "string" && (
            <>
              <Box paddingBlockEnd="200">
                <Text as="h3" variant="headingSm">
                  Filter Option
                </Text>
              </Box>

              <Box paddingBlockEnd="300">
                <Select
                  label="Filter option"
                  labelHidden
                  options={[
                    { label: "Equals", value: "equals" },
                    { label: "Not Equals", value: "notEquals" },
                    { label: "Contains", value: "contains" },
                    { label: "Does not contain", value: "notContains" },
                    { label: "Contains any of the words", value: "containsAny" },
                    { label: "Ends with", value: "endsWith" },
                    { label: "Starts with", value: "startsWith" },
                    { label: "Does not start with", value: "notStartsWith" },
                    { label: "Contains (case insensitive)", value: "containsCi" },
                    { label: "Equals (case insensitive)", value: "equalsCi" },
                  ]}
                  value={stringOp}
                  onChange={(v) => setStringOp(v as StringOp)}
                />
              </Box>

              <Box paddingBlockEnd="200">
                <Text as="h3" variant="headingSm">
                  Value
                </Text>
              </Box>

              <TextField
                label="Value"
                labelHidden
                placeholder="Enter value"
                autoComplete="off"
                value={stringValue}
                onChange={setStringValue}
              />
            </>
          )}

          {/* ENUM (Status style) */}
          {activeKey && configKind === "enum" && activeKey === "product.status" && (
            <>
              <Box paddingBlockEnd="200">
                <Text as="h3" variant="headingSm">
                  Status
                </Text>
              </Box>

              <ChoiceList
                title=""
                titleHidden
                choices={[
                  { label: "Draft", value: "DRAFT" },
                  { label: "Active", value: "ACTIVE" },
                  { label: "Archived", value: "ARCHIVED" },
                ]}
                selected={[enumValue]}
                onChange={(selected) => setEnumValue(selected[0] ?? "")}
              />
            </>
          )}

          {/* ENUM (generic) */}
          {activeKey && configKind === "enum" && activeKey !== "product.status" && (
            <>
              <Box paddingBlockEnd="200">
                <Text as="h3" variant="headingSm">
                  Filter Option
                </Text>
              </Box>

              <Box paddingBlockEnd="300">
                <Select
                  label="Filter option"
                  labelHidden
                  options={[
                    { label: "Is", value: "is" },
                    { label: "Is not", value: "isNot" },
                  ]}
                  value={enumOp}
                  onChange={(v) => setEnumOp(v as EnumOp)}
                />
              </Box>

              <Box paddingBlockEnd="200">
                <Text as="h3" variant="headingSm">
                  Search
                </Text>
              </Box>

              <TextField
                label="Search"
                labelHidden
                placeholder="Enter value"
                value={enumValue}
                onChange={setEnumValue}
                autoComplete="off"
              />
            </>
          )}

          {/* DATE */}
          {activeKey && configKind === "date" && (
            <>
              <Box paddingBlockEnd="200">
                <Text as="h3" variant="headingSm">
                  Select Date Filter
                </Text>
              </Box>

              <Box paddingBlockEnd="300">
                <Select
                  label="Date filter"
                  labelHidden
                  options={[
                    { label: "Is before", value: "before" },
                    { label: "Is after", value: "after" },
                    { label: "Is on", value: "on" },
                  ]}
                  value={dateOp}
                  onChange={(v) => setDateOp(v as DateOp)}
                />
              </Box>

              <Box paddingBlockEnd="200">
                <Text as="h3" variant="headingSm">
                  Select date
                </Text>
              </Box>

              <TextField
                label="Select date"
                labelHidden
                type="date"
                value={dateValue}
                onChange={setDateValue}
                autoComplete="off"
              />
            </>
          )}

          {/* NUMBER */}
          {activeKey && configKind === "number" && (
            <>
              <Box paddingBlockEnd="200">
                <Text as="h3" variant="headingSm">
                  Filter Option
                </Text>
              </Box>

              <Box paddingBlockEnd="300">
                <Select
                  label="Number filter"
                  labelHidden
                  options={[
                    { label: "Equals", value: "eq" },
                    { label: "Not equals", value: "neq" },
                    { label: "Greater than", value: "gt" },
                    { label: "Greater than or equal", value: "gte" },
                    { label: "Less than", value: "lt" },
                    { label: "Less than or equal", value: "lte" },
                    { label: "Between", value: "between" },
                  ]}
                  value={numberOp}
                  onChange={(v) => setNumberOp(v as NumberOp)}
                />
              </Box>

              <Box paddingBlockEnd="200">
                <Text as="h3" variant="headingSm">
                  Value
                </Text>
              </Box>

              <InlineStack gap="200" wrap>
                <Box minWidth="220px">
                  <TextField
                    label="Value"
                    labelHidden
                    type="number"
                    placeholder={numberOp === "between" ? "From" : "Enter value"}
                    value={numberA}
                    onChange={setNumberA}
                    autoComplete="off"
                  />
                </Box>

                {numberOp === "between" && (
                  <Box minWidth="220px">
                    <TextField
                      label="Value 2"
                      labelHidden
                      type="number"
                      placeholder="To"
                      value={numberB}
                      onChange={setNumberB}
                      autoComplete="off"
                    />
                  </Box>
                )}
              </InlineStack>
            </>
          )}

          {/* BOOLEAN */}
          {activeKey && configKind === "boolean" && (
            <>
              <Box paddingBlockEnd="200">
                <Text as="h3" variant="headingSm">
                  Value
                </Text>
              </Box>

              <ChoiceList
                title=""
                titleHidden
                choices={[
                  { label: "Yes", value: "yes" },
                  { label: "No", value: "no" },
                ]}
                selected={[boolValue ? "yes" : "no"]}
                onChange={(selected) => setBoolValue(selected[0] === "yes")}
              />
            </>
          )}

          {/* If nothing selected */}
          {!activeKey && (
            <Text as="p" tone="subdued">
              Select a filter field.
            </Text>
          )}

          {/* hint for unsupported */}
          {activeKey && !fieldSupportedNow(activeKey) && (
            <Box paddingBlockStart="400">
              <Banner tone="warning">
                <p>
                  This filter is UI-ready, but it won’t affect results yet because the FAST-plane product DTO doesn’t
                  include this field today.
                </p>
              </Banner>
            </Box>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
