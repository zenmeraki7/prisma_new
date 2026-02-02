/*
  Warnings:

  - You are about to drop the column `all_continue_selling` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `all_taxable` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `all_track_quantity` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `any_continue_selling` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `any_taxable` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `any_track_quantity` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `has_physical` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `max_compare_at_price` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `max_cost` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `max_inventory_per_variant` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `max_margin` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `max_weight_grams` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `min_compare_at_price` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `min_cost` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `min_inventory_per_variant` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `min_margin` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `min_weight_grams` on the `VariantRollup` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "ProductCollection_shopId_collectionId_productId_idx";

-- DropIndex
DROP INDEX "ProductInventoryLocation_shopId_locationId_productId_idx";

-- DropIndex
DROP INDEX "ProductOptionValue_shopId_optionIndex_value_productId_idx";

-- DropIndex
DROP INDEX "ProductTag_shopId_tag_productId_idx";

-- DropIndex
DROP INDEX "VariantLite_shopId_barcode_idx";

-- DropIndex
DROP INDEX "VariantLite_shopId_price_idx";

-- DropIndex
DROP INDEX "VariantLite_shopId_productId_id_idx";

-- DropIndex
DROP INDEX "VariantLite_shopId_sku_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_max_margin_id_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_max_price_id_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_max_weight_grams_id_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_min_margin_id_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_min_price_id_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_min_weight_grams_id_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_total_inventory_id_idx";

-- DropIndex
DROP INDEX "VariantRollup_shopId_variant_count_id_idx";

-- AlterTable
ALTER TABLE "VariantRollup" DROP COLUMN "all_continue_selling",
DROP COLUMN "all_taxable",
DROP COLUMN "all_track_quantity",
DROP COLUMN "any_continue_selling",
DROP COLUMN "any_taxable",
DROP COLUMN "any_track_quantity",
DROP COLUMN "has_physical",
DROP COLUMN "max_compare_at_price",
DROP COLUMN "max_cost",
DROP COLUMN "max_inventory_per_variant",
DROP COLUMN "max_margin",
DROP COLUMN "max_weight_grams",
DROP COLUMN "min_compare_at_price",
DROP COLUMN "min_cost",
DROP COLUMN "min_inventory_per_variant",
DROP COLUMN "min_margin",
DROP COLUMN "min_weight_grams";

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotRun" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "filterSummary" TEXT,
    "state" TEXT NOT NULL,
    "progress" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SnapshotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotRunEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "snapshotRunId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnapshotRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "SnapshotRun_shopId_createdAt_idx" ON "SnapshotRun"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "SnapshotRunEvent_snapshotRunId_idx" ON "SnapshotRunEvent"("snapshotRunId");

-- AddForeignKey
ALTER TABLE "SnapshotRun" ADD CONSTRAINT "SnapshotRun_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotRunEvent" ADD CONSTRAINT "SnapshotRunEvent_snapshotRunId_fkey" FOREIGN KEY ("snapshotRunId") REFERENCES "SnapshotRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
