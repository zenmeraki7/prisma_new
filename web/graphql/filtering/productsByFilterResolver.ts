// FILE: web/graphql/filtering/productsByFilterResolver.ts

import { GraphQLError } from "graphql";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

import { astFromJson } from "../../lib/filters/astFromJson.js";
import { FilterPlanner } from "../../lib/filters/planner.js";

export type FilterExecutionMode =
  | "AUTO"
  | "FAST_ONLY"
  | "SNAPSHOT_ONLY"
  | "HYBRID";

type ProductsByFilterArgs = {
  input: {
    filter: unknown;          // JSON AST from client
    mode: FilterExecutionMode;
    first: number;
    after?: string | null;
    snapshotRunId?: string | null;
  };
};

type Context = {
  shopId: string;
};

const CANDIDATE_LIMIT = 5000;

export async function productsByFilterResolver(
  _parent: unknown,
  args: ProductsByFilterArgs,
  ctx: Context,
) {
  const {
    filter: rawFilter,
    mode,
    first: rawFirst,
    after,
    snapshotRunId,
  } = args.input;
  const { shopId } = ctx;

  // 1) Parse JSON → AST
  let expr = null;
  try {
    expr = astFromJson(rawFilter);
  } catch (e: any) {
    throw new GraphQLError(`Invalid filter: ${e.message}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  // 2) Plan (split FAST vs SNAPSHOT)
  const plan = FilterPlanner.plan(expr, {
    shopId,
    snapshotRunId: snapshotRunId ?? undefined,
  });

  // For now, we derive executionMode from meta or fall back
  const executionMode: FilterExecutionMode =
    (plan.meta as any)?.mode ?? "FAST_ONLY";

  const where: Prisma.ProductLiteWhereInput = plan.fastQuery;

  // 3) Guardrail: candidate count
  let candidateCount = 0;
  let candidateLimitHit = false;

  try {
    candidateCount = await prisma.productLite.count({ where });
    candidateLimitHit = candidateCount > CANDIDATE_LIMIT;
  } catch (e) {
    // If count fails for any reason, don't block the query – just log.
    console.error("[productsByFilter] Count failed", e);
  }

  const guardrail = {
    candidateCount,
    candidateLimit: CANDIDATE_LIMIT,
    candidateLimitHit,
  };

  const warnings: string[] = [];
  if (candidateLimitHit) {
    warnings.push(
      `More than ${CANDIDATE_LIMIT} products matched. Showing a partial result set.`,
    );
  }

  // 4) Clamp page size
  const take = clampFirst(rawFirst);

  // 5) Cursor decoding (BigInt-safe)
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

  try {
    // 6) Execute FAST query only
    // IMPORTANT: no `include: { tagsJoin: true }` anymore.
    const rows = await prisma.productLite.findMany({
      where,
      take: take + 1,
      skip: cursor ? 1 : 0,
      cursor,
      orderBy: { updatedAtShopify: "desc" }, // or createdAtShopify
    });

    const hasNextPage = rows.length > take;
    const items = hasNextPage ? rows.slice(0, take) : rows;

    const nextCursor =
      hasNextPage && items.length > 0
        ? Buffer.from(
            items[items.length - 1].id.toString(),
            "utf8",
          ).toString("base64")
        : null;

    return {
      items,
      nextCursor,
      mode: executionMode,
      guardrail,
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
