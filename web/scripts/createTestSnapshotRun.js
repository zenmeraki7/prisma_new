// web/scripts/createTestSnapshotRun.js
import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  // Must match shopDomain in Prisma Studio exactly:
  const TARGET_SHOP_DOMAIN = "demo-zen-store.myshopify.com";

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: TARGET_SHOP_DOMAIN },
  });

  if (!shop) {
    console.error("❌ No Shop row found for", TARGET_SHOP_DOMAIN);
    console.error(
      "   Make sure you've opened the app and run syncProductsToDb at least once for that shop."
    );
    return;
  }

  console.log("Using shop", shop.id, shop.shopDomain);

  const run = await prisma.snapshotRun.create({
    data: {
      shopId: shop.id,
      planHash: "test-plan-hash",
      filterSummary: "Dummy: status = ACTIVE",
      state: "SUCCEEDED",
      progress: 10,
      total: 10,
      errorMessage: null,
    },
  });

  console.log("✅ Created SnapshotRun:", run.id);

  await prisma.snapshotRunEvent.createMany({
    data: [
      {
        shopId: shop.id,
        snapshotRunId: run.id,
        kind: "INFO",
        message: "Dummy snapshot run created for UI test.",
      },
      {
        shopId: shop.id,
        snapshotRunId: run.id,
        kind: "INFO",
        message: "Processed 10 of 10 products.",
      },
    ],
  });

  console.log("✅ Created SnapshotRunEvents.");
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
