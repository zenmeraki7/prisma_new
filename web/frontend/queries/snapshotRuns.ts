// FILE: web/frontend/queries/snapshotRuns.ts

import { useQuery } from "@tanstack/react-query";
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
  bulkOperationId?: string | null;
  bulkOperationStatus?: string | null;
  bulkOperationUrl?: string | null;
  errorMessage?: string | null;
  candidateCount?: number | null;
  filterJson?: any;
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

const SNAPSHOT_RUNS_QUERY = /* GraphQL */ `
  query SnapshotRuns($first: Int, $after: String, $status: SnapshotRunStatus) {
    snapshotRuns(
      first: $first
      after: $after
      filter: { status: $status }
    ) {
      totalCount
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        cursor
        node {
          id
          shopId
          status
          createdAt
          updatedAt
          bulkOperationId
          bulkOperationStatus
          bulkOperationUrl
          errorMessage
          candidateCount
          filterJson
        }
      }
    }
  }
`;

export function useSnapshotRuns(args: UseSnapshotRunsArgs = {}) {
  const { first = 20, after = null, status = "ALL" } = args;

  return useQuery({
    queryKey: ["snapshotRuns", { first, after, status }],
    queryFn: async () => {
      const variables: any = { first, after };

      if (status && status !== "ALL") {
        variables.status = status;
      }

      const res = await graphqlRequest<{
        snapshotRuns: SnapshotRunsPage;
      }>(SNAPSHOT_RUNS_QUERY, variables);

      return res.snapshotRuns;
    },
    keepPreviousData: true,
  });
}
