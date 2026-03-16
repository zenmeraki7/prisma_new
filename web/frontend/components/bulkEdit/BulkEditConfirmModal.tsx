// FILE: frontend/components/BulkEditConfirmModal.tsx

import { useMemo, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  InlineStack,
  List,
  Modal,
  Text,
} from "@shopify/polaris";
import {
  createBulkEditJob,
  getBulkEditFieldLabel,
  getBulkEditScopeLabel,
  type BulkEditFieldKey,
  type BulkEditScope,
  type CreateBulkEditJobRequest,
  type FilterExpr,
} from "../../../frontend/lib/bulkEdit/bulkEditApi";

export interface BulkEditConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (jobId: string) => void;

  scope: BulkEditScope;
  fieldKey: BulkEditFieldKey;
  action: "SET";
  value: unknown;
  filterExpr: FilterExpr;

  selectionCountPreview?: number | null;
}

function formatPreviewValue(value: unknown, fieldKey: string): string {
  if (fieldKey === "product.tags" && Array.isArray(value)) {
    return value.join(", ");
  }

  if (value == null) return "—";

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function validateBeforeSubmit(
  scope: BulkEditScope,
  fieldKey: string,
  action: string,
  value: unknown,
  filterExpr: FilterExpr | null | undefined,
): string | null {
  if (!scope) return "Scope is required.";
  if (!fieldKey) return "Field is required.";
  if (!action) return "Action is required.";
  if (!filterExpr) return "Filter expression is required.";

  if (fieldKey === "product.tags") {
    if (!Array.isArray(value)) {
      return "Tags must be an array of strings.";
    }
    return null;
  }

  if (value == null || value === "") {
    return "A value is required.";
  }

  return null;
}

export function BulkEditConfirmModal({
  open,
  onClose,
  onSuccess,
  scope,
  fieldKey,
  action,
  value,
  filterExpr,
  selectionCountPreview,
}: BulkEditConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validationError = useMemo(
    () => validateBeforeSubmit(scope, fieldKey, action, value, filterExpr),
    [scope, fieldKey, action, value, filterExpr],
  );

  const previewValue = useMemo(
    () => formatPreviewValue(value, fieldKey),
    [value, fieldKey],
  );

  const title = useMemo(
    () => `Confirm bulk edit for ${getBulkEditScopeLabel(scope).toLowerCase()}`,
    [scope],
  );

  const handlePrimaryAction = async () => {
    setSubmitError(null);

    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    const payload: CreateBulkEditJobRequest = {
      scope,
      fieldKey,
      action,
      value,
      filterExpr,
    };

    try {
      setSubmitting(true);

      const response = await createBulkEditJob(payload);

      onSuccess?.(response.job.id);
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to start bulk edit job.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={title}
      primaryAction={{
        content: submitting ? "Starting…" : "Run bulk edit",
        onAction: handlePrimaryAction,
        loading: submitting,
        disabled: submitting,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
          disabled: submitting,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {submitError ? (
            <Banner tone="critical">
              <p>{submitError}</p>
            </Banner>
          ) : null}

          <Text as="p" tone="subdued">
            This operation runs asynchronously in the background through Shopify
            bulk operations.
          </Text>

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
                  {getBulkEditScopeLabel(scope)}
                </Text>
              </InlineStack>

              <InlineStack align="space-between" blockAlign="start">
                <Text as="span" tone="subdued">
                  Field
                </Text>
                <Text as="span" fontWeight="medium">
                  {getBulkEditFieldLabel(fieldKey)}
                </Text>
              </InlineStack>

              <InlineStack align="space-between" blockAlign="start">
                <Text as="span" tone="subdued">
                  Action
                </Text>
                <Text as="span" fontWeight="medium">
                  {action}
                </Text>
              </InlineStack>

              <InlineStack align="space-between" blockAlign="start">
                <Text as="span" tone="subdued">
                  New value
                </Text>
                <Text as="span" fontWeight="medium" alignment="end">
                  {previewValue}
                </Text>
              </InlineStack>

              {typeof selectionCountPreview === "number" ? (
                <InlineStack align="space-between" blockAlign="start">
                  <Text as="span" tone="subdued">
                    Current filtered count
                  </Text>
                  <Text as="span" fontWeight="medium">
                    {selectionCountPreview}
                  </Text>
                </InlineStack>
              ) : null}
            </BlockStack>
          </Box>

          <Banner tone="warning">
            <List>
              <List.Item>Bulk edits may take a while for large catalogs.</List.Item>
              <List.Item>
                Some rows can fail independently even when the overall job completes.
              </List.Item>
              <List.Item>
                You will be able to retry failed rows and download a failures CSV.
              </List.Item>
            </List>
          </Banner>

          <InlineStack align="end">
            <Button
              variant="primary"
              onClick={handlePrimaryAction}
              loading={submitting}
              disabled={submitting}
            >
              Run bulk edit
            </Button>
          </InlineStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

export default BulkEditConfirmModal;