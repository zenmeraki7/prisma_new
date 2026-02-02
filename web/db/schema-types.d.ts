// web/db/schema-types.d.ts
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

export type SnapshotProductField = ScalarFieldEnumKeys<
  typeof Prisma.SnapshotProductScalarFieldEnum
>;

export type VariantInventoryLocationField = ScalarFieldEnumKeys<
  typeof Prisma.VariantInventoryLocationScalarFieldEnum
>;
