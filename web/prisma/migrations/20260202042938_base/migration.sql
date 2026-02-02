/*
  Warnings:

  - The primary key for the `ProductCollection` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ProductLite` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `productType` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAtShopify` on the `ProductLite` table. All the data in the column will be lost.
  - The `id` column on the `ProductLite` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `ProductTag` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `VariantRollup` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `maxPrice` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `minPrice` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `totalInventory` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the `BulkOpsJob` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BulkOpsJobEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FastSyncState` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IdempotencyLedger` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Shop` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SnapshotProduct` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SnapshotRun` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SnapshotRunEvent` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[shopId,productId,collectionId]` on the table `ProductCollection` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shopId,productId]` on the table `ProductLite` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shopId,productId,tag]` on the table `ProductTag` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shopId,productId]` on the table `VariantRollup` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `created_at_shopify` to the `ProductLite` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productId` to the `ProductLite` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ProductLite` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at_shopify` to the `ProductLite` table without a default value. This is not possible if the table is not empty.
  - Added the required column `max_price` to the `VariantRollup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `min_price` to the `VariantRollup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total_inventory` to the `VariantRollup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `variant_count` to the `VariantRollup` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "BulkOpsJob" DROP CONSTRAINT "BulkOpsJob_shopId_fkey";

-- DropForeignKey
ALTER TABLE "BulkOpsJobEvent" DROP CONSTRAINT "BulkOpsJobEvent_jobId_fkey";

-- DropForeignKey
ALTER TABLE "BulkOpsJobEvent" DROP CONSTRAINT "BulkOpsJobEvent_shopId_fkey";

-- DropForeignKey
ALTER TABLE "FastSyncState" DROP CONSTRAINT "FastSyncState_shopId_fkey";

-- DropForeignKey
ALTER TABLE "IdempotencyLedger" DROP CONSTRAINT "IdempotencyLedger_shopId_fkey";

-- DropForeignKey
ALTER TABLE "ProductCollection" DROP CONSTRAINT "ProductCollection_shopId_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductLite" DROP CONSTRAINT "ProductLite_shopId_fkey";

-- DropForeignKey
ALTER TABLE "ProductTag" DROP CONSTRAINT "ProductTag_shopId_productId_fkey";

-- DropForeignKey
ALTER TABLE "SnapshotProduct" DROP CONSTRAINT "SnapshotProduct_shopId_fkey";

-- DropForeignKey
ALTER TABLE "SnapshotProduct" DROP CONSTRAINT "SnapshotProduct_snapshotRunId_fkey";

-- DropForeignKey
ALTER TABLE "SnapshotRun" DROP CONSTRAINT "SnapshotRun_shopId_fkey";

-- DropForeignKey
ALTER TABLE "SnapshotRunEvent" DROP CONSTRAINT "SnapshotRunEvent_shopId_fkey";

-- DropForeignKey
ALTER TABLE "SnapshotRunEvent" DROP CONSTRAINT "SnapshotRunEvent_snapshotRunId_fkey";

-- DropForeignKey
ALTER TABLE "VariantRollup" DROP CONSTRAINT "VariantRollup_shopId_productId_fkey";

-- DropIndex
DROP INDEX "ProductCollection_shopId_collectionId_idx";

-- DropIndex
DROP INDEX "ProductLite_shopId_productType_idx";

-- DropIndex
DROP INDEX "ProductLite_shopId_status_idx";

-- DropIndex
DROP INDEX "ProductLite_shopId_updatedAtShopify_idx";

-- DropIndex
DROP INDEX "ProductLite_shopId_vendor_idx";

-- DropIndex
DROP INDEX "ProductTag_shopId_tag_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_totalInventory_idx";

-- AlterTable
ALTER TABLE "ProductCollection" DROP CONSTRAINT "ProductCollection_pkey",
ADD COLUMN     "collection_handle" TEXT,
ADD COLUMN     "collection_title" TEXT,
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD CONSTRAINT "ProductCollection_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ProductLite" DROP CONSTRAINT "ProductLite_pkey",
DROP COLUMN "productType",
DROP COLUMN "updatedAtShopify",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_at_shopify" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "is_searchable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "max_price" DECIMAL(65,30),
ADD COLUMN     "min_price" DECIMAL(65,30),
ADD COLUMN     "option1_name" TEXT,
ADD COLUMN     "option2_name" TEXT,
ADD COLUMN     "option3_name" TEXT,
ADD COLUMN     "productId" TEXT NOT NULL,
ADD COLUMN     "product_type" TEXT,
ADD COLUMN     "published_at_shopify" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "template_suffix" TEXT,
ADD COLUMN     "total_inventory" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_at_shopify" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "variant_count" INTEGER,
ADD COLUMN     "visible_online_store" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "visible_pos" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD CONSTRAINT "ProductLite_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ProductTag" DROP CONSTRAINT "ProductTag_pkey",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "VariantRollup" DROP CONSTRAINT "VariantRollup_pkey",
DROP COLUMN "maxPrice",
DROP COLUMN "minPrice",
DROP COLUMN "totalInventory",
ADD COLUMN     "all_continue_selling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "all_taxable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "all_track_quantity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "any_continue_selling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "any_taxable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "any_track_quantity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "has_physical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD COLUMN     "max_compare_at_price" DECIMAL(65,30),
ADD COLUMN     "max_cost" DECIMAL(65,30),
ADD COLUMN     "max_inventory_per_variant" INTEGER,
ADD COLUMN     "max_margin" DECIMAL(65,30),
ADD COLUMN     "max_price" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "max_weight_grams" INTEGER,
ADD COLUMN     "min_compare_at_price" DECIMAL(65,30),
ADD COLUMN     "min_cost" DECIMAL(65,30),
ADD COLUMN     "min_inventory_per_variant" INTEGER,
ADD COLUMN     "min_margin" DECIMAL(65,30),
ADD COLUMN     "min_price" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "min_weight_grams" INTEGER,
ADD COLUMN     "total_inventory" INTEGER NOT NULL,
ADD COLUMN     "variant_count" INTEGER NOT NULL,
ADD CONSTRAINT "VariantRollup_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "BulkOpsJob";

-- DropTable
DROP TABLE "BulkOpsJobEvent";

-- DropTable
DROP TABLE "FastSyncState";

-- DropTable
DROP TABLE "IdempotencyLedger";

-- DropTable
DROP TABLE "Shop";

-- DropTable
DROP TABLE "SnapshotProduct";

-- DropTable
DROP TABLE "SnapshotRun";

-- DropTable
DROP TABLE "SnapshotRunEvent";

-- DropEnum
DROP TYPE "BulkJobState";

-- DropEnum
DROP TYPE "SnapshotRunEventKind";

-- DropEnum
DROP TYPE "SnapshotState";

-- CreateTable
CREATE TABLE "VariantLite" (
    "id" BIGSERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DECIMAL(65,30) NOT NULL,
    "compareAtPrice" DECIMAL(65,30),
    "cost" DECIMAL(65,30),
    "taxable" BOOLEAN,
    "trackQuantity" BOOLEAN,
    "inventoryQty" INTEGER NOT NULL,
    "inventoryPolicy" TEXT,
    "weightGrams" INTEGER,
    "weightUnit" TEXT,
    "option1Value" TEXT,
    "option2Value" TEXT,
    "option3Value" TEXT,
    "title" TEXT,
    "countryOfOrigin" TEXT,
    "hsTariffCode" TEXT,

    CONSTRAINT "VariantLite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionValue" (
    "id" BIGSERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInventoryLocation" (
    "id" BIGSERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "hasInventory" BOOLEAN NOT NULL DEFAULT false,
    "totalQuantity" INTEGER,

    CONSTRAINT "ProductInventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariantLite_shopId_productId_id_idx" ON "VariantLite"("shopId", "productId", "id");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_sku_idx" ON "VariantLite"("shopId", "sku");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_barcode_idx" ON "VariantLite"("shopId", "barcode");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_price_idx" ON "VariantLite"("shopId", "price");

-- CreateIndex
CREATE UNIQUE INDEX "VariantLite_shopId_variantId_key" ON "VariantLite"("shopId", "variantId");

-- CreateIndex
CREATE INDEX "ProductOptionValue_shopId_optionIndex_value_productId_idx" ON "ProductOptionValue"("shopId", "optionIndex", "value", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_shopId_productId_optionIndex_value_key" ON "ProductOptionValue"("shopId", "productId", "optionIndex", "value");

-- CreateIndex
CREATE INDEX "ProductInventoryLocation_shopId_locationId_productId_idx" ON "ProductInventoryLocation"("shopId", "locationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductInventoryLocation_shopId_productId_locationId_key" ON "ProductInventoryLocation"("shopId", "productId", "locationId");

-- CreateIndex
CREATE INDEX "ProductCollection_shopId_collectionId_productId_idx" ON "ProductCollection"("shopId", "collectionId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCollection_shopId_productId_collectionId_key" ON "ProductCollection"("shopId", "productId", "collectionId");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_status_id_idx" ON "ProductLite"("shopId", "status", "id");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_vendor_id_idx" ON "ProductLite"("shopId", "vendor", "id");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_product_type_id_idx" ON "ProductLite"("shopId", "product_type", "id");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_created_at_shopify_id_idx" ON "ProductLite"("shopId", "created_at_shopify", "id");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_updated_at_shopify_id_idx" ON "ProductLite"("shopId", "updated_at_shopify", "id");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_published_at_shopify_id_idx" ON "ProductLite"("shopId", "published_at_shopify", "id");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_handle_idx" ON "ProductLite"("shopId", "handle");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_title_idx" ON "ProductLite"("shopId", "title");

-- CreateIndex
CREATE INDEX "ProductLite_tags_idx" ON "ProductLite" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "product_lite_shop_product_uniq" ON "ProductLite"("shopId", "productId");

-- CreateIndex
CREATE INDEX "ProductTag_shopId_tag_productId_idx" ON "ProductTag"("shopId", "tag", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTag_shopId_productId_tag_key" ON "ProductTag"("shopId", "productId", "tag");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_total_inventory_id_idx" ON "VariantRollup"("shopId", "total_inventory", "id");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_min_price_id_idx" ON "VariantRollup"("shopId", "min_price", "id");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_max_price_id_idx" ON "VariantRollup"("shopId", "max_price", "id");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_variant_count_id_idx" ON "VariantRollup"("shopId", "variant_count", "id");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_min_margin_id_idx" ON "VariantRollup"("shopId", "min_margin", "id");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_max_margin_id_idx" ON "VariantRollup"("shopId", "max_margin", "id");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_min_weight_grams_id_idx" ON "VariantRollup"("shopId", "min_weight_grams", "id");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_max_weight_grams_id_idx" ON "VariantRollup"("shopId", "max_weight_grams", "id");

-- CreateIndex
CREATE UNIQUE INDEX "VariantRollup_shopId_productId_key" ON "VariantRollup"("shopId", "productId");

-- AddForeignKey
ALTER TABLE "VariantRollup" ADD CONSTRAINT "VariantRollup_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantLite" ADD CONSTRAINT "VariantLite_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventoryLocation" ADD CONSTRAINT "ProductInventoryLocation_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
