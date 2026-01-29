// web/frontend/pages/ProductsPage.tsx
import React, { useMemo, useState, useCallback } from "react";
import { Page, Layout } from "@shopify/polaris";

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

export default function ProductsPage() {
  // Search (top bar)
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string | null>(null);

  // Sort
  const [sortBy, setSortBy] = useState<string>("sort");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Filters
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilter[]>([]);

  // Filter Builder modal
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);

  // FAST-plane query
  const query = useBootstrapProducts(searchTerm);
  const fastStatus = query.data?.pages[0]?.status;

  const loadingInitial = query.isLoading;
  const loadingMore = query.isFetchingNextPage;

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
  }, []);

  const handleSortByChange = useCallback((value: string) => setSortBy(value), []);
  const handleSortDirectionChange = useCallback(
    (value: "asc" | "desc") => setSortDirection(value),
    [],
  );

  /* ----------------------- */
  /* Data: filtered + sorted */
  /* ----------------------- */

  const allItems: ProductLiteDto[] = useMemo(() => {
    if (!query.data) return [];
    const raw = query.data.pages.flatMap((p) => p.items);

    // main search term: match vendor OR title OR handle (extra safety;
    // backend can also use search)
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

    // applied filters (client-side)
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
    <Page fullWidth title="Products (FAST plane)">
      <Layout>
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
            isSearching={query.isFetching && !!searchTerm}
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
            hasNextPage={query.hasNextPage ?? false}
            onLoadMore={() => query.fetchNextPage()}
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
