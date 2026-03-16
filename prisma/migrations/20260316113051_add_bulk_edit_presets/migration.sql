-- CreateTable
CREATE TABLE "BulkEditPreset" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "BulkEditScope" NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "action" "BulkEditAction" NOT NULL,
    "valueJson" JSONB NOT NULL,
    "filterExprJson" JSONB NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkEditPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkEditPreset_shopId_createdAt_idx" ON "BulkEditPreset"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "BulkEditPreset_shopId_isFavorite_createdAt_idx" ON "BulkEditPreset"("shopId", "isFavorite", "createdAt");

-- CreateIndex
CREATE INDEX "BulkEditPreset_shopId_isArchived_createdAt_idx" ON "BulkEditPreset"("shopId", "isArchived", "createdAt");
