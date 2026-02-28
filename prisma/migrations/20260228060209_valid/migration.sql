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

-- CreateTable
CREATE TABLE "ProductTag" (
    "id" BIGSERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCollection" (
    "id" BIGSERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "collectionHandle" TEXT,
    "collectionTitle" TEXT,

    CONSTRAINT "ProductCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantLite" (
    "id" BIGSERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DECIMAL(18,6) NOT NULL,
    "compareAtPrice" DECIMAL(65,30),
    "cost" DECIMAL(65,30),
    "taxable" BOOLEAN,
    "trackQuantity" BOOLEAN,
    "inventoryQty" INTEGER NOT NULL,
    "inventoryPolicy" TEXT,
    "weightGrams" INTEGER,
    "weightUnit" TEXT,
    "option1Value" TEXT,
    "option2Value" TEXT,
    "option3Value" TEXT,

    CONSTRAINT "VariantLite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionValue" (
    "id" BIGSERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInventoryLocation" (
    "id" BIGSERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "hasInventory" BOOLEAN NOT NULL DEFAULT false,
    "totalQuantity" INTEGER,

    CONSTRAINT "ProductInventoryLocation_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "VariantRollup_shopId_minPrice_idx" ON "VariantRollup"("shopId", "minPrice");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_maxPrice_idx" ON "VariantRollup"("shopId", "maxPrice");

-- CreateIndex
CREATE INDEX "JobLedger_shopId_type_status_idx" ON "JobLedger"("shopId", "type", "status");

-- CreateIndex
CREATE INDEX "JobLedger_shopId_createdAt_idx" ON "JobLedger"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductTag_shopId_tag_productId_idx" ON "ProductTag"("shopId", "tag", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTag_shopId_productId_tag_key" ON "ProductTag"("shopId", "productId", "tag");

-- CreateIndex
CREATE INDEX "ProductCollection_shopId_collectionId_productId_idx" ON "ProductCollection"("shopId", "collectionId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCollection_shopId_productId_collectionId_key" ON "ProductCollection"("shopId", "productId", "collectionId");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_productId_idx" ON "VariantLite"("shopId", "productId");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_sku_idx" ON "VariantLite"("shopId", "sku");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_barcode_idx" ON "VariantLite"("shopId", "barcode");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_price_idx" ON "VariantLite"("shopId", "price");

-- CreateIndex
CREATE UNIQUE INDEX "VariantLite_shopId_variantId_key" ON "VariantLite"("shopId", "variantId");

-- CreateIndex
CREATE INDEX "ProductOptionValue_shopId_optionIndex_value_productId_idx" ON "ProductOptionValue"("shopId", "optionIndex", "value", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_shopId_productId_optionIndex_value_key" ON "ProductOptionValue"("shopId", "productId", "optionIndex", "value");

-- CreateIndex
CREATE INDEX "ProductInventoryLocation_shopId_locationId_productId_idx" ON "ProductInventoryLocation"("shopId", "locationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductInventoryLocation_shopId_productId_locationId_key" ON "ProductInventoryLocation"("shopId", "productId", "locationId");

-- AddForeignKey
ALTER TABLE "VariantRollup" ADD CONSTRAINT "VariantRollup_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantLite" ADD CONSTRAINT "VariantLite_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventoryLocation" ADD CONSTRAINT "ProductInventoryLocation_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
