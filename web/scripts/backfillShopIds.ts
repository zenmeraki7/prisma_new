// FILE: web/scripts/backfillShopIds.ts

import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  console.log("[backfillShopIds] starting...");

  // Assumes ProductLite.shopId currently stores shopDomain.
  // Update it to store Shop.id instead.
  const shops = await prisma.shop.findMany({
    select: { id: true, shopDomain: true },
  });

  for (const s of shops) {
    console.log(
      "[backfillShopIds] shopDomain =",
      s.shopDomain,
      "id =",
      s.id,
    );

    const result = await prisma.$executeRawUnsafe(
      `
      UPDATE "ProductLite" AS p
      SET "shopId" = $1
      WHERE p."shopId" = $2
    `,
      s.id,
      s.shopDomain,
    );

    console.log(
      "[backfillShopIds] updated rows for",
      s.shopDomain,
      "->",
      s.id,
      "rows =",
      result,
    );
  }

  console.log("[backfillShopIds] done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
