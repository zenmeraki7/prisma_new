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
/* Page                    */
/* ----------------------- */

export default function ProductsPage() {
  const app = useAppBridge() as AppBridgeState | undefined;

  /* ----------------------- */
  /* Filter state            */
  /* ----------------------- */

  // Global title search (query bar)
  const [queryValue, setQueryValue] = useState("");

  // COMMITTED filter values (actually used for table + chips)
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<ProductLiteDto["status"] | null>(null);

  // DRAFT values while editing vendor/type filters
  const [vendorInput, setVendorInput] = useState("");
  const [typeInput, setTypeInput] = useState("");

  const query = useBootstrapProducts(app);
  const loadingInitial = query.isLoading;
  const loadingMore = query.isFetchingNextPage;

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

  const allStatuses: ProductLiteDto["status"][] = [
    "ACTIVE",
    "DRAFT",
    "ARCHIVED",
  ];

  /* ----------------------- */
  /* Autocomplete options    */
  /* ----------------------- */
  // suggestions only after typing something

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

  /* ----------------------- */
  /* Filtered table items    */
  /* ----------------------- */

  const allItems: ProductLiteDto[] = useMemo(() => {
    if (!query.data) return [];
    let result = query.data.pages.flatMap((p) => p.items);

    // Title search
    if (queryValue) {
      const q = queryValue.toLowerCase();
      result = result.filter((p) =>
        (p.title ?? "").toLowerCase().includes(q),
      );
    }

    // ONLY committed filters are used here
    if (vendorFilter) {
      result = result.filter((p) => p.vendor === vendorFilter);
    }
    if (typeFilter) {
      result = result.filter((p) => p.productType === typeFilter);
    }
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }

    return result;
  }, [query.data, queryValue, vendorFilter, typeFilter, statusFilter]);

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(allItems, {
      resourceIDResolver: (p) => p.id,
    });

  /* ----------------------- */
  /* Clear all               */
  /* ----------------------- */

  const clearAll = useCallback(() => {
    setQueryValue("");
    setVendorFilter(null);
    setTypeFilter(null);
    setStatusFilter(null);

    setVendorInput("");
    setTypeInput("");
  }, []);

  /* ----------------------- */
  /* Applied filters chips   */
  /* ----------------------- */

  const appliedFilters: FiltersProps["appliedFilters"] = [];

  if (queryValue) {
    appliedFilters.push({
      key: "title",
      label: `Title contains "${queryValue}"`,
      onRemove: () => setQueryValue(""),
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

  /* ----------------------- */
  /* Render                  */
  /* ----------------------- */

  return (
    <Page fullWidth title="Products (FAST plane)">
      <Layout>
        {/* Filters */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Filters
                queryValue={queryValue}
                queryPlaceholder="Search by title"
                onQueryChange={setQueryValue}
                onQueryClear={() => setQueryValue("")}
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
                                  setVendorFilter(value || null); // filter table
                                  setVendorInput(""); // clear so no suggestions after apply
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
                                  setTypeFilter(value || null); // filter table
                                  setTypeInput(""); // clear so no suggestions after apply
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

                  // Status: immediate filter, NO Apply/Reset
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
                          setStatusFilter(value ?? null); // apply instantly
                        }}
                      />
                    ),
                  },
                ]}
                appliedFilters={appliedFilters}
                onClearAll={clearAll}
              />
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
