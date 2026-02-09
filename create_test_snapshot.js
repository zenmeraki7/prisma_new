import { prisma } from "./web/db/prisma.js";

async function createTestSnapshot() {
  try {
    const shopDomain = "demo-zen-store.myshopify.com"; // Adjust if needed
    let shop = await prisma.shop.findUnique({ where: { shopDomain } });

    if (!shop) {
      console.log(`Shop ${shopDomain} not found, finding first available shop...`);
      shop = await prisma.shop.findFirst();
    }

    if (!shop) {
      console.error("No shop found in DB. Please run the app and install it first.");
      process.exit(1);
    }

    console.log(`Using shop: ${shop.shopDomain} (${shop.id})`);

    // Create a product if none exists
    let product = await prisma.productLite.findFirst({ where: { shopId: shop.id } });
    if (!product) {
        console.log("No product found, creating dummy product...");
        product = await prisma.productLite.create({
            data: {
                id: "gid://shopify/Product/1234567890",
                shopId: shop.id,
                title: "Test Product",
                handle: "test-product",
                status: "ACTIVE",
                hasImages: true,
                updatedAtShopify: new Date()
            }
        });
    }

    // Hash for "planHash" - usually a hash of the filter json
    const planHash = "test-hash-123";

    console.log("Creating SUCCEEDED snapshot run...");
    const run = await prisma.snapshotRun.create({
      data: {
        shopId: shop.id,
        planHash: planHash,
        state: "SUCCEEDED",
        total: 1,
        progress: 1,
        filterSummary: '{"test":"filter"}'
      }
    });

    console.log(`Snapshot Run created: ${run.id}`);

    await prisma.snapshotProduct.create({
      data: {
        snapshotRunId: run.id,
        shopId: shop.id,
        productId: product.id
      }
    });

    console.log("Snapshot Product linked.");
    console.log("DONE. You can now test with this Plan Hash if you can force it, or just verify DB retrieval.");

  } catch (e) {
    console.error("Error creating snapshot:", e);
  } finally {
    await prisma.$disconnect();
  }
}

createTestSnapshot();
