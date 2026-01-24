import React from "react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Text,
  BlockStack,
  InlineStack,
  Button,
  TextField,
  Select,
  Filters,
  ChoiceList,
  Pagination,
  InlineCode,
  EmptyState,
  Box,
  Tooltip,
  ProgressBar,
} from "@shopify/polaris";
import {
  RefreshIcon,
  ExportIcon,
  ViewIcon,
  DeleteIcon,
} from "@shopify/polaris-icons";

type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

type BulkJob = {
  id: string;
  createdAt: string;
  filterSummary: string;
  mutationSummary: string;
  affectedCount: number;
  processedCount?: number;
  status: JobStatus;
  duration?: string;
  errorMessage?: string;
};

const DUMMY_JOBS: BulkJob[] = [
  {
    id: "JOB-2025-0001",
    createdAt: "2025-01-01 10:02",
    filterSummary: 'product_status = "ACTIVE" AND variant_price < 10',
    mutationSummary: "Set compare_at_price to 19.99",
    affectedCount: 1423,
    processedCount: 1423,
    status: "COMPLETED",
    duration: "2m 34s",
  },
  {
    id: "JOB-2025-0002",
    createdAt: "2025-01-02 15:37",
    filterSummary: 'variant_inventory_quantity = 0',
    mutationSummary: "Unpublish products",
    affectedCount: 213,
    processedCount: 45,
    status: "FAILED",
    duration: "32s",
    errorMessage: "API rate limit exceeded",
  },
  {
    id: "JOB-2025-0003",
    createdAt: "2025-01-03 09:10",
    filterSummary: "Snapshot: all T-Shirts",
    mutationSummary: "Add tag bulk-edited-jan",
    affectedCount: 980,
    processedCount: 687,
    status: "RUNNING",
  },
  {
    id: "JOB-2025-0004",
    createdAt: "2025-01-05 14:22",
    filterSummary: 'product_type = "Accessories"',
    mutationSummary: "Update vendor to Premium Brands",
    affectedCount: 542,
    status: "PENDING",
  },
  {
    id: "JOB-2025-0005",
    createdAt: "2025-01-07 11:45",
    filterSummary: 'tags CONTAINS "clearance"',
    mutationSummary: "Apply 50% discount",
    affectedCount: 2156,
    processedCount: 2156,
    status: "COMPLETED",
    duration: "5m 12s",
  },
  {
    id: "JOB-2025-0006",
    createdAt: "2025-01-08 08:30",
    filterSummary: 'collection = "Winter 2025"',
    mutationSummary: "Set metafield season to winter",
    affectedCount: 1834,
    processedCount: 1834,
    status: "COMPLETED",
    duration: "4m 03s",
  },
];

function statusBadge(status: JobStatus) {
  switch (status) {
    case "COMPLETED":
      return <Badge tone="success">Completed</Badge>;
    case "FAILED":
      return <Badge tone="critical">Failed</Badge>;
    case "RUNNING":
      return <Badge tone="attention">Running</Badge>;
    case "PENDING":
    default:
      return <Badge tone="info">Pending</Badge>;
  }
}

export default function HistoryPage() {
  const [queryValue, setQueryValue] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string[]>([]);
  const [sortValue, setSortValue] = React.useState("date-desc");
  const [selectedJobs, setSelectedJobs] = React.useState<string[]>([]);

  const handleStatusFilterChange = React.useCallback(
    (value: string[]) => setStatusFilter(value),
    []
  );

  const handleQueryValueRemove = React.useCallback(
    () => setQueryValue(""),
    []
  );

  const handleStatusFilterRemove = React.useCallback(
    () => setStatusFilter([]),
    []
  );

  const handleClearAll = React.useCallback(() => {
    handleQueryValueRemove();
    handleStatusFilterRemove();
  }, [handleQueryValueRemove, handleStatusFilterRemove]);

  const filters = [
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={[
            { label: "Completed", value: "COMPLETED" },
            { label: "Running", value: "RUNNING" },
            { label: "Failed", value: "FAILED" },
            { label: "Pending", value: "PENDING" },
          ]}
          selected={statusFilter}
          onChange={handleStatusFilterChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = [];
  if (statusFilter.length > 0) {
    appliedFilters.push({
      key: "status",
      label: `Status: ${statusFilter.join(", ")}`,
      onRemove: handleStatusFilterRemove,
    });
  }

  // Filter jobs based on search and filters
  const filteredJobs = DUMMY_JOBS.filter((job) => {
    const matchesQuery =
      queryValue === "" ||
      job.id.toLowerCase().includes(queryValue.toLowerCase()) ||
      job.filterSummary.toLowerCase().includes(queryValue.toLowerCase()) ||
      job.mutationSummary.toLowerCase().includes(queryValue.toLowerCase());

    const matchesStatus =
      statusFilter.length === 0 || statusFilter.includes(job.status);

    return matchesQuery && matchesStatus;
  });

  // Sort jobs
  const sortedJobs = [...filteredJobs].sort((a, b) => {
    switch (sortValue) {
      case "date-desc":
        return b.createdAt.localeCompare(a.createdAt);
      case "date-asc":
        return a.createdAt.localeCompare(b.createdAt);
      case "affected-desc":
        return b.affectedCount - a.affectedCount;
      case "affected-asc":
        return a.affectedCount - b.affectedCount;
      default:
        return 0;
    }
  });

  const rows = sortedJobs.map((job) => {
    const progressContent =
      job.status === "RUNNING" && job.processedCount ? (
        <BlockStack gap="100">
          <Text as="span" variant="bodySm">
            {job.processedCount.toLocaleString()} / {job.affectedCount.toLocaleString()}
          </Text>
          <Box width="100px">
            <ProgressBar
              progress={(job.processedCount / job.affectedCount) * 100}
              size="small"
              tone="primary"
            />
          </Box>
        </BlockStack>
      ) : job.status === "FAILED" ? (
        <Tooltip content={job.errorMessage || "Job failed"}>
          <Text as="span" variant="bodySm" tone="critical">
            {job.processedCount?.toLocaleString() || 0} / {job.affectedCount.toLocaleString()}
          </Text>
        </Tooltip>
      ) : (
        <Text as="span" variant="bodySm">
          {job.affectedCount.toLocaleString()}
        </Text>
      );

    return [
      <InlineCode>{job.id}</InlineCode>,
      <Text as="span" variant="bodySm" tone="subdued">
        {job.createdAt}
      </Text>,
      <Box maxWidth="160px">
        <Text as="span" variant="bodySm" truncate>
          {job.filterSummary}
        </Text>
      </Box>,
      <Box maxWidth="180px">
        <Text as="span" variant="bodySm" fontWeight="medium" truncate>
          {job.mutationSummary}
        </Text>
      </Box>,
      progressContent,
      <InlineStack gap="200" blockAlign="center">
        {statusBadge(job.status)}
        {job.duration && (
          <Text as="span" variant="bodySm" tone="subdued">
            {job.duration}
          </Text>
        )}
        
      </InlineStack>,
      <InlineStack gap="100">
        <Button size="slim" icon={ViewIcon} variant="plain">
          View
        </Button>
        {job.status === "FAILED" && (
          <Button size="slim" variant="plain">
            Retry
          </Button>
        )}
        {(job.status === "COMPLETED" || job.status === "FAILED") && (
          <Button
            size="slim"
            icon={DeleteIcon}
            variant="plain"
            tone="critical"
          />
        )}
      </InlineStack>,
    ];
  });

  const sortOptions = [
    { label: "Date (newest first)", value: "date-desc" },
    { label: "Date (oldest first)", value: "date-asc" },
    { label: "Affected count (high to low)", value: "affected-desc" },
    { label: "Affected count (low to high)", value: "affected-asc" },
  ];

  return (
    <Page
      title="Job History"
      fullWidth
      subtitle="Monitor and manage your bulk edit operations"
      primaryAction={{
        content: "Refresh",
        icon: RefreshIcon,
        onAction: () => console.log("Refreshing..."),
      }}
      secondaryActions={[
        {
          content: "Export history",
          icon: ExportIcon,
          onAction: () => console.log("Exporting..."),
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* Filters */}
              <Filters
                queryValue={queryValue}
                filters={filters}
                appliedFilters={appliedFilters}
                onQueryChange={setQueryValue}
                onQueryClear={handleQueryValueRemove}
                onClearAll={handleClearAll}
                queryPlaceholder="Search jobs by ID, filter, or mutation"
              />

              {/* Sort and Stats */}
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">
                  Showing {sortedJobs.length} of {DUMMY_JOBS.length} jobs
                </Text>
                <Box width="200px">
                  <Select
                    label="Sort by"
                    labelInline
                    options={sortOptions}
                    value={sortValue}
                    onChange={setSortValue}
                  />
                </Box>
              </InlineStack>

              {/* Data Table */}
              {sortedJobs.length > 0 ? (
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                  ]}
                  headings={[
                    "Job ID",
                    "Created",
                    "Filter Applied",
                    "Mutation",
                    "Products",
                    "Status",
                    "Actions",
                  ]}
                  rows={rows}
                  hoverable
                />
              ) : (
                <EmptyState
                  heading="No jobs found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <Text as="p" tone="subdued">
                    Try changing your search or filter criteria
                  </Text>
                </EmptyState>
              )}

              {/* Pagination */}
              {sortedJobs.length > 0 && (
                <InlineStack align="center">
                  <Pagination
                    hasPrevious
                    onPrevious={() => console.log("Previous page")}
                    hasNext
                    onNext={() => console.log("Next page")}
                    label="1-6 of 6"
                  />
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Sidebar */}
        <Layout.Section variant="oneThird">
       <Box paddingInlineStart="400">
          <Box maxWidth="320px" width='100%'>
               <BlockStack gap="400">
            {/* Summary Stats */}
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  Summary Statistics
                </Text>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Total jobs
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {DUMMY_JOBS.length}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Completed
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {DUMMY_JOBS.filter((j) => j.status === "COMPLETED").length}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Running
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {DUMMY_JOBS.filter((j) => j.status === "RUNNING").length}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Failed
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {DUMMY_JOBS.filter((j) => j.status === "FAILED").length}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Total products affected
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {DUMMY_JOBS.reduce(
                        (sum, j) =>
                          sum +
                          (j.status === "COMPLETED" ? j.affectedCount : 0),
                        0
                      ).toLocaleString()}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Info Card */}
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  About Job History
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Track all bulk edit operations performed on your products. Jobs are retained for 90 days.
                </Text>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • Click "View" to see detailed job logs
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • Failed jobs can be retried with the same settings
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • Export history for audit and reporting
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Help Card */}
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  Need Help?
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Learn more about monitoring and troubleshooting bulk jobs.
                </Text>
                <Button
                  variant="plain"
                  onClick={() =>
                    window.open("https://docs.zenmeraki.com/history", "_blank")
                  }
                >
                  View documentation
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
         </Box>
       </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}