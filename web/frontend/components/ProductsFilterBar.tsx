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
  RangeSlider,
  Select,
  Tag,
} from "@shopify/polaris";

export type DraftFilter =
  | {
      id: string;
      key:
        | "product.vendor"
        | "product.productType"
        | "product.tag"
        | "product.title"
        | "product.handle"
        | "product.status"
        | "product.updatedAt"
        | "product.createdAt"
        | "product.publishedAt"
        | "product.variantCount"
        | "product.inventoryQuantity"
        | "variant.sku"
        | "variant.barcode"
        | "variant.inventoryQuantity"
        | "variant.price"
        | "variant.compareAtPrice"
        | "variant.cost"
        | "variant.weight";
      op: "CONTAINS" | "EQ" | "GTE" | "LTE";
      value: any;
    }
  | {
      id: string;
      key: "product.status";
      op: "EQ";
      value: "ACTIVE" | "DRAFT" | "ARCHIVED";
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

type FilterDef = {
  key: DraftFilter["key"];
  label: string;
  kind: "string" | "number" | "date" | "enum";
  defaultOp: DraftFilter["op"];
  ops: DraftFilter["op"][];
  suggestion?: boolean;
  enumValues?: { label: string; value: string }[];
};

const FILTER_DEFS: FilterDef[] = [
  // Product fields
  { key: "product.title", label: "Title", kind: "string", defaultOp: "CONTAINS", ops: ["CONTAINS", "EQ"], suggestion: true },
  { key: "product.vendor", label: "Vendor", kind: "string", defaultOp: "CONTAINS", ops: ["CONTAINS", "EQ"], suggestion: true },
  { key: "product.productType", label: "Product type (Custom)", kind: "string", defaultOp: "CONTAINS", ops: ["CONTAINS", "EQ"], suggestion: true },
  { key: "product.handle", label: "Handle (URL)", kind: "string", defaultOp: "CONTAINS", ops: ["CONTAINS", "EQ"], suggestion: true },
  { key: "product.tag", label: "Tag", kind: "string", defaultOp: "CONTAINS", ops: ["CONTAINS", "EQ"], suggestion: true },

  {
    key: "product.status",
    label: "Status",
    kind: "enum",
    defaultOp: "EQ",
    ops: ["EQ"],
    enumValues: [
      { label: "Active", value: "ACTIVE" },
      { label: "Draft", value: "DRAFT" },
      { label: "Archived", value: "ARCHIVED" },
    ],
  },

  { key: "product.createdAt", label: "Date Created", kind: "date", defaultOp: "GTE", ops: ["GTE", "LTE"] },
  { key: "product.publishedAt", label: "Date Published", kind: "date", defaultOp: "GTE", ops: ["GTE", "LTE"] },
  { key: "product.updatedAt", label: "Date Updated", kind: "date", defaultOp: "GTE", ops: ["GTE", "LTE"] },

  { key: "product.variantCount", label: "Variant Count", kind: "number", defaultOp: "GTE", ops: ["GTE", "LTE", "EQ"] },
  { key: "product.inventoryQuantity", label: "Inventory Quantity", kind: "number", defaultOp: "GTE", ops: ["GTE", "LTE", "EQ"] },

  // Variant fields
  { key: "variant.sku", label: "SKU", kind: "string", defaultOp: "CONTAINS", ops: ["CONTAINS", "EQ"], suggestion: true },
  { key: "variant.barcode", label: "Barcode", kind: "string", defaultOp: "CONTAINS", ops: ["CONTAINS", "EQ"], suggestion: true },

  { key: "variant.inventoryQuantity", label: "Variant Inventory Quantity", kind: "number", defaultOp: "GTE", ops: ["GTE", "LTE", "EQ"] },
  { key: "variant.price", label: "Price", kind: "number", defaultOp: "GTE", ops: ["GTE", "LTE", "EQ"] },
  { key: "variant.compareAtPrice", label: "Compare-at Price", kind: "number", defaultOp: "GTE", ops: ["GTE", "LTE", "EQ"] },
  { key: "variant.cost", label: "Cost", kind: "number", defaultOp: "GTE", ops: ["GTE", "LTE", "EQ"] },
  { key: "variant.weight", label: "Weight", kind: "number", defaultOp: "GTE", ops: ["GTE", "LTE", "EQ"] },
];

function defFor(key: DraftFilter["key"]) {
  const d = FILTER_DEFS.find((x) => x.key === key);
  if (!d) throw new Error(`Unknown filter key: ${key}`);
  return d;
}

function setFilter(
  draftFilters: DraftFilter[],
  patch: DraftFilter,
): DraftFilter[] {
  const idx = draftFilters.findIndex((f) => f.key === patch.key);
  if (idx === -1) return [...draftFilters, patch];
  const next = [...draftFilters];
  next[idx] = { ...next[idx], ...patch } as any;
  return next;
}

function removeFilterByKey(draftFilters: DraftFilter[], key: DraftFilter["key"]) {
  return draftFilters.filter((f) => f.key !== key);
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
  // “Apply” should be enabled if there is anything to apply
  const hasAnyDraft =
    searchText.trim().length > 0 ||
    draftFilters.some((f) => {
      if (f.key === "product.status") return Boolean(f.value);
      return String(f.value ?? "").trim().length > 0;
    });

  // ---------- Search query input (top bar) ----------
  const queryValue = searchText;
  const onQueryChange = (v: string) => onSearchTextChange(v);
  const onQueryClear = () => onSearchTextChange("");

  // ---------- Build controls for “Add filter” dropdown ----------
  const filters = FILTER_DEFS.map((d) => {
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

  // ---------- Applied filter “pills” ----------
  const appliedFilters = buildAppliedFilters(draftFilters, onDraftFiltersChange);

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
              onClearAll={() => {
                onQueryClear();
                onDraftFiltersChange([]);
              }}
            />
          </div>

          <InlineStack gap="200" blockAlign="center">
            <Button
              onClick={onReset}
              disabled={Boolean(loading) || (!hasAnyDraft && draftFilters.length === 0)}
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
  const applied = [];

  for (const f of draftFilters) {
    const d = defFor(f.key);

    let labelValue = "";
    if (d.kind === "enum") {
      const item = d.enumValues?.find((x) => x.value === f.value);
      labelValue = item?.label ?? String(f.value ?? "");
    } else if (d.kind === "date") {
      labelValue = String(f.value ?? "");
    } else {
      labelValue = String(f.value ?? "");
    }

    if (!labelValue) continue;

    applied.push({
      key: f.key,
      label: `${d.label} ${String(f.op).toLowerCase()} ${labelValue}`,
      onRemove: () => onDraftFiltersChange(removeFilterByKey(draftFilters, f.key)),
    });
  }

  return applied;
}

function FilterControl(props: {
  def: FilterDef;
  draftFilters: DraftFilter[];
  onDraftFiltersChange: (filters: DraftFilter[]) => void;
  fetchSuggestions: (key: string, q: string) => Promise<string[]>;
}) {
  const { def, draftFilters, onDraftFiltersChange, fetchSuggestions } = props;

  const current = draftFilters.find((f) => f.key === def.key) as DraftFilter | undefined;

  const op = current?.op ?? def.defaultOp;
  const value = current?.value ?? (def.kind === "enum" ? (def.enumValues?.[0]?.value ?? "") : "");

  const set = (patch: Partial<DraftFilter>) => {
    const next: DraftFilter = {
      id: current?.id ?? uid(),
      key: def.key,
      op: (patch.op ?? op) as any,
      value: patch.value ?? value,
    } as any;
    onDraftFiltersChange(setFilter(draftFilters, next));
  };

  // STATUS: single-select radios (exactly like Shopify Admin)
  if (def.key === "product.status") {
    const choices = (def.enumValues ?? []).map((x) => ({ label: x.label, value: x.value }));
    return (
      <ChoiceList
        title="Status"
        titleHidden
        choices={choices}
        selected={[String(value)]}
        onChange={(sel) => {
          const v = sel?.[0] ?? "ACTIVE";
          set({ op: "EQ", value: v });
        }}
      />
    );
  }

  // DATE: operator + date input
  if (def.kind === "date") {
    return (
      <BlockStack gap="200">
        <Select
          label="Operator"
          labelHidden
          options={def.ops.map((o) => ({ label: o, value: o }))}
          value={String(op)}
          onChange={(v) => set({ op: v as any })}
        />
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

  // NUMBER: operator + numeric field (simple)
  if (def.kind === "number") {
    return (
      <BlockStack gap="200">
        <Select
          label="Operator"
          labelHidden
          options={def.ops.map((o) => ({ label: o, value: o }))}
          value={String(op)}
          onChange={(v) => set({ op: v as any })}
        />
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

  // STRING w/ typeahead suggestions
  if (def.kind === "string" && def.suggestion) {
    return (
      <SuggestText
        label={def.label}
        op={String(op)}
        ops={def.ops}
        value={String(value ?? "")}
        onOpChange={(v) => set({ op: v as any })}
        onValueChange={(v) => set({ value: v })}
        fetchSuggestions={(q) => fetchSuggestions(def.key, q)}
      />
    );
  }

  // STRING without suggestions
  return (
    <BlockStack gap="200">
      <Select
        label="Operator"
        labelHidden
        options={def.ops.map((o) => ({ label: o, value: o }))}
        value={String(op)}
        onChange={(v) => set({ op: v as any })}
      />
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
  label: string;
  op: string;
  ops: string[];
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
        options={ops.map((o) => ({ label: o, value: o }))}
        value={op}
        onChange={onOpChange}
      />

      {/* This matches your screenshot behavior: type + click suggestion */}
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
              borderRadius: 8,
              padding: 8,
              maxHeight: 200,
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
