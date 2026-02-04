// web/scripts/seedShop.js
import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  const shopDomain = "demo-zen-store.myshopify.com";

  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    update: {}, // nothing to update for now
    create: {
      id: shopDomain,              // <- IMPORTANT
      shopDomain,
      accessToken: "DUMMY_LOCAL_TOKEN",
    },
  });

  console.log("✅ Upserted shop:", shop);
}

main()
  .catch(console.error)
  .finally(async () => prisma.$disconnect());
