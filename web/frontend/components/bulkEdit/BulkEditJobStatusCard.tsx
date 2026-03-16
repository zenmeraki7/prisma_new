// FILE: frontend/components/BulkEditJobStatusCard.tsx

import { useMemo, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Spinner,
  Text,
} from "@shopify/polaris";
import {
  getBulkEditFailuresCsvUrl,
  getBulkEditFieldLabel,
  getBulkEditScopeLabel,
  getBulkEditStatusTone,
  isBulkEditTerminalStatus,
  retryFailedBulkEditJob,
  type BulkEditJob,
} from "../../../frontend/lib/bulkEdit/bulkEditApi";

export interface BulkEditJobStatusCardProps {
  job: BulkEditJob | null;
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  onRetryStarted?: (newJobId: string) => void;
  onRefresh?: () => void;
}

function inferFailedCount(job: BulkEditJob | null): number {
  if (!job?.items?.length) return 0;
  return job.items.filter((item) => item.success === false).length;
}

function inferSucceededCount(job: BulkEditJob | null): number {
  if (!job?.items?.length) return 0;
  return job.items.filter((item) => item.success === true).length;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
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
      return "Submitted to Shopify";
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

export function BulkEditJobStatusCard({
  job,
  loading = false,
  refreshing = false,
  error = null,
  onRetryStarted,
  onRefresh,
}: BulkEditJobStatusCardProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const failedCount = useMemo(() => inferFailedCount(job), [job]);
  const successCount = useMemo(() => inferSucceededCount(job), [job]);
  const canRetryFailed = Boolean(job?.id && failedCount > 0);
  const canDownloadFailures = Boolean(job?.id && failedCount > 0);

  const handleRetryFailed = async () => {
    if (!job?.id) return;

    try {
      setRetryError(null);
      setRetrying(true);

      const response = await retryFailedBulkEditJob(job.id);
      onRetryStarted?.(response.retryJob.id);
    } catch (err: any) {
      setRetryError(err?.message || "Failed to start retry job.");
    } finally {
      setRetrying(false);
    }
  };

  if (loading && !job) {
    return (
      <Card>
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <Spinner size="small" />
            <Text as="span">Loading bulk edit job…</Text>
          </InlineStack>
        </BlockStack>
      </Card>
    );
  }

  if (!job) {
    return null;
  }

  const tone = getBulkEditStatusTone(job.status);
  const terminal = isBulkEditTerminalStatus(job.status);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              Bulk edit job
            </Text>
            <Text as="p" tone="subdued">
              Job ID: {job.id}
            </Text>
          </BlockStack>

          <InlineStack gap="200" blockAlign="center">
            {refreshing && !terminal ? <Spinner size="small" /> : null}
            <Box
              paddingInlineStart="300"
              paddingInlineEnd="300"
              paddingBlockStart="100"
              paddingBlockEnd="100"
              borderRadius="200"
              background={
                tone === "success"
                  ? "bg-fill-success-secondary"
                  : tone === "critical"
                    ? "bg-fill-critical-secondary"
                    : tone === "attention"
                      ? "bg-fill-caution-secondary"
                      : "bg-fill-info-secondary"
              }
            >
              <Text as="span" variant="bodySm" fontWeight="medium">
                {statusLabel(job.status)}
              </Text>
            </Box>
          </InlineStack>
        </InlineStack>

        {error ? (
          <Banner tone="critical">
            <p>{error}</p>
          </Banner>
        ) : null}

        {job.errorMessage ? (
          <Banner tone={job.status === "COMPLETED" ? "warning" : "critical"}>
            <p>{job.errorMessage}</p>
          </Banner>
        ) : null}

        {retryError ? (
          <Banner tone="critical">
            <p>{retryError}</p>
          </Banner>
        ) : null}

        <Box
          padding="400"
          borderWidth="025"
          borderColor="border"
          borderRadius="200"
          background="bg-surface-secondary"
        >
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="start">
              <Text as="span" tone="subdued">
                Scope
              </Text>
              <Text as="span" fontWeight="medium">
                {getBulkEditScopeLabel(job.scope)}
              </Text>
            </InlineStack>

            <InlineStack align="space-between" blockAlign="start">
              <Text as="span" tone="subdued">
                Field
              </Text>
              <Text as="span" fontWeight="medium">
                {getBulkEditFieldLabel(job.fieldKey)}
              </Text>
            </InlineStack>

            <InlineStack align="space-between" blockAlign="start">
              <Text as="span" tone="subdued">
                Mutation
              </Text>
              <Text as="span" fontWeight="medium">
                {job.mutationName}
              </Text>
            </InlineStack>

            <InlineStack align="space-between" blockAlign="start">
              <Text as="span" tone="subdued">
                Selected count
              </Text>
              <Text as="span" fontWeight="medium">
                {job.selectedCount ?? "—"}
              </Text>
            </InlineStack>

            <InlineStack align="space-between" blockAlign="start">
              <Text as="span" tone="subdued">
                Input line count
              </Text>
              <Text as="span" fontWeight="medium">
                {job.inputLineCount ?? "—"}
              </Text>
            </InlineStack>

            <InlineStack align="space-between" blockAlign="start">
              <Text as="span" tone="subdued">
                Started
              </Text>
              <Text as="span" fontWeight="medium">
                {formatDateTime(job.startedAt)}
              </Text>
            </InlineStack>

            <InlineStack align="space-between" blockAlign="start">
              <Text as="span" tone="subdued">
                Completed
              </Text>
              <Text as="span" fontWeight="medium">
                {formatDateTime(job.completedAt)}
              </Text>
            </InlineStack>
          </BlockStack>
        </Box>

        <Divider />

        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Result summary
          </Text>

          <InlineStack gap="400" wrap>
            <Box>
              <BlockStack gap="100">
                <Text as="span" tone="subdued" variant="bodySm">
                  Succeeded
                </Text>
                <Text as="p" variant="headingLg">
                  {successCount}
                </Text>
              </BlockStack>
            </Box>

            <Box>
              <BlockStack gap="100">
                <Text as="span" tone="subdued" variant="bodySm">
                  Failed
                </Text>
                <Text as="p" variant="headingLg">
                  {failedCount}
                </Text>
              </BlockStack>
            </Box>
          </InlineStack>

          {job.items?.length ? (
            <Box
              padding="300"
              borderWidth="025"
              borderColor="border"
              borderRadius="200"
            >
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Recent result items
                </Text>

                {job.items.slice(0, 10).map((item) => (
                  <InlineStack
                    key={item.id}
                    align="space-between"
                    blockAlign="start"
                    gap="300"
                  >
                    <BlockStack gap="050">
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        Line {item.inputLineNumber ?? "—"}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {item.variantId || item.productId || item.variantGid || item.productGid || "Unknown target"}
                      </Text>
                    </BlockStack>

                    <BlockStack gap="050" inlineAlign="end">
                      <Text
                        as="span"
                        variant="bodySm"
                        fontWeight="medium"
                        tone={
                          item.success === true
                            ? "success"
                            : item.success === false
                              ? "critical"
                              : "subdued"
                        }
                      >
                        {item.success === true
                          ? "Success"
                          : item.success === false
                            ? "Failed"
                            : "Pending"}
                      </Text>
                      {item.errorMessage ? (
                        <Text as="span" variant="bodySm" tone="critical" alignment="end">
                          {item.errorMessage}
                        </Text>
                      ) : null}
                    </BlockStack>
                  </InlineStack>
                ))}
              </BlockStack>
            </Box>
          ) : null}
        </BlockStack>

        <InlineStack gap="200" align="space-between">
          <InlineStack gap="200">
            {onRefresh ? (
              <Button onClick={onRefresh} disabled={loading || refreshing}>
                Refresh
              </Button>
            ) : null}
          </InlineStack>

          <InlineStack gap="200">
            {canDownloadFailures ? (
              <Button url={getBulkEditFailuresCsvUrl(job.id)} external>
                Download failures CSV
              </Button>
            ) : null}

            {canRetryFailed ? (
              <Button
                variant="primary"
                onClick={handleRetryFailed}
                loading={retrying}
                disabled={retrying}
              >
                Retry failed rows
              </Button>
            ) : null}
          </InlineStack>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

export default BulkEditJobStatusCard;