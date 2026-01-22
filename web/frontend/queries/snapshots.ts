// web/frontend/queries/snapshots.ts
import { graphqlRequest } from "../../lib/graphqlClient";
import type { AppBridgeState } from "@shopify/app-bridge-react";
import type { ProductLiteDto } from "../types/product";

export type SnapshotState =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED";

export type SnapshotStatusResponse = {
  snapshotStatus: {
    state: SnapshotState;
    progress: number;
    total: number;
    errorMessage?: string | null;
    filterSummary?: string | null;
    planHash: string;
    snapshotRunId?: string | null;
  };
};

export type ProductsBySnapshotResponse = {
  productsBySnapshot: {
    items: ProductLiteDto[];
    nextCursor: string | null;
    snapshotRunId: string | null;
  };
};

const SNAPSHOT_STATUS_QUERY = `
  query SnapshotStatus($planHash: String!) {
    snapshotStatus(planHash: $planHash) {
      state
      progress
      total
      errorMessage
      filterSummary
      planHash
      snapshotRunId
    }
  }
`;

const PRODUCTS_BY_SNAPSHOT_QUERY = `
  query ProductsBySnapshot($planHash: String!, $first: Int!, $after: String) {
    productsBySnapshot(planHash: $planHash, first: $first, after: $after) {
      items {
        id
        title
        handle
        status
        vendor
        productType
        tags
        hasImages
        updatedAtShopify
      }
      nextCursor
      snapshotRunId
    }
  }
`;

export async function snapshotStatusRequest(
  app: AppBridgeState,
  planHash: string
): Promise<SnapshotStatusResponse["snapshotStatus"]> {
  const res = await graphqlRequest<SnapshotStatusResponse>(
    app,
    SNAPSHOT_STATUS_QUERY,
    { planHash }
  );
  return res.snapshotStatus;
}

export async function productsBySnapshotRequest(
  app: AppBridgeState,
  params: { planHash: string; first: number; after?: string | null }
): Promise<ProductsBySnapshotResponse["productsBySnapshot"]> {
  const res = await graphqlRequest<ProductsBySnapshotResponse>(
    app,
    PRODUCTS_BY_SNAPSHOT_QUERY,
    {
      planHash: params.planHash,
      first: params.first,
      after: params.after ?? null,
    }
  );
  return res.productsBySnapshot;
}
