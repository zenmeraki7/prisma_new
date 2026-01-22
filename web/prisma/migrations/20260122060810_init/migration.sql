/*
  Warnings:

  - You are about to drop the column `hasInStockVariant` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `hasOutOfStockVariant` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to drop the column `variantCount` on the `VariantRollup` table. All the data in the column will be lost.
  - You are about to alter the column `minPrice` on the `VariantRollup` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,6)` to `Decimal(18,2)`.
  - You are about to alter the column `maxPrice` on the `VariantRollup` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,6)` to `Decimal(18,2)`.
  - You are about to drop the `JobLedger` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SnapshotState" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SnapshotRunEventKind" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "BulkJobState" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "VariantRollup" DROP COLUMN "hasInStockVariant",
DROP COLUMN "hasOutOfStockVariant",
DROP COLUMN "updatedAt",
DROP COLUMN "variantCount",
ALTER COLUMN "minPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "maxPrice" SET DATA TYPE DECIMAL(18,2);

-- DropTable
DROP TABLE "JobLedger";

-- DropEnum
DROP TYPE "JobStatus";

-- DropEnum
DROP TYPE "JobType";

-- CreateTable
CREATE TABLE "SnapshotRun" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "state" "SnapshotState" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "filterSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "SnapshotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotProduct" (
    "snapshotRunId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortKey" TIMESTAMP(3),

    CONSTRAINT "SnapshotProduct_pkey" PRIMARY KEY ("snapshotRunId","productId")
);

-- CreateTable
CREATE TABLE "SnapshotRunEvent" (
    "id" TEXT NOT NULL,
    "snapshotRunId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "kind" "SnapshotRunEventKind" NOT NULL DEFAULT 'INFO',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnapshotRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkOpsJob" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeRef" TEXT NOT NULL,
    "actionKind" TEXT NOT NULL,
    "actionPayload" JSONB NOT NULL,
    "state" "BulkJobState" NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkOpsJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkOpsJobEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulkOpsJobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyLedger" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SnapshotRun_shopId_planHash_idx" ON "SnapshotRun"("shopId", "planHash");

-- CreateIndex
CREATE INDEX "SnapshotRun_shopId_createdAt_idx" ON "SnapshotRun"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "SnapshotRun_state_idx" ON "SnapshotRun"("state");

-- CreateIndex
CREATE INDEX "SnapshotRun_expiresAt_idx" ON "SnapshotRun"("expiresAt");

-- CreateIndex
CREATE INDEX "SnapshotProduct_shopId_productId_idx" ON "SnapshotProduct"("shopId", "productId");

-- CreateIndex
CREATE INDEX "SnapshotRunEvent_snapshotRunId_createdAt_idx" ON "SnapshotRunEvent"("snapshotRunId", "createdAt");

-- CreateIndex
CREATE INDEX "SnapshotRunEvent_shopId_createdAt_idx" ON "SnapshotRunEvent"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "BulkOpsJob_shopId_createdAt_idx" ON "BulkOpsJob"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "BulkOpsJob_shopId_state_idx" ON "BulkOpsJob"("shopId", "state");

-- CreateIndex
CREATE INDEX "BulkOpsJobEvent_jobId_createdAt_idx" ON "BulkOpsJobEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "BulkOpsJobEvent_shopId_createdAt_idx" ON "BulkOpsJobEvent"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyLedger_shopId_scope_key_key" ON "IdempotencyLedger"("shopId", "scope", "key");

-- AddForeignKey
ALTER TABLE "SnapshotRun" ADD CONSTRAINT "SnapshotRun_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotProduct" ADD CONSTRAINT "SnapshotProduct_snapshotRunId_fkey" FOREIGN KEY ("snapshotRunId") REFERENCES "SnapshotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotProduct" ADD CONSTRAINT "SnapshotProduct_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotRunEvent" ADD CONSTRAINT "SnapshotRunEvent_snapshotRunId_fkey" FOREIGN KEY ("snapshotRunId") REFERENCES "SnapshotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotRunEvent" ADD CONSTRAINT "SnapshotRunEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkOpsJob" ADD CONSTRAINT "BulkOpsJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkOpsJobEvent" ADD CONSTRAINT "BulkOpsJobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BulkOpsJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkOpsJobEvent" ADD CONSTRAINT "BulkOpsJobEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyLedger" ADD CONSTRAINT "IdempotencyLedger_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
