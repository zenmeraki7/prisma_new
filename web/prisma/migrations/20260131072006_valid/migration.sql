-- CreateTable
CREATE TABLE "VariantLite" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DECIMAL(18,2),
    "compareAt" DECIMAL(18,2),
    "inventoryQty" INTEGER,
    "trackQuantity" BOOLEAN NOT NULL DEFAULT false,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "weight" DECIMAL(18,3),
    "weightUnit" TEXT,

    CONSTRAINT "VariantLite_pkey" PRIMARY KEY ("shopId","id")
);

-- CreateTable
CREATE TABLE "ProductOptionValue" (
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "optionValue" TEXT NOT NULL,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("shopId","productId","optionName","optionValue")
);

-- CreateTable
CREATE TABLE "ProductInventoryLocation" (
    "shopId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER,

    CONSTRAINT "ProductInventoryLocation_pkey" PRIMARY KEY ("shopId","variantId","locationId")
);

-- CreateIndex
CREATE INDEX "VariantLite_shopId_productId_idx" ON "VariantLite"("shopId", "productId");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_sku_idx" ON "VariantLite"("shopId", "sku");

-- CreateIndex
CREATE INDEX "VariantLite_shopId_price_idx" ON "VariantLite"("shopId", "price");

-- CreateIndex
CREATE INDEX "ProductOptionValue_shopId_optionName_idx" ON "ProductOptionValue"("shopId", "optionName");

-- CreateIndex
CREATE INDEX "ProductOptionValue_shopId_optionValue_idx" ON "ProductOptionValue"("shopId", "optionValue");

-- CreateIndex
CREATE INDEX "ProductInventoryLocation_shopId_locationId_idx" ON "ProductInventoryLocation"("shopId", "locationId");

-- AddForeignKey
ALTER TABLE "VariantLite" ADD CONSTRAINT "VariantLite_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "ProductLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventoryLocation" ADD CONSTRAINT "ProductInventoryLocation_shopId_variantId_fkey" FOREIGN KEY ("shopId", "variantId") REFERENCES "VariantLite"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
