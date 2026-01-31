-- DropForeignKey
ALTER TABLE "SnapshotProduct" DROP CONSTRAINT "SnapshotProduct_shopId_fkey";

-- DropForeignKey
ALTER TABLE "SnapshotProduct" DROP CONSTRAINT "SnapshotProduct_snapshotRunId_fkey";

-- AddForeignKey
ALTER TABLE "SnapshotProduct" ADD CONSTRAINT "SnapshotProduct_snapshotRunId_fkey" FOREIGN KEY ("snapshotRunId") REFERENCES "SnapshotRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotProduct" ADD CONSTRAINT "SnapshotProduct_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotProduct" ADD CONSTRAINT "SnapshotProduct_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
