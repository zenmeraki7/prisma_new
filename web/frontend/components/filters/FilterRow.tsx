// FILE: web/frontend/components/filters/FilterRow.tsx

import React from "react";
import { TextField, Select, Checkbox } from "@shopify/polaris";

import type { FilterExpr, Operator } from "../../lib/filters/dsl";
import { field as buildFieldExpr } from "../../lib/filters/dsl";
import {
  listFilters,
  getFilterConfig,
  getWidgetConfig,
  getEnumOptions,
} from "../../lib/filters/frontendRegistry";

import type { FilterKey } from "../../../lib/filters/registry";

interface FilterRowProps {
  scope: "product" | "variant";
  value: FilterExpr | null;
  onChange: (expr: FilterExpr | null) => void;
}

export function FilterRow({ scope, value, onChange }: FilterRowProps) {
  const allFilters = listFilters(scope);

  // Extract current selected key/op/value (if any)
  const currentField = value && value.kind === "field" ? value : null;
  const selectedKey = currentField?.key ?? allFilters[0]?.key;
  const cfg = selectedKey ? getFilterConfig(selectedKey) : undefined;

  const handleKeyChange = (key: string) => {
    const typedKey = key as FilterKey;
    const cfg = getFilterConfig(typedKey);
    const op = cfg.operators[0] as Operator;
    onChange(buildFieldExpr(typedKey, op)); // no value yet
  };

  const handleValueChange = (raw: string) => {
    if (!cfg) return;
    const key = cfg.key;
    const op = (currentField?.op ?? cfg.operators[0]) as Operator;
    // Value normalization is handled server-side (astFromJson),
    // here we just send raw strings / arrays as appropriate.
    onChange(buildFieldExpr(key, op, raw));
  };

  if (!cfg) return null;

  const widget = getWidgetConfig(cfg.key);
  const enumOptions = getEnumOptions(cfg.key);

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {/* Filter selector */}
      <Select
        label="Filter"
        labelHidden
        options={allFilters.map((f) => ({ label: f.label, value: f.key }))}
        value={selectedKey}
        onChange={handleKeyChange}
      />

      {/* Very simple example: show a text field or select based on widget */}
      {cfg.valueKind === "enum" && enumOptions ? (
        <Select
          label="Value"
          labelHidden
          options={enumOptions.map((o) => ({ label: o.label, value: o.value }))}
          value={(currentField?.value as string | undefined) ?? ""}
          onChange={handleValueChange}
        />
      ) : widget.widget === "boolean-toggle" ? (
        <Checkbox
          label={cfg.label}
          checked={Boolean(currentField?.value)}
          onChange={(checked) => handleValueChange(String(checked))}
        />
      ) : (
        <TextField
          label="Value"
          labelHidden
          placeholder={widget.placeholder}
          value={(currentField?.value as string | undefined) ?? ""}
          onChange={handleValueChange}
            autoComplete="off"
        />
      )}
    </div>
  );
}
