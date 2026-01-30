import { prisma } from "../../db/prisma";

type VariantFilter = {
  key: string;
  op: string;
  value: any;
  value2?: any;
};

export async function applyVariantSnapshotFilter({
  planHash,
  filters,
}: {
  planHash: string;
  filters: VariantFilter[];
}): Promise<string[]> {
  console.log("🧠 Applying variant snapshot filters…");

  // STEP 1: find snapshot run
  const snapshot = await prisma.snapshotRun.findFirst({
    where: {
      planHash,
      state: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!snapshot) {
    console.warn("⚠️ No COMPLETED snapshot found for planHash:", planHash);
    return [];
  }

  console.log("📸 Using snapshot:", snapshot.id);

  // STEP 2: build WHERE clause
  const variantWhere: any = {
    snapshotId: snapshot.id,
  };

  for (const f of filters) {
    console.log("🔎 Applying filter:", f.key, f.op, f.value);

    switch (f.key) {
      case "variant.sku":
        variantWhere.sku = buildStringCondition(f);
        break;

      case "variant.barcode":
        variantWhere.barcode = buildStringCondition(f);
        break;

      case "variant.price":
        variantWhere.price = buildNumberCondition(f);
        break;

      case "variant.inventoryQuantity":
        variantWhere.inventoryQuantity = buildNumberCondition(f);
        break;

      default:
        console.warn("⚠️ Unsupported variant filter:", f.key);
    }
  }

  console.log("🧱 Final Prisma WHERE:", JSON.stringify(variantWhere, null, 2));

  // STEP 3: query snapshot variants
  const rows = await prisma.snapshotVariant.findMany({
    where: variantWhere,
    select: {
      productId: true,
    },
  });

  console.log("📦 Matching variants:", rows.length);

  // STEP 4: unique productIds
  const productIds = [...new Set(rows.map(r => r.productId))];
  return productIds;
}
