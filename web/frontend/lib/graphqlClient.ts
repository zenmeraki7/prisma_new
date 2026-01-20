import { useAppBridge } from "@shopify/app-bridge-react";

type GraphQLError = { message: string };

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
};

/**
 * App Bridge React v4 pattern:
 *
 * - App Bridge JS tag in index.html wraps `window.fetch`
 * - Wrapped fetch automatically adds the session token in the Authorization header
 * - Backend uses `validateAuthenticatedSession()` to validate that token
 *
 * So: DO NOT manually attach Authorization here. Just use `fetch("/api/graphql", ...)`.
 */
export async function graphqlRequest<T>(
  _shopify: any, // kept for future if you need it
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const res = await fetch("/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: variables ?? {},
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL HTTP ${res.status}: ${text}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }

  if (!json.data) {
    throw new Error("GraphQL response missing data");
  }

  return json.data;
}

// Convenience hook wrapper
export function useGraphqlClient() {
  // Ensures we’re inside <AppBridgeProvider>, but we don't actually need the value here.
  const shopify = useAppBridge();

  return {
    query: <T,>(query: string, variables?: Record<string, any>) =>
      graphqlRequest<T>(shopify, query, variables),
  };
}
