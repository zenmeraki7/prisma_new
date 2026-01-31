/*
  Warnings:

  - You are about to drop the `ProductInventoryLocation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductOptionValue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VariantLite` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProductInventoryLocation" DROP CONSTRAINT "ProductInventoryLocation_shopId_variantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductOptionValue" DROP CONSTRAINT "ProductOptionValue_shopId_productId_fkey";

-- DropForeignKey
ALTER TABLE "VariantLite" DROP CONSTRAINT "VariantLite_shopId_productId_fkey";

-- DropTable
DROP TABLE "ProductInventoryLocation";

-- DropTable
DROP TABLE "ProductOptionValue";

-- DropTable
DROP TABLE "VariantLite";
