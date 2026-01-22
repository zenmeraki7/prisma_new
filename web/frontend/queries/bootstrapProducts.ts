// web/frontend/queries/bootstrapProducts.ts
import type { AppBridgeState } from "@shopify/app-bridge-react";
import { graphqlRequest } from "../../lib/graphqlClient";
import type { ProductLiteDto } from "../types/product";

export type BootstrapStatusDto = {
  fastReady: boolean;
  fastLastSyncAt?: string | null;
  fastRevision: number;
  syncEnqueued: boolean;
};

export type BootstrapProductsPageDto = {
  status: BootstrapStatusDto;
  items: ProductLiteDto[];
  nextCursor: string | null;
};


type BootstrapProductsResponse = {
  bootstrapProducts: {
    status: BootstrapStatusDto;
    page: {
      items: ProductLiteDto[];
      nextCursor: string | null;
    };
  };
};

const BOOTSTRAP_PRODUCTS_QUERY = `
  query BootstrapProducts($first: Int!, $after: String) {
    bootstrapProducts(first: $first, after: $after) {
      status {
        fastReady
        fastLastSyncAt
        fastRevision
        syncEnqueued
      }
      page {
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
      }
    }
  }
`;

export async function bootstrapProductsRequest(
  app: AppBridgeState,
  params: { first: number; after?: string | null }
): Promise<BootstrapProductsPageDto> {
  const res = await graphqlRequest<BootstrapProductsResponse>(
    app,
    BOOTSTRAP_PRODUCTS_QUERY,
    {
      first: params.first,
      after: params.after ?? null,
    }
  );

  return {
    status: res.bootstrapProducts.status,
    items: res.bootstrapProducts.page.items,
    nextCursor: res.bootstrapProducts.page.nextCursor,
  };
}
// ✅ Export the type here
export type { ProductLiteDto };