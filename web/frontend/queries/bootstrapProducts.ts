// web/frontend/queries/bootstrapProducts.ts

export const BOOTSTRAP_PRODUCTS_QUERY = /* GraphQL */ `
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

export type ProductLiteDto = {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor?: string | null;
  productType?: string | null;
  tags: string[];
  hasImages: boolean;
  updatedAtShopify?: string | null;
};

export type BootstrapStatusDto = {
  fastReady: boolean;
  fastLastSyncAt?: string | null;
  fastRevision: number;
  syncEnqueued: boolean;
};

export type BootstrapProductsResponse = {
  bootstrapProducts: {
    status: BootstrapStatusDto;
    page: {
      items: ProductLiteDto[];
      nextCursor?: string | null;
    };
  };
};
