-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FAST_FULL_SYNC', 'FAST_DELTA_REFRESH');

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
    "shopId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "vendor" TEXT,
    "productType" TEXT,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "description" TEXT,
    "templateSuffix" TEXT,
    "seoHidden" BOOLEAN NOT NULL DEFAULT false,
    "visibleOnlineStore" BOOLEAN NOT NULL DEFAULT false,
    "visiblePos" BOOLEAN NOT NULL DEFAULT false,
    "option1Name" TEXT,
    "option2Name" TEXT,
    "option3Name" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasImages" BOOLEAN NOT NULL DEFAULT false,
    "createdAtShopify" TIMESTAMP(3),
    "updatedAtShopify" TIMESTAMP(3),
    "publishedAtShopify" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductLite_pkey" PRIMARY KEY ("shopId","id")
);

-- CreateTable
CREATE TABLE "VariantRollup" (
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantCount" INTEGER NOT NULL DEFAULT 0,
    "totalInventory" INTEGER NOT NULL DEFAULT 0,
    "minPrice" DECIMAL(18,6),
    "maxPrice" DECIMAL(18,6),
    "minCompareAtPrice" DECIMAL(18,6),
    "maxCompareAtPrice" DECIMAL(18,6),
    "minCost" DECIMAL(18,6),
    "maxCost" DECIMAL(18,6),
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
    "title" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DECIMAL(18,6),
    "compareAtPrice" DECIMAL(18,6),
    "cost" DECIMAL(18,6),
    "profitMarginPct" DECIMAL(9,4),
    "taxable" BOOLEAN,
    "trackQuantity" BOOLEAN,
    "requiresShipping" BOOLEAN,
    "inventoryQty" INTEGER NOT NULL DEFAULT 0,
    "inventoryPolicy" TEXT,
    "countryOfOrigin" TEXT,
    "hsTariffCode" TEXT,
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
    "locationName" TEXT,
    "hasInventory" BOOLEAN NOT NULL DEFAULT false,
    "totalQuantity" INTEGER,

    CONSTRAINT "ProductInventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductLite_shopId_updatedAtShopify_idx" ON "ProductLite"("shopId", "updatedAtShopify" DESC);

-- CreateIndex
CREATE INDEX "ProductLite_shopId_title_idx" ON "ProductLite"("shopId", "title");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_handle_idx" ON "ProductLite"("shopId", "handle");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_status_idx" ON "ProductLite"("shopId", "status");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_vendor_idx" ON "ProductLite"("shopId", "vendor");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_productType_idx" ON "ProductLite"("shopId", "productType");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_categoryName_idx" ON "ProductLite"("shopId", "categoryName");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_visibleOnlineStore_idx" ON "ProductLite"("shopId", "visibleOnlineStore");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_visiblePos_idx" ON "ProductLite"("shopId", "visiblePos");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_seoHidden_idx" ON "ProductLite"("shopId", "seoHidden");

-- CreateIndex
CREATE INDEX "ProductLite_shopId_templateSuffix_idx" ON "ProductLite"("shopId", "templateSuffix");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_totalInventory_idx" ON "VariantRollup"("shopId", "totalInventory");

-- CreateIndex
CREATE INDEX "VariantRollup_shopId_variantCount_idx" ON "VariantRollup"("shopId", "variantCount");

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
CREATE INDEX "ProductCollection_shopId_collectionHandle_productId_idx" ON "ProductCollection"("shopId", "collectionHandle", "productId");

-- CreateIndex
CREATE INDEX "ProductCollection_shopId_collectionTitle_productId_idx" ON "ProductCollection"("shopId", "collectionTitle", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCollection_shopId_productId_collectionId_key" ON "ProductCollection"("shopId", "productId", "collectionId");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_productId_idx" ON "VariantLite"("shopId", "productId");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_sku_idx" ON "VariantLite"("shopId", "sku");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_barcode_idx" ON "VariantLite"("shopId", "barcode");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_title_idx" ON "VariantLite"("shopId", "title");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_price_idx" ON "VariantLite"("shopId", "price");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_compareAtPrice_idx" ON "VariantLite"("shopId", "compareAtPrice");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_cost_idx" ON "VariantLite"("shopId", "cost");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_profitMarginPct_idx" ON "VariantLite"("shopId", "profitMarginPct");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_inventoryQty_idx" ON "VariantLite"("shopId", "inventoryQty");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_inventoryPolicy_idx" ON "VariantLite"("shopId", "inventoryPolicy");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_trackQuantity_idx" ON "VariantLite"("shopId", "trackQuantity");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_taxable_idx" ON "VariantLite"("shopId", "taxable");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_requiresShipping_idx" ON "VariantLite"("shopId", "requiresShipping");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_countryOfOrigin_idx" ON "VariantLite"("shopId", "countryOfOrigin");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_hsTariffCode_idx" ON "VariantLite"("shopId", "hsTariffCode");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_weightUnit_idx" ON "VariantLite"("shopId", "weightUnit");

-- CreateIndex
CREATE UNIQUE INDEX "VariantLite_shopId_variantId_key" ON "VariantLite"("shopId", "variantId");

-- CreateIndex
CREATE INDEX "ProductOptionValue_shopId_optionIndex_value_productId_idx" ON "ProductOptionValue"("shopId", "optionIndex", "value", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_shopId_productId_optionIndex_value_key" ON "ProductOptionValue"("shopId", "productId", "optionIndex", "value");

-- CreateIndex
CREATE INDEX "ProductInventoryLocation_shopId_locationId_productId_idx" ON "ProductInventoryLocation"("shopId", "locationId", "productId");

-- CreateIndex
CREATE INDEX "ProductInventoryLocation_shopId_locationName_productId_idx" ON "ProductInventoryLocation"("shopId", "locationName", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductInventoryLocation_shopId_productId_locationId_key" ON "ProductInventoryLocation"("shopId", "productId", "locationId");

-- AddForeignKey
ALTER TABLE "VariantRollup" ADD CONSTRAINT "VariantRollup_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantLite" ADD CONSTRAINT "VariantLite_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventoryLocation" ADD CONSTRAINT "ProductInventoryLocation_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
