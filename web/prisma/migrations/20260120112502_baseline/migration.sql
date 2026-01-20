-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FAST_FULL_SYNC', 'FAST_DELTA_REFRESH', 'SNAPSHOT_RUN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "ShopState" (
    "shopId" TEXT NOT NULL,
    "fastReady" BOOLEAN NOT NULL DEFAULT false,
    "fastLastSyncAt" TIMESTAMP(3),
    "fastRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopState_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "ProductLite" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "vendor" TEXT,
    "productType" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasImages" BOOLEAN NOT NULL DEFAULT false,
    "createdAtShopify" TIMESTAMP(3),
    "updatedAtShopify" TIMESTAMP(3),
    "publishedAtShopify" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductLite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantRollup" (
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantCount" INTEGER NOT NULL DEFAULT 0,
    "totalInventory" INTEGER NOT NULL DEFAULT 0,
    "minPrice" DECIMAL(18,6),
    "maxPrice" DECIMAL(18,6),
    "hasOutOfStockVariant" BOOLEAN NOT NULL DEFAULT false,
    "hasInStockVariant" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantRollup_pkey" PRIMARY KEY ("shopId","productId")
);

-- CreateTable
CREATE TABLE "JobLedger" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "queueJobId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductLite_shopId_updatedAtShopify_idx" ON "ProductLite"("shopId", "updatedAtShopify" DESC);

-- CreateIndex
CREATE INDEX "ProductLite_shopId_title_idx" ON "ProductLite"("shopId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "ProductLite_shopId_id_key" ON "ProductLite"("shopId", "id");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_totalInventory_idx" ON "VariantRollup"("shopId", "totalInventory");

-- CreateIndex
CREATE INDEX "JobLedger_shopId_type_status_idx" ON "JobLedger"("shopId", "type", "status");

-- CreateIndex
CREATE INDEX "JobLedger_shopId_createdAt_idx" ON "JobLedger"("shopId", "createdAt");
