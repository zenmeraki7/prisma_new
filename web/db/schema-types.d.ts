import type { Prisma } from "@prisma/client";

type ScalarFieldEnumKeys<E> = E extends Record<string, any>
  ? keyof E & string
  : never;

export type ProductLiteField = ScalarFieldEnumKeys<
  typeof Prisma.ProductLiteScalarFieldEnum
>;

export type VariantLiteField = ScalarFieldEnumKeys<
  typeof Prisma.VariantLiteScalarFieldEnum
>;

export type VariantRollupField = ScalarFieldEnumKeys<
  typeof Prisma.VariantRollupScalarFieldEnum
>;

export type ProductContentField = ScalarFieldEnumKeys<
  typeof Prisma.ProductContentScalarFieldEnum
>;

export type ProductCollectionField = ScalarFieldEnumKeys<
  typeof Prisma.ProductCollectionScalarFieldEnum
>;

export type VariantInventoryLocationField = ScalarFieldEnumKeys<
  typeof Prisma.ProductInventoryLocationScalarFieldEnum
>;