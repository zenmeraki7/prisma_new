import { prisma } from "../../db/prisma.js";
import { applyVariantSnapshotFilter } from "../../lib/snapshots/applyVariantSnapshotFilter.js";

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export async function snapshotFilterHandler(req, res) {
  try {
    const session = res.locals.shopify?.session;
    if (!session) {
      return res.status(401).json({ error: "Unauthenticated" });
    }
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: session.shop },
    });
    if (!shop) {
      return res.status(400).json({ error: "Shop not found" });
    }

    const { planHash, filters } = req.body;

    console.log("📥 Snapshot filter request received");
    console.log("🔑 planHash:", planHash);
    console.log("🧩 variant filters:", JSON.stringify(filters, null, 2));

    if (!filters?.length) {
      return res.json({ items: [] });
    }

    const productIds = await applyVariantSnapshotFilter({
      planHash,
      shopId: shop.id,
      filters,
    });

    console.log("✅ Snapshot matched productIds:", productIds.length);

    // Return minimal product info (frontend already has FAST data). ProductLite has composite key (shopId, id).
    const items = await prisma.productLite.findMany({
      where: { shopId: shop.id, id: { in: productIds } },
      select: { id: true },
    });

    res.json({ items });
  } catch (err) {
    console.error("❌ Snapshot filter API failed", err);
    res.status(500).json({ error: "Snapshot filtering failed" });
  }
}
