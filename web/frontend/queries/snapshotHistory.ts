import type { AppBridgeState } from "@shopify/app-bridge-react";
import { graphqlRequest } from "../../lib/graphqlClient";

/* -----------------------------
   Snapshot States
----------------------------- */
export type SnapshotRunState =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

/* -----------------------------
   DTOs
----------------------------- */
export type SnapshotRunDto = {
  id: string;
  planHash: string;
  state: SnapshotRunState;

  productCount: number;
  approxBytes: string;

  createdAt: string;
  completedAt?: string | null;
  expiresAt: string;
};

export type SnapshotRunEventDto = {
  id: string;
  runId: string;
  message: string;
  level: "INFO" | "WARN" | "ERROR";
  createdAt: string;
};

/* -----------------------------
   GraphQL Types
----------------------------- */
type SnapshotHistoryResponse = {
  snapshotHistory: SnapshotRunDto[];
};

type SnapshotRunEventsResponse = {
  snapshotRunEvents: SnapshotRunEventDto[];
};

/* -----------------------------
   GraphQL Queries
----------------------------- */
const SNAPSHOT_HISTORY_QUERY = `
  query SnapshotHistory($limit: Int!) {
    snapshotHistory(limit: $limit) {
      id
      planHash
      state
      productCount
      approxBytes
      createdAt
      completedAt
      expiresAt
    }
  }
`;

const SNAPSHOT_RUN_EVENTS_QUERY = `
  query SnapshotRunEvents($runId: ID!) {
    snapshotRunEvents(runId: $runId) {
      id
      runId
      message
      level
      createdAt
    }
  }
`;

/* -----------------------------
   Requests
----------------------------- */
export async function snapshotRunsRequest(
  app: AppBridgeState,
  params: { limit?: number } = {},
): Promise<{ runs: SnapshotRunDto[]; nextCursor: string | null }> {
  const res = await graphqlRequest<SnapshotHistoryResponse>(
    app,
    SNAPSHOT_HISTORY_QUERY,
    { limit: params.limit ?? 20 },
  );

  return {
    runs: res.snapshotHistory,
    nextCursor: null,
  };
}

export async function snapshotRunEventsRequest(
  app: AppBridgeState,
  params: { runId: string },
): Promise<{ events: SnapshotRunEventDto[]; nextCursor: string | null }> {
  const res = await graphqlRequest<SnapshotRunEventsResponse>(
    app,
    SNAPSHOT_RUN_EVENTS_QUERY,
    { runId: params.runId },
  );

  return {
    events: res.snapshotRunEvents,
    nextCursor: null,
  };
}
