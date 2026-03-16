-- CreateEnum
CREATE TYPE "BulkEditScope" AS ENUM ('PRODUCT', 'VARIANT');

-- CreateEnum
CREATE TYPE "BulkEditAction" AS ENUM ('SET', 'APPEND', 'REMOVE', 'REPLACE');

-- CreateEnum
CREATE TYPE "BulkEditJobStatus" AS ENUM ('QUEUED', 'BUILDING', 'UPLOADING', 'SUBMITTED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'SNAPSHOT_RUN';

-- AlterTable
ALTER TABLE "ProductLite" ADD COLUMN     "shopifyGid" TEXT;

-- AlterTable
ALTER TABLE "VariantLite" ADD COLUMN     "productGid" TEXT,
ADD COLUMN     "variantGid" TEXT;

-- CreateTable
CREATE TABLE "BulkEditJob" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "BulkEditJobStatus" NOT NULL DEFAULT 'QUEUED',
    "scope" "BulkEditScope" NOT NULL,
    "action" "BulkEditAction" NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "filterExprJson" JSONB NOT NULL,
    "editPayloadJson" JSONB NOT NULL,
    "idempotencyKey" TEXT,
    "selectedCount" INTEGER,
    "inputLineCount" INTEGER,
    "previewCount" INTEGER,
    "mutationName" TEXT NOT NULL,
    "bulkOperationId" TEXT,
    "stagedUploadPath" TEXT,
    "stagedResourceUrl" TEXT,
    "resultUrl" TEXT,
    "partialDataUrl" TEXT,
    "objectCount" INTEGER,
    "fileSizeBytes" BIGINT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkEditJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkEditJobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT,
    "productGid" TEXT,
    "variantId" TEXT,
    "variantGid" TEXT,
    "inputJson" JSONB,
    "resultJson" JSONB,
    "userErrorsJson" JSONB,
    "success" BOOLEAN,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkEditJobItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkEditJob_shopId_status_createdAt_idx" ON "BulkEditJob"("shopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BulkEditJob_shopId_scope_status_idx" ON "BulkEditJob"("shopId", "scope", "status");

-- CreateIndex
CREATE INDEX "BulkEditJob_shopId_bulkOperationId_idx" ON "BulkEditJob"("shopId", "bulkOperationId");

-- CreateIndex
CREATE INDEX "BulkEditJob_shopId_createdAt_idx" ON "BulkEditJob"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BulkEditJob_shopId_idempotencyKey_key" ON "BulkEditJob"("shopId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BulkEditJobItem_jobId_idx" ON "BulkEditJobItem"("jobId");

-- CreateIndex
CREATE INDEX "BulkEditJobItem_shopId_jobId_idx" ON "BulkEditJobItem"("shopId", "jobId");

-- CreateIndex
CREATE INDEX "BulkEditJobItem_shopId_productId_idx" ON "BulkEditJobItem"("shopId", "productId");

-- CreateIndex
CREATE INDEX "BulkEditJobItem_shopId_variantId_idx" ON "BulkEditJobItem"("shopId", "variantId");

-- CreateIndex
CREATE INDEX "BulkEditJobItem_jobId_success_idx" ON "BulkEditJobItem"("jobId", "success");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_shopifyGid_idx" ON "ProductLite"("shopId", "shopifyGid");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_variantGid_idx" ON "VariantLite"("shopId", "variantGid");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_productGid_idx" ON "VariantLite"("shopId", "productGid");

-- AddForeignKey
ALTER TABLE "BulkEditJobItem" ADD CONSTRAINT "BulkEditJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BulkEditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkEditJobItem" ADD CONSTRAINT "BulkEditJobItem_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkEditJobItem" ADD CONSTRAINT "BulkEditJobItem_shopId_variantId_fkey" FOREIGN KEY ("shopId", "variantId") REFERENCES "VariantLite"("shopId", "variantId") ON DELETE CASCADE ON UPDATE CASCADE;
