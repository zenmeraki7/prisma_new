import React from "react";
import { Page, Layout, Card, BlockStack } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

import type { FilterExpr } from "../lib/filters/dsl";
import { andGroup, field } from "../lib/filters/dsl";

import { useProductsByFilter } from "../hooks/useProductsByFilter";
import { ProductIndexTable } from "../components/ProductIndexTable";
import { FilterExecutionAlert } from "../components/FilterExecutionAlert";

import type { DraftFilter } from "../components/ProductsFilterBar";
import { ProductsFilterBar } from "../components/ProductsFilterBar";

import { useFastPlaneSync } from "../queries/syncProductsToDb";

/* ✅ BULK IMPORTS (FIXED) */
import BulkEditActionBar from "../components/bulkEdit/BulkEditActionBar";
import { BulkEditJobHistoryPanel } from "../components/bulkEdit/BulkEditJobHistoryPanel";
import { BulkEditJobDetailsDrawer } from "../components/bulkEdit/BulkEditJobDetailsDrawer";

export const ProductsPage: React.FC = () => {
  const app = useAppBridge();

  /* ---------------- FILTER STATE ---------------- */
  const [draftFilters, setDraftFilters] = React.useState<DraftFilter[]>([]);
  const [searchText, setSearchText] = React.useState("");
  const [appliedExpr, setAppliedExpr] = React.useState<FilterExpr | null>(null);
  const [requestKey, setRequestKey] = React.useState(0);

  /* ---------------- BULK STATE ---------------- */
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  /* ---------------- JOB STATE ---------------- */
  const [jobs, setJobs] = React.useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = React.useState(false);
  const [selectedJob, setSelectedJob] = React.useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  /* ---------------- BUILD FILTER ---------------- */
  const buildExprFrom = React.useCallback(
    (search: string, filters: DraftFilter[]): FilterExpr | null => {
      const leaves: FilterExpr[] = [];

      const trimmedSearch = (search ?? "").trim();
      if (trimmedSearch) {
        leaves.push(
          field("product.search" as any, "CONTAINS" as any, trimmedSearch),
        );
      }

      for (const f of Array.isArray(filters) ? filters : []) {
        leaves.push(field(f.key as any, f.op as any, f.value));
      }

      return leaves.length > 0 ? andGroup(leaves) : null;
    },
    [],
  );

  const applyCurrentState = React.useCallback(
    (nextSearch: string, nextFilters: DraftFilter[]) => {
      const safeFilters = Array.isArray(nextFilters) ? nextFilters : [];
      setAppliedExpr(buildExprFrom(nextSearch, safeFilters));
      setRequestKey((x) => x + 1);
    },
    [buildExprFrom],
  );

  const onApplySearch = React.useCallback(
    (nextSearch: string) => {
      setSearchText(nextSearch);
      applyCurrentState(nextSearch, draftFilters);
    },
    [applyCurrentState, draftFilters],
  );

  const onResetSearchOnly = React.useCallback(() => {
    const nextSearch = "";
    setSearchText(nextSearch);
    applyCurrentState(nextSearch, draftFilters);
  }, [applyCurrentState, draftFilters]);

  const onDraftFiltersChangeApplyNow = React.useCallback(
    (next: DraftFilter[]) => {
      const safe = Array.isArray(next) ? next : [];
      setDraftFilters(safe);
      applyCurrentState(searchText, safe);
    },
    [applyCurrentState, searchText],
  );

  /* ---------------- FETCH SUGGESTIONS ---------------- */
  const fetchSuggestions = React.useCallback(async (key: string, q: string) => {
    try {
      const resp = await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query FilterSuggestions($input: FilterSuggestionsInput!) {
              filterSuggestions(input: $input)
            }
          `,
          variables: { input: { key, q, limit: 10 } },
        }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || json?.errors?.length) return [];

      return (json?.data?.filterSuggestions || []) as string[];
    } catch {
      return [];
    }
  }, []);

  /* ---------------- DATA FETCH ---------------- */
  const {
    items,
    mode,
    guardrail,
    warnings,
    hasNextPage,
    loadMore,
    loading,
    loadingMore,
    error,
  } = useProductsByFilter({
    requestKey,
    filterExpr: appliedExpr,
    pageSize: 50,
    enabled: true,
  });

  /* ---------------- SYNC ---------------- */
  const syncMutation = useFastPlaneSync(app as any);

  /* ---------------- JOB FETCH ---------------- */
  const fetchJobs = React.useCallback(async () => {
    try {
      setJobsLoading(true);
      const res = await fetch("/api/bulk-edit/jobs");
      const json = await res.json();
      setJobs(json.jobs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  /* ---------------- JOB HANDLERS ---------------- */
  const handleSelectJob = (job: any) => {
    setSelectedJob(job);
    setDrawerOpen(true);
  };

  /* ---------------- UI ---------------- */
  return (
    <Page
      title="Products"
      subtitle="Search, filter and bulk edit your catalog"
      fullWidth
      primaryAction={{
        content: "Sync from Shopify",
        onAction: () => syncMutation.mutate(),
        loading: syncMutation.isPending,
        disabled: syncMutation.isPending || loading,
      }}
    >
      <Layout>
        {/* FILTER */}
        <Layout.Section>
          <Card padding="0">
            <ProductsFilterBar
              searchText={searchText}
              onSearchTextChange={setSearchText}
              onApplySearch={onApplySearch}
              onResetSearch={onResetSearchOnly}
              loading={loading}
              draftFilters={draftFilters}
              onDraftFiltersChange={onDraftFiltersChangeApplyNow}
              fetchSuggestions={fetchSuggestions}
            />

            <div style={{ padding: 16 }}>
              <FilterExecutionAlert
                mode={mode}
                guardrail={guardrail}
                warnings={warnings}
              />
            </div>
          </Card>
        </Layout.Section>

        {/* BULK BAR */}
        <Layout.Section>
          {selectedIds.length > 0 && appliedExpr && (
            <BulkEditActionBar
              selectedIds={selectedIds}
              filterExpr={appliedExpr}
            />
          )}
        </Layout.Section>

        {/* TABLE */}
        <Layout.Section>
          {error ? (
            <Card>
              <BlockStack gap="200">
                <div style={{ color: "var(--p-color-text-critical)" }}>
                  {(error as Error).message}
                </div>
              </BlockStack>
            </Card>
          ) : (
            <ProductIndexTable
              products={items}
              loading={loading && items.length === 0}
              hasNextPage={Boolean(hasNextPage)}
              onLoadMore={() => loadMore()}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
          )}

          {loadingMore && items.length > 0 && (
            <div style={{ paddingTop: 12, textAlign: "center" }}>
              Loading more…
            </div>
          )}
        </Layout.Section>

        {/* JOB HISTORY */}
        <Layout.Section>
          <Card>
            <BulkEditJobHistoryPanel
              jobs={jobs}
              loading={jobsLoading}
              refreshing={false}
              error={null}
              onRefresh={fetchJobs}
              onSelectJob={handleSelectJob}
              selectedJobId={selectedJob?.id}
            />
          </Card>
        </Layout.Section>
      </Layout>

      {/* DRAWER */}
      <BulkEditJobDetailsDrawer
        open={drawerOpen}
        job={selectedJob}
        onClose={() => setDrawerOpen(false)}
        onRetryStarted={fetchJobs}
      />
    </Page>
  );
};

export default ProductsPage;
