// FILE: web/frontend/lib/graphqlClient.ts
//
// Minimal typed GraphQL client wrapper.
// Works with any fetch-based environment (React SPA, embedded app, etc.).
// No Apollo, no urql — just typed fetch with timeout + error normalisation.
//
// Usage:
//   import { initGraphQLClient, getGraphQLClient } from "./lib/graphqlClient";
//
//   // At app startup (e.g. index.tsx):
//   initGraphQLClient("/api/graphql");
//
//   // Later in hooks/components:
//   const client = getGraphQLClient();
//   const data = await client.query<MyQueryResult>(MY_QUERY, vars);

export interface GraphQLError {
  readonly message:    string;
  readonly path?:      ReadonlyArray<string | number>;
  readonly extensions?: Record<string, unknown>;
}

export interface GraphQLResponse<T> {
  readonly data?:   T;
  readonly errors?: ReadonlyArray<GraphQLError>;
}

export class GraphQLRequestError extends Error {
  constructor(
    message: string,
    public readonly errors: ReadonlyArray<GraphQLError>,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GraphQLRequestError";
  }
}

export interface GraphQLClientOptions {
  /** Additional headers (e.g. Authorization) */
  headers?: Record<string, string>;
  /** Timeout in ms — default 30_000 */
  timeoutMs?: number;
}

export interface GraphQLClient {
  query<
    TData,
    TVariables extends Record<string, unknown> = Record<string, unknown>
  >(
    document:  string,
    variables?: TVariables,
    options?:   GraphQLClientOptions,
  ): Promise<TData>;
}

/**
 * Create a typed GraphQL client bound to a single endpoint.
 *
 * @param endpoint  The GraphQL endpoint URL, e.g. "/api/graphql"
 * @param defaults  Default headers applied to every request (e.g. Authorization)
 */
export function createGraphQLClient(
  endpoint: string,
  defaults: GraphQLClientOptions = {},
): GraphQLClient {
  async function query<
    TData,
    TVariables extends Record<string, unknown> = Record<string, unknown>
  >(
    document:  string,
    variables?: TVariables,
    options:    GraphQLClientOptions = {},
  ): Promise<TData> {
    const timeoutMs = options.timeoutMs ?? defaults.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timerId = window.setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;

    try {
      response = await fetch(endpoint, {
        method:  "POST",
        signal:  controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...defaults.headers,
          ...options.headers,
        },
        body: JSON.stringify({ query: document, variables }),
      });
    } catch (err) {
      window.clearTimeout(timerId);

      if ((err as Error).name === "AbortError") {
        throw new GraphQLRequestError(
          `GraphQL request timed out after ${timeoutMs}ms`,
          [],
        );
      }

      throw err;
    } finally {
      window.clearTimeout(timerId);
    }

    let body: GraphQLResponse<TData>;

    try {
      body = (await response.json()) as GraphQLResponse<TData>;
    } catch {
      throw new GraphQLRequestError(
        `GraphQL server returned non-JSON response (HTTP ${response.status})`,
        [],
        response.status,
      );
    }

    if (body.errors?.length) {
      throw new GraphQLRequestError(
        body.errors.map((e) => e.message).join("; "),
        body.errors,
        response.status,
      );
    }

    if (!body.data) {
      throw new GraphQLRequestError(
        "GraphQL response contained no data",
        [],
        response.status,
      );
    }

    return body.data;
  }

  return { query };
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton factory — call once at app startup, import the result everywhere
// ─────────────────────────────────────────────────────────────────────────────

let _client: GraphQLClient | null = null;

/**
 * Initialise the global GraphQL client.
 * Call this once at app startup (e.g. in your React root).
 */
export function initGraphQLClient(
  endpoint: string,
  options?: GraphQLClientOptions,
): GraphQLClient {
  _client = createGraphQLClient(endpoint, options);
  return _client;
}

/**
 * Get the global GraphQL client instance.
 * Throws if initGraphQLClient() has not been called yet.
 */
export function getGraphQLClient(): GraphQLClient {
  if (!_client) {
    throw new Error(
      "GraphQL client not initialised. Call initGraphQLClient() at app startup.",
    );
  }
  return _client;
}