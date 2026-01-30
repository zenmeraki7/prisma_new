import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { applyVariantSnapshotFilter } from "../../lib/snapshot/applyVariantSnapshotFilter";

export async function snapshotFilterHandler(req: Request, res: Response) {
  try {
    const { planHash, filters } = req.body;

    console.log("📥 Snapshot filter request received");
    console.log("🔑 planHash:", planHash);
    console.log("🧩 variant filters:", JSON.stringify(filters, null, 2));

    if (!filters?.length) {
      return res.json({ items: [] });
    }

    const productIds = await applyVariantSnapshotFilter({
      planHash,
      filters,
    });

    console.log("✅ Snapshot matched productIds:", productIds.length);

    // Return minimal product info (frontend already has FAST data)
    const items = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });

    res.json({ items });
  } catch (err) {
    console.error("❌ Snapshot filter API failed", err);
    res.status(500).json({ error: "Snapshot filtering failed" });
  }
}
