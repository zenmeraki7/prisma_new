// FILE: web/components/filters/FilterBar.tsx

import React from "react";
import {
  Card,
  BlockStack,
  InlineStack,
  Select,
  Button,
  TextField,
  Text,
  Box,
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";

import {
  FILTER_REGISTRY,
  type FilterKey,
  type FilterDefinition,
} from "../../lib/filters/registry";
import {
  useFilterBuilder,
  type ActiveFilter,
} from "../../hooks/useFilterBuilder";

interface FilterBarProps {
  /**
   * Called when the user clicks "Apply".
   * You usually pass this directly into your query hook:
   *   onApply: (filters) => setFilter({ predicates: filters })
   */
  onApply: (payload: { key: FilterKey; operator: string; value: any }[]) => void;
}

export function FilterBar({ onApply }: FilterBarProps) {
  const {
    activeFilters,
    availableFilters,
    addFilter,
    updateFilter,
    removeFilter,
    getApiPayload,
    getDefinition,
  } = useFilterBuilder();

  const handleApply = () => {
    const payload = getApiPayload();
    onApply(payload);
  };

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingSm">
          Filter Products
        </Text>

        {/* Active Filter Rows */}
        <BlockStack gap="300">
          {activeFilters.map((filter) => (
            <FilterRow
              key={filter.id}
              filter={filter}
              def={getDefinition(filter.key)}
              onUpdate={updateFilter}
              onRemove={() => removeFilter(filter.id)}
            />
          ))}

          {activeFilters.length === 0 && (
            <Text as="p" tone="subdued">
              No filters added. Use the selector below to add your first filter.
            </Text>
          )}
        </BlockStack>

        {/* Action Bar */}
        <InlineStack align="space-between" blockAlign="center">
          <Box maxWidth="260px" width="100%">
            <Select
              label="Add filter"
              labelHidden
              placeholder="Select a filter..."
              options={availableFilters}
              onChange={(val) => {
                if (!val) return;
                addFilter(val as FilterKey);
              }}
              value="" // Always reset after selection
            />
          </Box>

          <Button variant="primary" onClick={handleApply}>
            Apply filters
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

// --- Sub-Components ---

interface FilterRowProps {
  filter: ActiveFilter;
  def: FilterDefinition;
  onUpdate: (id: string, updates: Partial<ActiveFilter>) => void;
  onRemove: () => void;
}

function FilterRow({ filter, def, onUpdate, onRemove }: FilterRowProps) {
  const operatorOptions = def.operators.map((op) => ({
    label: op.replace(/_/g, " "), // "NOT_IN" -> "NOT IN"
    value: op,
  }));

  return (
    <Box background="bg-surface-secondary" padding="200" borderRadius="200">
      <InlineStack gap="300" align="start" blockAlign="center" wrap={false}>
        {/* 1. Label (fixed per row) */}
        <Box minWidth="160px">
          <Text as="span" fontWeight="bold">
            {def.label}
          </Text>
        </Box>

        {/* 2. Operator selector */}
        <Box minWidth="140px">
          <Select
            label="Operator"
            labelHidden
            options={operatorOptions}
            value={filter.operator}
            onChange={(val) => onUpdate(filter.id, { operator: val as any })}
          />
        </Box>

        {/* 3. Value widget */}
        <Box width="100%">
          <ValueWidget
            filter={filter}
            def={def}
            onChange={(val) => onUpdate(filter.id, { value: val })}
          />
        </Box>

        {/* 4. Remove button */}
        <Button
          icon={DeleteIcon}
          variant="tertiary"
          tone="critical"
          onClick={onRemove}
          accessibilityLabel="Remove filter"
        />
      </InlineStack>
    </Box>
  );
}

// --- Dynamic Value Widget ---

function ValueWidget({
  filter,
  def,
  onChange,
}: {
  filter: ActiveFilter;
  def: FilterDefinition;
  onChange: (val: any) => void;
}) {
  const widgetType = def.ui?.widget || "text";
  const placeholder = def.ui?.placeholder || "";

  // Boolean toggle
  if (widgetType === "boolean-toggle") {
    return (
      <Select
        label="Value"
        labelHidden
        options={[
          { label: "Yes / True", value: "true" },
          { label: "No / False", value: "false" },
        ]}
        value={String(filter.value ?? "")}
        onChange={(val) => onChange(val === "true")}
      />
    );
  }

  // Enum select (status, weight unit, etc.)
  if (def.enumValues && def.enumValues.length > 0) {
    return (
      <Select
        label="Value"
        labelHidden
        options={def.enumValues.map((e) => ({
          label: e.label,
          value: e.value,
        }))}
        value={filter.value ?? ""}
        onChange={onChange}
      />
    );
  }

  // Numeric input
  if (widgetType === "number") {
    return (
      <TextField
        label="Value"
        labelHidden
        type="number"
        value={filter.value ?? ""}
        onChange={onChange}
        autoComplete="off"
        placeholder={placeholder}
      />
    );
  }

  // Date input (simple ISO string; you can upgrade to a proper date picker later)
  if (widgetType === "date") {
    return (
      <TextField
        label="Value"
        labelHidden
        type="date"
        value={filter.value ?? ""}
        onChange={onChange}
        autoComplete="off"
        placeholder={placeholder}
      />
    );
  }

  // Fallback: text input
  return (
    <TextField
      label="Value"
      labelHidden
      value={filter.value ?? ""}
      onChange={onChange}
      autoComplete="off"
      placeholder={placeholder}
    />
  );
}
