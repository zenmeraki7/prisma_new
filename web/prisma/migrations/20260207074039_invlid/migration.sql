/*
  Warnings:

  - The values [EXPIRED] on the enum `SnapshotRunState` will be removed. If these variants are still used in the database, this will fail.
  - The primary key for the `SnapshotProduct` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `compression` on the `SnapshotProduct` table. All the data in the column will be lost.
  - You are about to drop the column `dataCompressed` on the `SnapshotProduct` table. All the data in the column will be lost.
  - The `id` column on the `SnapshotProduct` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `approxBytes` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `productCount` on the `SnapshotRun` table. All the data in the column will be lost.
  - You are about to drop the column `reuseCount` on the `SnapshotRun` table. All the data in the column will be lost.
  - Added the required column `sortKey` to the `SnapshotProduct` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `productId` on the `SnapshotProduct` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SnapshotRunState_new" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
ALTER TABLE "public"."SnapshotRun" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "SnapshotRun" ALTER COLUMN "state" TYPE "SnapshotRunState_new" USING ("state"::text::"SnapshotRunState_new");
ALTER TYPE "SnapshotRunState" RENAME TO "SnapshotRunState_old";
ALTER TYPE "SnapshotRunState_new" RENAME TO "SnapshotRunState";
DROP TYPE "public"."SnapshotRunState_old";
ALTER TABLE "SnapshotRun" ALTER COLUMN "state" SET DEFAULT 'QUEUED';
COMMIT;

-- DropIndex
DROP INDEX "SnapshotProduct_shopId_snapshotRunId_id_idx";

-- DropIndex
DROP INDEX "SnapshotRun_shopId_createdAt_idx";

-- DropIndex
DROP INDEX "SnapshotRun_shopId_planHash_key";

-- DropIndex
DROP INDEX "SnapshotRun_shopId_state_expiresAt_idx";

-- AlterTable
ALTER TABLE "SnapshotProduct" DROP CONSTRAINT "SnapshotProduct_pkey",
DROP COLUMN "compression",
DROP COLUMN "dataCompressed",
ADD COLUMN     "sortKey" TIMESTAMP(3) NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "productId",
ADD COLUMN     "productId" BIGINT NOT NULL,
ADD CONSTRAINT "SnapshotProduct_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "SnapshotRun" DROP COLUMN "approxBytes",
DROP COLUMN "completedAt",
DROP COLUMN "expiresAt",
DROP COLUMN "productCount",
DROP COLUMN "reuseCount",
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "filterSummary" TEXT,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VariantRollup" ALTER COLUMN "max_price" DROP NOT NULL,
ALTER COLUMN "min_price" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SnapshotRunEvent" (
    "id" BIGSERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "snapshotRunId" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnapshotRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SnapshotRunEvent_shopId_snapshotRunId_createdAt_idx" ON "SnapshotRunEvent"("shopId", "snapshotRunId", "createdAt");

-- CreateIndex
CREATE INDEX "SnapshotProduct_shopId_snapshotRunId_sortKey_idx" ON "SnapshotProduct"("shopId", "snapshotRunId", "sortKey");

-- CreateIndex
CREATE INDEX "SnapshotRun_shopId_planHash_idx" ON "SnapshotRun"("shopId", "planHash");

-- CreateIndex
CREATE INDEX "SnapshotRun_shopId_state_createdAt_idx" ON "SnapshotRun"("shopId", "state", "createdAt");

-- AddForeignKey
ALTER TABLE "SnapshotRunEvent" ADD CONSTRAINT "SnapshotRunEvent_snapshotRunId_fkey" FOREIGN KEY ("snapshotRunId") REFERENCES "SnapshotRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
