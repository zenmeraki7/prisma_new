/*
  Warnings:

  - The primary key for the `ProductLite` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `productId` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `totalInventory` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `variantCount` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the `Shop` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[shopId,id]` on the table `ProductLite` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `id` to the `ProductLite` table without a default value. This is not possible if the table is not empty.

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

-- AlterTable
ALTER TABLE "ProductLite" DROP CONSTRAINT "ProductLite_pkey",
DROP COLUMN "productId",
DROP COLUMN "totalInventory",
DROP COLUMN "variantCount",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "ProductLite_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "Shop";

-- CreateIndex
CREATE UNIQUE INDEX "ProductLite_shopId_id_key" ON "ProductLite"("shopId", "id");

-- AddForeignKey
ALTER TABLE "VariantRollup" ADD CONSTRAINT "VariantRollup_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantLite" ADD CONSTRAINT "VariantLite_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventoryLocation" ADD CONSTRAINT "ProductInventoryLocation_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
