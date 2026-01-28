// web/graphql/schema.ts
import { createSchema } from "graphql-yoga";
import { prisma } from "../db/prisma.js";

import { planFilterResolver } from "./filtering/planFilterResolver.js";
import { productsByFilterResolver } from "./filtering/productsByFilterResolver.js";

import {
  snapshotStatusResolver,
  productsBySnapshotResolver,
} from "./snapshots/resolvers.js";

import {
  snapshotRunsResolver,
  snapshotRunEventsResolver,
} from "./snapshots/historyResolvers.js";

import { debugVerifySnapshotResolver } from "./debug/debugVerifySnapshotResolver.js";

// Context type
export type GraphQLContext = {
  shopId: string;
};

/* ==========================
   GraphQL SDL
========================== */

const typeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSON

  # --- FAST plane ---
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

  enum FilterExecutionMode {
    FAST_ONLY
    SNAPSHOT
  }

  input PlanFilterInput {
    filter: JSON!
  }

  type PlanFilterPayload {
    planHash: String!
    executionMode: FilterExecutionMode!
    filterSummary: String
  }

  input ProductsByFilterInput {
    filter: JSON!
    mode: FilterExecutionMode! = FAST_ONLY
    first: Int! = 50
    after: String
  }

  type ProductsByFilterPage {
    items: [ProductLite!]!
    nextCursor: String
    planHash: String
  }

  # --- Snapshot plane ---
  enum SnapshotState {
    PENDING
    RUNNING
    SUCCEEDED
    FAILED
    EXPIRED
  }

  type SnapshotStatus {
    state: SnapshotState!
    progress: Int!
    total: Int!
    errorMessage: String
    filterSummary: String
    planHash: String!
    snapshotRunId: ID
  }

  type ProductsBySnapshotPage {
    items: [ProductLite!]!
    nextCursor: String
    snapshotRunId: ID!
  }

  type SnapshotRun {
    id: ID!
    planHash: String!
    state: SnapshotState!
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

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type DebugVerifySnapshotPayload {
    ok: Boolean!
    message: String
    mismatchedProductIds: [ID!]
  }

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

    planFilter(input: PlanFilterInput!): PlanFilterPayload!
    productsByFilter(input: ProductsByFilterInput!): ProductsByFilterPage!
    snapshotStatus(planHash: String!): SnapshotStatus!
    productsBySnapshot(
      planHash: String!
      first: Int! = 50
      after: String
    ): ProductsBySnapshotPage!
    snapshotRuns(first: Int! = 25, after: String): SnapshotRunConnection!
    snapshotRunEvents(
      runId: ID!
      first: Int! = 50
      after: String
    ): SnapshotRunEventConnection!
    debugVerifySnapshot(planHash: String!): DebugVerifySnapshotPayload!
  }
`;

/* ==========================
   Helpers for cursor
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

    // Existing resolvers
    planFilter: planFilterResolver,
    productsByFilter: productsByFilterResolver,

    snapshotStatus: snapshotStatusResolver,
    productsBySnapshot: productsBySnapshotResolver,

    snapshotRuns: snapshotRunsResolver,
    snapshotRunEvents: snapshotRunEventsResolver,

    debugVerifySnapshot: debugVerifySnapshotResolver,
  },
};

export const schema = createSchema({
  typeDefs,
  resolvers,
});
