/*
  Warnings:

  - The primary key for the `ProductLite` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `compareAtPrice` on the `VariantLite` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.
  - You are about to alter the column `cost` on the `VariantLite` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,6)`.

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
ALTER TABLE "VariantLite" DROP CONSTRAINT "VariantLite_shopId_productId_fkey";

-- DropForeignKey
ALTER TABLE "VariantRollup" DROP CONSTRAINT "VariantRollup_shopId_productId_fkey";

-- DropIndex
DROP INDEX "ProductLite_shopId_id_key";

-- AlterTable
ALTER TABLE "ProductInventoryLocation" ADD COLUMN     "locationName" TEXT;

-- AlterTable
ALTER TABLE "ProductLite" DROP CONSTRAINT "ProductLite_pkey",
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "categoryName" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "option1Name" TEXT,
ADD COLUMN     "option2Name" TEXT,
ADD COLUMN     "option3Name" TEXT,
ADD COLUMN     "seoHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "templateSuffix" TEXT,
ADD COLUMN     "visibleOnlineStore" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visiblePos" BOOLEAN NOT NULL DEFAULT false,
ADD CONSTRAINT "ProductLite_pkey" PRIMARY KEY ("shopId", "id");

-- AlterTable
ALTER TABLE "VariantLite" ADD COLUMN     "countryOfOrigin" TEXT,
ADD COLUMN     "hsTariffCode" TEXT,
ADD COLUMN     "profitMarginPct" DECIMAL(9,4),
ADD COLUMN     "requiresShipping" BOOLEAN,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "compareAtPrice" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "cost" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "inventoryQty" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "VariantRollup" ADD COLUMN     "maxCompareAtPrice" DECIMAL(18,6),
ADD COLUMN     "maxCost" DECIMAL(18,6),
ADD COLUMN     "minCompareAtPrice" DECIMAL(18,6),
ADD COLUMN     "minCost" DECIMAL(18,6);

-- CreateIndex
CREATE INDEX "ProductCollection_shopId_collectionHandle_productId_idx" ON "ProductCollection"("shopId", "collectionHandle", "productId");

-- CreateIndex
CREATE INDEX "ProductCollection_shopId_collectionTitle_productId_idx" ON "ProductCollection"("shopId", "collectionTitle", "productId");

-- CreateIndex
CREATE INDEX "ProductInventoryLocation_shopId_locationName_productId_idx" ON "ProductInventoryLocation"("shopId", "locationName", "productId");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_handle_idx" ON "ProductLite"("shopId", "handle");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_status_idx" ON "ProductLite"("shopId", "status");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_vendor_idx" ON "ProductLite"("shopId", "vendor");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_productType_idx" ON "ProductLite"("shopId", "productType");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_categoryName_idx" ON "ProductLite"("shopId", "categoryName");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_visibleOnlineStore_idx" ON "ProductLite"("shopId", "visibleOnlineStore");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_visiblePos_idx" ON "ProductLite"("shopId", "visiblePos");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_seoHidden_idx" ON "ProductLite"("shopId", "seoHidden");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_templateSuffix_idx" ON "ProductLite"("shopId", "templateSuffix");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_title_idx" ON "VariantLite"("shopId", "title");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_compareAtPrice_idx" ON "VariantLite"("shopId", "compareAtPrice");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_cost_idx" ON "VariantLite"("shopId", "cost");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_profitMarginPct_idx" ON "VariantLite"("shopId", "profitMarginPct");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_inventoryQty_idx" ON "VariantLite"("shopId", "inventoryQty");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_inventoryPolicy_idx" ON "VariantLite"("shopId", "inventoryPolicy");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_trackQuantity_idx" ON "VariantLite"("shopId", "trackQuantity");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_taxable_idx" ON "VariantLite"("shopId", "taxable");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_requiresShipping_idx" ON "VariantLite"("shopId", "requiresShipping");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_countryOfOrigin_idx" ON "VariantLite"("shopId", "countryOfOrigin");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_hsTariffCode_idx" ON "VariantLite"("shopId", "hsTariffCode");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_weightUnit_idx" ON "VariantLite"("shopId", "weightUnit");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_variantCount_idx" ON "VariantRollup"("shopId", "variantCount");

-- AddForeignKey
ALTER TABLE "VariantRollup" ADD CONSTRAINT "VariantRollup_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantLite" ADD CONSTRAINT "VariantLite_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventoryLocation" ADD CONSTRAINT "ProductInventoryLocation_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
