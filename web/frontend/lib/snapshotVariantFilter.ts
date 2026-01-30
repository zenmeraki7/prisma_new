// web/backend/lib/snapshotVariantFilter.ts
import { prisma } from "../db/prisma.js";
import type { AppliedFilter } from "../../frontend/lib/filters/registry";

// Convert AppliedFilter[] → Prisma where for snapshot variant
function convertVariantFiltersToPrismaWhere(filters: AppliedFilter[]) {
  const andClauses: any[] = [];

  filters.forEach((f) => {
    // Only variant fields
    if (!f.key.startsWith("variant.")) return;

    let clause: any = {};
    const field = f.key.replace("variant.", "variantData."); // assuming JSON column in snapshot

    switch (f.kind) {
      case "string":
        if (f.op === "equals") clause[field] = f.value;
        else if (f.op === "contains") clause[field] = { contains: f.value };
        else if (f.op === "containsCi") clause[field] = { contains: f.value, mode: "insensitive" };
        break;
      case "number":
        switch (f.op) {
          case "eq": clause[field] = f.value; break;
          case "neq": clause[field] = { not: f.value }; break;
          case "gt": clause[field] = { gt: f.value }; break;
          case "gte": clause[field] = { gte: f.value }; break;
          case "lt": clause[field] = { lt: f.value }; break;
          case "lte": clause[field] = { lte: f.value }; break;
        }
        break;
      case "boolean":
        clause[field] = f.value;
        break;
      default:
        console.warn("Unsupported filter kind:", f.kind);
    }

    if (Object.keys(clause).length > 0) andClauses.push(clause);
  });

  if (andClauses.length === 0) return {};
  return { AND: andClauses };
}

// Main snapshot query
export async function snapshotVariantFilterQuery(planHash: string, filters: AppliedFilter[]) {
  console.log("🚀 Received variant filters:", JSON.stringify(filters, null, 2));

  const prismaWhere = convertVariantFiltersToPrismaWhere(filters);
  console.log("🔹 Generated Prisma WHERE:", JSON.stringify(prismaWhere, null, 2));

  const items = await prisma.snapshotItem.findMany({
    where: {
      planHash,
      ...prismaWhere,
    },
    take: 50, // limit for debug
  });

  console.log(`✅ Retrieved ${items.length} items from snapshot for planHash ${planHash}`);
  return items;
}
