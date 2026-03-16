// FILE: frontend/components/BulkEditActionBar.tsx

import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  InlineStack,
  Select,
  TextField,
  BlockStack,
  Text,
} from "@shopify/polaris";

import BulkEditConfirmModal from "./BulkEditConfirmModal";

import type {
  BulkEditScope,
  BulkEditFieldKey,
  FilterExpr,
} from "../../../frontend/lib/bulkEdit/bulkEditApi";

interface BulkEditActionBarProps {
  filterExpr: FilterExpr;
  filteredCount?: number | null;

  onJobStarted?: (jobId: string) => void;
}

type FieldOption = {
  label: string;
  value: BulkEditFieldKey;
  scope: BulkEditScope;
};

const FIELD_OPTIONS: FieldOption[] = [
  { label: "Product title", value: "product.title", scope: "PRODUCT" },
  { label: "Vendor", value: "product.vendor", scope: "PRODUCT" },
  { label: "Product type", value: "product.productType", scope: "PRODUCT" },
  { label: "Tags", value: "product.tags", scope: "PRODUCT" },

  { label: "Variant price", value: "variant.price", scope: "VARIANT" },
  {
    label: "Variant compare-at price",
    value: "variant.compareAtPrice",
    scope: "VARIANT",
  },
  { label: "Variant SKU", value: "variant.sku", scope: "VARIANT" },
  { label: "Variant barcode", value: "variant.barcode", scope: "VARIANT" },
];

export default function BulkEditActionBar({
  filterExpr,
  filteredCount,
  onJobStarted,
}: BulkEditActionBarProps) {
  const [scope, setScope] = useState<BulkEditScope>("PRODUCT");
  const [fieldKey, setFieldKey] = useState<BulkEditFieldKey>("product.title");
  const [value, setValue] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);

  const availableFields = useMemo(() => {
    return FIELD_OPTIONS.filter((f) => f.scope === scope);
  }, [scope]);

  const fieldSelectOptions = useMemo(
    () =>
      availableFields.map((f) => ({
        label: f.label,
        value: f.value,
      })),
    [availableFields],
  );

  const selectedFieldLabel = useMemo(() => {
    return (
      FIELD_OPTIONS.find((f) => f.value === fieldKey)?.label || fieldKey
    );
  }, [fieldKey]);

  const openModal = () => {
    if (!value) return;
    setModalOpen(true);
  };

  const handleScopeChange = (value: string) => {
    const newScope = value as BulkEditScope;

    setScope(newScope);

    const firstField = FIELD_OPTIONS.find((f) => f.scope === newScope);
    if (firstField) {
      setFieldKey(firstField.value);
    }
  };

  return (
    <>
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text variant="headingSm" as="h3">
                Bulk edit filtered items
              </Text>

              {typeof filteredCount === "number" && (
                <Text as="p" tone="subdued">
                  {filteredCount} matching items
                </Text>
              )}
            </InlineStack>

            <InlineStack gap="300" align="start" wrap>
              <Select
                label="Scope"
                labelHidden
                value={scope}
                onChange={handleScopeChange}
                options={[
                  { label: "Products", value: "PRODUCT" },
                  { label: "Variants", value: "VARIANT" },
                ]}
              />

              <Select
                label="Field"
                labelHidden
                value={fieldKey}
                onChange={(value) => setFieldKey(value as BulkEditFieldKey)}
                options={fieldSelectOptions}
              />

              <TextField
                label="Value"
                labelHidden
                placeholder={`Set ${selectedFieldLabel}`}
                value={value}
                onChange={setValue}
                autoComplete="off"
              />

              <Button
                variant="primary"
                onClick={openModal}
                disabled={!value}
              >
                Apply bulk edit
              </Button>
            </InlineStack>
          </BlockStack>
        </Box>
      </Card>

      <BulkEditConfirmModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={(jobId) => {
          setModalOpen(false);
          onJobStarted?.(jobId);
        }}
        scope={scope}
        fieldKey={fieldKey}
        action="SET"
        value={value}
        filterExpr={filterExpr}
        selectionCountPreview={filteredCount}
      />
    </>
  );
}