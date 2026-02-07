/*
  Warnings:

  - You are about to drop the column `bulkOperationId` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `bulkOperationStatus` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `bulkOperationUrl` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `candidateCount` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `errorMessage` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `filterJson` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `filterSummary` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `progress` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `total` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the `SnapshotRunEvent` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[shopId,planHash]` on the table `SnapshotRun` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SnapshotRunState" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- DropForeignKey
ALTER TABLE "SnapshotRunEvent" DROP CONSTRAINT "SnapshotRunEvent_snapshotRunId_fkey";

-- DropIndex
DROP INDEX "SnapshotRun_shopId_status_id_idx";

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "fastLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "fastReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fastRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fastSyncEnqueued" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SnapshotRun" DROP COLUMN "bulkOperationId",
DROP COLUMN "bulkOperationStatus",
DROP COLUMN "bulkOperationUrl",
DROP COLUMN "candidateCount",
DROP COLUMN "errorMessage",
DROP COLUMN "filterJson",
DROP COLUMN "filterSummary",
DROP COLUMN "progress",
DROP COLUMN "status",
DROP COLUMN "total",
DROP COLUMN "updatedAt",
ADD COLUMN     "approxBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "productCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reuseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "state" "SnapshotRunState" NOT NULL DEFAULT 'QUEUED';

-- DropTable
DROP TABLE "SnapshotRunEvent";

-- DropEnum
DROP TYPE "SnapshotRunStatus";

-- CreateTable
CREATE TABLE "SnapshotProduct" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "snapshotRunId" BIGINT NOT NULL,
    "productId" TEXT NOT NULL,
    "dataCompressed" BYTEA NOT NULL,
    "compression" TEXT NOT NULL,

    CONSTRAINT "SnapshotProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkEditJob" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "action" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BulkEditJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SnapshotProduct_shopId_snapshotRunId_id_idx" ON "SnapshotProduct"("shopId", "snapshotRunId", "id");

-- CreateIndex
CREATE INDEX "BulkEditJob_shopId_planHash_idx" ON "BulkEditJob"("shopId", "planHash");

-- CreateIndex
CREATE INDEX "BulkEditJob_shopId_state_createdAt_idx" ON "BulkEditJob"("shopId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_id_idx" ON "ProductLite"("shopId", "id");

-- CreateIndex
CREATE INDEX "SnapshotRun_shopId_state_expiresAt_idx" ON "SnapshotRun"("shopId", "state", "expiresAt");

-- CreateIndex
CREATE INDEX "SnapshotRun_shopId_createdAt_idx" ON "SnapshotRun"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SnapshotRun_shopId_planHash_key" ON "SnapshotRun"("shopId", "planHash");

-- AddForeignKey
ALTER TABLE "SnapshotProduct" ADD CONSTRAINT "SnapshotProduct_snapshotRunId_fkey" FOREIGN KEY ("snapshotRunId") REFERENCES "SnapshotRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkEditJob" ADD CONSTRAINT "BulkEditJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
