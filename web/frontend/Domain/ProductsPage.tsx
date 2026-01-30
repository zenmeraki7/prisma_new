// web/frontend/pages/ProductsPage.tsx
import React, { useMemo, useState, useCallback } from "react";
import { Page, Layout } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { AppBridgeState } from "@shopify/app-bridge-react";

import type { ProductLiteDto } from "../queries/bootstrapProducts";
import { useBootstrapProducts } from "../Domain/productPage/useBootstrapProducts";
import { fieldSupportedNow } from "../Domain/productPage/filterRegistry";
import { filterPredicate } from "../Domain/productPage/filterUtils";
import { useProductsPageFilterState } from "../Domain/productPage/useFilterState";

import { FastStatusCard } from "../Domain/productPage/components/FastStatusCard";
import { FiltersSortCard } from "../Domain/productPage/components/FiltersSortCard";
import { ProductsTableCard } from "../Domain/productPage/components/ProductsTableCard";
import { AddFilterModal } from "../Domain/productPage/components/AddFilterModal";
import { ConfigureFilterModal } from "../Domain/productPage/components/ConfigureFilterModal";

export default function ProductsPage() {
  const app = useAppBridge();

  // Search (top bar)
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string | null>(null);

  // Sort
  const [sortBy, setSortBy] = useState<string>("sort");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const query = useBootstrapProducts(app as AppBridgeState | undefined, searchTerm);
  const fastStatus = query.data?.pages[0]?.status;

  const loadingInitial = query.isLoading;
  const loadingMore = query.isFetchingNextPage;

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
    // filters are cleared inside the filter hook via clearAll callback we expose
    // but we keep sort reset here to preserve original behavior
    setSortBy("sort");
    setSortDirection("desc");
  }, []);

  const handleSortByChange = useCallback((value: string) => setSortBy(value), []);
  const handleSortDirectionChange = useCallback(
    (value: string) => setSortDirection(value as "asc" | "desc"),
    [],
  );

  /* ----------------------- */
  /* Filters state (modals)  */
  /* ----------------------- */

  const filters = useProductsPageFilterState();

  const onClearAll = useCallback(() => {
    handleClearAll();
    filters.clearAllFilters();
  }, [handleClearAll, filters]);

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
        return vendor.includes(needle) || title.includes(needle) || handle.includes(needle);
      });
    }

    // applied filters
    if (filters.appliedFilters.length > 0) {
      for (const f of filters.appliedFilters) {
        // If this field isn't supported yet (no data), we do NOT filter out rows.
        if (!fieldSupportedNow(f.key)) continue;
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
  }, [query.data, searchTerm, filters.appliedFilters, sortBy, sortDirection]);

  return (
    <Page fullWidth title="Products (FAST plane)">
      <Layout>
        <Layout.Section>
          <FastStatusCard fastStatus={fastStatus} />
        </Layout.Section>

        <Layout.Section>
          <FiltersSortCard
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            searchTerm={searchTerm}
            onSearch={handleSearchClick}
            onClear={onClearAll}
            sortBy={sortBy}
            setSortBy={handleSortByChange}
            sortDirection={sortDirection}
            setSortDirection={handleSortDirectionChange}
            appliedFilters={filters.appliedFilters}
            onOpenAddFilter={filters.openAddFilter}
            onRemoveFilter={filters.removeFilter}
            isSearching={query.isFetching && !!searchTerm}
            isClearDisabled={
              !searchInput &&
              !searchTerm &&
              filters.appliedFilters.length === 0 &&
              sortBy === "sort" &&
              sortDirection === "desc"
            }
          />
        </Layout.Section>

        <Layout.Section>
          <ProductsTableCard
            items={allItems}
            loadingInitial={loadingInitial}
            hasNextPage={!!query.hasNextPage}
            loadingMore={loadingMore}
            onLoadMore={() => query.fetchNextPage()}
          />
        </Layout.Section>
      </Layout>

      <AddFilterModal
        open={filters.addFilterOpen}
        filterSearch={filters.filterSearch}
        setFilterSearch={filters.setFilterSearch}
        onClose={filters.closeAddFilter}
        onPickField={filters.openConfigForKey}
      />

      <ConfigureFilterModal
        open={filters.configOpen}
        onClose={filters.closeConfig}
        title={filters.configTitle}
        primaryActionLabel={filters.primaryActionLabel}
        onApply={filters.applyConfig}
        primaryDisabled={filters.configDisabled}
        activeKey={filters.activeKey}
        configKind={filters.configKind}
        // config state setters
        stringOp={filters.stringOp}
        setStringOp={filters.setStringOp}
        stringValue={filters.stringValue}
        setStringValue={filters.setStringValue}
        numberOp={filters.numberOp}
        setNumberOp={filters.setNumberOp}
        numberA={filters.numberA}
        setNumberA={filters.setNumberA}
        numberB={filters.numberB}
        setNumberB={filters.setNumberB}
        dateOp={filters.dateOp}
        setDateOp={filters.setDateOp}
        dateValue={filters.dateValue}
        setDateValue={filters.setDateValue}
        enumOp={filters.enumOp}
        setEnumOp={filters.setEnumOp}
        enumValue={filters.enumValue}
        setEnumValue={filters.setEnumValue}
        boolValue={filters.boolValue}
        setBoolValue={filters.setBoolValue}
      />
    </Page>
  );
}
