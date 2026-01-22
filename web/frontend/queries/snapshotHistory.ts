// web/frontend/queries/snapshotHistory.ts
import type { AppBridgeState } from "@shopify/app-bridge-react";
import { graphqlRequest } from "../../lib/graphqlClient";

export type SnapshotState =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED";

export type SnapshotRunDto = {
  id: string;
  planHash: string;
  state: SnapshotState;
  progress: number;
  total: number;
  errorMessage?: string | null;
  filterSummary?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
};

export type SnapshotRunEventDto = {
  id: string;
  kind: string;
  message?: string | null;
  createdAt: string;
};

type SnapshotRunsResponse = {
  snapshotRuns: {
    edges: {
      cursor: string;
      node: SnapshotRunDto;
    }[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
  };
};

type SnapshotRunEventsResponse = {
  snapshotRunEvents: {
    edges: {
      cursor: string;
      node: SnapshotRunEventDto;
    }[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
  };
};

const SNAPSHOT_RUNS_QUERY = `
  query SnapshotRuns($first: Int!, $after: String) {
    snapshotRuns(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          planHash
          state
          progress
          total
          errorMessage
          filterSummary
          createdAt
          updatedAt
          expiresAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const SNAPSHOT_RUN_EVENTS_QUERY = `
  query SnapshotRunEvents($runId: ID!, $first: Int!, $after: String) {
    snapshotRunEvents(runId: $runId, first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          kind
          message
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export async function snapshotRunsRequest(
  app: AppBridgeState,
  params: { first: number; after?: string | null }
): Promise<{
  runs: SnapshotRunDto[];
  nextCursor: string | null;
}> {
  const res = await graphqlRequest<SnapshotRunsResponse>(
    app,
    SNAPSHOT_RUNS_QUERY,
    {
      first: params.first,
      after: params.after ?? null,
    }
  );

  const edges = res.snapshotRuns.edges;
  const runs = edges.map((e) => e.node);
  const nextCursor =
    res.snapshotRuns.pageInfo.hasNextPage &&
    res.snapshotRuns.pageInfo.endCursor
      ? res.snapshotRuns.pageInfo.endCursor
      : null;

  return { runs, nextCursor };
}

export async function snapshotRunEventsRequest(
  app: AppBridgeState,
  params: { runId: string; first: number; after?: string | null }
): Promise<{
  events: SnapshotRunEventDto[];
  nextCursor: string | null;
}> {
  const res = await graphqlRequest<SnapshotRunEventsResponse>(
    app,
    SNAPSHOT_RUN_EVENTS_QUERY,
    {
      runId: params.runId,
      first: params.first,
      after: params.after ?? null,
    }
  );

  const edges = res.snapshotRunEvents.edges;
  const events = edges.map((e) => e.node);
  const nextCursor =
    res.snapshotRunEvents.pageInfo.hasNextPage &&
    res.snapshotRunEvents.pageInfo.endCursor
      ? res.snapshotRunEvents.pageInfo.endCursor
      : null;

  return { events, nextCursor };
}
