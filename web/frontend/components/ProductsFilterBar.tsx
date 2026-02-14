// FILE: web/frontend/components/ProductsFilterBar.tsx
import React from "react";
import {
  Box,
  Button,
  InlineStack,
  BlockStack,
  Filters,
  ChoiceList,
  TextField,
  Select,
  Badge,
} from "@shopify/polaris";

import type {
  UiFilterDef,
  FilterKey,
  FilterOperator,
} from "../lib/filters/uiRegistry";
import { UI_FILTERS, UI_FILTERS_BY_KEY } from "../lib/filters/uiRegistry";

export type DraftFilter = {
  id: string;
  key: FilterKey;
  op: FilterOperator;
  value: any;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

type Props = {
  searchText: string;
  onSearchTextChange: (v: string) => void;

  draftFilters: DraftFilter[];
  onDraftFiltersChange: (filters: DraftFilter[]) => void;

  onApply: () => void;
  onReset: () => void;

  loading?: boolean;

  // backend typeahead
  fetchSuggestions: (key: string, q: string) => Promise<string[]>;
};

// ---- operator labels (Ablestar-ish) ----
const OP_LABEL: Record<string, string> = {
  EQ: "is",
  NEQ: "is not",
  IN: "is any of",
  NOT_IN: "is none of",
  CONTAINS: "contains",
  NOT_CONTAINS: "does not contain",
  STARTS_WITH: "starts with",
  ENDS_WITH: "ends with",
  GT: "greater than",
  GTE: "at least",
  LT: "less than",
  LTE: "at most",
  BETWEEN: "between",
  IS_SET: "is set",
  IS_NOT_SET: "is not set",
};

function setFilter(
  draftFilters: DraftFilter[],
  patch: DraftFilter,
): DraftFilter[] {
  const idx = draftFilters.findIndex((f) => f.key === patch.key);
  if (idx === -1) return [...draftFilters, patch];
  const next = [...draftFilters];
  next[idx] = { ...next[idx], ...patch };
  return next;
}

function removeFilterByKey(draftFilters: DraftFilter[], key: FilterKey) {
  return draftFilters.filter((f) => f.key !== key);
}

function defFor(key: FilterKey): UiFilterDef {
  const d = UI_FILTERS_BY_KEY.get(key);
  if (!d) throw new Error(`Unknown filter key: ${key}`);
  return d;
}

function defaultValueFor(def: UiFilterDef) {
  if (def.widget === "boolean") return "true";
  if (def.widget === "select") return def.enumValues?.[0]?.value ?? "";
  if (def.valueKind === "number") return "";
  if (def.valueKind === "date") return "";
  if (def.valueKind === "text") return "";
  return "";
}

function normalizeValueForStorage(
  def: UiFilterDef,
  op: FilterOperator,
  raw: any,
) {
  // Keep it simple: backend normalizes. But ensure BETWEEN uses [a,b].
  if (op === "BETWEEN") {
    const a = raw?.[0] ?? "";
    const b = raw?.[1] ?? "";
    return [a, b];
  }
  return raw;
}

export const ProductsFilterBar: React.FC<Props> = ({
  searchText,
  onSearchTextChange,
  draftFilters,
  onDraftFiltersChange,
  onApply,
  onReset,
  loading,
  fetchSuggestions,
}) => {
  const hasAnyDraft =
    searchText.trim().length > 0 ||
    draftFilters.some((f) => {
      if (f.op === "IS_SET" || f.op === "IS_NOT_SET") return true;
      if (f.op === "BETWEEN") {
        const a = String(f.value?.[0] ?? "").trim();
        const b = String(f.value?.[1] ?? "").trim();
        return a.length > 0 || b.length > 0;
      }
      return String(f.value ?? "").trim().length > 0;
    });

  const queryValue = searchText;
  const onQueryChange = (v: string) => onSearchTextChange(v);
  const onQueryClear = () => onSearchTextChange("");

  // Build “Add filter” dropdown from UI_FILTERS (SSOT)
  const filters = UI_FILTERS.map((d) => {
    return {
      key: d.key,
      label: d.label,
      filter: (
        <FilterControl
          def={d}
          draftFilters={draftFilters}
          onDraftFiltersChange={onDraftFiltersChange}
          fetchSuggestions={fetchSuggestions}
        />
      ),
      shortcut: false,
    };
  });

  const appliedFilters = buildAppliedFilters(
    draftFilters,
    onDraftFiltersChange,
  );

  return (
    <Box padding="400">
      <BlockStack gap="300">
        <InlineStack gap="200" align="space-between" blockAlign="center">
          <div style={{ flex: 1 }}>
            <Filters
              queryValue={queryValue}
              queryPlaceholder="Search title / vendor / handle / tag ..."
              onQueryChange={onQueryChange}
              onQueryClear={onQueryClear}
              filters={filters}
              appliedFilters={appliedFilters}
              onClearAll={onReset} // ✅ THIS LINE
            />
          </div>

          <InlineStack gap="200" blockAlign="center">
            <Button
              onClick={onReset}
              disabled={
                Boolean(loading) || (!hasAnyDraft && draftFilters.length === 0)
              }
            >
              Reset
            </Button>
            <Button
              variant="primary"
              onClick={onApply}
              loading={Boolean(loading)}
              disabled={Boolean(loading) || !hasAnyDraft}
            >
              Apply
            </Button>
          </InlineStack>
        </InlineStack>
      </BlockStack>
    </Box>
  );
};

function buildAppliedFilters(
  draftFilters: DraftFilter[],
  onDraftFiltersChange: (f: DraftFilter[]) => void,
) {
  const applied: { key: string; label: string; onRemove: () => void }[] = [];

  for (const f of draftFilters) {
    const d = defFor(f.key);

    // Skip empty values (except is_set/is_not_set)
    if (f.op !== "IS_SET" && f.op !== "IS_NOT_SET") {
      if (f.op === "BETWEEN") {
        const a = String(f.value?.[0] ?? "").trim();
        const b = String(f.value?.[1] ?? "").trim();
        if (!a && !b) continue;
      } else {
        const v = String(f.value ?? "").trim();
        if (!v) continue;
      }
    }

    const opLabel = OP_LABEL[String(f.op)] ?? String(f.op).toLowerCase();

    let valueLabel = "";
    if (f.op === "IS_SET") valueLabel = "";
    else if (f.op === "IS_NOT_SET") valueLabel = "";
    else if (d.widget === "select") {
      const item = d.enumValues?.find((x) => x.value === f.value);
      valueLabel = item?.label ?? String(f.value ?? "");
    } else if (d.widget === "boolean") {
      valueLabel = String(f.value) === "true" ? "True" : "False";
    } else if (f.op === "BETWEEN") {
      const a = String(f.value?.[0] ?? "").trim();
      const b = String(f.value?.[1] ?? "").trim();
      valueLabel = `${a || "…"} and ${b || "…"}`;
    } else {
      valueLabel = String(f.value ?? "");
    }

    const label =
      f.op === "IS_SET"
        ? `${d.label} is set`
        : f.op === "IS_NOT_SET"
        ? `${d.label} is not set`
        : `${d.label} ${opLabel} ${valueLabel}`.trim();

    applied.push({
      key: f.key,
      label,
      onRemove: () =>
        onDraftFiltersChange(removeFilterByKey(draftFilters, f.key)),
    });
  }

  return applied;
}

function FilterControl(props: {
  def: UiFilterDef;
  draftFilters: DraftFilter[];
  onDraftFiltersChange: (filters: DraftFilter[]) => void;
  fetchSuggestions: (key: string, q: string) => Promise<string[]>;
}) {
  const { def, draftFilters, onDraftFiltersChange, fetchSuggestions } = props;

  const current = draftFilters.find((f) => f.key === def.key);

  const op: FilterOperator = (current?.op ??
    def.operators[0]) as FilterOperator;
  const value =
    current?.value ?? (op === "BETWEEN" ? ["", ""] : defaultValueFor(def));

  const set = (patch: Partial<DraftFilter>) => {
    const next: DraftFilter = {
      id: current?.id ?? uid(),
      key: def.key,
      op: (patch.op ?? op) as FilterOperator,
      value: normalizeValueForStorage(
        def,
        (patch.op ?? op) as FilterOperator,
        patch.value ?? value,
      ),
    };
    onDraftFiltersChange(setFilter(draftFilters, next));
  };

  // STATUS-style enum single select (Ablestar/Shopify Admin feel)
  if (def.widget === "select" && def.key === "product.status") {
    const choices = (def.enumValues ?? []).map((x) => ({
      label: x.label,
      value: x.value,
    }));
    return (
      <ChoiceList
        title={def.label}
        titleHidden
        choices={choices}
        selected={[String(value)]}
        onChange={(sel) => {
          const v = sel?.[0] ?? def.enumValues?.[0]?.value ?? "";
          set({ op: "EQ", value: v });
        }}
      />
    );
  }

  // Operator select (most filters)
  const opSelect =
    def.operators.length > 1 ? (
      <Select
        label="Operator"
        labelHidden
        options={def.operators.map((o) => ({
          label: OP_LABEL[o] ?? o,
          value: o,
        }))}
        value={String(op)}
        onChange={(v) => set({ op: v as FilterOperator })}
      />
    ) : null;

  // IS_SET / IS_NOT_SET (no value input)
  if (op === "IS_SET" || op === "IS_NOT_SET") {
    return (
      <BlockStack gap="200">
        {opSelect}
        <InlineStack gap="200" blockAlign="center">
          <Badge tone="info">{op === "IS_SET" ? "Set" : "Not set"}</Badge>
        </InlineStack>
      </BlockStack>
    );
  }

  // BETWEEN (2 inputs)
  if (op === "BETWEEN") {
    const a = String(value?.[0] ?? "");
    const b = String(value?.[1] ?? "");
    const inputType =
      def.widget === "date"
        ? "date"
        : def.widget === "number"
        ? "number"
        : "text";

    return (
      <BlockStack gap="200">
        {opSelect}
        <InlineStack gap="200">
          <TextField
            label="From"
            labelHidden
            type={inputType as any}
            value={a}
            onChange={(v) => set({ value: [v, b] })}
            autoComplete="off"
            placeholder="From"
          />
          <TextField
            label="To"
            labelHidden
            type={inputType as any}
            value={b}
            onChange={(v) => set({ value: [a, v] })}
            autoComplete="off"
            placeholder="To"
          />
        </InlineStack>
      </BlockStack>
    );
  }

  // BOOLEAN
  if (def.widget === "boolean") {
    return (
      <BlockStack gap="200">
        {opSelect /* usually EQ only */}
        <Select
          label="Value"
          labelHidden
          options={[
            { label: "True", value: "true" },
            { label: "False", value: "false" },
          ]}
          value={String(value)}
          onChange={(v) => set({ value: v })}
        />
      </BlockStack>
    );
  }

  // ENUM select
  if (def.widget === "select") {
    return (
      <BlockStack gap="200">
        {opSelect}
        <Select
          label="Value"
          labelHidden
          options={(def.enumValues ?? []).map((x) => ({
            label: x.label,
            value: x.value,
          }))}
          value={String(value)}
          onChange={(v) => set({ value: v })}
        />
      </BlockStack>
    );
  }

  // DATE
  if (def.widget === "date") {
    return (
      <BlockStack gap="200">
        {opSelect}
        <TextField
          label="Date"
          labelHidden
          type="date"
          value={String(value ?? "")}
          onChange={(v) => set({ value: v })}
          autoComplete="off"
        />
      </BlockStack>
    );
  }

  // NUMBER
  if (def.widget === "number") {
    return (
      <BlockStack gap="200">
        {opSelect}
        <TextField
          label="Number"
          labelHidden
          type="number"
          value={String(value ?? "")}
          onChange={(v) => set({ value: v })}
          autoComplete="off"
        />
      </BlockStack>
    );
  }

  // TEXTAREA (Description)
  if (def.widget === "textarea") {
    return (
      <BlockStack gap="200">
        {opSelect}
        <TextField
          label="Value"
          labelHidden
          multiline={4}
          value={String(value ?? "")}
          onChange={(v) => set({ value: v })}
          autoComplete="off"
        />
      </BlockStack>
    );
  }

  // TEXT with suggestions (only for a few keys)
  const suggestionKeys = new Set<FilterKey>([
    "product.vendor",
    "product.productType",
    "product.tag",
    "product.title",
    "product.handle",
    "variant.sku",
    "variant.barcode",
  ]);

  if (def.widget === "text" && suggestionKeys.has(def.key)) {
    return (
      <SuggestText
        op={String(op)}
        ops={def.operators}
        value={String(value ?? "")}
        onOpChange={(v) => set({ op: v as FilterOperator })}
        onValueChange={(v) => set({ value: v })}
        fetchSuggestions={(q) => fetchSuggestions(def.key, q)}
      />
    );
  }

  // TEXT fallback
  return (
    <BlockStack gap="200">
      {opSelect}
      <TextField
        label="Value"
        labelHidden
        value={String(value ?? "")}
        onChange={(v) => set({ value: v })}
        autoComplete="off"
      />
    </BlockStack>
  );
}

function SuggestText(props: {
  op: string;
  ops: FilterOperator[];
  value: string;
  onOpChange: (v: string) => void;
  onValueChange: (v: string) => void;
  fetchSuggestions: (q: string) => Promise<string[]>;
}) {
  const { op, ops, value, onOpChange, onValueChange, fetchSuggestions } = props;

  const [options, setOptions] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    async function run() {
      const q = value.trim();
      if (q.length < 2) {
        setOptions([]);
        return;
      }
      setLoading(true);
      try {
        const vals = await fetchSuggestions(q);
        if (!alive) return;
        setOptions(vals || []);
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [value, fetchSuggestions]);

  return (
    <BlockStack gap="200">
      <Select
        label="Operator"
        labelHidden
        options={ops.map((o) => ({ label: OP_LABEL[o] ?? o, value: o }))}
        value={op}
        onChange={onOpChange}
      />

      <BlockStack gap="100">
        <TextField
          label="Value"
          labelHidden
          value={value}
          onChange={onValueChange}
          autoComplete="off"
          placeholder={loading ? "Loading…" : "Start typing…"}
        />

        {options.length > 0 && (
          <div
            style={{
              border: "1px solid var(--p-color-border-secondary)",
              borderRadius: 10,
              padding: 8,
              maxHeight: 220,
              overflowY: "auto",
              background: "var(--p-color-bg-surface)",
            }}
          >
            <BlockStack gap="100">
              {options.slice(0, 10).map((s) => (
                <Button
                  key={s}
                  variant="plain"
                  onClick={() => onValueChange(s)}
                >
                  {s}
                </Button>
              ))}
            </BlockStack>
          </div>
        )}
      </BlockStack>
    </BlockStack>
  );
}
