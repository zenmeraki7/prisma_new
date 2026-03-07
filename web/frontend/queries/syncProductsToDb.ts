// FILE: web/frontend/queries/syncProductsToDb.ts

import type { AppBridgeState } from "@shopify/app-bridge-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export type SyncProductsResult = {
  synced: number;
  nextCursor: string | null;
  hasNextPage: boolean;
};

const SYNC_PRODUCTS_MUTATION = /* GraphQL */ `
  mutation SyncProductsToDb($first: Int!, $after: String) {
    syncProductsToDb(first: $first, after: $after) {
      synced
      nextCursor
      hasNextPage
    }
  }
`;

export async function syncProductsToDbRequest(
  _app: AppBridgeState,
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

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Sync request failed: ${response.status} ${response.statusText} – ${JSON.stringify(json)}`
    );
  }

  if (json?.errors?.length) {
    throw new Error(
      `GraphQL errors from syncProductsToDb: ${JSON.stringify(json.errors, null, 2)}`
    );
  }

  const payload = json?.data?.syncProductsToDb;
  if (!payload) {
    throw new Error("syncProductsToDb response missing payload");
  }

  return payload as SyncProductsResult;
}

export async function syncAllProductsToDb(
  app: AppBridgeState | undefined,
): Promise<{ totalSynced: number }> {
  if (!app) throw new Error("AppBridge not ready");

  let after: string | null = null;
  let hasNextPage = true;
  let totalSynced = 0;

  while (hasNextPage) {
    const res = await syncProductsToDbRequest(app, {
      first: 100,
      after,
    });

    totalSynced += res.synced;
    hasNextPage = Boolean(res.hasNextPage);
    after = res.nextCursor ?? null;
  }

  return { totalSynced };
}

export function useFastPlaneSync(app: AppBridgeState | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => syncAllProductsToDb(app),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["productsByFilter"] }),
        queryClient.invalidateQueries({ queryKey: ["bootstrapProducts"] }),
      ]);
    },
  });
}