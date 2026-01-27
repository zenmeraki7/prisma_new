// web/graphql/filtering/productsByFilterResolver.ts

import crypto from "crypto";
import { prisma } from "../../db/prisma.js";
import { compileFastWhere } from "../../lib/filters/fastCompiler.js";
import type { FilterExpr, FilterLeafExpr } from "../../lib/filters/dsl.js";
import {
  FILTER_REGISTRY,
  getFilterDef,
  type FilterRegistry,
} from "../../lib/filters/registry.js";

// Types must match GraphQL SDL:
// input ProductsByFilterInput {
//   filter: JSON!
//   mode: FilterExecutionMode! = FAST_ONLY
//   first: Int! = 50
//   after: String
// }

type FilterExecutionMode = "FAST_ONLY" | "SNAPSHOT";

type ProductsByFilterArgs = {
  input: {
    filter: any;
    mode?: FilterExecutionMode;
    first?: number;
    after?: string | null;
  };
};

type GraphQLContext = {
  shopId: string;
};

// Same as in planFilterResolver
const REGISTRY_VERSION = "v1";

export async function productsByFilterResolver(
  _parent: unknown,
  args: ProductsByFilterArgs,
  ctx: GraphQLContext
) {
  const { shopId } = ctx;
  const { filter: rawFilter, mode: rawMode, first: rawFirst, after } = args.input;

  if (!rawFilter || typeof rawFilter !== "object") {
    throw new Error("productsByFilter: input.filter must be a non-null JSON object.");
  }

  const expr = rawFilter as FilterExpr;
  const mode = rawMode ?? "FAST_ONLY";
  const first = clampFirst(rawFirst);

  const { effectiveMode, filterSummary } = analyzeFilter(expr, FILTER_REGISTRY, mode);
  const planHash = computePlanHash(expr, effectiveMode, REGISTRY_VERSION);

  if (effectiveMode === "FAST_ONLY") {
    return runFastOnlyQuery({ shopId, expr, first, after, planHash });
  }

  return runSnapshotBackedQuery({ shopId, expr, first, after, planHash, filterSummary });
}

/* =======================================================================
 * ANALYSIS – ensure mode is consistent with registry
 * ==================================================================== */

function analyzeFilter(
  expr: FilterExpr,
  registry: FilterRegistry,
  requestedMode: FilterExecutionMode
): { effectiveMode: FilterExecutionMode; filterSummary: string } {
  const leafPlanes: ("FAST" | "SNAPSHOT")[] = [];
  const parts: string[] = [];

  traverse(expr, (leaf) => {
    const def = getFilterDef(leaf.filterId);
    leafPlanes.push(def.plane);
    parts.push(renderLeaf(def.label, leaf));
  });

  const hasSnapshot = leafPlanes.some((p) => p === "SNAPSHOT");
  const fastOnly = !hasSnapshot;

  const effectiveMode: FilterExecutionMode = hasSnapshot ? "SNAPSHOT" : "FAST_ONLY";

  // If the caller explicitly requested FAST_ONLY but we detected SNAPSHOT filters,
  // fail fast rather than silently degrading.
  if (requestedMode === "FAST_ONLY" && !fastOnly) {
    throw new Error(
      "productsByFilter: requested FAST_ONLY mode but filter expression contains SNAPSHOT-plane filters."
    );
  }

  const filterSummary =
    parts.length === 0 ? "No filter (match all products)" : parts.join(" ∧ ");

  return { effectiveMode, filterSummary };
}

function traverse(expr: FilterExpr, visitLeaf: (leaf: FilterLeafExpr) => void) {
  if (expr.type === "leaf") {
    visitLeaf(expr);
    return;
  }
  if (!expr.children || expr.children.length === 0) return;
  for (const child of expr.children) {
    traverse(child as FilterExpr, visitLeaf);
  }
}

function renderLeaf(label: string, leaf: FilterLeafExpr): string {
  const op = leaf.op;
  const v = leaf.value;

  if (op === "is_set") return `${label} is set`;
  if (op === "is_not_set") return `${label} is not set`;

  const vStr =
    v === undefined || v === null
      ? "null"
      : Array.isArray(v)
      ? JSON.stringify(v)
      : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);

  return `${label} ${op} ${vStr}`;
}

/* =======================================================================
 * PLAN HASH (shared with planFilterResolver)
 * ==================================================================== */

function computePlanHash(
  expr: FilterExpr,
  mode: FilterExecutionMode,
  registryVersion: string
): string {
  const payload = JSON.stringify({
    registryVersion,
    mode,
    filter: expr,
  });

  const hash = crypto.createHash("sha256");
  hash.update(payload);
  return hash.digest("hex");
}

/* =======================================================================
 * FAST-ONLY EXECUTION
 * ==================================================================== */

async function runFastOnlyQuery(params: {
  shopId: string;
  expr: FilterExpr;
  first: number;
  after?: string | null;
  planHash: string;
}) {
  const { shopId, expr, first, after, planHash } = params;

  // Compile to Prisma where
  const fastWhere = compileFastWhere(expr, FILTER_REGISTRY);

  // Cursor: stable on (updatedAtShopify DESC, id ASC)
  const cursorFilter = after ? decodeFastCursor(after) : null;

  const where: any = {
    AND: [{ shopId }, fastWhere],
  };

  if (cursorFilter) {
    const { updatedAt, id } = cursorFilter;
    // (updatedAtShopify < updatedAt) OR (updatedAtShopify = updatedAt AND id > lastId)
    where.AND.push({
      OR: [
        { updatedAtShopify: { lt: updatedAt } },
        {
          updatedAtShopify: updatedAt,
          id: { gt: id },
        },
      ],
    });
  }

  const items = await prisma.productLite.findMany({
    where,
    orderBy: [
      { updatedAtShopify: "desc" },
      { id: "asc" },
    ],
    take: first + 1,
  });

  let nextCursor: string | null = null;
  if (items.length > first) {
    const last = items[first - 1];
    nextCursor = encodeFastCursor({
      updatedAt: last.updatedAtShopify ?? new Date(0),
      id: last.id,
    });
    items.length = first;
  }

  return {
    items,
    nextCursor,
    planHash,
  };
}

/* Cursor helpers for FAST_ONLY */

type FastCursorPayload = {
  updatedAt: Date;
  id: string;
};

function encodeFastCursor(payload: FastCursorPayload): string {
  const json = JSON.stringify({
    u: payload.updatedAt.toISOString(),
    i: payload.id,
  });
  return Buffer.from(json, "utf8").toString("base64");
}

function decodeFastCursor(cursor: string): FastCursorPayload {
  const json = Buffer.from(cursor, "base64").toString("utf8");
  const obj = JSON.parse(json) as { u: string; i: string };
  const d = new Date(obj.u);
  if (Number.isNaN(d.getTime())) {
    throw new Error("productsByFilter: invalid cursor (bad date).");
  }
  return { updatedAt: d, id: obj.i };
}

/* =======================================================================
 * SNAPSHOT-BACKED EXECUTION (high-level)
 * ==================================================================== */

async function runSnapshotBackedQuery(params: {
  shopId: string;
  expr: FilterExpr;
  first: number;
  after?: string | null;
  planHash: string;
  filterSummary: string;
}) {
  const { shopId, first, after, planHash, filterSummary, expr } = params;

  // 1) Try to find an existing SUCCEEDED snapshot run for this planHash
  const now = new Date();
  const existingRun = await prisma.snapshotRun.findFirst({
    where: {
      shopId,
      planHash,
      state: "SUCCEEDED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!existingRun) {
    // 2) If none, ensure there's at least a PENDING/RUNNING run, and enqueue a worker.
    const run = await prisma.snapshotRun.upsert({
      where: {
        // Composite unique recommended in schema; if you don't have it yet, use findFirst+create instead.
        id: `${shopId}_${planHash}`, // or just cuid(); adjust schema accordingly
      } as any,
      update: {},
      create: {
        shopId,
        planHash,
        state: "PENDING",
        progress: 0,
        total: 0,
        filterSummary,
        // TTL up to you – 24h example:
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    }).catch(async () => {
      // Fallback if upsert by id doesn't match your schema; use findFirst+create pattern.
      const existingPending = await prisma.snapshotRun.findFirst({
        where: { shopId, planHash },
      });
      if (existingPending) return existingPending;
      return prisma.snapshotRun.create({
        data: {
          shopId,
          planHash,
          state: "PENDING",
          progress: 0,
          total: 0,
          filterSummary,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
    });

    // 3) Enqueue snapshot worker (you implement this)
    try {
      // You will implement this function in your jobs layer, e.g.
      // await enqueueSnapshotRun({ snapshotRunId: run.id, shopId, filter: expr });
      void enqueueSnapshotRunSafe(run.id, shopId, expr);
    } catch (err) {
      // Log but don't crash the query
      console.error("Failed to enqueue snapshot run", err);
    }

    // 4) Return empty page; frontend should call snapshotStatus(planHash)
    //    and productsBySnapshot(planHash) once the run is SUCCEEDED.
    return {
      items: [],
      nextCursor: null,
      planHash,
    };
  }

  // 5) We have a completed snapshot run; page through SnapshotProduct and join ProductLite.

  const snapshotCursor = after ? decodeSnapshotCursor(after) : null;

  const where: any = {
    snapshotRunId: existingRun.id,
    shopId,
  };

  if (snapshotCursor) {
    const { sortKey, productId } = snapshotCursor;
    where.OR = [
      { sortKey: { lt: sortKey } },
      {
        sortKey,
        productId: { gt: productId },
      },
    ];
  }

  const snapshotRows = await prisma.snapshotProduct.findMany({
    where,
    orderBy: [
      { sortKey: "desc" },
      { productId: "asc" },
    ],
    take: first + 1,
  });

  let nextCursor: string | null = null;
  const pageRows = snapshotRows.slice(0, first);
  if (snapshotRows.length > first && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = encodeSnapshotCursor({
      sortKey: last.sortKey ?? new Date(0),
      productId: last.productId,
    });
  }

  const productIds = pageRows.map((r) => r.productId);
  if (productIds.length === 0) {
    return {
      items: [],
      nextCursor,
      planHash,
    };
  }

  // Fetch ProductLite rows and re-order to match snapshot order.
  const products = await prisma.productLite.findMany({
    where: {
      shopId,
      id: { in: productIds },
    },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const orderedProducts = productIds
    .map((id) => byId.get(id))
    .filter((p): p is (typeof products)[number] => !!p);

  return {
    items: orderedProducts,
    nextCursor,
    planHash,
  };
}

/* Snapshot cursor helpers */

type SnapshotCursorPayload = {
  sortKey: Date;
  productId: string;
};

function encodeSnapshotCursor(payload: SnapshotCursorPayload): string {
  const json = JSON.stringify({
    s: payload.sortKey.toISOString(),
    p: payload.productId,
  });
  return Buffer.from(json, "utf8").toString("base64");
}

function decodeSnapshotCursor(cursor: string): SnapshotCursorPayload {
  const json = Buffer.from(cursor, "base64").toString("utf8");
  const obj = JSON.parse(json) as { s: string; p: string };
  const d = new Date(obj.s);
  if (Number.isNaN(d.getTime())) {
    throw new Error("productsByFilter: invalid snapshot cursor (bad date).");
  }
  return { sortKey: d, productId: obj.p };
}

/* =======================================================================
 * MISC HELPERS
 * ==================================================================== */

function clampFirst(rawFirst: number | undefined): number {
  const n = typeof rawFirst === "number" ? rawFirst : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(n, 1), 200);
}

// Fire-and-forget wrapper; you will replace internals with BullMQ / whatever.
async function enqueueSnapshotRunSafe(
  snapshotRunId: string,
  shopId: string,
  filter: FilterExpr
): Promise<void> {
  try {
    // Example: publish to a job queue
    // await snapshotRunQueue.add("snapshot-run", { snapshotRunId, shopId, filter });
    console.log(
      "[SNAPSHOT] Enqueue snapshot run",
      snapshotRunId,
      "for shop",
      shopId
    );
  } catch (err) {
    console.error("Error enqueueing snapshot run", err);
  }
}
