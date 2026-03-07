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

import type { UiFilterDef, FilterKey, FilterOperator } from "../lib/filters/uiRegistry";
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

type Props = {
  searchText: string;
  onSearchTextChange: (v: string) => void;
  draftFilters?: DraftFilter[];
  onDraftFiltersChange: (filters: DraftFilter[]) => void;
  onApplySearch: (nextSearch: string) => void;
  onResetSearch: () => void;
  loading?: boolean;
  fetchSuggestions: (key: string, q: string) => Promise<string[]>;
};

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
  return "";
}

function normalizeValueForStorage(def: UiFilterDef, op: FilterOperator, raw: any) {
  if (op === "BETWEEN") {
    const a = raw?.[0] ?? "";
    const b = raw?.[1] ?? "";
    return [a, b];
  }
  return raw;
}

function safeJsonParse(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function parseLooseArrayLikeString(input: string): string[] {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return [];

  const direct = safeJsonParse(trimmed);
  if (Array.isArray(direct)) {
    return direct.map((x) => String(x ?? "").trim()).filter(Boolean);
  }

  if (trimmed.startsWith('"[') && trimmed.endsWith(']"')) {
    const unwrapped = safeJsonParse(trimmed);
    if (typeof unwrapped === "string") {
      const parsed = safeJsonParse(unwrapped);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
      }
    }
  }

  return [];
}

function sanitizeTagLikeValue(raw: any, op: FilterOperator) {
  if (Array.isArray(raw)) {
    const clean = raw.map((x) => String(x ?? "").trim()).filter(Boolean);
    return op === "IN" ? clean : clean[0] ?? "";
  }

  const s = String(raw ?? "").trim();
  if (!s) return op === "IN" ? [] : "";

  const parsed = parseLooseArrayLikeString(s);
  if (parsed.length > 0) {
    return op === "IN" ? parsed : parsed[0] ?? "";
  }

  return op === "IN" ? [s] : s;
}

function normalizeCommittedValue(def: UiFilterDef, op: FilterOperator, raw: any) {
  const base = normalizeValueForStorage(def, op, raw);

  if (def.key === "product.tag") {
    return sanitizeTagLikeValue(base, op);
  }

  return base;
}

function formatValueLabelForDisplay(def: UiFilterDef, op: FilterOperator, value: any) {
  if (op === "IS_SET" || op === "IS_NOT_SET") return "";

  if (def.widget === "select") {
    const item = def.enumValues?.find((x) => x.value === value);
    return item?.label ?? String(value ?? "");
  }

  if (def.widget === "boolean") {
    return String(value) === "true" ? "True" : "False";
  }

  if (op === "BETWEEN") {
    const a = String(value?.[0] ?? "").trim();
    const b = String(value?.[1] ?? "").trim();
    return `${a || "…"} and ${b || "…"}`;
  }

  if (Array.isArray(value)) {
    return value.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  }

  return String(value ?? "");
}

function isEffectivelyEmpty(def: UiFilterDef, op: FilterOperator, value: any) {
  if (op === "IS_SET" || op === "IS_NOT_SET") return false;

  if (op === "BETWEEN") {
    const a = String(value?.[0] ?? "").trim();
    const b = String(value?.[1] ?? "").trim();
    return !a && !b;
  }

  if (Array.isArray(value)) {
    return value.map((x) => String(x ?? "").trim()).filter(Boolean).length === 0;
  }

  const v = String(value ?? "").trim();
  return v.length === 0;
}

function removeFilterByKey(filters: DraftFilter[], key: FilterKey) {
  return filters.filter((f) => f.key !== key);
}

export const ProductsFilterBar: React.FC<Props> = ({
  searchText,
  onSearchTextChange,
  draftFilters,
  onDraftFiltersChange,
  onApplySearch,
  onResetSearch,
  loading,
  fetchSuggestions,
}) => {
  const filtersArray: DraftFilter[] = Array.isArray(draftFilters) ? draftFilters : [];

  const [searchDraft, setSearchDraft] = React.useState<string>(searchText ?? "");

  React.useEffect(() => {
    setSearchDraft(searchText ?? "");
  }, [searchText]);

  const applied = (searchText ?? "").trim();
  const draft = (searchDraft ?? "").trim();
  const searchDirty = draft !== applied;

  const applySearch = () => {
    const nextSearch = draft;
    onSearchTextChange(nextSearch);
    onApplySearch(nextSearch);
  };

  const resetSearch = () => {
    setSearchDraft("");
    onSearchTextChange("");
    onResetSearch();
  };

  const applyFiltersNow = (next: DraftFilter[]) => {
    onDraftFiltersChange(Array.isArray(next) ? next : []);
  };

  const filters = UI_FILTERS.map((d) => ({
    key: d.key,
    label: d.label,
    filter: (
      <FilterControl
        def={d}
        draftFilters={filtersArray}
        onApplyFilters={applyFiltersNow}
        fetchSuggestions={fetchSuggestions}
      />
    ),
    shortcut: false,
  }));

  const appliedFilters = buildAppliedFilters(filtersArray, applyFiltersNow);

  return (
    <Box padding="400">
      <BlockStack gap="300">
        <InlineStack gap="200" align="space-between" blockAlign="center">
          <div style={{ flex: 1 }}>
            <Filters
              queryValue={searchDraft}
              queryPlaceholder="Search title / vendor / handle / tag ..."
              onQueryChange={setSearchDraft}
              onQueryClear={() => setSearchDraft("")}
              filters={filters}
              appliedFilters={appliedFilters}
              onClearAll={() => applyFiltersNow([])}
            />
          </div>

          <InlineStack gap="200" blockAlign="center">
            <Button
              onClick={resetSearch}
              disabled={Boolean(loading) || (!applied && !draft)}
            >
              Reset
            </Button>

            <Button
              variant="primary"
              onClick={applySearch}
              loading={Boolean(loading)}
              disabled={Boolean(loading) || !searchDirty}
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
  onApplyFilters: (next: DraftFilter[]) => void,
) {
  const applied: { key: string; label: string; onRemove: () => void }[] = [];

  for (const f of draftFilters) {
    const d = defFor(f.key);
    if (isEffectivelyEmpty(d, f.op, f.value)) continue;

    const opLabel = OP_LABEL[String(f.op)] ?? String(f.op).toLowerCase();
    const valueLabel = formatValueLabelForDisplay(d, f.op, f.value);

    const label =
      f.op === "IS_SET"
        ? `${d.label} is set`
        : f.op === "IS_NOT_SET"
        ? `${d.label} is not set`
        : `${d.label} ${opLabel} ${valueLabel}`.trim();

    applied.push({
      key: f.key,
      label,
      onRemove: () => onApplyFilters(removeFilterByKey(draftFilters, f.key)),
    });
  }

  return applied;
}

function FilterControl(props: {
  def: UiFilterDef;
  draftFilters: DraftFilter[];
  onApplyFilters: (next: DraftFilter[]) => void;
  fetchSuggestions: (key: string, q: string) => Promise<string[]>;
}) {
  const { def, draftFilters, onApplyFilters, fetchSuggestions } = props;

  const existing = draftFilters.find((f) => f.key === def.key);

  const initialOp: FilterOperator = (existing?.op ?? def.operators[0]) as FilterOperator;
  const initialValue =
    existing?.value ?? (initialOp === "BETWEEN" ? ["", ""] : defaultValueFor(def));

  const [op, setOp] = React.useState<FilterOperator>(initialOp);
  const [value, setValue] = React.useState<any>(initialValue);

  React.useEffect(() => {
    setOp(initialOp);
    setValue(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.key, existing?.id]);

  const candidate: DraftFilter = {
    id: existing?.id ?? uid(),
    key: def.key,
    op,
    value: normalizeCommittedValue(def, op, value),
  };

  const commitDisabled = isEffectivelyEmpty(def, candidate.op, candidate.value);

  const commit = () => {
    const idx = draftFilters.findIndex((f) => f.key === candidate.key);
    const next =
      idx === -1
        ? [...draftFilters, candidate]
        : draftFilters.map((f, i) => (i === idx ? candidate : f));
    onApplyFilters(next);
  };

  const clear = () => {
    if (!existing) return;
    onApplyFilters(removeFilterByKey(draftFilters, def.key));
  };

  if (def.widget === "select" && def.key === "product.status") {
    const choices = (def.enumValues ?? []).map((x) => ({ label: x.label, value: x.value }));
    return (
      <BlockStack gap="200">
        <ChoiceList
          title={def.label}
          titleHidden
          choices={choices}
          selected={[String(value ?? "")]}
          onChange={(sel) => {
            const v = sel?.[0] ?? def.enumValues?.[0]?.value ?? "";
            setOp("EQ");
            setValue(v);
          }}
        />
        <InlineStack gap="200" align="end">
          <Button onClick={clear} disabled={!existing}>
            Clear
          </Button>
          <Button variant="primary" onClick={commit} disabled={commitDisabled}>
            Add filter
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

  const opSelect =
    def.operators.length > 1 ? (
      <Select
        label="Operator"
        labelHidden
        options={def.operators.map((o) => ({ label: OP_LABEL[o] ?? o, value: o }))}
        value={String(op)}
        onChange={(v) => setOp(v as FilterOperator)}
      />
    ) : null;

  if (op === "IS_SET" || op === "IS_NOT_SET") {
    return (
      <BlockStack gap="200">
        {opSelect}
        <InlineStack gap="200" blockAlign="center">
          <Badge tone="info">{op === "IS_SET" ? "Set" : "Not set"}</Badge>
        </InlineStack>
        <InlineStack gap="200" align="end">
          <Button onClick={clear} disabled={!existing}>
            Clear
          </Button>
          <Button variant="primary" onClick={commit} disabled={commitDisabled}>
            Add filter
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

  if (op === "BETWEEN") {
    const a = String(value?.[0] ?? "");
    const b = String(value?.[1] ?? "");
    const inputType = def.widget === "date" ? "date" : def.widget === "number" ? "number" : "text";

    return (
      <BlockStack gap="200">
        {opSelect}
        <InlineStack gap="200">
          <TextField
            label="From"
            labelHidden
            type={inputType as any}
            value={a}
            onChange={(v) => setValue([v, b])}
            autoComplete="off"
            placeholder="From"
          />
          <TextField
            label="To"
            labelHidden
            type={inputType as any}
            value={b}
            onChange={(v) => setValue([a, v])}
            autoComplete="off"
            placeholder="To"
          />
        </InlineStack>
        <InlineStack gap="200" align="end">
          <Button onClick={clear} disabled={!existing}>
            Clear
          </Button>
          <Button variant="primary" onClick={commit} disabled={commitDisabled}>
            Add filter
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

  if (def.widget === "boolean") {
    return (
      <BlockStack gap="200">
        {opSelect}
        <Select
          label="Value"
          labelHidden
          options={[
            { label: "True", value: "true" },
            { label: "False", value: "false" },
          ]}
          value={String(value ?? "true")}
          onChange={(v) => setValue(v)}
        />
        <InlineStack gap="200" align="end">
          <Button onClick={clear} disabled={!existing}>
            Clear
          </Button>
          <Button variant="primary" onClick={commit} disabled={commitDisabled}>
            Add filter
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

  if (def.widget === "select") {
    return (
      <BlockStack gap="200">
        {opSelect}
        <Select
          label="Value"
          labelHidden
          options={(def.enumValues ?? []).map((x) => ({ label: x.label, value: x.value }))}
          value={String(value ?? "")}
          onChange={(v) => setValue(v)}
        />
        <InlineStack gap="200" align="end">
          <Button onClick={clear} disabled={!existing}>
            Clear
          </Button>
          <Button variant="primary" onClick={commit} disabled={commitDisabled}>
            Add filter
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

  if (def.widget === "date") {
    return (
      <BlockStack gap="200">
        {opSelect}
        <TextField
          label="Date"
          labelHidden
          type="date"
          value={String(value ?? "")}
          onChange={(v) => setValue(v)}
          autoComplete="off"
        />
        <InlineStack gap="200" align="end">
          <Button onClick={clear} disabled={!existing}>
            Clear
          </Button>
          <Button variant="primary" onClick={commit} disabled={commitDisabled}>
            Add filter
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

  if (def.widget === "number") {
    return (
      <BlockStack gap="200">
        {opSelect}
        <TextField
          label="Number"
          labelHidden
          type="number"
          value={String(value ?? "")}
          onChange={(v) => setValue(v)}
          autoComplete="off"
        />
        <InlineStack gap="200" align="end">
          <Button onClick={clear} disabled={!existing}>
            Clear
          </Button>
          <Button variant="primary" onClick={commit} disabled={commitDisabled}>
            Add filter
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

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
        filterKey={def.key}
        op={op}
        ops={def.operators}
        value={String(Array.isArray(value) ? value[0] ?? "" : value ?? "")}
        onOpChange={(v) => setOp(v as FilterOperator)}
        onValueChange={(v) => setValue(v)}
        fetchSuggestions={(q) => fetchSuggestions(def.key, q)}
        onClear={clear}
        onCommit={commit}
        commitDisabled={commitDisabled}
        hasExisting={Boolean(existing)}
      />
    );
  }

  if (def.widget === "textarea") {
    return (
      <BlockStack gap="200">
        {opSelect}
        <TextField
          label="Value"
          labelHidden
          multiline={4}
          value={String(value ?? "")}
          onChange={(v) => setValue(v)}
          autoComplete="off"
        />
        <InlineStack gap="200" align="end">
          <Button onClick={clear} disabled={!existing}>
            Clear
          </Button>
          <Button variant="primary" onClick={commit} disabled={commitDisabled}>
            Add filter
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

  return (
    <BlockStack gap="200">
      {opSelect}
      <TextField
        label="Value"
        labelHidden
        value={String(value ?? "")}
        onChange={(v) => setValue(v)}
        autoComplete="off"
      />
      <InlineStack gap="200" align="end">
        <Button onClick={clear} disabled={!existing}>
          Clear
        </Button>
        <Button variant="primary" onClick={commit} disabled={commitDisabled}>
          Add filter
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

function SuggestText(props: {
  filterKey: FilterKey;
  op: FilterOperator;
  ops: FilterOperator[];
  value: string;
  onOpChange: (v: string) => void;
  onValueChange: (v: string) => void;
  fetchSuggestions: (q: string) => Promise<string[]>;
  onClear: () => void;
  onCommit: () => void;
  commitDisabled: boolean;
  hasExisting: boolean;
}) {
  const {
    filterKey,
    op,
    ops,
    value,
    onOpChange,
    onValueChange,
    fetchSuggestions,
    onClear,
    onCommit,
    commitDisabled,
    hasExisting,
  } = props;

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
        value={String(op)}
        onChange={onOpChange}
      />

      <TextField
        label="Value"
        labelHidden
        value={value}
        onChange={(next) => {
          let cleaned = next;

          if (filterKey === "product.tag") {
            const parsed = parseLooseArrayLikeString(cleaned);
            if (parsed.length > 0) {
              cleaned = parsed[0] ?? "";
            }
          }

          onValueChange(cleaned);
        }}
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
              <Button key={s} variant="plain" onClick={() => onValueChange(s)}>
                {s}
              </Button>
            ))}
          </BlockStack>
        </div>
      )}

      <InlineStack gap="200" align="end">
        <Button onClick={onClear} disabled={!hasExisting}>
          Clear
        </Button>
        <Button variant="primary" onClick={onCommit} disabled={commitDisabled}>
          Add filter
        </Button>
      </InlineStack>
    </BlockStack>
  );
}