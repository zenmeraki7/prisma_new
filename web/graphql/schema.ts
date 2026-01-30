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

/* ==========================
   Context
========================== */

export type GraphQLContext = {
  shopId: string;
};

/* ==========================
   GraphQL SDL
========================== */

const typeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSON

  # ---------- FAST plane ----------
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

  # ---------- Filtering ----------
  enum FilterExecutionMode {
    FAST_ONLY
    SNAPSHOT
  }

  enum FilterKind {
    STRING
    NUMBER
    DATE
    ENUM
    BOOLEAN
  }

  enum FilterLogicalOp {
    AND
    OR
  }

enum StringFilterOp {
  EQUALS
  NOT_EQUALS
  CONTAINS
  NOT_CONTAINS
  CONTAINS_ANY
  STARTS_WITH
  NOT_STARTS_WITH
  ENDS_WITH
  CONTAINS_CI
  EQUALS_CI
}


  enum NumberFilterOp {
    EQ
    NEQ
    GT
    GTE
    LT
    LTE
    BETWEEN
  }

  enum DateFilterOp {
    BEFORE
    AFTER
    ON
  }

  enum EnumFilterOp {
    IS
    IS_NOT
  }

  enum BooleanFilterOp {
    IS
  }

  enum FilterFieldKey {
    PRODUCT_ID
    PRODUCT_TITLE
    PRODUCT_VENDOR
    PRODUCT_STATUS
    PRODUCT_TAG
    PRODUCT_PRODUCT_TYPE
    PRODUCT_CREATED_AT
    PRODUCT_UPDATED_AT
    PRODUCT_INVENTORY_QUANTITY
  }

  input StringFilterBodyInput {
    op: StringFilterOp!
    value: String!
  }

  input NumberFilterBodyInput {
    op: NumberFilterOp!
    value: Float!
    value2: Float
  }

  input DateFilterBodyInput {
    op: DateFilterOp!
    value: String!
  }

  input EnumFilterBodyInput {
    op: EnumFilterOp!
    value: String!
  }

  input BooleanFilterBodyInput {
    op: BooleanFilterOp!
    value: Boolean!
  }

  input FilterClauseInput {
    field: FilterFieldKey!
    kind: FilterKind!
    string: StringFilterBodyInput
    number: NumberFilterBodyInput
    date: DateFilterBodyInput
    enum: EnumFilterBodyInput
    boolean: BooleanFilterBodyInput
  }

  input FilterGroupInput {
    op: FilterLogicalOp!
    clauses: [FilterClauseInput!]
    groups: [FilterGroupInput!]
  }

  input PlanFiltersInput {
    root: FilterGroupInput
  }

  input PlanFilterInput {
    filter: PlanFiltersInput!
  }

  type PlanFilterPayload {
    planHash: String!
    executionMode: FilterExecutionMode!
    filterSummary: String
  }

  input ProductsByFilterInput {
    filters: PlanFiltersInput
    mode: FilterExecutionMode! = FAST_ONLY
    first: Int! = 50
    after: String
  }

  type ProductsByFilterPage {
    items: [ProductLite!]!
    nextCursor: String
    planHash: String
  }

  # ---------- Snapshots ----------
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

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
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

  type DebugVerifySnapshotPayload {
    ok: Boolean!
    message: String
    mismatchedProductIds: [ID!]
  }

  type Query {
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
   Cursor helpers
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
    tags: async (parent: any, _args: unknown, ctx: GraphQLContext) => {
      const rows = await prisma.productTag.findMany({
        where: { shopId: ctx.shopId, productId: parent.id },
        select: { tag: true },
      });
      return rows.map((r) => r.tag);
    },
  },

  Query: {
    bootstrapProducts: async (
      _parent: unknown,
      args: { first: number; after?: string | null; search?: string | null },
      ctx: GraphQLContext,
    ) => {
      const { shopId } = ctx;
      const first = Math.min(Math.max(args.first, 1), 100);

      const syncState = await prisma.fastSyncState.findUnique({
        where: { shopId },
      });

      const status = {
        fastReady: syncState?.fastReady ?? false,
        fastLastSyncAt: syncState?.fastLastSyncAt ?? null,
        fastRevision: syncState?.fastRevision ?? 0,
        syncEnqueued: syncState?.syncEnqueued ?? false,
      };

      const cursorFilter =
        args.after != null
          ? { updatedAtShopify: { lt: decodeCursor(args.after) } }
          : {};

      const where: any = { shopId, ...cursorFilter };

      if (args.search?.trim()) {
        where.OR = [
          { title: { contains: args.search, mode: "insensitive" } },
          { vendor: { contains: args.search, mode: "insensitive" } },
          { productType: { contains: args.search, mode: "insensitive" } },
          { handle: { contains: args.search, mode: "insensitive" } },
        ];
      }

      const items = await prisma.productLite.findMany({
        where,
        orderBy: { updatedAtShopify: "desc" },
        take: first + 1,
      });

      let nextCursor: string | null = null;
      if (items.length > first) {
        const last = items[first - 1];
        if (last.updatedAtShopify) {
          nextCursor = encodeCursor(last.updatedAtShopify);
        }
        items.length = first;
      }

      return { status, page: { items, nextCursor } };
    },

    planFilter: planFilterResolver,
    productsByFilter: productsByFilterResolver,

    snapshotStatus: snapshotStatusResolver,
    productsBySnapshot: productsBySnapshotResolver,
    snapshotRuns: snapshotRunsResolver,
    snapshotRunEvents: snapshotRunEventsResolver,

    debugVerifySnapshot: debugVerifySnapshotResolver,
  },
};

/* ==========================
   Schema
========================== */

export const schema = createSchema({
  typeDefs,
  resolvers,
});
