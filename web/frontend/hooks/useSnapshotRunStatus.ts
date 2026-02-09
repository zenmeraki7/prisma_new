// FILE: web/frontend/hooks/useSnapshotRunStatus.ts

import { useQuery } from "@tanstack/react-query";
import { graphqlRequest } from "../../utils/graphqlClient";

export type SnapshotRunState =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface SnapshotStatus {
  id: string;
  state: SnapshotRunState;
  progress: number;
  total: number;
  errorMessage?: string | null;
  createdAt: string;
}

const SNAPSHOT_STATUS_QUERY = /* GraphQL */ `
  query SnapshotStatus($id: ID!) {
    snapshotStatus(id: $id) {
      id
      state
      progress
      total
      errorMessage
      createdAt
    }
  }
`;

interface UseSnapshotRunStatusOptions {
  runId: string | null;
  enabled?: boolean;
}

/**
 * useSnapshotRunStatus
 *
 * - Polls the snapshot run status while RUNNING / QUEUED.
 * - Stops polling automatically when SUCCEEDED/FAILED/CANCELLED.
 */
export function useSnapshotRunStatus(options: UseSnapshotRunStatusOptions) {
  const { runId, enabled = true } = options;

  const query = useQuery<SnapshotStatus | null>({
    queryKey: ["snapshotStatus", runId],
    enabled: enabled && !!runId,
    queryFn: async () => {
      if (!runId) return null;
      const data = await graphqlRequest<{ snapshotStatus: SnapshotStatus }>(
        SNAPSHOT_STATUS_QUERY,
        { id: runId },
      );
      return data.snapshotStatus;
    },
    // Poll while active
    refetchInterval: (data) => {
      if (!data) return 5000; // default 5s if we don’t know state yet
      if (data.state === "RUNNING" || data.state === "QUEUED") {
        return 3000; // 3s poll while job is in-flight
      }
      return false; // stop polling when finished
    },
  });

  return {
    run: query.data,
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
