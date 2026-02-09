/*
  Warnings:

  - You are about to drop the column `description` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `max_price` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `min_price` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `option1_name` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `option2_name` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `option3_name` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `total_inventory` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `variant_count` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `any_continue_selling` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `any_taxable` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `any_track_quantity` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `max_compare_at_price` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `max_cost` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `max_inventory_per_variant` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `max_weight_grams` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `min_compare_at_price` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `min_cost` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `min_inventory_per_variant` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `min_weight_grams` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the `ProductTag` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProductCollection" DROP CONSTRAINT "ProductCollection_shopId_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductInventoryLocation" DROP CONSTRAINT "ProductInventoryLocation_shopId_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductOptionValue" DROP CONSTRAINT "ProductOptionValue_shopId_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductTag" DROP CONSTRAINT "ProductTag_shopId_productId_fkey";

-- DropForeignKey
ALTER TABLE "SnapshotProduct" DROP CONSTRAINT "SnapshotProduct_snapshotRunId_fkey";

-- DropForeignKey
ALTER TABLE "SnapshotRunEvent" DROP CONSTRAINT "SnapshotRunEvent_snapshotRunId_fkey";

-- DropForeignKey
ALTER TABLE "VariantLite" DROP CONSTRAINT "VariantLite_shopId_productId_fkey";

-- DropForeignKey
ALTER TABLE "VariantRollup" DROP CONSTRAINT "VariantRollup_shopId_productId_fkey";

-- DropIndex
DROP INDEX "ProductLite_shopId_created_at_shopify_id_idx";

-- DropIndex
DROP INDEX "ProductLite_shopId_published_at_shopify_id_idx";

-- DropIndex
DROP INDEX "ProductLite_shopId_updated_at_shopify_id_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_max_margin_id_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_max_weight_grams_id_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_min_margin_id_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_min_weight_grams_id_idx";

-- AlterTable
ALTER TABLE "ProductLite" DROP COLUMN "description",
DROP COLUMN "max_price",
DROP COLUMN "min_price",
DROP COLUMN "option1_name",
DROP COLUMN "option2_name",
DROP COLUMN "option3_name",
DROP COLUMN "total_inventory",
DROP COLUMN "variant_count",
ADD COLUMN     "option1Name" TEXT,
ADD COLUMN     "option2Name" TEXT,
ADD COLUMN     "option3Name" TEXT,
ADD COLUMN     "titleSearchVector" tsvector;

-- AlterTable
ALTER TABLE "SnapshotProduct" ADD COLUMN     "searchEngineVisibility" TEXT;

-- AlterTable
ALTER TABLE "VariantLite" ADD COLUMN     "profit_margin" DECIMAL(65,30),
ADD COLUMN     "requiresShipping" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "VariantRollup" DROP COLUMN "any_continue_selling",
DROP COLUMN "any_taxable",
DROP COLUMN "any_track_quantity",
DROP COLUMN "max_compare_at_price",
DROP COLUMN "max_cost",
DROP COLUMN "max_inventory_per_variant",
DROP COLUMN "max_weight_grams",
DROP COLUMN "min_compare_at_price",
DROP COLUMN "min_cost",
DROP COLUMN "min_inventory_per_variant",
DROP COLUMN "min_weight_grams";

-- DropTable
DROP TABLE "ProductTag";

-- CreateTable
CREATE TABLE "ProductContent" (
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "description" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "descriptionSearchVector" tsvector,
    "seoTitleSearchVector" tsvector,
    "seoDescriptionSearchVector" tsvector,

    CONSTRAINT "ProductContent_pkey" PRIMARY KEY ("shopId","productId")
);

-- CreateTable
CREATE TABLE "VariantInventoryLocation" (
    "id" BIGSERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "locationName" TEXT,
    "available" INTEGER,

    CONSTRAINT "VariantInventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariantInventoryLocation_shopId_locationName_idx" ON "VariantInventoryLocation"("shopId", "locationName");

-- CreateIndex
CREATE UNIQUE INDEX "VariantInventoryLocation_shopId_variantId_locationId_key" ON "VariantInventoryLocation"("shopId", "variantId", "locationId");

-- CreateIndex
CREATE INDEX "ProductCollection_shopId_collection_title_productId_idx" ON "ProductCollection"("shopId", "collection_title", "productId");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_category_id_idx" ON "ProductLite"("shopId", "category", "id");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_inventoryQty_idx" ON "VariantLite"("shopId", "inventoryQty");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_weightGrams_idx" ON "VariantLite"("shopId", "weightGrams");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_profit_margin_idx" ON "VariantLite"("shopId", "profit_margin");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_requiresShipping_idx" ON "VariantLite"("shopId", "requiresShipping");

-- AddForeignKey
ALTER TABLE "ProductContent" ADD CONSTRAINT "ProductContent_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantRollup" ADD CONSTRAINT "VariantRollup_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantLite" ADD CONSTRAINT "VariantLite_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventoryLocation" ADD CONSTRAINT "ProductInventoryLocation_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantInventoryLocation" ADD CONSTRAINT "VariantInventoryLocation_shopId_variantId_fkey" FOREIGN KEY ("shopId", "variantId") REFERENCES "VariantLite"("shopId", "variantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotProduct" ADD CONSTRAINT "SnapshotProduct_snapshotRunId_fkey" FOREIGN KEY ("snapshotRunId") REFERENCES "SnapshotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotRunEvent" ADD CONSTRAINT "SnapshotRunEvent_snapshotRunId_fkey" FOREIGN KEY ("snapshotRunId") REFERENCES "SnapshotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
