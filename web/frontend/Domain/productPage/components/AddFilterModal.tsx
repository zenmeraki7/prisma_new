// web/frontend/pages/productsPage/components/AddFilterModal.tsx
import React, { useMemo } from "react";
import { Modal, Box, TextField, Divider, Text, ActionList } from "@shopify/polaris";

import { PRODUCT_FIELDS, VARIANT_FIELDS } from "../filterRegistry";

export function AddFilterModal(props: {
  open: boolean;
  filterSearch: string;
  setFilterSearch: (v: string) => void;
  onClose: () => void;
  onPickField: (key: string) => void;
}) {
  const { open, filterSearch, setFilterSearch, onClose, onPickField } = props;

  const filteredProductFields = useMemo(() => {
    const needle = filterSearch.trim().toLowerCase();
    const list = PRODUCT_FIELDS;
    if (!needle) return list;
    return list.filter((f) => f.label.toLowerCase().includes(needle));
  }, [filterSearch]);

  const filteredVariantFields = useMemo(() => {
    const needle = filterSearch.trim().toLowerCase();
    const list = VARIANT_FIELDS;
    if (!needle) return list;
    return list.filter((f) => f.label.toLowerCase().includes(needle));
  }, [filterSearch]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Filter"
      size="large"
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <Box paddingBlockEnd="200">
          <TextField
            label="Search filters"
            labelHidden
            placeholder="Search filters"
            autoComplete="off"
            value={filterSearch}
            onChange={setFilterSearch}
            prefix={<span style={{ display: "inline-flex" }}>{/* Polaris icon spacing */}</span>}
          />
        </Box>

        <Divider />

        <Box paddingBlockStart="300" paddingBlockEnd="200">
          <Text as="h3" variant="headingSm">
            Product Fields
          </Text>
        </Box>

        <ActionList
          items={filteredProductFields.map((f) => ({
            content: f.label,
            onAction: () => onPickField(f.key),
          }))}
        />

        <Box paddingBlockStart="300">
          <Text as="h3" variant="headingSm">
            Variant Fields
          </Text>
        </Box>

        <ActionList
          items={filteredVariantFields.map((f) => ({
            content: f.label,
            onAction: () => onPickField(f.key),
          }))}
        />
      </Modal.Section>
    </Modal>
  );
}
