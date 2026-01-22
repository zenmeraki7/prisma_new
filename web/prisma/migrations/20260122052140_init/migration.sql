/*
  Warnings:

  - The primary key for the `ProductLite` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAtShopify` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `publishedAtShopify` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ProductLite` table. All the data in the column will be lost.
  - You are about to drop the `ShopState` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "ProductLite_shopId_id_key";

-- DropIndex
DROP INDEX "ProductLite_shopId_title_idx";

-- DropIndex
DROP INDEX "ProductLite_shopId_updatedAtShopify_idx";

-- AlterTable
ALTER TABLE "ProductLite" DROP CONSTRAINT "ProductLite_pkey",
DROP COLUMN "createdAtShopify",
DROP COLUMN "publishedAtShopify",
DROP COLUMN "tags",
DROP COLUMN "updatedAt",
ADD CONSTRAINT "ProductLite_pkey" PRIMARY KEY ("shopId", "id");

-- AlterTable
ALTER TABLE "VariantRollup" ALTER COLUMN "totalInventory" DROP NOT NULL,
ALTER COLUMN "totalInventory" DROP DEFAULT;

-- DropTable
DROP TABLE "ShopState";

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTag" (
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("shopId","productId","tag")
);

-- CreateTable
CREATE TABLE "ProductCollection" (
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,

    CONSTRAINT "ProductCollection_pkey" PRIMARY KEY ("shopId","productId","collectionId")
);

-- CreateTable
CREATE TABLE "FastSyncState" (
    "shopId" TEXT NOT NULL,
    "fastReady" BOOLEAN NOT NULL DEFAULT false,
    "fastLastSyncAt" TIMESTAMP(3),
    "fastRevision" INTEGER NOT NULL DEFAULT 0,
    "syncEnqueued" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FastSyncState_pkey" PRIMARY KEY ("shopId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "ProductTag_shopId_tag_idx" ON "ProductTag"("shopId", "tag");

-- CreateIndex
CREATE INDEX "ProductCollection_shopId_collectionId_idx" ON "ProductCollection"("shopId", "collectionId");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_status_idx" ON "ProductLite"("shopId", "status");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_vendor_idx" ON "ProductLite"("shopId", "vendor");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_productType_idx" ON "ProductLite"("shopId", "productType");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_updatedAtShopify_idx" ON "ProductLite"("shopId", "updatedAtShopify");

-- AddForeignKey
ALTER TABLE "ProductLite" ADD CONSTRAINT "ProductLite_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantRollup" ADD CONSTRAINT "VariantRollup_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastSyncState" ADD CONSTRAINT "FastSyncState_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
