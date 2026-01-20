// web/frontend/hooks/useBootstrapProducts.ts
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
const POLL_INTERVAL_MS = 5000;

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

  const pollTimerRef = useRef<number | null>(null);

  const fetchPage = useCallback(
    async (opts: { after?: string | null; append: boolean }) => {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: prev.error ?? null,
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
      }
    },
    [query]
  );

  const loadInitial = useCallback(() => {
    void fetchPage({ after: undefined, append: false });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    setState((prev) => {
      if (!prev.nextCursor) return prev;
      void fetchPage({ after: prev.nextCursor, append: true });
      return prev;
    });
  }, [fetchPage]);

  // Initial load
  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Polling while sync is in progress:
  // - fastReady == false
  // - syncEnqueued == true
  // Once fastReady becomes true, polling stops.
  useEffect(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    const shouldPoll =
      state.status &&
      !state.status.fastReady &&
      state.status.syncEnqueued === true;

    if (shouldPoll) {
      pollTimerRef.current = window.setInterval(() => {
        loadInitial();
      }, POLL_INTERVAL_MS);
    }

    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [state.status, loadInitial]);

  const syncState = useMemo(() => {
    if (!state.status) {
      return {
        state: "unknown" as const,
        label: "Loading sync status…",
      };
    }
    if (state.status.fastReady) {
      return {
        state: "ready" as const,
        label: "FAST plane ready",
      };
    }
    if (!state.status.fastReady && state.status.syncEnqueued) {
      return {
        state: "syncing" as const,
        label: "Initial sync is running…",
      };
    }
    return {
      state: "cold" as const,
      label: "FAST plane not ready yet",
    };
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
