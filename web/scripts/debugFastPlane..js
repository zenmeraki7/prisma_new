// FILE: web/scripts/debugFastPlane.js
import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  const shops = await prisma.shop.findMany();
  console.log("Shops:");
  for (const s of shops) {
    console.log(`- shopDomain=${s.shopDomain} id=${s.id}`);
    const count = await prisma.productLite.count({
      where: { shopId: s.id },
    });
    console.log(`  ProductLite rows for this shop: ${count}`);
  }

  const total = await prisma.productLite.count();
  console.log(`TOTAL ProductLite rows (all shops): ${total}`);
}

main()
  .catch((e) => {
    console.error("❌ debugFastPlane error:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
