// web/frontend/pages/ProductsPage.tsx
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Page, Layout } from "@shopify/polaris";
import type { ProductLiteDto } from "../queries/bootstrapProducts";
import { useBootstrapProducts } from "../hooks/useBootstrapProducts";
import { useAuthenticatedFetch } from "../hooks/useAuthenticatedFetch";
import {
  PRODUCT_FIELDS,
  VARIANT_FIELDS,
  filterPredicate,
  AppliedFilter,
} from "../lib/products/filters";
import { ProductsFiltersCard } from "../components/products/ProductsFiltersCard";
import { ProductsTable } from "../components/products/ProductsTable";
import { FilterBuilder } from "../components/products/FilterBuilderModal";
import { FastStatusCard } from "../components/products/FastStatusCard";

export default function ProductsPage() {
  const fetch = useAuthenticatedFetch();

  // -----------------------
  // State
  // -----------------------
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState("sort");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [appliedFilters, setAppliedFilters] = useState<AppliedFilter[]>([]);
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);

  // Snapshot (variant filters only)
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

  const removeFilter = useCallback((key: string) => {
    setAppliedFilters((prev) => prev.filter((f) => f.key !== key));
  }, []);

  // -----------------------
  // Split filters
  // -----------------------
  const productFilters = useMemo(
    () => appliedFilters.filter((f) => f.key.startsWith("product.")),
    [appliedFilters],
  );

  const variantFilters = useMemo(
    () => appliedFilters.filter((f) => f.key.startsWith("variant.")),
    [appliedFilters],
  );

  // -----------------------
  // FAST client-side filtering
  // -----------------------
  const filteredFastItems: ProductLiteDto[] = useMemo(() => {
    let items = [...allFastItems];

    // Search
    if (searchTerm) {
      const needle = searchTerm.toLowerCase();
      items = items.filter(
        (p) =>
          (p.title ?? "").toLowerCase().includes(needle) ||
          (p.vendor ?? "").toLowerCase().includes(needle) ||
          (p.handle ?? "").toLowerCase().includes(needle),
      );
    }

    // Product field filters (FAST)
    if (productFilters.length > 0) {
      items = items.filter((p) =>
        productFilters.every((f) => filterPredicate(p, f)),
      );
    }

    // Sorting
    const dir = sortDirection === "asc" ? 1 : -1;
    items.sort((a, b) => {
      if (sortBy === "title") {
        return (a.title ?? "").localeCompare(b.title ?? "") * dir;
      }
      const aTime = a.updatedAtShopify ? new Date(a.updatedAtShopify).getTime() : 0;
      const bTime = b.updatedAtShopify ? new Date(b.updatedAtShopify).getTime() : 0;
      return (aTime - bTime) * dir;
    });

    return items;
  }, [allFastItems, searchTerm, productFilters, sortBy, sortDirection]);

  // -----------------------
  // Snapshot filtering (variant fields ONLY)
  // -----------------------
  // -----------------------
  // Snapshot filtering (variant fields ONLY)
  // -----------------------
  console.log("Render ProductsPage. VariantFilters:", variantFilters.length, "FastStatus:", fastStatus?.fastRevision);

  useEffect(() => {
    console.log("Effect triggered. Filters:", variantFilters.length);
    if (variantFilters.length === 0) {
      setSnapshotFilteredItems([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        console.log("🚀 [ProductsPage] Starting snapshot filter run", { planHash, filters: variantFilters });
        setLoadingSnapshotFilters(true);

        const planHash = fastStatus?.fastRevision?.toString() ?? "unknown";

        const res = await fetch("/api/products/snapshotFilter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planHash, filters: variantFilters }),
        });

        console.log("📨 [ProductsPage] Snapshot filter response status:", res.status);

        if (!res.ok) throw new Error("Snapshot filter failed");

        const data = await res.json();
        console.log("📦 [ProductsPage] Snapshot data received:", data);
        
        if (!cancelled) {
          setSnapshotFilteredItems(data.items ?? []);
        }
      } catch (err) {
        console.error("❌ [ProductsPage] Snapshot filter error:", err);
        if (!cancelled) setSnapshotFilteredItems([]);
      } finally {
        if (!cancelled) setLoadingSnapshotFilters(false);
      }
    };

    const t = setTimeout(run, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [variantFilters, fastStatus?.fastRevision, fetch]);

  // -----------------------
  // FINAL ITEMS (FAST WINS)
  // -----------------------
  const finalItems = filteredFastItems;

  // -----------------------
  // Render
  // -----------------------
  return (
    <Page fullWidth title="Products (FAST plane)">
      <Layout>
        <Layout.Section>
          <FastStatusCard
            fastStatus={fastStatus}
            hasVariantFilters={variantFilters.length > 0}
            snapshotEmpty={
              variantFilters.length > 0 &&
              !loadingSnapshotFilters &&
              snapshotFilteredItems.length === 0
            }
          />
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
            onSortByChange={setSortBy}
            onSortDirectionChange={setSortDirection}
            onOpenAddFilter={() => setFilterBuilderOpen(true)}
            onClearAll={handleClearAll}
          />
        </Layout.Section>

        <Layout.Section>
          <ProductsTable
            items={finalItems}
            loadingInitial={loadingInitial}
            loadingMore={loadingMore}
            hasNextPage={query.hasNextPage ?? false}
            onLoadMore={() => query.fetchNextPage()}
          />
        </Layout.Section>
      </Layout>

      <FilterBuilder
        open={filterBuilderOpen}
        onClose={() => setFilterBuilderOpen(false)}
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
