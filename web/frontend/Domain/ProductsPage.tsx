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
  Filters,
  ChoiceList,
  Autocomplete,
  Select,
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

// "none" => placeholder "Sort by" (no sort)
// Extended to match all table columns
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
/* Page                    */
/* ----------------------- */

export default function ProductsPage() {
  const app = useAppBridge() as AppBridgeState | undefined;

  /* ----------------------- */
  /* Filter + sort state     */
  /* ----------------------- */

  // Search: input vs applied term
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<ProductLiteDto["status"] | null>(null);

  // Tag filter
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  // Images filter ("with" / "without")
  const [imageFilter, setImageFilter] = useState<"with" | "without" | null>(
    null,
  );

  // Updated filter ("7" / "30" / "90" days)
  const [updatedFilter, setUpdatedFilter] = useState<"7" | "30" | "90" | null>(
    null,
  );

  const [vendorInput, setVendorInput] = useState("");
  const [typeInput, setTypeInput] = useState("");

  // sort configuration
  const [sortField, setSortField] = useState<SortField>("none"); // default = "Sort by"
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("asc"); // default Ascending

  const query = useBootstrapProducts(app);
  const loadingInitial = query.isLoading;
  const loadingMore = query.isFetchingNextPage;

  // FAST sync status (from first ProductsPage version)
  const status = query.data?.pages[0]?.status;

  /* ----------------------- */
  /* Unique options          */
  /* ----------------------- */

  const allVendors: string[] = useMemo(() => {
    if (!query.data) return [];
    const vendors = query.data.pages.flatMap((p) =>
      p.items
        .map((i) => i.vendor)
        .filter((v): v is string => Boolean(v && v.trim())),
    );
    return Array.from(new Set(vendors)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [query.data]);

  const allTypes: string[] = useMemo(() => {
    if (!query.data) return [];
    const types = query.data.pages.flatMap((p) =>
      p.items
        .map((i) => i.productType)
        .filter((t): t is string => Boolean(t && t.trim())),
    );
    return Array.from(new Set(types)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [query.data]);

  // All tags for tag autocomplete
  const allTags: string[] = useMemo(() => {
    if (!query.data) return [];
    const tags = query.data.pages.flatMap((p) =>
      p.items.flatMap((i) =>
        (i.tags ?? []).filter((t): t is string => Boolean(t && t.trim())),
      ),
    );
    return Array.from(new Set(tags)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [query.data]);

  const allStatuses: ProductLiteDto["status"][] = [
    "ACTIVE",
    "DRAFT",
    "ARCHIVED",
  ];

  /* ----------------------- */
  /* Autocomplete options    */
  /* ----------------------- */

  const vendorOptions: Autocomplete.OptionDescriptor[] = useMemo(() => {
    const q = vendorInput.trim().toLowerCase();
    if (!q) return [];
    return allVendors
      .filter((v) => v.toLowerCase().includes(q))
      .map((v) => ({ value: v, label: v }));
  }, [allVendors, vendorInput]);

  const typeOptions: Autocomplete.OptionDescriptor[] = useMemo(() => {
    const q = typeInput.trim().toLowerCase();
    if (!q) return [];
    return allTypes
      .filter((t) => t.toLowerCase().includes(q))
      .map((t) => ({ value: t, label: t }));
  }, [allTypes, typeInput]);

  const tagOptions: Autocomplete.OptionDescriptor[] = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    return allTags
      .filter((t) => t.toLowerCase().includes(q))
      .map((t) => ({ value: t, label: t }));
  }, [allTags, tagInput]);

  /* ----------------------- */
  /* Filtered + sorted items */
  /* ----------------------- */

  const allItems: ProductLiteDto[] = useMemo(() => {
    if (!query.data) return [];
    let result = query.data.pages.flatMap((p) => p.items);

    // Search – applies ONLY the committed searchTerm
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

    // Filters
    if (vendorFilter) {
      result = result.filter((p) => p.vendor === vendorFilter);
    }
    if (typeFilter) {
      result = result.filter((p) => p.productType === typeFilter);
    }
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (tagFilter) {
      result = result.filter((p) => (p.tags ?? []).includes(tagFilter));
    }

    if (imageFilter === "with") {
      result = result.filter((p) => p.hasImages);
    } else if (imageFilter === "without") {
      result = result.filter((p) => !p.hasImages);
    }

    if (updatedFilter) {
      const days =
        updatedFilter === "7"
          ? 7
          : updatedFilter === "30"
          ? 30
          : 90; // "90"
      const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

      result = result.filter((p) => {
        if (!p.updatedAtShopify) return false;
        const ts = new Date(p.updatedAtShopify).getTime();
        if (Number.isNaN(ts)) return false;
        return ts >= cutoffMs;
      });
    }

    // Sort based on field + direction
    if (sortField !== "none") {
      const dir = sortDirection === "asc" ? 1 : -1;

      result = [...result].sort((a, b) => {
        let av: string | number | null = null;
        let bv: string | number | null = null;

        switch (sortField) {
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
            // hasImages: true > false
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
    query.data,
    searchTerm,
    vendorFilter,
    typeFilter,
    statusFilter,
    tagFilter,
    imageFilter,
    updatedFilter,
    sortField,
    sortDirection,
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

    setVendorFilter(null);
    setTypeFilter(null);
    setStatusFilter(null);

    setVendorInput("");
    setTypeInput("");

    setTagFilter(null);
    setTagInput("");
    setImageFilter(null);
    setUpdatedFilter(null);

    // keep sortField + sortDirection as user preference
  }, []);

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
  if (vendorFilter) {
    appliedFilters.push({
      key: "vendor",
      label: `Vendor: ${vendorFilter}`,
      onRemove: () => {
        setVendorFilter(null);
        setVendorInput("");
      },
    });
  }
  if (typeFilter) {
    appliedFilters.push({
      key: "type",
      label: `Type: ${typeFilter}`,
      onRemove: () => {
        setTypeFilter(null);
        setTypeInput("");
      },
    });
  }
  if (statusFilter) {
    appliedFilters.push({
      key: "status",
      label: `Status: ${statusFilter}`,
      onRemove: () => {
        setStatusFilter(null);
      },
    });
  }
  if (tagFilter) {
    appliedFilters.push({
      key: "tag",
      label: `Tag: ${tagFilter}`,
      onRemove: () => {
        setTagFilter(null);
        setTagInput("");
      },
    });
  }
  if (imageFilter) {
    appliedFilters.push({
      key: "images",
      label:
        imageFilter === "with" ? "With images" : "Without images",
      onRemove: () => {
        setImageFilter(null);
      },
    });
  }
  if (updatedFilter) {
    const labelDays =
      updatedFilter === "7"
        ? "last 7 days"
        : updatedFilter === "30"
        ? "last 30 days"
        : "last 90 days";
    appliedFilters.push({
      key: "updated",
      label: `Updated in ${labelDays}`,
      onRemove: () => {
        setUpdatedFilter(null);
      },
    });
  }

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
                  {status.syncEnqueued && (
                    <Badge tone="attention">Sync enqueued</Badge>
                  )}
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
                filters={[
                  // Vendor: Autocomplete + conditional Apply/Reset
                  {
                    key: "vendor",
                    label: "Vendor",
                    filter: (
                      <>
                        <Autocomplete
                          options={vendorOptions}
                          selected={vendorInput ? [vendorInput] : []}
                          onSelect={(selected) => {
                            const value = (selected[0] as string) ?? "";
                            setVendorInput(value);
                          }}
                          allowMultiple={false}
                          textField={
                            <Autocomplete.TextField
                              label="Vendor"
                              labelHidden
                              placeholder="Start typing vendor"
                              value={vendorInput}
                              onChange={setVendorInput}
                              autoComplete="off"
                            />
                          }
                        />
                        {(vendorInput.trim().length > 0 ||
                          vendorFilter !== null) && (
                          <Box paddingBlockStart="200">
                            <InlineStack gap="200">
                              <Button
                                size="slim"
                                onClick={() => {
                                  const value = vendorInput.trim();
                                  setVendorFilter(value || null);
                                  setVendorInput("");
                                }}
                              >
                                Apply
                              </Button>
                              <Button
                                size="slim"
                                onClick={() => {
                                  setVendorInput("");
                                  setVendorFilter(null);
                                }}
                              >
                                Reset
                              </Button>
                            </InlineStack>
                          </Box>
                        )}
                      </>
                    ),
                  },

                  // Type: Autocomplete + conditional Apply/Reset
                  {
                    key: "type",
                    label: "Type",
                    filter: (
                      <>
                        <Autocomplete
                          options={typeOptions}
                          selected={typeInput ? [typeInput] : []}
                          onSelect={(selected) => {
                            const value = (selected[0] as string) ?? "";
                            setTypeInput(value);
                          }}
                          allowMultiple={false}
                          textField={
                            <Autocomplete.TextField
                              label="Type"
                              labelHidden
                              placeholder="Start typing type"
                              value={typeInput}
                              onChange={setTypeInput}
                              autoComplete="off"
                            />
                          }
                        />
                        {(typeInput.trim().length > 0 ||
                          typeFilter !== null) && (
                          <Box paddingBlockStart="200">
                            <InlineStack gap="200">
                              <Button
                                size="slim"
                                onClick={() => {
                                  const value = typeInput.trim();
                                  setTypeFilter(value || null);
                                  setTypeInput("");
                                }}
                              >
                                Apply
                              </Button>
                              <Button
                                size="slim"
                                onClick={() => {
                                  setTypeInput("");
                                  setTypeFilter(null);
                                }}
                              >
                                Reset
                              </Button>
                            </InlineStack>
                          </Box>
                        )}
                      </>
                    ),
                  },

                  // Status: immediate filter
                  {
                    key: "status",
                    label: "Status",
                    filter: (
                      <ChoiceList
                        titleHidden
                        choices={allStatuses.map((s) => ({
                          label: s,
                          value: s,
                        }))}
                        selected={statusFilter ? [statusFilter] : []}
                        onChange={(selected) => {
                          const value = selected[0] as
                            | ProductLiteDto["status"]
                            | undefined;
                          setStatusFilter(value ?? null);
                        }}
                      />
                    ),
                  },

                  // Tag filter
                  {
                    key: "tag",
                    label: "Tag",
                    filter: (
                      <>
                        <Autocomplete
                          options={tagOptions}
                          selected={tagInput ? [tagInput] : []}
                          onSelect={(selected) => {
                            const value = (selected[0] as string) ?? "";
                            setTagInput(value);
                          }}
                          allowMultiple={false}
                          textField={
                            <Autocomplete.TextField
                              label="Tag"
                              labelHidden
                              placeholder="Start typing tag"
                              value={tagInput}
                              onChange={setTagInput}
                              autoComplete="off"
                            />
                          }
                        />
                        {(tagInput.trim().length > 0 ||
                          tagFilter !== null) && (
                          <Box paddingBlockStart="200">
                            <InlineStack gap="200">
                              <Button
                                size="slim"
                                onClick={() => {
                                  const value = tagInput.trim();
                                  setTagFilter(value || null);
                                  setTagInput("");
                                }}
                              >
                                Apply
                              </Button>
                              <Button
                                size="slim"
                                onClick={() => {
                                  setTagInput("");
                                  setTagFilter(null);
                                }}
                              >
                                Reset
                              </Button>
                            </InlineStack>
                          </Box>
                        )}
                      </>
                    ),
                  },

                  // Images filter (with / without)
                  {
                    key: "images",
                    label: "Images",
                    filter: (
                      <ChoiceList
                        titleHidden
                        choices={[
                          { label: "With images", value: "with" },
                          { label: "Without images", value: "without" },
                        ]}
                        selected={imageFilter ? [imageFilter] : []}
                        onChange={(selected) => {
                          const value = selected[0] as
                            | "with"
                            | "without"
                            | undefined;
                          setImageFilter(value ?? null);
                        }}
                      />
                    ),
                  },

                  // Updated filter (relative)
                  {
                    key: "updated",
                    label: "Updated",
                    filter: (
                      <ChoiceList
                        titleHidden
                        choices={[
                          { label: "Last 7 days", value: "7" },
                          { label: "Last 30 days", value: "30" },
                          { label: "Last 90 days", value: "90" },
                        ]}
                        selected={updatedFilter ? [updatedFilter] : []}
                        onChange={(selected) => {
                          const value = selected[0] as
                            | "7"
                            | "30"
                            | "90"
                            | undefined;
                          setUpdatedFilter(value ?? null);
                        }}
                      />
                    ),
                  },
                ]}
                appliedFilters={appliedFilters}
                onClearAll={clearAll}
              >
                {/* Search button + SORT BAR: under search bar, inline-right of Add filter */}
                <InlineStack align="end" gap="200">
                  <Button
                    size="slim"
                    onClick={() => setSearchTerm(searchInput.trim())}
                    disabled={!searchInput.trim()}
                  >
                    Search
                  </Button>
                  {/* First dropdown: "Sort by" default (placeholder) */}
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
                    value={sortField}
                    onChange={(value) => setSortField(value as SortField)}
                  />
                  {/* Second dropdown: Asc / Desc */}
                  <Select
                    label="Sort direction"
                    labelHidden
                    options={[
                      { label: "Ascending", value: "asc" },
                      { label: "Descending", value: "desc" },
                    ]}
                    value={sortDirection}
                    onChange={(value) =>
                      setSortDirection(value as SortDirection)
                    }
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
                      <IndexTable.Cell>
                        {product.vendor || "—"}
                      </IndexTable.Cell>
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

                {query.hasNextPage && (
                  <Box padding="400">
                    <InlineStack align="center">
                      <Button
                        onClick={() => query.fetchNextPage()}
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
