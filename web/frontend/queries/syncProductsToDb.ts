// FILE: web/frontend/queries/syncProductsToDb.ts

import type { AppBridgeState } from "@shopify/app-bridge-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export type SyncProductsResult = {
  synced: number;
  nextCursor: string | null;
  hasNextPage: boolean;
};

// Low-level one-page call ---------------------------------------

const SYNC_PRODUCTS_MUTATION = /* GraphQL */ `
  mutation SyncProductsToDb($first: Int!, $after: String) {
    syncProductsToDb(first: $first, after: $after) {
      synced
      nextCursor
      hasNextPage
    }
  }
`;

/**
 * Call the backend once to sync a single page of products from Shopify
 * into ProductLite / VariantRollup / ProductTag.
 */
export async function syncProductsToDbRequest(
  _app: AppBridgeState, // reserved for future AppBridge-aware fetch
  params: {
    first?: number;
    after?: string | null;
  } = {},
): Promise<SyncProductsResult> {
  const first = params.first ?? 50;
  const after = params.after ?? null;

  const response = await fetch("/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: SYNC_PRODUCTS_MUTATION,
      variables: { first, after },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Sync request failed: ${response.status} ${response.statusText} – ${text}`,
    );
  }

  const json = await response.json();

  if (json.errors && json.errors.length) {
    throw new Error(
      `GraphQL errors from syncProductsToDb: ${JSON.stringify(
        json.errors,
        null,
        2,
      )}`,
    );
  }

  const payload = json.data?.syncProductsToDb;
  if (!payload) {
    throw new Error("syncProductsToDb response missing payload");
  }

  return payload as SyncProductsResult;
}

// High-level “sync entire catalog” helper ------------------------

/**
 * Loop through all Shopify pages and fully populate the FAST plane.
 * Call this from a button / mutation.
 */
export async function syncAllProductsToDb(
  app: AppBridgeState | undefined,
): Promise<{ totalSynced: number }> {
  if (!app) throw new Error("AppBridge not ready");

  let after: string | null = null;
  let totalSynced = 0;

  do {
    const res = await syncProductsToDbRequest(app, {
      first: 100,
      after,
    });

    totalSynced += res.synced;
    after = res.hasNextPage ? res.nextCursor : null;
  } while (after);

  return { totalSynced };
}

// React Query hook for UI ----------------------------------------

export function useFastPlaneSync(app: AppBridgeState | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => syncAllProductsToDb(app),
    onSuccess: async () => {
      // After syncing, refresh both status + table queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["productsByFilter"] }),
        queryClient.invalidateQueries({ queryKey: ["bootstrapProducts"] }),
      ]);
    },
  });
}
