// web/graphql/filtering/productsByFilterResolver.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

import type { FilterExpr } from "../../lib/filters/dsl.js";
import { FILTER_REGISTRY } from "../../lib/filters/registry.js";
import { astFromJson } from "../../lib/filters/astFromJson.js";
import { compileFastWhere } from "../../lib/filters/fastCompiler.js";
import type { FilterExecutionMode } from "./planFilterResolver.js";

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
  const { filter: rawFilter, mode, first, after } = args.input;

  // 1) Parse JSON → AST
  const expr: FilterExpr | null = astFromJson(rawFilter);

  // 2) Only FAST plane is implemented here for now
  if (mode !== "FAST_ONLY") {
    throw new Error(
      "SNAPSHOT mode not implemented yet for productsByFilter (FAST_ONLY only)",
    );
  }

  // 3) AST → Prisma where fragment (FAST filters only)
  const fastWhere = compileFastWhere(expr, FILTER_REGISTRY);

  // 4) Full where with tenant isolation
  const where: Prisma.ProductLiteWhereInput = {
    shopId: ctx.shopId,
    ...fastWhere,
  };

  const pageSize = Math.min(Math.max(first ?? 50, 1), 200);

  const rows = await prisma.productLite.findMany({
    where,
    orderBy: { id: "asc" },
    take: pageSize + 1,
    ...(after
      ? {
          cursor: { shopId_id: { shopId: ctx.shopId, id: after } },
          skip: 1,
        }
      : {}),
  });

  const hasNextPage = rows.length > pageSize;
  const items = hasNextPage ? rows.slice(0, pageSize) : rows;

  return {
    items,                                        // ProductLite rows
    nextCursor: hasNextPage ? items[items.length - 1].id : null,
    planHash: null,
  };
}
