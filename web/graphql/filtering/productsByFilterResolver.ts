// web/graphql/filtering/productsByFilterResolver.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

import type { FilterExpr } from "../../lib/filters/dsl.js";
import { FILTER_REGISTRY } from "../../lib/filters/registry.js";
import { astFromJson } from "../../lib/filters/astFromJson.js";
import { compileFastWhere } from "../../lib/filters/fastCompiler.js";
import { planFilterExecution } from "./planFilterResolver.js";


type ProductsByFilterArgs = {
  input: {
    filter: unknown;          // JSON AST from client
    mode: FilterExecutionMode;
    first: number;
    after?: string | null;
  };
};

type Context = {
  shopId: string;             // MUST match Shop.id used in ProductLite.shopId
};

export async function productsByFilterResolver(
  _parent: unknown,
  args: ProductsByFilterArgs,
  ctx: Context,
) {
  const { filter: rawFilter, first = 50, after } = args.input;

  // 1) Parse JSON → AST
  const expr: FilterExpr | null = astFromJson(rawFilter);
  if (!expr) {
    return { items: [], nextCursor: null, planHash: null, mode: "FAST" };
  }

  // 2) Only FAST plane is implemented for now
  const plan = planFilterExecution(expr);
  if (plan.mode !== "FAST") {
    throw new Error("Only FAST mode is implemented");
  }

  // 3) AST → Prisma where fragment
  const fastWhere = compileFastWhere(expr, FILTER_REGISTRY);

  // 4) Full where with tenant isolation
  const where: Prisma.ProductLiteWhereInput = {
    shopId: ctx.shopId,
    ...fastWhere,
  };

  const pageSize = Math.min(Math.max(first, 1), 200);

  const rows = await prisma.productLite.findMany({
    where,
    orderBy: { id: "asc" },
    take: pageSize + 1,
    ...(after
      ? { cursor: { shopId_id: { shopId: ctx.shopId, id: after } }, skip: 1 }
      : {}),
  });

  const hasNextPage = rows.length > pageSize;
  const items = hasNextPage ? rows.slice(0, pageSize) : rows;

  return {
    items,
    nextCursor: hasNextPage ? items[items.length - 1].id : null,
    planHash: plan.planHash,
    mode: "FAST",
  };
}
