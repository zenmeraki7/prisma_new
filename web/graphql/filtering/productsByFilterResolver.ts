// FILE: web/graphql/filtering/productsByFilterResolver.ts

import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

import type { FilterExpr } from "../../lib/filters/dsl.js";
import { astFromJson } from "../../lib/filters/astFromJson.js";
import { compileFastWhere } from "../../lib/filters/fastCompiler.js";

/**
 * Execution mode is still FAST_ONLY for now.
 * Once SNAPSHOT is wired, extend this.
 */
export type FilterExecutionMode = "FAST_ONLY";

type ProductsByFilterArgs = {
  input: {
    filter?: unknown;      // JSON AST from client
    first: number;
    after?: string | null; // cursor = ProductLite.id as string
    sort?: {
      field: string;
      direction: "asc" | "desc";
    } | null;
  };
};

type Context = {
  shopId: string; // MUST be the same value used in ProductLite.shopId
};

type ProductsByFilterPayload = {
  planHash: string;
  executionMode: "FAST";
  explain: Array<{
    code: string;
    filterId?: string;
    field?: string;
    detail?: string;
  }>;
  items: Prisma.ProductLiteGetPayload<{}>[];
  nextCursor: string | null;
};

function stablePlanHash(filter: unknown): string {
  // Extremely simple stable hash for now.
  // You can swap to crypto / xxhash if you want.
  const json = filter ? JSON.stringify(filter) : "NULL";
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash * 31 + json.charCodeAt(i)) | 0;
  }
  return `fast:${hash >>> 0}`;
}

export async function productsByFilterResolver(
  _parent: unknown,
  args: ProductsByFilterArgs,
  ctx: Context,
): Promise<ProductsByFilterPayload> {
  const { filter: rawFilter, first, after, sort } = args.input;

  // 1) Parse JSON → AST
  const expr: FilterExpr | null = astFromJson(rawFilter ?? null);

  // 2) Compile to Prisma WHERE, always enforcing shopId
  const where = compileFastWhere(expr, { shopId: ctx.shopId });

  // 3) Build Prisma query options
  const take = first;
  const cursor =
    after != null
      ? {
          id: BigInt(after),
        }
      : undefined;

  const orderBy: Prisma.ProductLiteOrderByWithRelationInput = (() => {
    if (!sort || !sort.field || sort.field === "id") {
      return { id: "asc" };
    }

    const direction = sort.direction ?? "asc";

    switch (sort.field) {
      case "title":
        return { title: direction };
      case "status":
        return { status: direction };
      case "vendor":
        return { vendor: direction };
      case "productType":
        return { productType: direction };
      case "updatedAtShopify":
        return { updatedAtShopify: direction };
      default:
        return { id: "asc" };
    }
  })();

  // 4) LOGGING – so you can actually see why 0 rows come back
  console.log("[productsByFilter] shopId =", ctx.shopId);
  console.log(
    "[productsByFilter] where =",
    JSON.stringify(where, null, 2),
  );
  console.log("[productsByFilter] sort =", sort ?? null);
  console.log("[productsByFilter] first =", first, "after =", after ?? null);

  // 5) Query
  const items = await prisma.productLite.findMany({
    where,
    take,
    ...(cursor ? { cursor, skip: 1 } : {}),
    orderBy,
  });

  console.log("[productsByFilter] result count =", items.length);

  // 6) Cursor
  let nextCursor: string | null = null;
  if (items.length === take) {
    const last = items[items.length - 1];
    nextCursor = String(last.id);
  }

  // 7) Very simple "plan"
  const planHash = stablePlanHash(rawFilter ?? null);

  return {
    planHash,
    executionMode: "FAST",
    explain: [], // you can fill this from your planner later
    items,
    nextCursor,
  };
}
