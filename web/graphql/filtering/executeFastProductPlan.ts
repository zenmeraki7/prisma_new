import { prisma } from "../../db/prisma";
import type { ProductQueryPlan } from "./types";

export async function executeFastProductPlan(args: {
  plan: Extract<ProductQueryPlan, { mode: "FAST" }>;
  first: number;
  after?: string | null;
}) {
  const { plan, first, after } = args;

  const items = await prisma.productLite.findMany({
    where: plan.where,
    orderBy: plan.orderBy,
    take: first + 1,
    cursor: after ? { id: after } : undefined,
    skip: after ? 1 : 0,
  });

  const hasNextPage = items.length > first;
  const pageItems = hasNextPage ? items.slice(0, first) : items;

  return {
    items: pageItems,
    nextCursor: hasNextPage ? pageItems.at(-1)!.id : null,
    hasNextPage,
  };
}
