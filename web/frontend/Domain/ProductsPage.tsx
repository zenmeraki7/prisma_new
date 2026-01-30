// web/frontend/pages/ProductsPage.tsx
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Page, Layout } from "@shopify/polaris";
import type { ProductLiteDto } from "../queries/bootstrapProducts";
import { useBootstrapProducts } from "../hooks/useBootstrapProducts";
import { useAuthenticatedFetch } from "../hooks/useAuthenticatedFetch"; // Add this import
import { PRODUCT_FIELDS, VARIANT_FIELDS, filterPredicate, AppliedFilter } from "../lib/products/filters";
import { ProductsFiltersCard } from "../components/products/ProductsFiltersCard";
import { ProductsTable } from "../components/products/ProductsTable";
import { FilterBuilder } from "../components/products/FilterBuilderModal";
import { FastStatusCard } from "../components/products/FastStatusCard";

export default function ProductsPage() {
  // Use the custom hook instead
  const fetch = useAuthenticatedFetch();

  // -----------------------
  // State
  // -----------------------
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<string>("sort");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [appliedFilters, setAppliedFilters] = useState<AppliedFilter[]>([]);
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);

  const [snapshotFilteredItems, setSnapshotFilteredItems] = useState<ProductLiteDto[]>([]);
  const [loadingSnapshotFilters, setLoadingSnapshotFilters] = useState(false);

  // -----------------------
  // FAST-plane products
  // -----------------------
  const query = useBootstrapProducts(searchTerm);
  const fastStatus = query.data?.pages[0]?.status;
  const loadingInitial = query.isLoading;
  const loadingMore = query.isFetchingNextPage;

  const allFastItems: ProductLiteDto[] = useMemo(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((p) => p.items);
  }, [query.data]);

  // -----------------------
  // Handlers
  // -----------------------
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
    setSnapshotFilteredItems([]);
  }, []);

  const handleSortByChange = useCallback((value: string) => setSortBy(value), []);
  const handleSortDirectionChange = useCallback(
    (value: "asc" | "desc") => setSortDirection(value),
    [],
  );

  const openFilterBuilder = useCallback(() => setFilterBuilderOpen(true), []);
  const closeFilterBuilder = useCallback(() => setFilterBuilderOpen(false), []);

  const removeFilter = useCallback((key: string) => {
    setAppliedFilters((prev) => prev.filter((f) => f.key !== key));
  }, []);

  // -----------------------
  // Split filters
  // -----------------------
  const productFilters = useMemo(
    () => appliedFilters.filter(f => f.key.startsWith("product.")),
    [appliedFilters]
  );
  
  const variantFilters = useMemo(
    () => appliedFilters.filter(f => f.key.startsWith("variant.")),
    [appliedFilters]
  );

  // -----------------------
  // Client-side filtering (product fields + search)
  // -----------------------
  const filteredFastItems: ProductLiteDto[] = useMemo(() => {
    let items = [...allFastItems];

    // search
    if (searchTerm && searchTerm.trim()) {
      const needle = searchTerm.toLowerCase();
      items = items.filter(p =>
        (p.title ?? "").toLowerCase().includes(needle) ||
        (p.vendor ?? "").toLowerCase().includes(needle) ||
        (p.handle ?? "").toLowerCase().includes(needle)
      );
    }

    // product filters
    if (productFilters.length > 0) {
      items = items.filter(p => productFilters.every(f => filterPredicate(p, f)));
    }

    // sorting
    const direction = sortDirection === "asc" ? 1 : -1;
    items.sort((a, b) => {
      if (sortBy === "title") {
        return (a.title ?? "").localeCompare(b.title ?? "") * direction;
      } else {
        const aTime = a.updatedAtShopify ? new Date(a.updatedAtShopify).getTime() : 0;
        const bTime = b.updatedAtShopify ? new Date(b.updatedAtShopify).getTime() : 0;
        return (aTime - bTime) * direction;
      }
    });

    console.log("🟢 Client-side filtered items count:", items.length);
    return items;
  }, [allFastItems, searchTerm, productFilters, sortBy, sortDirection]);

  // -----------------------
  // Server-side filtering (variant fields)
  // -----------------------
  useEffect(() => {
    if (variantFilters.length === 0) {
      setSnapshotFilteredItems([]);
      return;
    }

    let cancelled = false;

    const fetchSnapshotFilters = async () => {
      try {
        setLoadingSnapshotFilters(true);

        const planHash = fastStatus?.fastRevision?.toString() ?? "unknown";

        console.log("📡 Fetching snapshot filters:", { planHash, variantFilters });

        const res = await fetch("/api/products/snapshotFilter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planHash, filters: variantFilters }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Snapshot fetch failed: ${res.status} ${errorText}`);
        }

        const data = await res.json();
        console.log("✅ Snapshot filter results:", data);
        
        if (!cancelled) {
          setSnapshotFilteredItems(data.items ?? []);
        }
      } catch (e) {
        console.error("Snapshot filter error:", e);
        if (!cancelled) {
          setSnapshotFilteredItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSnapshotFilters(false);
        }
      }
    };

    // Add a small delay to debounce
    const timeoutId = setTimeout(() => {
      fetchSnapshotFilters();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [variantFilters, fastStatus?.fastRevision, fetch]);

  // -----------------------
  // Combine product + variant results
  // -----------------------
  const finalItems = useMemo(() => {
    if (variantFilters.length === 0) return filteredFastItems;

    const snapshotIds = new Set(snapshotFilteredItems.map(p => p.id));
    const combined = filteredFastItems.filter(p => snapshotIds.has(p.id));

    console.log("🔹 Final displayed items count after combining snapshot:", combined.length);
    return combined;
  }, [filteredFastItems, snapshotFilteredItems, variantFilters.length]);

  // -----------------------
  // Render
  // -----------------------
  return (
    <Page fullWidth title="Products (FAST plane)">
      <Layout>
        <Layout.Section>
          <FastStatusCard fastStatus={fastStatus} />
        </Layout.Section>

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

        <Layout.Section>
          <ProductsTable
            items={finalItems}
            loadingInitial={loadingInitial || loadingSnapshotFilters}
            loadingMore={loadingMore}
            hasNextPage={query.hasNextPage ?? false}
            onLoadMore={() => query.fetchNextPage()}
          />
        </Layout.Section>
      </Layout>

      <FilterBuilder
        open={filterBuilderOpen}
        onClose={closeFilterBuilder}
        groups={[
          { id: "product", label: "Product Fields", fields: PRODUCT_FIELDS },
          { id: "variant", label: "Variant Fields", fields: VARIANT_FIELDS },
        ]}
        value={appliedFilters}
        onChange={setAppliedFilters}
      />
    </Page>
  );
}