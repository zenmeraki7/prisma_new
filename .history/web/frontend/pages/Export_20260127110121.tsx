import React from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Select,
  TextField,
  Badge,
  Banner,
  Divider,
  ChoiceList,
  Box,
  ProgressBar,
  DataTable,
} from "@shopify/polaris";
import { ExportIcon } from "@shopify/polaris-icons";
import { gql, useMutation, useQuery } from "@apollo/client";

import { useProductsSelectionStore } from "../state/productsSelectionStore";
import { useFilterContextStore } from "../state/filterContextStore";

// 🔗 Shared export literals & mappers (single source of truth)
import {
  ExportFormatLocal,
  ExportScopeLocal,
  toGqlFormat,
  toGqlScope,
} from "../shared/export/types";

/* ========================================================================== *
 * GraphQL documents
 * ========================================================================== */

const EXPORT_JOB_FIELDS = gql`
  fragment ExportJobFields on ExportJob {
    id
    name
    format
    scope
    status
    recordCount
    fileSizeBytes
    createdAt
    completedAt
    downloadUrl
    errorMessage
  }
`;

const EXPORT_JOBS_QUERY = gql`
  query ExportJobs($first: Int!, $after: String) {
    exportJobs(first: $first, after: $after) {
      edges {
        cursor
        node {
          ...ExportJobFields
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
  ${EXPORT_JOB_FIELDS}
`;

const START_EXPORT_JOB_MUTATION = gql`
  mutation StartExportJob($input: StartExportJobInput!) {
    startExportJob(input: $input) {
      job {
        ...ExportJobFields
      }
    }
  }
  ${EXPORT_JOB_FIELDS}
`;

/* ========================================================================== *
 * Helpers
 * ========================================================================== */

function formatFileSize(fileSizeBytes?: number | null): string {
  if (!fileSizeBytes || fileSizeBytes <= 0) return "—";
  const kb = fileSizeBytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function formatStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return <Badge tone="success">Completed</Badge>;
    case "RUNNING":
    case "PENDING":
      return <Badge tone="attention">Processing</Badge>;
    case "FAILED":
      return <Badge tone="critical">Failed</Badge>;
    default:
      return <Badge tone="subdued">{status}</Badge>;
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/* ========================================================================== *
 * Static option lists (stable references)
 * ========================================================================== */

const FIELD_OPTIONS: { label: string; value: string }[] = [
  { label: "Product Title", value: "title" },
  { label: "Price", value: "price" },
  { label: "Compare at Price", value: "comparePrice" },
  { label: "SKU", value: "sku" },
  { label: "Barcode", value: "barcode" },
  { label: "Inventory", value: "inventory" },
  { label: "Weight", value: "weight" },
  { label: "Vendor", value: "vendor" },
  { label: "Product Type", value: "type" },
  { label: "Tags", value: "tags" },
  { label: "Status", value: "status" },
  { label: "Created At", value: "createdAt" },
];

const EXPORT_FORMAT_OPTIONS: { label: string; value: ExportFormatLocal }[] = [
  { label: "CSV (Comma Separated)", value: "csv" },
  { label: "Excel (XLSX)", value: "xlsx" },
  { label: "JSON", value: "json" },
  { label: "XML", value: "xml" },
];

const EXPORT_TIPS: string[] = [
  "Select products from the Products page",
  "Remove products by clearing selection",
  "CSV format works with Excel and Google Sheets",
  "XLSX preserves formatting and formulas",
  "Exports are available for 30 days",
];

/* ========================================================================== *
 * Component
 * ========================================================================== */

export default function ExportPage() {
  const [format, setFormat] = React.useState<ExportFormatLocal>("csv");
  const [scope, setScope] = React.useState<ExportScopeLocal>("selected");
  const [exportName, setExportName] = React.useState(
    "Selected Products Export",
  );
  const [selectedFields, setSelectedFields] = React.useState<string[]>([
    "title",
    "price",
    "sku",
    "vendor",
    "status",
  ]);
  const [showBanner, setShowBanner] = React.useState(false);
  const [showErrorBanner, setShowErrorBanner] = React.useState(false);

  // 🧠 Selection store: use branded IDs for UI, GraphQL-safe IDs for mutations
  const {
    selectedProductIds,
    asGraphqlProductIds,
  } = useProductsSelectionStore();

  const { planHash, filterExpr } = useFilterContextStore();

  const selectedCount = selectedProductIds.length;

  // Cursor for export history pagination (simple "load more" pattern)
  const [historyCursor, setHistoryCursor] = React.useState<string | null>(null);

  const {
    data,
    loading: historyLoading,
    refetch,
    startPolling,
    stopPolling,
    fetchMore,
  } = useQuery(EXPORT_JOBS_QUERY, {
    variables: { first: 20, after: historyCursor },
    notifyOnNetworkStatusChange: true,
  });

  const [startExportJob, { loading: startExportLoading }] = useMutation(
    START_EXPORT_JOB_MUTATION,
    {
      onCompleted: () => {
        setShowBanner(true);
        setShowErrorBanner(false);
        refetch();
      },
      onError: () => {
        setShowErrorBanner(true);
      },
    },
  );

  // Manage success banner auto-dismiss with cleanup
  const bannerTimeoutRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (showBanner) {
      if (bannerTimeoutRef.current) {
        window.clearTimeout(bannerTimeoutRef.current);
      }
      bannerTimeoutRef.current = window.setTimeout(() => {
        setShowBanner(false);
        bannerTimeoutRef.current = null;
      }, 5000);
    }
    return () => {
      if (bannerTimeoutRef.current) {
        window.clearTimeout(bannerTimeoutRef.current);
      }
    };
  }, [showBanner]);

  // Derived: export history edges and whether any job is "active"
  const historyEdges = data?.exportJobs?.edges ?? [];

  const hasActiveJobs = React.useMemo(
    () =>
      historyEdges.some(
        ({ node }: any) =>
          node.status === "PENDING" || node.status === "RUNNING",
      ),
    [historyEdges],
  );

  // Status-aware polling: only poll while there are active jobs
  React.useEffect(() => {
    if (hasActiveJobs) {
      startPolling(5000);
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [hasActiveJobs, startPolling, stopPolling]);

  // Paginated "has more" information
  const pageInfo = data?.exportJobs?.pageInfo;
  const hasNextPage = !!pageInfo?.hasNextPage;
  const endCursor = pageInfo?.endCursor ?? null;

  const handleLoadMore = React.useCallback(() => {
    if (!hasNextPage || !endCursor) return;
    fetchMore({
      variables: {
        first: 20,
        after: endCursor,
      },
    }).then(() => {
      setHistoryCursor(endCursor);
    });
  }, [fetchMore, hasNextPage, endCursor]);

  // Memoized history rows to avoid re-computing on every render
  const historyRows: React.ReactNode[][] = React.useMemo(
    () =>
      historyEdges.map(({ node }: any) => {
        const size = formatFileSize(node.fileSizeBytes);
        const date = node.completedAt ?? node.createdAt ?? null;

        const actions =
          node.downloadUrl && node.status === "COMPLETED" ? (
            <Button size="slim" url={node.downloadUrl} target="_blank">
              Download
            </Button>
          ) : (
            <Text as="span" tone="subdued">
              —
            </Text>
          );

        return [
          node.id,
          node.name,
          node.format,
          node.recordCount ?? "—",
          formatDateTime(date),
          formatStatusBadge(node.status),
          size,
          actions,
        ];
      }),
    [historyEdges],
  );

  // Split static field options into two columns once
  const { leftFields, rightFields } = React.useMemo(() => {
    const mid = Math.ceil(FIELD_OPTIONS.length / 2);
    return {
      leftFields: FIELD_OPTIONS.slice(0, mid),
      rightFields: FIELD_OPTIONS.slice(mid),
    };
  }, []);

  const primaryDisabled =
    !exportName ||
    selectedFields.length === 0 ||
    startExportLoading ||
    (scope === "selected" && selectedCount === 0) ||
    (scope === "filtered" && (!planHash || !filterExpr));

  const handleExport = React.useCallback(async () => {
    if (!exportName || selectedFields.length === 0) return;

    const input: any = {
      name: exportName,
      format: toGqlFormat(format),
      scope: toGqlScope(scope),
      fieldKeys: selectedFields,
    };

    if (scope === "selected") {
      const ids = asGraphqlProductIds();
      if (ids.length === 0) {
        // defensive, but button should already be disabled.
        return;
      }
      input.selectedProductIds = ids;
    }

    if (scope === "filtered") {
      if (!planHash || !filterExpr) {
        setShowErrorBanner(true);
        return;
      }
      input.planHash = planHash;
      input.filterJson = filterExpr;
    }

    await startExportJob({ variables: { input } });
  }, [
    exportName,
    selectedFields,
    format,
    scope,
    asGraphqlProductIds,
    planHash,
    filterExpr,
    startExportJob,
  ]);

  return (
    <Page
      title="Export Products"
      subtitle="Configure and export your selected products"
      backAction={{ content: "Products", url: "/Products" }}
      primaryAction={{
        content: startExportLoading ? "Starting export..." : "Start Export",
        onAction: handleExport,
        loading: startExportLoading,
        icon: ExportIcon,
        disabled: primaryDisabled,
      }}
      secondaryActions={[
        {
          content: "Back to Products",
          url: "/Products",
        },
      ]}
    >
      <Layout>
        {(showBanner || showErrorBanner) && (
          <Layout.Section>
            {showBanner && (
              <Banner
                title="Export started"
                tone="success"
                onDismiss={() => setShowBanner(false)}
              >
                Your export job has been created. You can monitor progress and
                download the file from the Export history below.
              </Banner>
            )}
            {showErrorBanner && !showBanner && (
              <Banner
                title="Unable to start export"
                tone="critical"
                onDismiss={() => setShowErrorBanner(false)}
              >
                <Text as="p" variant="bodySm">
                  We could not start this export. Please check your scope and
                  filter configuration, then try again.
                </Text>
              </Banner>
            )}
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="400">
            {/* Export Configuration */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd" fontWeight="semibold">
                  Export Configuration
                </Text>

                <Divider />

                {/* Selection / scope info */}
                {scope === "selected" && selectedCount === 0 ? (
                  <Banner tone="warning">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodySm">
                        No products selected. Please select products from the
                        Products page to export.
                      </Text>
                      <Button url="/Products" size="slim">
                        Browse Products
                      </Button>
                    </InlineStack>
                  </Banner>
                ) : (
                  <Banner tone="info">
                    <Text as="p" variant="bodySm">
                      {scope === "all" && (
                        <>
                          Exporting <strong>all products</strong>.
                        </>
                      )}
                      {scope === "filtered" && (
                        <>
                          Exporting products matching the current{" "}
                          <strong>filter</strong>.
                          {!planHash && (
                            <>
                              {" "}
                              No active filter plan detected; please apply a
                              filter in Products first.
                            </>
                          )}
                        </>
                      )}
                      {scope === "selected" && selectedCount > 0 && (
                        <>
                          {`${selectedCount} ${
                            selectedCount === 1 ? "product" : "products"
                          } selected and ready to export`}
                        </>
                      )}
                    </Text>
                  </Banner>
                )}

                {/* Export Name */}
                <TextField
                  label="Export name"
                  value={exportName}
                  onChange={setExportName}
                  placeholder="e.g., Active Products January 2025"
                  autoComplete="off"
                  helpText="Give your export a descriptive name for easy identification"
                />

                {/* Scope Selection */}
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    Scope
                  </Text>
                  <InlineStack gap="400" wrap={false}>
                    <Button
                      pressed={scope === "all"}
                      size="slim"
                      onClick={() => setScope("all")}
                    >
                      All products
                    </Button>
                    <Button
                      pressed={scope === "filtered"}
                      size="slim"
                      onClick={() => setScope("filtered")}
                    >
                      Filtered products
                    </Button>
                    <Button
                      pressed={scope === "selected"}
                      size="slim"
                      onClick={() => setScope("selected")}
                    >
                      Selected products
                    </Button>
                  </InlineStack>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Scope controls which products are included in this export.
                  </Text>
                </BlockStack>

                {/* Format Selection */}
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    File Format
                  </Text>
                  <Select
                    label="Format"
                    labelHidden
                    options={EXPORT_FORMAT_OPTIONS}
                    value={format}
                    onChange={(value) =>
                      setFormat(value as ExportFormatLocal)
                    }
                  />
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Field Selection + Tips */}
            <Layout>
              <Layout.Section>
                <Box paddingBlockEnd="400">
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack
                        align="space-between"
                        blockAlign="center"
                      >
                        <Text
                          as="h2"
                          variant="headingMd"
                          fontWeight="semibold"
                        >
                          Field Selection
                        </Text>
                        <Badge tone="info">
                          {`${selectedFields.length} fields selected`}
                        </Badge>
                      </InlineStack>

                      <Divider />

                      <InlineStack gap="400" align="start">
                        <Box minWidth="220px">
                          <ChoiceList
                            title=""
                            titleHidden
                            choices={leftFields}
                            selected={selectedFields}
                            onChange={setSelectedFields}
                            allowMultiple
                          />
                        </Box>

                        <Box minWidth="220px">
                          <ChoiceList
                            title=""
                            titleHidden
                            choices={rightFields}
                            selected={selectedFields}
                            onChange={setSelectedFields}
                            allowMultiple
                          />
                        </Box>
                      </InlineStack>

                      {selectedFields.length === 0 && (
                        <Banner tone="warning">
                          <Text as="p" variant="bodySm">
                            Please select at least one field to export.
                          </Text>
                        </Banner>
                      )}
                    </BlockStack>
                  </Card>
                </Box>
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="300">
                    <Text
                      as="h3"
                      variant="headingMd"
                      fontWeight="semibold"
                    >
                      Export Tips
                    </Text>
                    <BlockStack gap="200">
                      {EXPORT_TIPS.map((tip) => (
                        <Text
                          key={tip}
                          as="p"
                          variant="bodyMd"
                          tone="subdued"
                        >
                          • {tip}
                        </Text>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Layout.Section>

        {/* Export History */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack
                align="space-between"
                blockAlign="center"
              >
                <Text
                  as="h2"
                  variant="headingMd"
                  fontWeight="semibold"
                >
                  Export History
                </Text>
                {historyLoading && (
                  <InlineStack
                    gap="200"
                    blockAlign="center"
                    align="center"
                  >
                    <Text as="span" tone="subdued">
                      Refreshing…
                    </Text>
                    <Box width="80px">
                      <ProgressBar progress={33} size="small" />
                    </Box>
                  </InlineStack>
                )}
              </InlineStack>

              <Divider />

              {historyRows.length === 0 ? (
                <Text as="p" tone="subdued">
                  No exports yet. Start your first export using the
                  configuration above.
                </Text>
              ) : (
                <>
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "text",
                      "text",
                      "numeric",
                      "text",
                      "text",
                      "text",
                      "text",
                    ]}
                    headings={[
                      "ID",
                      "Name",
                      "Format",
                      "Records",
                      "Date",
                      "Status",
                      "Size",
                      "Actions",
                    ]}
                    rows={historyRows}
                  />
                  {hasNextPage && (
                    <Box paddingBlockStart="300">
                      <InlineStack align="center">
                        <Button
                          onClick={handleLoadMore}
                          disabled={historyLoading}
                        >
                          Load more
                        </Button>
                      </InlineStack>
                    </Box>
                  )}
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
