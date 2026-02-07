/*
  Warnings:

  - A unique constraint covering the columns `[shopId,planHash]` on the table `SnapshotRun` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "SnapshotRun_shopId_planHash_idx";

-- CreateIndex
CREATE UNIQUE INDEX "SnapshotRun_shopId_planHash_key" ON "SnapshotRun"("shopId", "planHash");
