// FILE: web/frontend/lib/filters/frontendRegistry.ts

import type {
  FilterKey,
  FilterScope,
  FilterOperator,
  FilterWidget,
  ValueKind,
} from "../../../lib/filters/registry";
import { FILTERS, type FrontendFilterConfig } from "../../config/FILTERS";

/**
 * Pre-index filters by key for fast lookups and type safety.
 */
const FILTERS_BY_KEY: Record<FilterKey, FrontendFilterConfig> = (() => {
  const map = {} as Record<FilterKey, FrontendFilterConfig>;
  for (const def of FILTERS) {
    map[def.key] = def;
  }
  return map;
})();

/* ======================================================================= */
/* Public API                                                              */
/* ======================================================================= */

/**
 * Get the full frontend config for a filter key.
 * Throws if the key is unknown (should only happen if codegen is out of date).
 */
export function getFilterConfig(key: FilterKey): FrontendFilterConfig {
  const def = FILTERS_BY_KEY[key];
  if (!def) {
    throw new Error(`[frontendRegistry] Unknown filter key: "${key}". Is FILTERS.ts up to date?`);
  }
  return def;
}

/**
 * List all filters, optionally scoped to "product" or "variant".
 * Useful for building the dropdown of available filters in the UI.
 */
export function listFilters(scope?: FilterScope): FrontendFilterConfig[] {
  if (!scope) return FILTERS;
  return FILTERS.filter((f) => f.scope === scope);
}

/**
 * Convenience accessor: allowed operators for a filter key.
 */
export function getAllowedOperators(key: FilterKey): FilterOperator[] {
  return getFilterConfig(key).operators;
}

/**
 * Convenience accessor: widget configuration for a filter key.
 */
export function getWidgetConfig(key: FilterKey): {
  widget: FilterWidget;
  placeholder?: string;
  multiSelect?: boolean;
} {
  const { widget, placeholder, multiSelect } = getFilterConfig(key);
  return { widget, placeholder, multiSelect };
}

/**
 * Convenience accessor: enum options for a filter key (if any).
 */
export function getEnumOptions(
  key: FilterKey,
): { value: string; label: string }[] | undefined {
  return getFilterConfig(key).enumValues;
}

/**
 * Convenience accessor: value kind for a filter key.
 * Useful if you want to change UI behavior based on scalar type.
 */
export function getValueKind(key: FilterKey): ValueKind {
  return getFilterConfig(key).valueKind;
}

/**
 * Simple grouping helper for menus: split by scope.
 */
export function groupFiltersByScope(): {
  product: FrontendFilterConfig[];
  variant: FrontendFilterConfig[];
} {
  const product: FrontendFilterConfig[] = [];
  const variant: FrontendFilterConfig[] = [];

  for (const def of FILTERS) {
    if (def.scope === "product") product.push(def);
    else if (def.scope === "variant") variant.push(def);
  }

  return { product, variant };
}
