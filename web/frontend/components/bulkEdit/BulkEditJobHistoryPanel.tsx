// FILE: frontend/components/BulkEditJobHistoryPanel.tsx

import { useMemo } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  EmptyState,
  InlineStack,
  Spinner,
  Text,
} from "@shopify/polaris";
import {
  getBulkEditFieldLabel,
  getBulkEditScopeLabel,
  getBulkEditStatusTone,
  isBulkEditTerminalStatus,
  type BulkEditJob,
} from "../../../frontend/lib/bulkEdit/bulkEditApi";

export interface BulkEditJobHistoryPanelProps {
  jobs: BulkEditJob[];
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onSelectJob?: (jobId: string) => void;
  selectedJobId?: string | null;
}

function statusLabel(status?: string | null): string {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "BUILDING":
      return "Preparing rows";
    case "UPLOADING":
      return "Uploading JSONL";
    case "SUBMITTED":
      return "Submitted";
    case "RUNNING":
      return "Running";
    case "COMPLETED":
      return "Completed";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status || "Unknown";
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function inferFailureCount(job: BulkEditJob): number {
  if (!job.items?.length) return 0;
  return job.items.filter((item) => item.success === false).length;
}

function toneBackground(tone?: string) {
  switch (tone) {
    case "success":
      return "bg-fill-success-secondary";
    case "critical":
      return "bg-fill-critical-secondary";
    case "attention":
    case "warning":
      return "bg-fill-caution-secondary";
    default:
      return "bg-fill-info-secondary";
  }
}

export function BulkEditJobHistoryPanel({
  jobs,
  loading = false,
  refreshing = false,
  error = null,
  onRefresh,
  onSelectJob,
  selectedJobId = null,
}: BulkEditJobHistoryPanelProps) {
  const activeCount = useMemo(
    () => jobs.filter((job) => !isBulkEditTerminalStatus(job.status)).length,
    [jobs],
  );

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              Bulk jobs
            </Text>
            <Text as="p" tone="subdued">
              {activeCount > 0
                ? `${activeCount} active job${activeCount > 1 ? "s" : ""}`
                : "Recent bulk edit history"}
            </Text>
          </BlockStack>

          <InlineStack gap="200" blockAlign="center">
            {refreshing ? <Spinner size="small" /> : null}
            {onRefresh ? <Button onClick={onRefresh}>Refresh</Button> : null}
          </InlineStack>
        </InlineStack>

        {error ? (
          <Banner tone="critical">
            <p>{error}</p>
          </Banner>
        ) : null}

        {loading && jobs.length === 0 ? (
          <InlineStack gap="200" blockAlign="center">
            <Spinner size="small" />
            <Text as="span">Loading bulk jobs…</Text>
          </InlineStack>
        ) : null}

        {!loading && jobs.length === 0 ? (
          <EmptyState
            heading="No bulk edit jobs yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Run your first bulk edit to see job history here.</p>
          </EmptyState>
        ) : null}

        {jobs.length > 0 ? (
          <BlockStack gap="0">
            {jobs.map((job, index) => {
              const tone = getBulkEditStatusTone(job.status);
              const failureCount = inferFailureCount(job);
              const isSelected = selectedJobId === job.id;

              return (
                <Box key={job.id}>
                  {index > 0 ? <Divider /> : null}

                  <Box
                    padding="400"
                    background={isSelected ? "bg-surface-secondary" : "bg-surface"}
                  >
                    <InlineStack align="space-between" blockAlign="start" gap="300">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Text as="h3" variant="headingSm">
                            {getBulkEditFieldLabel(job.fieldKey)}
                          </Text>

                          <Box
                            paddingInlineStart="300"
                            paddingInlineEnd="300"
                            paddingBlockStart="100"
                            paddingBlockEnd="100"
                            borderRadius="200"
                            background={toneBackground(tone)}
                          >
                            <Text as="span" variant="bodySm" fontWeight="medium">
                              {statusLabel(job.status)}
                            </Text>
                          </Box>
                        </InlineStack>

                        <Text as="p" tone="subdued" variant="bodySm">
                          {getBulkEditScopeLabel(job.scope)} · {job.mutationName}
                        </Text>

                        <InlineStack gap="400" wrap>
                          <Text as="span" variant="bodySm" tone="subdued">
                            Selected: {job.selectedCount ?? "—"}
                          </Text>

                          <Text as="span" variant="bodySm" tone="subdued">
                            Failed: {failureCount}
                          </Text>

                          <Text as="span" variant="bodySm" tone="subdued">
                            Created: {formatDateTime(job.createdAt)}
                          </Text>
                        </InlineStack>

                        {job.errorMessage ? (
                          <Text as="p" variant="bodySm" tone="critical">
                            {job.errorMessage}
                          </Text>
                        ) : null}
                      </BlockStack>

                      {onSelectJob ? (
                        <Button
                          onClick={() => onSelectJob(job.id)}
                          variant={isSelected ? "primary" : "secondary"}
                        >
                          {isSelected ? "Selected" : "View"}
                        </Button>
                      ) : null}
                    </InlineStack>
                  </Box>
                </Box>
              );
            })}
          </BlockStack>
        ) : null}
      </BlockStack>
    </Card>
  );
}

export default BulkEditJobHistoryPanel;