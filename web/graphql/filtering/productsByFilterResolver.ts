// FILE: web/graphql/filtering/productsByFilterResolver.ts

import { GraphQLError } from "graphql";
import { prisma } from "../../db/prisma.js";
import { astFromJson } from "../../lib/filters/astFromJson.js";
import { FilterPlanner } from "../../lib/filters/planner.js";

export type FilterExecutionMode =
  | "AUTO"
  | "FAST_ONLY";

type ProductsByFilterArgs = {
  input: {
    filter: unknown;
    mode?: FilterExecutionMode;
    first: number;
    after?: string | null;
  };
};

type Context = {
  shopId: string;
};

export async function productsByFilterResolver(
  _parent: unknown,
  args: ProductsByFilterArgs,
  ctx: Context,
) {
  const {
    filter: rawFilter,
    first: rawFirst,
    after,
  } = args.input;

  const { shopId } = ctx;

  let expr = null;
  try {
    expr = astFromJson(rawFilter);
  } catch (e: any) {
    throw new GraphQLError(`Invalid filter: ${e.message}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const plan = FilterPlanner.plan(expr, { shopId });
  const where = plan.fastQuery;

  const take = clampFirst(rawFirst);

  let cursor: { id: bigint } | undefined;
  if (after) {
    try {
      const idStr = Buffer.from(after, "base64").toString("utf8");
      cursor = { id: BigInt(idStr) };
    } catch {
      throw new GraphQLError("Invalid cursor format", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
  }

  let totalMatched = 0;
  try {
    totalMatched = await prisma.productLite.count({ where });
  } catch (e) {
    console.error("[productsByFilter] Count failed", e);
  }

  const warnings: string[] = [];

  try {
    const rows = await prisma.productLite.findMany({
      where,
      take: take + 1,
      skip: cursor ? 1 : 0,
      cursor,
      orderBy: { updatedAtShopify: "desc" },
      include: {
        variantRollup: true,
      },
    });

    const hasNextPage = rows.length > take;
    const visibleRows = hasNextPage ? rows.slice(0, take) : rows;

    const nextCursor =
      hasNextPage && visibleRows.length > 0
        ? Buffer.from(
            visibleRows[visibleRows.length - 1].id.toString(),
            "utf8",
          ).toString("base64")
        : null;

    const items = visibleRows.map((row) => ({
      id: row.id,
      title: row.title,
      handle: row.handle,
      status: row.status,
      vendor: row.vendor,
      productType: row.productType,
      tags: row.tags ?? [],
      hasImages: row.hasImages,
      totalInventory: row.variantRollup?.totalInventory ?? 0,
      variantCount: row.variantRollup?.variantCount ?? 0,
      updatedAtShopify: row.updatedAtShopify,
    }));

    return {
      items,
      nextCursor,
      mode: "FAST_ONLY",
      guardrail: {
        totalMatched,
        shownCount: items.length,
        pageSize: take,
        hasMore: hasNextPage,
        limited: hasNextPage,
      },
      warnings,
    };
  } catch (e: any) {
    console.error("[productsByFilter] Prisma error", e);
    throw new GraphQLError("Filter query failed", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        details: e.message ?? String(e),
      },
    });
  }
}

function clampFirst(rawFirst: number | null | undefined): number {
  const n = typeof rawFirst === "number" ? rawFirst : 50;
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, 250);
}