// FILE: web/scripts/debugProductLite.js
import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  const SHOP_DOMAIN = "demo-zen-store.myshopify.com"; // same as seedShop + snapshot script

  // 1) Find Shop row
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: SHOP_DOMAIN },
  });

  if (!shop) {
    console.error("❌ No Shop row for", SHOP_DOMAIN);
    console.error("   Run seedShop.js or open the app once.");
    process.exit(1);
  }

  console.log("🛒 Shop row:");
  console.log({ id: shop.id, shopDomain: shop.shopDomain });

  // 2) Count ProductLite rows for THIS shopId
  const countForShop = await prisma.productLite.count({
    where: { shopId: shop.id },
  });

  console.log("✅ ProductLite rows for this shopId:", countForShop);

  // 3) Show a few sample rows for this shopId
  const sampleForShop = await prisma.productLite.findMany({
    where: { shopId: shop.id },
    orderBy: { updatedAtShopify: "desc" },
    take: 5,
  });

  console.log("🔍 Sample ProductLite rows for this shopId:");
  console.dir(sampleForShop, { depth: null });

  // 4) Optional: see if there are ProductLite rows with some OTHER shopId
  const anyCount = await prisma.productLite.count();
  console.log("📊 TOTAL ProductLite rows (all shops):", anyCount);

  if (anyCount > 0 && countForShop === 0) {
    const allShopIds = await prisma.productLite.findMany({
      select: { shopId: true },
      take: 20,
    });

    const uniqueShopIds = [...new Set(allShopIds.map((r) => r.shopId))];
    console.log("⚠️ Distinct shopIds present in ProductLite:", uniqueShopIds);
  }
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
