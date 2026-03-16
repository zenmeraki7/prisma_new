// FILE: frontend/components/BulkEditJobDetailsDrawer.tsx

import { useMemo, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Divider,
  InlineStack,
  Modal,
  Scrollable,
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
  type BulkEditJobItem,
} from "../../../frontend/lib/bulkEdit/bulkEditApi";

export interface BulkEditJobDetailsDrawerProps {
  open: boolean;
  job: BulkEditJob | null;
  onClose: () => void;
  onRetryStarted?: (newJobId: string) => void;
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

function formatValuePreview(value: unknown): string {
  if (value == null) return "—";

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function inferFailedItems(job: BulkEditJob | null): BulkEditJobItem[] {
  if (!job?.items?.length) return [];
  return job.items.filter((item) => item.success === false);
}

function inferSuccessCount(job: BulkEditJob | null): number {
  if (!job?.items?.length) return 0;
  return job.items.filter((item) => item.success === true).length;
}

function inferFailureCount(job: BulkEditJob | null): number {
  return inferFailedItems(job).length;
}

function buildOperationMeta(job: BulkEditJob | null) {
  if (!job) return [];

  return [
    { label: "Job ID", value: job.id || "—" },
    { label: "Scope", value: getBulkEditScopeLabel(job.scope) },
    { label: "Field", value: getBulkEditFieldLabel(job.fieldKey) },
    { label: "Action", value: job.action || "—" },
    { label: "Mutation", value: job.mutationName || "—" },
    { label: "Selection mode", value: job.selectionMode || "—" },
    { label: "Selected count", value: job.selectedCount ?? "—" },
    { label: "Input line count", value: job.inputLineCount ?? "—" },
    { label: "Object count", value: job.objectCount ?? "—" },
    { label: "Error code", value: job.errorCode || "—" },
    { label: "Started", value: formatDateTime(job.startedAt) },
    { label: "Completed", value: formatDateTime(job.completedAt) },
    { label: "Created", value: formatDateTime(job.createdAt) },
    { label: "Updated", value: formatDateTime(job.updatedAt) },
    { label: "Bulk operation ID", value: job.bulkOperationId || "—" },
    { label: "Result URL", value: job.resultUrl || "—" },
    { label: "Partial data URL", value: job.partialDataUrl || "—" },
  ];
}

function MetaSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <Box
      padding="400"
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      background="bg-surface-secondary"
    >
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">
          {title}
        </Text>

        {rows.map((row) => (
          <InlineStack key={String(row.label)} align="space-between" blockAlign="start" gap="300">
            <Text as="span" tone="subdued">
              {row.label}
            </Text>
            <Box maxWidth="70%">
              <Text as="span" alignment="end" breakWord>
                {row.value}
              </Text>
            </Box>
          </InlineStack>
        ))}
      </BlockStack>
    </Box>
  );
}

function FailureRow({ item }: { item: BulkEditJobItem }) {
  const target =
    item.variantId ||
    item.productId ||
    item.variantGid ||
    item.productGid ||
    "Unknown target";

  return (
    <Box
      padding="300"
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
    >
      <BlockStack gap="150">
        <InlineStack align="space-between" blockAlign="start" gap="300">
          <BlockStack gap="050">
            <Text as="span" variant="bodySm" fontWeight="medium">
              Line {item.inputLineNumber ?? "—"}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {target}
            </Text>
          </BlockStack>

          <Text as="span" variant="bodySm" tone="critical" fontWeight="medium">
            Failed
          </Text>
        </InlineStack>

        {item.errorMessage ? (
          <Text as="p" variant="bodySm" tone="critical">
            {item.errorMessage}
          </Text>
        ) : null}

        {item.userErrorsJson ? (
          <Box
            padding="200"
            borderRadius="100"
            background="bg-surface-tertiary"
          >
            <Text as="p" variant="bodySm" breakWord>
              {formatValuePreview(item.userErrorsJson)}
            </Text>
          </Box>
        ) : null}
      </BlockStack>
    </Box>
  );
}

export function BulkEditJobDetailsDrawer({
  open,
  job,
  onClose,
  onRetryStarted,
}: BulkEditJobDetailsDrawerProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const tone = getBulkEditStatusTone(job?.status);
  const failedItems = useMemo(() => inferFailedItems(job).slice(0, 20), [job]);
  const failureCount = useMemo(() => inferFailureCount(job), [job]);
  const successCount = useMemo(() => inferSuccessCount(job), [job]);
  const terminal = isBulkEditTerminalStatus(job?.status);
  const operationRows = useMemo(() => buildOperationMeta(job), [job]);

  const editSummaryRows = useMemo(() => {
    if (!job) return [];

    return [
      {
        label: "Field",
        value: getBulkEditFieldLabel(job.fieldKey),
      },
      {
        label: "Action",
        value: job.action,
      },
      {
        label: "Requested value",
        value: formatValuePreview(job.editPayloadJson?.value),
      },
      {
        label: "Scope",
        value: getBulkEditScopeLabel(job.scope),
      },
      {
        label: "Status",
        value: statusLabel(job.status),
      },
    ];
  }, [job]);

  const handleRetryFailed = async () => {
    if (!job?.id) return;

    try {
      setRetryError(null);
      setRetrying(true);

      const response = await retryFailedBulkEditJob(job.id);
      onRetryStarted?.(response.retryJob.id);
      onClose();
    } catch (err: any) {
      setRetryError(err?.message || "Failed to start retry job.");
    } finally {
      setRetrying(false);
    }
  };

  if (!job) {
    return (
      <Modal open={open} onClose={onClose} title="Bulk job details">
        <Modal.Section>
          <Text as="p">No job selected.</Text>
        </Modal.Section>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={retrying ? () => {} : onClose}
      title="Bulk job details"
      
      primaryAction={
        failureCount > 0
          ? {
              content: retrying ? "Starting retry…" : "Retry failed rows",
              onAction: handleRetryFailed,
              loading: retrying,
              disabled: retrying,
            }
          : undefined
      }
      secondaryActions={[
        ...(failureCount > 0
          ? [
              {
                content: "Download failures CSV",
                url: getBulkEditFailuresCsvUrl(job.id),
                external: true,
              },
            ]
          : []),
        {
          content: "Close",
          onAction: onClose,
          disabled: retrying,
        },
      ]}
    >
      <Modal.Section>
        <Scrollable style={{ maxHeight: "70vh" }}>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">
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

              <Text as="span" tone="subdued" variant="bodySm">
                {terminal ? "Terminal state" : "Active job"}
              </Text>
            </InlineStack>

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
                    {failureCount}
                  </Text>
                </BlockStack>
              </Box>

              <Box>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Selected
                  </Text>
                  <Text as="p" variant="headingLg">
                    {job.selectedCount ?? "—"}
                  </Text>
                </BlockStack>
              </Box>
            </InlineStack>

            <MetaSection title="Edit summary" rows={editSummaryRows} />

            <MetaSection title="Operation metadata" rows={operationRows} />

            <Divider />

            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingSm">
                  First 20 failures
                </Text>
                <Text as="span" tone="subdued" variant="bodySm">
                  {failureCount} total
                </Text>
              </InlineStack>

              {failedItems.length === 0 ? (
                <Box
                  padding="400"
                  borderWidth="025"
                  borderColor="border"
                  borderRadius="200"
                >
                  <Text as="p" tone="subdued">
                    No failed rows found for this job.
                  </Text>
                </Box>
              ) : (
                <BlockStack gap="200">
                  {failedItems.map((item) => (
                    <FailureRow key={item.id} item={item} />
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </BlockStack>
        </Scrollable>
      </Modal.Section>
    </Modal>
  );
}

export default BulkEditJobDetailsDrawer;