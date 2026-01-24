// web/frontend/queries/syncProductsToDb.ts
import type { AppBridgeState } from "@shopify/app-bridge-react";

export type SyncProductsResult = {
  synced: number;
  nextCursor: string | null;
  hasNextPage: boolean;
};

export async function syncProductsToDbRequest(
  app: AppBridgeState,
  params: {
    first?: number;
    after?: string | null;
  } = {}
): Promise<SyncProductsResult> {
  const { first = 50, after = null } = params;

  // Changed from mutation to query since backend handles it in query check
  const query = `
    query SyncProductsToDb($first: Int!, $after: String) {
      syncProductsToDb(first: $first, after: $after) {
        synced
        nextCursor
        hasNextPage
      }
    }
  `;

  const variables = { first, after };

  const response = await fetch("/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sync request failed: ${response.statusText} - ${text}`);
  }

  const json = await response.json();

  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data.syncProductsToDb;
}