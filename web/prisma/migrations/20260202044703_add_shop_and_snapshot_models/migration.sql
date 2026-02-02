/*
  Warnings:

  - The primary key for the `SnapshotRun` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `SnapshotRun` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `SnapshotRunEvent` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `SnapshotRunEvent` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `updatedAt` to the `Shop` table without a default value. This is not possible if the table is not empty.
  - Made the column `filterSummary` on table `SnapshotRun` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `snapshotRunId` on the `SnapshotRunEvent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "SnapshotRunEvent" DROP CONSTRAINT "SnapshotRunEvent_snapshotRunId_fkey";

-- DropIndex
DROP INDEX "SnapshotRun_shopId_createdAt_idx";

-- DropIndex
DROP INDEX "SnapshotRunEvent_snapshotRunId_idx";

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "SnapshotRun" DROP CONSTRAINT "SnapshotRun_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ALTER COLUMN "filterSummary" SET NOT NULL,
ALTER COLUMN "progress" SET DEFAULT 0,
ALTER COLUMN "total" SET DEFAULT 0,
ADD CONSTRAINT "SnapshotRun_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "SnapshotRunEvent" DROP CONSTRAINT "SnapshotRunEvent_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "snapshotRunId",
ADD COLUMN     "snapshotRunId" BIGINT NOT NULL,
ADD CONSTRAINT "SnapshotRunEvent_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "VariantRollup" ADD COLUMN     "all_continue_selling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "all_taxable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "all_track_quantity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "any_continue_selling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "any_taxable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "any_track_quantity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "has_physical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_compare_at_price" DECIMAL(65,30),
ADD COLUMN     "max_cost" DECIMAL(65,30),
ADD COLUMN     "max_inventory_per_variant" INTEGER,
ADD COLUMN     "max_margin" DECIMAL(65,30),
ADD COLUMN     "max_weight_grams" INTEGER,
ADD COLUMN     "min_compare_at_price" DECIMAL(65,30),
ADD COLUMN     "min_cost" DECIMAL(65,30),
ADD COLUMN     "min_inventory_per_variant" INTEGER,
ADD COLUMN     "min_margin" DECIMAL(65,30),
ADD COLUMN     "min_weight_grams" INTEGER;

-- CreateIndex
CREATE INDEX "ProductCollection_shopId_collectionId_productId_idx" ON "ProductCollection"("shopId", "collectionId", "productId");

-- CreateIndex
CREATE INDEX "ProductInventoryLocation_shopId_locationId_productId_idx" ON "ProductInventoryLocation"("shopId", "locationId", "productId");

-- CreateIndex
CREATE INDEX "ProductOptionValue_shopId_optionIndex_value_productId_idx" ON "ProductOptionValue"("shopId", "optionIndex", "value", "productId");

-- CreateIndex
CREATE INDEX "ProductTag_shopId_tag_productId_idx" ON "ProductTag"("shopId", "tag", "productId");

-- CreateIndex
CREATE INDEX "SnapshotRun_shopId_state_id_idx" ON "SnapshotRun"("shopId", "state", "id");

-- CreateIndex
CREATE INDEX "SnapshotRunEvent_shopId_snapshotRunId_id_idx" ON "SnapshotRunEvent"("shopId", "snapshotRunId", "id");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_productId_id_idx" ON "VariantLite"("shopId", "productId", "id");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_sku_idx" ON "VariantLite"("shopId", "sku");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_barcode_idx" ON "VariantLite"("shopId", "barcode");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_price_idx" ON "VariantLite"("shopId", "price");

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

-- AddForeignKey
ALTER TABLE "SnapshotRunEvent" ADD CONSTRAINT "SnapshotRunEvent_snapshotRunId_fkey" FOREIGN KEY ("snapshotRunId") REFERENCES "SnapshotRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
