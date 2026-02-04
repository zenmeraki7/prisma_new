/*
  Warnings:

  - You are about to drop the column `state` on the `SnapshotRun` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "SnapshotRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'INGESTING', 'COMPLETED', 'FAILED');

-- DropIndex
DROP INDEX "SnapshotRun_shopId_state_id_idx";

-- AlterTable
ALTER TABLE "SnapshotRun" DROP COLUMN "state",
ADD COLUMN     "bulkOperationId" TEXT,
ADD COLUMN     "bulkOperationStatus" TEXT,
ADD COLUMN     "bulkOperationUrl" TEXT,
ADD COLUMN     "candidateCount" INTEGER,
ADD COLUMN     "filterJson" JSONB,
ADD COLUMN     "status" "SnapshotRunStatus" NOT NULL DEFAULT 'QUEUED';

-- CreateIndex
CREATE INDEX "SnapshotRun_shopId_status_id_idx" ON "SnapshotRun"("shopId", "status", "id");
