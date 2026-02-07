import type { AppBridgeState } from "@shopify/app-bridge-react";
import { graphqlRequest } from "../../lib/graphqlClient";

/* -----------------------------
   DTO
----------------------------- */

export type BootstrapStatusDto = {
  fastReady: boolean;
  fastLastSyncAt?: string | null;
  fastRevision: number;
  syncEnqueued: boolean;
};

/* -----------------------------
   GraphQL
----------------------------- */

type BootstrapProductsResponse = {
  bootstrapProducts: {
    status: BootstrapStatusDto;
  };
};

const BOOTSTRAP_STATUS_QUERY = /* GraphQL */ `
  query BootstrapStatus {
    bootstrapProducts {
      status {
        fastReady
        fastLastSyncAt
        fastRevision
        syncEnqueued
      }
    }
  }
`;

/* -----------------------------
   Request
----------------------------- */

export async function bootstrapProductsRequest(
  app: AppBridgeState,
): Promise<BootstrapStatusDto> {
  const res = await graphqlRequest<BootstrapProductsResponse>(
    app,
    BOOTSTRAP_STATUS_QUERY,
    {},
  );

  return res.bootstrapProducts.status;
}
