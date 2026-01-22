// web/frontend/types/product.ts
export type ProductLiteDto = {
  id: string;
  title: string;
  handle: string;
  status: string; // ACTIVE | DRAFT | ARCHIVED
  vendor?: string;
  productType?: string;
  tags: string[];
  hasImages: boolean;
  updatedAtShopify?: string;
  totalInventory?: number;
};
