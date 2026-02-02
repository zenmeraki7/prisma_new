// FILE: web/hooks/useFilterBuilder.ts

import { useCallback, useMemo, useState } from "react";
import {
  FILTER_REGISTRY,
  type FilterKey,
  type FilterOperator,
  type FilterDefinition,
} from "../lib/filters/registry";

// This matches what the planner expects at the boundary
export interface ApiFilterPayload {
  key: FilterKey;
  operator: FilterOperator;
  value: any;
}

export interface ActiveFilter {
  id: string;
  key: FilterKey;
  operator: FilterOperator;
  value: any;
}

interface UseFilterBuilderResult {
  activeFilters: ActiveFilter[];
  availableFilters: { label: string; value: string }[];
  addFilter: (key: FilterKey) => void;
  updateFilter: (id: string, updates: Partial<ActiveFilter>) => void;
  removeFilter: (id: string) => void;
  getApiPayload: () => ApiFilterPayload[];
  getDefinition: (key: FilterKey) => FilterDefinition;
}

/**
 * Hook that manages filter UI state, sourced from FILTER_REGISTRY.
 *
 * - No filter metadata is hardcoded in the UI.
 * - All labels/operators/widgets come directly from the registry.
 */
export function useFilterBuilder(): UseFilterBuilderResult {
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  // Build options for "Add filter" <Select>
  const availableFilters = useMemo(() => {
    const entries = Object.entries(FILTER_REGISTRY) as [
      FilterKey,
      FilterDefinition,
    ][];

    return entries.map(([key, def]) => ({
      label: def.label,
      value: key,
    }));
  }, []);

  const getDefinition = useCallback((key: FilterKey): FilterDefinition => {
    const def = FILTER_REGISTRY[key];
    if (!def) {
      throw new Error(`Unknown filter key: ${key}`);
    }
    return def;
  }, []);

  const addFilter = useCallback(
    (key: FilterKey) => {
      const def = getDefinition(key);
      const defaultOperator = def.operators[0] as FilterOperator | undefined;

      const newFilter: ActiveFilter = {
        id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        key,
        operator: defaultOperator ?? "EQ",
        value: getDefaultValueForFilter(def),
      };

      setActiveFilters((prev) => [...prev, newFilter]);
    },
    [getDefinition],
  );

  const updateFilter = useCallback(
    (id: string, updates: Partial<ActiveFilter>) => {
      setActiveFilters((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...updates } : f)),
      );
    },
    [],
  );

  const removeFilter = useCallback((id: string) => {
    setActiveFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const getApiPayload = useCallback((): ApiFilterPayload[] => {
    return activeFilters.map((f) => ({
      key: f.key,
      operator: f.operator,
      value: normalizeFilterValueForApi(f),
    }));
  }, [activeFilters]);

  return {
    activeFilters,
    availableFilters,
    addFilter,
    updateFilter,
    removeFilter,
    getApiPayload,
    getDefinition,
  };
}

// --- Helpers ---

function getDefaultValueForFilter(def: FilterDefinition): any {
  const widgetType = def.ui?.widget || "text";

  if (widgetType === "boolean-toggle") return true;
  if (widgetType === "number") return "";
  if (widgetType === "date") return "";
  if (def.enumValues && def.enumValues.length > 0) {
    return def.enumValues[0].value;
  }
  return "";
}

/**
 * Adjusts filter.value into the shape your backend expects.
 * For now this is mostly identity, with small tweaks for booleans/numbers.
 */
function normalizeFilterValueForApi(filter: ActiveFilter): any {
  const def = FILTER_REGISTRY[filter.key];
  const raw = filter.value;

  // Boolean toggle
  if (def.ui?.widget === "boolean-toggle") {
    return Boolean(raw);
  }

  // Numbers (simple single-value case)
  if (def.ui?.widget === "number") {
    if (raw === "" || raw == null) return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }

  // TODO: handle BETWEEN / range UI later if you add it

  return raw;
}
