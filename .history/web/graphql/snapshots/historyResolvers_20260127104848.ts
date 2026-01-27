// web/graphql/snapshots/historyResolvers.ts
import { prisma } from "../../db/prisma.js";
import type { GraphQLContext } from "../schema.js";

type SnapshotRunsArgs = {
  first?: number;
  after?: string | null;
};

type SnapshotRunEventsArgs = {
  runId: string;
  first?: number;
  after?: string | null;
};

type RunCursorPayload = {
  createdAt: Date;
  id: string;
};

type EventCursorPayload = {
  createdAt: Date;
  id: string;
};

function clampFirst(raw: number | undefined): number {
  const n = typeof raw === "number" ? raw : 25;
  if (!Number.isFinite(n)) return 25;
  return Math.min(Math.max(n, 1), 200);
}

function encodeRunCursor(payload: RunCursorPayload): string {
  const json = JSON.stringify({
    c: payload.createdAt.toISOString(),
    i: payload.id,
  });
  return Buffer.from(json, "utf8").toString("base64");
}

function decodeRunCursor(cursor: string): RunCursorPayload {
  const json = Buffer.from(cursor, "base64").toString("utf8");
  const obj = JSON.parse(json) as { c: string; i: string };
  const d = new Date(obj.c);
  if (Number.isNaN(d.getTime())) {
    throw new Error("snapshotRuns: invalid cursor.");
  }
  return { createdAt: d, id: obj.i };
}

function encodeEventCursor(payload: EventCursorPayload): string {
  const json = JSON.stringify({
    c: payload.createdAt.toISOString(),
    i: payload.id,
  });
  return Buffer.from(json, "utf8").toString("base64");
}

function decodeEventCursor(cursor: string): EventCursorPayload {
  const json = Buffer.from(cursor, "base64").toString("utf8");
  const obj = JSON.parse(json) as { c: string; i: string };
  const d = new Date(obj.c);
  if (Number.isNaN(d.getTime())) {
    throw new Error("snapshotRunEvents: invalid cursor.");
  }
  return { createdAt: d, id: obj.i };
}

export async function snapshotRunsResolver(
  _parent: unknown,
  args: SnapshotRunsArgs,
  ctx: GraphQLContext
) {
  const { shopId } = ctx;
  const first = clampFirst(args.first);
  const cursor = args.after ? decodeRunCursor(args.after) : null;

  const where: any = { shopId };

  if (cursor) {
    const { createdAt, id } = cursor;
    where.OR = [
      { createdAt: { lt: createdAt } },
      {
        createdAt,
        id: { gt: id },
      },
    ];
  }

  const runs = await prisma.snapshotRun.findMany({
    where,
    orderBy: [
      { createdAt: "desc" },
      { id: "asc" },
    ],
    take: first + 1,
  });

  const edges = runs.slice(0, first).map((run) => ({
    cursor: encodeRunCursor({ createdAt: run.createdAt, id: run.id }),
    node: run,
  }));

  const hasNextPage = runs.length > first;
  const endCursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;

  return {
    edges,
    pageInfo: {
      hasNextPage,
      endCursor,
    },
  };
}

export async function snapshotRunEventsResolver(
  _parent: unknown,
  args: SnapshotRunEventsArgs,
  ctx: GraphQLContext
) {
  const { shopId } = ctx;
  const first = clampFirst(args.first);
  const cursor = args.after ? decodeEventCursor(args.after) : null;

  // Ensure the run belongs to this shop
  const run = await prisma.snapshotRun.findUnique({
    where: { id: args.runId },
  });
  if (!run || run.shopId !== shopId) {
    // Return empty, do not leak run existence across shops
    return {
      edges: [],
      pageInfo: {
        hasNextPage: false,
        endCursor: null,
      },
    };
  }

  const where: any = {
    snapshotRunId: args.runId,
    shopId,
  };

  if (cursor) {
    const { createdAt, id } = cursor;
    where.OR = [
      { createdAt: { lt: createdAt } },
      {
        createdAt,
        id: { gt: id },
      },
    ];
  }

  const events = await prisma.snapshotRunEvent.findMany({
    where,
    orderBy: [
      { createdAt: "desc" },
      { id: "asc" },
    ],
    take: first + 1,
  });

  const edges = events.slice(0, first).map((ev) => ({
    cursor: encodeEventCursor({ createdAt: ev.createdAt, id: ev.id }),
    node: ev,
  }));

  const hasNextPage = events.length > first;
  const endCursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;

  return {
    edges,
    pageInfo: {
      hasNextPage,
      endCursor,
    },
  };
}
