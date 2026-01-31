// web/frontend/pages/ProductsPage.tsx
import React, { useMemo, useState, useCallback } from "react";
import { Page, Layout,Banner } from "@shopify/polaris";

import type { ProductLiteDto } from "../queries/bootstrapProducts";
import { useBootstrapProducts } from "../hooks/useBootstrapProducts";
import {
  PRODUCT_FIELDS,
  VARIANT_FIELDS,
  filterPredicate,
  type AppliedFilter,
} from "../lib/products/filters";
import type { FilterFieldGroup } from "../lib/filters/registry";

import { FastStatusCard } from "../components/products/FastStatusCard";
import { ProductsFiltersCard } from "../components/products/ProductsFiltersCard";
import { ProductsTable } from "../components/products/ProductsTable";
import { FilterBuilder } from "../components/products/FilterBuilderModal";
import { useProductsByFilter } from "../hooks/useProductsByFilter";
import { buildFilterAST } from "../lib/filters/buildFilterAST";

export default function ProductsPage() {
  // Search (top bar)
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string | null>(null);

  // Sort
  const [sortBy, setSortBy] = useState<string>("sort");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Filters
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilter[]>([]);

  //Snapshot mode toggle
  const [useSnapshotMode, setUseSnapshotMode] = useState(false);
  // Filter Builder modal
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);

/* ----------------------- */
  /* Queries                 */
  /* ----------------------- */

  // Determine if we should use snapshot mode
  const hasFilters = appliedFilters.length > 0;
  const shouldUseSnapshot = useSnapshotMode && hasFilters;

  // Build filter input for GraphQL
  const filterInput = useMemo(() => {
    if (!hasFilters) return null;
    
    return {
      filter: buildFilterAST(appliedFilters),
      mode: shouldUseSnapshot ? ("SNAPSHOT" as const) : ("FAST_ONLY" as const),
      first: 50,
    };
  }, [appliedFilters, hasFilters, shouldUseSnapshot]);

  // Bootstrap query (no filters)
  const bootstrapQuery = useBootstrapProducts(searchTerm);
  
  // Filter-based query (with filters applied)
  const filterQuery = useProductsByFilter(filterInput);

  // Use the appropriate query
  const activeQuery = shouldUseSnapshot ? filterQuery : bootstrapQuery;
  const fastStatus = bootstrapQuery.data?.pages[0]?.status;

  const loadingInitial = activeQuery.isLoading;
  const loadingMore = activeQuery.isFetchingNextPage;

  /* ----------------------- */
  /* Search & sort helpers   */
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
    setUseSnapshotMode(false);
  }, []);

  const handleSortByChange = useCallback((value: string) => setSortBy(value), []);
  const handleSortDirectionChange = useCallback(
    (value: "asc" | "desc") => setSortDirection(value),
    [],
  );

  const toggleSnapshotMode = useCallback(() => {
    setUseSnapshotMode((prev) => !prev);
  }, []);

  /* ----------------------- */
  /* Data: filtered + sorted */
  /* ----------------------- */

 const allItems: ProductLiteDto[] = useMemo(() => {
  if (!activeQuery.data) return [];
  
  // In snapshot mode, backend already filtered - just return results
  if (shouldUseSnapshot) {
    const items = filterQuery.data.pages.flatMap((p) => p.items);
    console.log('🎯 Frontend Snapshot Data:', {
      mode: 'SNAPSHOT',
      totalPages: filterQuery.data.pages.length,
      totalItems: items.length,
      firstPage: filterQuery.data.pages[0],
    });
    // Only apply sorting in snapshot mode (backend doesn't sort)
    const sorted = [...items];
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
  }

  // FAST mode: bootstrap query + client-side filtering
  const raw = bootstrapQuery.data?.pages.flatMap((p) => p.items) ?? [];
  let result = raw;
  
  // Apply search term
  if (searchTerm && searchTerm.trim() !== "") {
    const needle = searchTerm.toLowerCase();
    result = result.filter((p) => {
      const vendor = (p.vendor ?? "").toLowerCase();
      const title = (p.title ?? "").toLowerCase();
      const handle = (p.handle ?? "").toLowerCase();
      return vendor.includes(needle) || title.includes(needle) || handle.includes(needle);
    });
  }

  // Apply filters client-side
  if (appliedFilters.length > 0) {
    for (const f of appliedFilters) {
      result = result.filter((p) => filterPredicate(p, f));
    }
  }

  // Sort
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
}, [
  shouldUseSnapshot,
  filterQuery.data,
  bootstrapQuery.data,
  searchTerm,
  appliedFilters,
  sortBy,
  sortDirection,
]);

  /* ----------------------- */
  /* Filter Builder registry */
  /* ----------------------- */

  const filterGroups: FilterFieldGroup[] = useMemo(
    () => [
      {
        id: "product",
        label: "Product Fields",
        fields: PRODUCT_FIELDS,
      },
      {
        id: "variant",
        label: "Variant Fields",
        fields: VARIANT_FIELDS,
      },
    ],
    [],
  );

  const openFilterBuilder = useCallback(() => {
    setFilterBuilderOpen(true);
  }, []);

  const closeFilterBuilder = useCallback(() => {
    setFilterBuilderOpen(false);
  }, []);

  const removeFilter = useCallback((key: string) => {
    setAppliedFilters((prev) => prev.filter((f) => f.key !== key));
  }, []);

  /* ----------------------- */
  /* Render                  */
  /* ----------------------- */

  return (
    <Page 
    fullWidth 
    title="Products"
    primaryAction={
        hasFilters
          ? {
              content: useSnapshotMode ? "Switch to FAST Mode" : "Switch to Snapshot Mode",
              onAction: toggleSnapshotMode,
            }
          : undefined
      }
    >
      <Layout>
         {/* Snapshot mode banner */}
        {shouldUseSnapshot && (
          <Layout.Section>
            <Banner tone="info">
              <p>
                <strong>Snapshot Mode:</strong> Results are cached for consistent pagination. 
                Switch to FAST mode to see real-time updates.
              </p>
            </Banner>
          </Layout.Section>
        )}
        {/* FAST status */}
        <Layout.Section>
          <FastStatusCard fastStatus={fastStatus} />
        </Layout.Section>

        {/* Filters + Sort */}
        <Layout.Section>
          <ProductsFiltersCard
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            onSearchClick={handleSearchClick}
            isSearching={activeQuery.isFetching && !!searchTerm}
            searchTerm={searchTerm}
            appliedFilters={appliedFilters}
            onRemoveFilter={removeFilter}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortByChange={handleSortByChange}
            onSortDirectionChange={handleSortDirectionChange}
            onOpenAddFilter={openFilterBuilder}
            onClearAll={handleClearAll}
          />
        </Layout.Section>

        {/* Products table */}
        <Layout.Section>
          <ProductsTable
            items={allItems}
            loadingInitial={loadingInitial}
            loadingMore={loadingMore}
            hasNextPage={activeQuery.hasNextPage ?? false}
            onLoadMore={() => activeQuery.fetchNextPage()}
          />
        </Layout.Section>
      </Layout>

      {/* Generic Filter Builder (modal) */}
      <FilterBuilder
        open={filterBuilderOpen}
        onClose={closeFilterBuilder}
        groups={filterGroups}
        value={appliedFilters}
        onChange={setAppliedFilters}
      />
    </Page>
  );
}
