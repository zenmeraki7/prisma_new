// FILE: web/frontend/queries/snapshotRuns.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { graphqlRequest } from "../../utils/graphqlClient";

export type SnapshotRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "INGESTING"
  | "COMPLETED"
  | "FAILED";

export interface SnapshotRunNode {
  id: string;
  shopId: string;
  status: SnapshotRunStatus;
  createdAt: string;
  updatedAt: string;

  // 🔹 These are the “baki” fields your table expects:
  candidateCount?: number | null;
  bulkOperationStatus?: string | null;
  bulkOperationUrl?: string | null;

  // Optional extra fields
  progress?: number | null;
  total?: number | null;
  filterSummary?: string | null;
  planHash?: string | null;
  errorMessage?: string | null;
}

export interface SnapshotRunsPage {
  edges: { cursor: string; node: SnapshotRunNode }[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  totalCount: number;
}

interface UseSnapshotRunsArgs {
  first?: number;
  after?: string | null;
  status?: SnapshotRunStatus | "ALL";
}

const SNAPSHOT_RUNS_QUERY = `
  query SnapshotRuns(
    $first: Int
    $after: String
    $status: SnapshotRunStatus
  ) {
    snapshotRuns(first: $first, after: $after, status: $status) {
      edges {
        cursor
        node {
          id
          shopId
          status
          createdAt
          updatedAt

          candidateCount
          bulkOperationStatus
          bulkOperationUrl

          progress
          total
          filterSummary
          planHash
          errorMessage
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

export function useSnapshotRuns(
  args: UseSnapshotRunsArgs = {},
): UseQueryResult<SnapshotRunsPage> {
  const { first = 25, after = null, status = "ALL" } = args;

  const gqlStatus = status === "ALL" ? null : status;

  return useQuery({
    queryKey: ["snapshotRuns", { first, after, status }],
    queryFn: async () => {
      const data = await graphqlRequest<{ snapshotRuns: SnapshotRunsPage }>(
        SNAPSHOT_RUNS_QUERY,
        { first, after, status: gqlStatus },
      );
      return data.snapshotRuns;
    },
  });
}
