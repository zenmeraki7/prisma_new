// web/graphql/filtering/productsByFilterResolver.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

import type { FilterExpr } from "../../lib/filters/dsl.js";
import { FILTER_REGISTRY } from "../../lib/filters/registry.js";
import { astFromJson } from "../../lib/filters/astFromJson.js";
import { compileFastWhere } from "../../lib/filters/fastCompiler.js";
import type { FilterExecutionMode } from "./planFilterResolver.js";
import { createSnapshotFromFilter } from "../mutation/createSnapShotFromFilter.js";

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
console.log('🔍 productsByFilter called:', {
    mode,
    shopId: ctx.shopId,
    first,
    after,
    rawFilter: JSON.stringify(rawFilter, null, 2),
  hasRawFilter: !!rawFilter
  });
  // 1) Parse JSON → AST
  const expr: FilterExpr | null = astFromJson(rawFilter);

console.log('📝 Parsed AST:', {
  expr: JSON.stringify(expr, null, 2),
  isNull: expr === null,
  type: expr?.type
});

  // 2) Only FAST plane is implemented here for now
if (mode === "SNAPSHOT") {
  const snapshot = await createSnapshotFromFilter(ctx.shopId, rawFilter);
  const pageSize = Math.min(Math.max(first ?? 50, 1), 200);

  const rows = await prisma.snapshotProduct.findMany({
    where: {
      shopId: ctx.shopId,
      snapshotRunId: snapshot.id,
    },
    orderBy: [
      { sortKey: "asc" },      // Primary sort
      { productId: "asc" },    // Tiebreaker
    ],
    take: pageSize + 1,
    ...(after
      ? {
          cursor: {
            snapshotRunId_productId: {
              snapshotRunId: snapshot.id,
              productId: after,
            },
          },
          skip: 1,
        }
      : {}),
    include: {
      product: true,
    },
  });

  console.log('📦 Snapshot Products:', {
    rowsFound: rows.length,
    hasProducts: rows.length > 0,
    firstProduct: rows[0]?.product?.title,
  });
  const hasNextPage = rows.length > pageSize;
  const items = hasNextPage ? rows.slice(0, pageSize) : rows;

  return {
    items: items.map((r) => r.product),
    nextCursor: hasNextPage ? items[items.length - 1].productId : null,
    planHash: snapshot.planHash,
  };
}

  // 3) AST → Prisma where fragment (FAST filters only)
  console.log('🔧 About to call compileFastWhere with:', {
    expr: JSON.stringify(expr, null, 2),
    hasRegistry: !!FILTER_REGISTRY,
    registryKeys: Object.keys(FILTER_REGISTRY).slice(0, 5)
  });
  const fastWhere = compileFastWhere(expr, FILTER_REGISTRY);

  console.log('🔧 compileFastWhere returned:', JSON.stringify(fastWhere, null, 2));
  console.log('🔧 fastWhere is empty object?', Object.keys(fastWhere).length === 0);

  // 4) Full where with tenant isolation
  const where: Prisma.ProductLiteWhereInput = {
    shopId: ctx.shopId,
    ...fastWhere,
  };

    console.log('🔎 Final Prisma where clause:', JSON.stringify(where, null, 2));

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
