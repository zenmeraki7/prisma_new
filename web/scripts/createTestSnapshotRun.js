import "dotenv/config";
import { prisma } from "../db/prisma.js";
import { SnapshotRunState } from "@prisma/client";

async function main() {
  const TARGET_SHOP_DOMAIN = "demo-zen-store.myshopify.com";
  const PLAN_HASH = "test-plan-hash";

  // ---------- FIND SHOP ----------
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: TARGET_SHOP_DOMAIN },
  });

  if (!shop) {
    console.error("❌ No Shop row found for", TARGET_SHOP_DOMAIN);
    return;
  }

  console.log("Using shop:", shop.id, shop.shopDomain);

  // ---------- UPSERT SNAPSHOT RUN ----------
  const run = await prisma.snapshotRun.upsert({
    where: {
      shopId_planHash: {
        shopId: shop.id,
        planHash: PLAN_HASH,
      },
    },
    update: {
      state: SnapshotRunState.QUEUED,
      progress: 0,
      total: 10,
      errorMessage: null,
    },
    create: {
      shopId: shop.id,
      planHash: PLAN_HASH,
      state: SnapshotRunState.QUEUED,
      progress: 0,
      total: 10,
      errorMessage: null,
    },
  });

  console.log("✅ SnapshotRun ready:", run.id.toString());

  // ---------- OPTIONAL EVENTS ----------
  // createMany will fail if model missing, but in your schema it exists
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

  console.log("✅ SnapshotRunEvents created");
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
