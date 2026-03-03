// FILE: web/frontend/hooks/useProductFilters.ts
//
// All data-fetching hooks for the product filter surface.
// These are plain React hooks — no Apollo, no urql.
// They call getGraphQLClient() which must be initialised at app startup.
//
// Hooks exported:
//   useProductsByFilter    — filteredProducts query
//   useVariantsByFilter    — filteredVariants query
//   usePresetProducts      — presetProducts query
//   usePresetVariants      — presetVariants query
//   useFilterRegistry      — filterRegistry + sortDefinitions + presetDefinitions
//   useFilterValidation    — validateFilterGroup (lazy, on demand)

import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

import { getGraphQLClient } from "../lib/graphqlClient";

import {
  FILTERED_PRODUCTS_QUERY,
  FILTERED_VARIANTS_QUERY,
  PRESET_PRODUCTS_QUERY,
  PRESET_VARIANTS_QUERY,
  VALIDATE_FILTER_QUERY,
  FILTER_REGISTRY_QUERY,
} from "../../graphql/productFilter.queries";

import type {
  FilterGroupInput,
  ProductConnection,
  VariantConnection,
  FilterRegistryPayload,
  SortDefinition,
  PresetDefinition,
  FilterValidationResult,
  ProductRow,
  VariantRow,
  PageInfo,
  UseProductsOptions,
  UseVariantsOptions,
  UsePresetProductsOptions,
  UsePresetVariantsOptions,
  UseProductsResult,
  UseVariantsResult,
  UseFilterRegistryResult,
  UseFilterValidationResult,
} from "../../types/filter.types";

// ─────────────────────────────────────────────────────────────────────────────
// Internal types — GraphQL response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface FilteredProductsData {
  filteredProducts: ProductConnection;
}

interface FilteredVariantsData {
  filteredVariants: VariantConnection;
}

interface PresetProductsData {
  presetProducts: ProductConnection;
}

interface PresetVariantsData {
  presetVariants: VariantConnection;
}

interface ValidateFilterData {
  validateFilterGroup: FilterValidationResult;
}

interface FilterRegistryData {
  filterRegistry:    FilterRegistryPayload;
  sortDefinitions:   ReadonlyArray<SortDefinition>;
  presetDefinitions: ReadonlyArray<PresetDefinition>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stable JSON serialisation for use as useEffect dependency.
 * Returns a string that changes only when the object's shape/values change.
 * Using JSON.stringify directly in deps arrays is safe here because these
 * objects are plain data (no Date instances, no undefined, no circular refs).
 */
function stableKey(value: unknown): string {
  return JSON.stringify(value) ?? "";
}

/**
 * Normalise an unknown thrown value into an Error instance.
 */
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/**
 * Build the pagination input from hook options.
 */
function buildPagination(page?: number, pageSize?: number) {
  if (page == null && pageSize == null) return undefined;
  return {
    page:     page     ?? 1,
    pageSize: pageSize ?? 50,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useProductsByFilter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated, filtered list of products.
 *
 * @example
 * const { items, pageInfo, loading, error, refetch } = useProductsByFilter({
 *   filter: {
 *     operator: "AND",
 *     conditions: [
 *       { key: "PRODUCT_STATUS", operator: "EQ", value: "active" },
 *       { key: "PRODUCT_VENDOR",  operator: "CONTAINS", value: "Nike" },
 *     ],
 *   },
 *   sort:      "TITLE",
 *   direction: "ASC",
 *   page:      1,
 *   pageSize:  50,
 * });
 */
export function useProductsByFilter(options: UseProductsOptions = {}): UseProductsResult {
  const {
    filter    = null,
    sort      = "CREATED_AT",
    direction = "DESC",
    page      = 1,
    pageSize  = 50,
    skip      = false,
  } = options;

  const [items,    setItems]    = useState<ReadonlyArray<ProductRow>>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loading,  setLoading]  = useState(!skip);
  const [error,    setError]    = useState<Error | null>(null);

  // Stable ref for abort controller so we can cancel in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  const filterKey = stableKey({ filter, sort, direction, page, pageSize });

  const fetchData = useCallback(async () => {
    if (skip) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const client = getGraphQLClient();
      const data = await client.query<FilteredProductsData>(
        FILTERED_PRODUCTS_QUERY,
        {
          filter,
          sort,
          direction,
          pagination: buildPagination(page, pageSize),
        },
      );

      setItems(data.filteredProducts.items);
      setPageInfo(data.filteredProducts.pageInfo);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(toError(err));
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, skip]);

  useEffect(() => {
    void fetchData();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return { items, pageInfo, loading, error, refetch };
}

// ─────────────────────────────────────────────────────────────────────────────
// useVariantsByFilter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated, filtered list of variants (variant-first mode).
 * Each row includes parent product rollup fields.
 *
 * @example
 * const { items, pageInfo, loading } = useVariantsByFilter({
 *   filter: {
 *     operator: "AND",
 *     conditions: [
 *       { key: "VARIANT_PRICE", operator: "BETWEEN", value: [10, 50] },
 *     ],
 *   },
 *   sort: "VARIANT_PRICE",
 * });
 */
export function useVariantsByFilter(options: UseVariantsOptions = {}): UseVariantsResult {
  const {
    filter    = null,
    sort      = "CREATED_AT",
    direction = "DESC",
    page      = 1,
    pageSize  = 50,
    skip      = false,
  } = options;

  const [items,    setItems]    = useState<ReadonlyArray<VariantRow>>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loading,  setLoading]  = useState(!skip);
  const [error,    setError]    = useState<Error | null>(null);

  const abortRef  = useRef<AbortController | null>(null);
  const filterKey = stableKey({ filter, sort, direction, page, pageSize });

  const fetchData = useCallback(async () => {
    if (skip) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const client = getGraphQLClient();
      const data = await client.query<FilteredVariantsData>(
        FILTERED_VARIANTS_QUERY,
        {
          filter,
          sort,
          direction,
          pagination: buildPagination(page, pageSize),
        },
      );

      setItems(data.filteredVariants.items);
      setPageInfo(data.filteredVariants.pageInfo);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(toError(err));
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, skip]);

  useEffect(() => {
    void fetchData();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return { items, pageInfo, loading, error, refetch };
}

// ─────────────────────────────────────────────────────────────────────────────
// usePresetProducts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch products matching a named preset.
 *
 * @example
 * const { items, loading } = usePresetProducts({
 *   preset:    "OUT_OF_STOCK",
 *   pageSize:  100,
 * });
 */
export function usePresetProducts(options: UsePresetProductsOptions): UseProductsResult {
  const {
    preset,
    threshold,
    page     = 1,
    pageSize = 50,
    skip     = false,
  } = options;

  const [items,    setItems]    = useState<ReadonlyArray<ProductRow>>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loading,  setLoading]  = useState(!skip);
  const [error,    setError]    = useState<Error | null>(null);

  const abortRef  = useRef<AbortController | null>(null);
  const optionKey = stableKey({ preset, threshold, page, pageSize });

  const fetchData = useCallback(async () => {
    if (skip) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const client = getGraphQLClient();
      const data = await client.query<PresetProductsData>(
        PRESET_PRODUCTS_QUERY,
        {
          preset,
          threshold,
          pagination: buildPagination(page, pageSize),
        },
      );

      setItems(data.presetProducts.items);
      setPageInfo(data.presetProducts.pageInfo);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(toError(err));
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionKey, skip]);

  useEffect(() => {
    void fetchData();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return { items, pageInfo, loading, error, refetch };
}

// ─────────────────────────────────────────────────────────────────────────────
// usePresetVariants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch variants matching a named preset.
 *
 * @example
 * const { items, loading } = usePresetVariants({ preset: "NO_SKU" });
 */
export function usePresetVariants(options: UsePresetVariantsOptions): UseVariantsResult {
  const {
    preset,
    threshold,
    page     = 1,
    pageSize = 50,
    skip     = false,
  } = options;

  const [items,    setItems]    = useState<ReadonlyArray<VariantRow>>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loading,  setLoading]  = useState(!skip);
  const [error,    setError]    = useState<Error | null>(null);

  const abortRef  = useRef<AbortController | null>(null);
  const optionKey = stableKey({ preset, threshold, page, pageSize });

  const fetchData = useCallback(async () => {
    if (skip) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const client = getGraphQLClient();
      const data = await client.query<PresetVariantsData>(
        PRESET_VARIANTS_QUERY,
        {
          preset,
          threshold,
          pagination: buildPagination(page, pageSize),
        },
      );

      setItems(data.presetVariants.items);
      setPageInfo(data.presetVariants.pageInfo);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(toError(err));
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionKey, skip]);

  useEffect(() => {
    void fetchData();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return { items, pageInfo, loading, error, refetch };
}

// ─────────────────────────────────────────────────────────────────────────────
// useFilterRegistry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the full filter registry, sort definitions, and preset definitions.
 * Cache-friendly — returns the same object reference until data changes.
 *
 * Typically called once at app startup or in the filter-builder component.
 *
 * @example
 * const { registry, sortDefs, presetDefs, loading } = useFilterRegistry();
 * // registry.productFilters → FilterDefinition[]
 * // registry.variantFilters → FilterDefinition[]
 */
export function useFilterRegistry(): UseFilterRegistryResult {
  const [registry,   setRegistry]   = useState<FilterRegistryPayload | null>(null);
  const [sortDefs,   setSortDefs]   = useState<ReadonlyArray<SortDefinition>>([]);
  const [presetDefs, setPresetDefs] = useState<ReadonlyArray<PresetDefinition>>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getGraphQLClient()
      .query<FilterRegistryData>(FILTER_REGISTRY_QUERY)
      .then((data) => {
        if (!cancelled) {
          setRegistry(data.filterRegistry);
          setSortDefs(data.sortDefinitions);
          setPresetDefs(data.presetDefinitions);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []); // intentionally empty — registry never changes at runtime

  return { registry, sortDefs, presetDefs, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// useFilterValidation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lazy filter validation — call validate() from your filter-builder UI to
 * get per-condition error messages from the server without triggering a query.
 *
 * @example
 * const { validate, validating, lastResult } = useFilterValidation();
 *
 * const handleSubmit = async () => {
 *   const result = await validate(filterGroup);
 *   if (!result.valid) {
 *     // show result.errors in UI
 *   }
 * };
 */
export function useFilterValidation(): UseFilterValidationResult {
  const [validating, setValidating] = useState(false);
  const [lastResult, setLastResult] = useState<FilterValidationResult | null>(null);

  const validate = useCallback(
    async (filter: FilterGroupInput): Promise<FilterValidationResult> => {
      setValidating(true);
      try {
        const client = getGraphQLClient();
        const data = await client.query<ValidateFilterData>(
          VALIDATE_FILTER_QUERY,
          { filter },
        );
        const result = data.validateFilterGroup;
        setLastResult(result);
        return result;
      } catch (err) {
        // Network / server error — return a synthetic validation failure
        const result: FilterValidationResult = {
          valid:  false,
          errors: [{ path: "root", message: toError(err).message }],
        };
        setLastResult(result);
        return result;
      } finally {
        setValidating(false);
      }
    },
    [],
  );

  return { validate, validating, lastResult };
}