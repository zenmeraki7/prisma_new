// FILE: web/graphql/schema.ts

import { createSchema } from "graphql-yoga";
import { prisma } from "../db/prisma.js";

import { planFilterResolver } from "./filtering/planFilterResolver.js";
import { productsByFilterResolver } from "./filtering/productsByFilterResolver.js";

import { snapshotStatusResolver } from "./snapshots/statusResolver";
import { productsBySnapshotResolver } from "./snapshots/productsBySnapshotResolver";
import { fastProductsResolvers } from "./resolvers/fastProducts";

import {
  snapshotRunsResolver,
  snapshotRunEventsResolver,
} from "./snapshots/historyResolvers.js";

import { debugVerifySnapshotResolver } from "./debug/debugVerifySnapshotResolver.js";

// Context type (used only for type hints in resolvers that take ctx)
export type GraphQLContext = {
  shopId: string;
};

/* ==========================
   GraphQL SDL
========================== */

const typeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSON

  # --- Core product types (FAST plane) ---
  type ProductLite {
    id: ID!
    title: String!
    handle: String!
    status: String!
    vendor: String
    productType: String
    tags: [String!]!
    hasImages: Boolean!
    updatedAtShopify: DateTime
  }

  type VariantRollup {
    minPrice: Float
    maxPrice: Float
    totalInventory: Int
  }

  # --- Bootstrap / legacy listing for ProductsPage ---
  type BootstrapStatus {
    fastReady: Boolean!
    fastLastSyncAt: DateTime
    fastRevision: Int!
    syncEnqueued: Boolean!
  }

  type ProductPage {
    items: [ProductLite!]!
    nextCursor: String
  }

  type BootstrapProductsPayload {
    status: BootstrapStatus!
    page: ProductPage!
  }

  # --- Filter execution / planner meta ---
  enum FilterExecutionMode {
    AUTO
    FAST_ONLY
    SNAPSHOT_ONLY
    HYBRID
  }

  input PlanFilterInput {
    filter: JSON!
  }

  type PlanFilterPayload {
    planHash: String!
    executionMode: FilterExecutionMode!
    filterSummary: String
  }

  type FilterGuardrail {
    candidateCount: Int!
    candidateLimit: Int!
    candidateLimitHit: Boolean!
  }

  # ProductsByFilter (single-pass: data + meta)
  input ProductsByFilterInput {
    filter: JSON
    mode: FilterExecutionMode = AUTO
    first: Int! = 50
    after: String
    snapshotRunId: ID
  }

  type ProductsByFilterPayload {
    items: [ProductLite!]!
    nextCursor: String
    mode: FilterExecutionMode!
    guardrail: FilterGuardrail!
    warnings: [String!]!
  }

  # --- Snapshot plane types ---
  enum SnapshotRunState {
    QUEUED
    RUNNING
    SUCCEEDED
    FAILED
    CANCELLED
  }

  type SnapshotStatus {
    id: ID!
    state: SnapshotRunState!
    progress: Int!
    total: Int!
    errorMessage: String
    createdAt: DateTime!
  }

  input ProductsBySnapshotInput {
    snapshotRunId: ID!
    filter: JSON
    first: Int = 50
    after: String
  }

  type ProductsBySnapshotPayload {
    items: [ProductLite!]!
    nextCursor: String
    mode: FilterExecutionMode!
    guardrail: FilterGuardrail!
    snapshotRunId: ID!
  }

  type SnapshotRun {
    id: ID!
    planHash: String!
    state: SnapshotRunState!
    progress: Int!
    total: Int!
    errorMessage: String
    filterSummary: String
    createdAt: DateTime!
    updatedAt: DateTime!
    expiresAt: DateTime
  }

  type SnapshotRunEdge {
    cursor: String!
    node: SnapshotRun!
  }

  type SnapshotRunConnection {
    edges: [SnapshotRunEdge!]!
    pageInfo: PageInfo!
  }

  type SnapshotRunEvent {
    id: ID!
    kind: String!
    message: String
    createdAt: DateTime!
  }

  type SnapshotRunEventEdge {
    cursor: String!
    node: SnapshotRunEvent!
  }

  type SnapshotRunEventConnection {
    edges: [SnapshotRunEventEdge!]!
    pageInfo: PageInfo!
  }

  # --- Shared pagination type ---
  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type DebugVerifySnapshotPayload {
    ok: Boolean!
    message: String
    mismatchedProductIds: [ID!]
  }

  # --- FAST products connection (for fastProductsResolver) ---
  enum FastProductsSortField {
    TITLE
    CREATED_AT
    UPDATED_AT
    PUBLISHED_AT
    TOTAL_INVENTORY
    VARIANT_COUNT
  }

  enum SortDirection {
    ASC
    DESC
  }

  input FastProductsSortInput {
    field: FastProductsSortField!
    direction: SortDirection!
  }

  type FastProductsEdge {
    cursor: String!
    node: ProductLite!
  }

  type FastProductsConnection {
    edges: [FastProductsEdge!]!
    pageInfo: PageInfo!
  }

  # --- Root Query ---
  type Query {
    """
    FAST-plane bootstrap listing for ProductsPage.
    Optional search is by title / vendor / productType / handle.
    """
    bootstrapProducts(
      first: Int! = 25
      after: String
      search: String
    ): BootstrapProductsPayload!

    """
    Standalone planner call (dev / debug tooling).
    Most merchants will not hit this; UI can rely on productsByFilter meta.
    """
    planFilter(input: PlanFilterInput!): PlanFilterPayload!

    """
    Primary filtered listing endpoint (FAST + SNAPSHOT planner baked in).
    Returns products + execution mode + guardrail + warnings in one round-trip.
    """
    productsByFilter(input: ProductsByFilterInput!): ProductsByFilterPayload!

    """
    FAST-only listing with simple filter JSON and sort.
    Used by fastProductsResolvers.
    """
    fastProducts(
      first: Int
      after: String
      filter: JSON
      sort: FastProductsSortInput
    ): FastProductsConnection!

    """
    Snapshot status lookup by planHash or id.
    At least one of planHash or id should be provided.
    """
    snapshotStatus(
      planHash: String
      id: ID
    ): SnapshotStatus

    """
    Read products from a specific snapshot run (HYBRID/SNAPSHOT).
    """
    productsBySnapshot(input: ProductsBySnapshotInput!): ProductsBySnapshotPayload!

    """
    Snapshot run history (for debug / admin UI).
    """
    snapshotRuns(first: Int! = 25, after: String): SnapshotRunConnection!

    """
    Events for a specific snapshot run.
    """
    snapshotRunEvents(
      runId: ID!
      first: Int! = 50
      after: String
    ): SnapshotRunEventConnection!

    """
    Deep consistency check between FAST and SNAPSHOT planes.
    """
    debugVerifySnapshot(planHash: String!): DebugVerifySnapshotPayload!
  }
`;

/* ==========================
   Helpers for bootstrap cursor
========================== */

function encodeCursor(d: Date): string {
  return Buffer.from(d.toISOString(), "utf8").toString("base64");
}
function decodeCursor(c: string): Date {
  return new Date(Buffer.from(c, "base64").toString("utf8"));
}

/* ==========================
   Resolvers
========================== */

const resolvers = {
  ProductLite: {
    // Resolve tags via ProductTag FAST table
    tags: async (parent: any, _args: unknown, ctx: GraphQLContext) => {
      const rows = await prisma.productTag.findMany({
        where: { shopId: ctx.shopId, productId: parent.id },
        select: { tag: true },
      });
      return rows.map((r) => r.tag);
    },
  },

  VariantRollup: {
    minPrice: (parent: any) =>
      parent.minPrice != null ? Number(parent.minPrice) : null,
    maxPrice: (parent: any) =>
      parent.maxPrice != null ? Number(parent.maxPrice) : null,
    totalInventory: (parent: any) => parent.totalInventory,
  },

  Query: {
    /*
     * FAST-plane bootstrap listing
     * - Paginates by updatedAtShopify (newest first)
     * - Uses a base64-encoded Date cursor
     * - Optionally filters by a simple text search
     */
    bootstrapProducts: async (
      _parent: unknown,
      args: { first: number; after?: string | null; search?: string | null },
      ctx: GraphQLContext,
    ) => {
      const { shopId } = ctx;

      // clamp page size between 1 and 100
      const first = Math.min(Math.max(args.first, 1), 100);

      // FAST sync status
      const syncState = await prisma.fastSyncState.findUnique({
        where: { shopId },
      });

      const status = {
        fastReady: syncState?.fastReady ?? false,
        fastLastSyncAt: syncState?.fastLastSyncAt ?? null,
        fastRevision: syncState?.fastRevision ?? 0,
        syncEnqueued: syncState?.syncEnqueued ?? false,
      };

      // Cursor filter based on updatedAtShopify
      const cursorFilter =
        args.after != null
          ? { updatedAtShopify: { lt: decodeCursor(args.after) } }
          : {};

      // Optional simple search
      const where: any = {
        shopId,
        ...cursorFilter,
      };

      const search = args.search?.trim();
      if (search && search.length > 0) {
        where.AND = [
          {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { vendor: { contains: search, mode: "insensitive" } },
              { productType: { contains: search, mode: "insensitive" } },
              { handle: { contains: search, mode: "insensitive" } },
            ],
          },
        ];
      }

      const items = await prisma.productLite.findMany({
        where,
        orderBy: { updatedAtShopify: "desc" },
        take: first + 1, // one extra to detect next page
      });

      let nextCursor: string | null = null;
      if (items.length > first) {
        const last = items[first - 1];
        if (last.updatedAtShopify) {
          nextCursor = encodeCursor(last.updatedAtShopify);
        }
        items.length = first;
      }

      return {
        status,
        page: { items, nextCursor },
      };
    },

    // Planner + filter data resolvers
    planFilter: planFilterResolver,
    productsByFilter: productsByFilterResolver,

    // Snapshot status + read-side
    snapshotStatus: snapshotStatusResolver,
    productsBySnapshot: productsBySnapshotResolver,

    // Snapshot history
    snapshotRuns: snapshotRunsResolver,
    snapshotRunEvents: snapshotRunEventsResolver,

    // Debug
    debugVerifySnapshot: debugVerifySnapshotResolver,

    // FAST products connection (from fastProductsResolvers)
    ...fastProductsResolvers.Query,
  },
};

export const schema = createSchema({
  typeDefs,
  resolvers,
});
