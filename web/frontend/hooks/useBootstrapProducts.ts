import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGraphqlClient } from "../lib/graphqlClient";
import {
  BOOTSTRAP_PRODUCTS_QUERY,
  type BootstrapProductsResponse,
  type ProductLiteDto,
  type BootstrapStatusDto,
} from "../queries/bootstrapProducts";

type State = {
  loading: boolean;
  error?: string | null;
  products: ProductLiteDto[];
  status?: BootstrapStatusDto;
  nextCursor?: string | null;
};

const DEFAULT_PAGE_SIZE = 25;

function normalizeError(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  const anyErr = err as any;
  return anyErr?.message ?? String(err);
}

export function useBootstrapProducts() {
  const { query } = useGraphqlClient();

  const [state, setState] = useState<State>({
    loading: true,
    products: [],
    error: null,
  });

  const inFlightRef = useRef(false);
  const didInitRef = useRef(false);

  const fetchPage = useCallback(
    async (opts: { after?: string | null; append: boolean }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));

      try {
        const data = await query<BootstrapProductsResponse>(
          BOOTSTRAP_PRODUCTS_QUERY,
          {
            first: DEFAULT_PAGE_SIZE,
            after: opts.after ?? null,
          }
        );

        const payload = data.bootstrapProducts;

        setState((prev) => ({
          loading: false,
          error: null,
          status: payload.status,
          products: opts.append
            ? [...prev.products, ...payload.page.items]
            : payload.page.items,
          nextCursor: payload.page.nextCursor ?? null,
        }));
      } catch (e) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: normalizeError(e),
        }));
      } finally {
        inFlightRef.current = false;
      }
    },
    [query]
  );

  const loadInitial = useCallback(() => {
    fetchPage({ append: false });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (state.loading || !state.nextCursor) return;
    fetchPage({ after: state.nextCursor, append: true });
  }, [fetchPage, state.loading, state.nextCursor]);

  // ✅ StrictMode-safe initial load
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    loadInitial();
  }, [loadInitial]);

  const syncState = useMemo(() => {
    if (!state.status) {
      return { state: "unknown" as const, label: "Loading sync status…" };
    }
    if (state.status.fastReady) {
      return { state: "ready" as const, label: "FAST plane ready" };
    }
    if (state.status.syncEnqueued) {
      return { state: "syncing" as const, label: "Initial sync is running…" };
    }
    return { state: "cold" as const, label: "FAST plane not ready yet" };
  }, [state.status]);

  return {
    loading: state.loading,
    error: state.error,
    products: state.products,
    status: state.status,
    nextCursor: state.nextCursor,
    syncState,
    reload: loadInitial,
    loadMore,
  };
}
