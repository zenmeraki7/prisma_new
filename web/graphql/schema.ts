
// FILE: web/graphql/schema.ts

import { createSchema } from "graphql-yoga";
import { prisma } from "../db/prisma.js";

import { planFilterResolver } from "./filtering/planFilterResolver.js";
import { productsByFilterResolver } from "./filtering/productsByFilterResolver.js";
import { fastProductsResolvers } from "./resolvers/fastProducts.js";

export type GraphQLContext = {
  shopId: string;
};

/* ==========================
   GraphQL SDL
========================== */

const typeDefs = /* GraphQL */ `

  scalar DateTime
  scalar JSON

  # --- Product type ---
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

  # --- Variant rollup ---
  type VariantRollup {
    minPrice: Float
    maxPrice: Float
    totalInventory: Int
  }

  # --- Filter execution mode ---
  enum FilterExecutionMode {
    AUTO
    FAST_ONLY
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

  input ProductsByFilterInput {
    filter: JSON
    mode: FilterExecutionMode = AUTO
    first: Int! = 50
    after: String
  }

  type ProductsByFilterPayload {
    items: [ProductLite!]!
    nextCursor: String
    mode: FilterExecutionMode!
    guardrail: FilterGuardrail!
    warnings: [String!]!
  }

  # --- Pagination ---
  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  # --- FAST products sorting ---
  enum FastProductsSortField {
    TITLE
    CREATED_AT
    UPDATED_AT
    TOTAL_INVENTORY
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

    planFilter(input: PlanFilterInput!): PlanFilterPayload!

    productsByFilter(input: ProductsByFilterInput!): ProductsByFilterPayload!

    fastProducts(
      first: Int
      after: String
      filter: JSON
      sort: FastProductsSortInput
    ): FastProductsConnection!
  }
`;

/* ==========================
   Resolvers
========================== */

const resolvers = {

  ProductLite: {
    tags: async (parent: any, _args: unknown, ctx: GraphQLContext) => {

      const rows = await prisma.productTag.findMany({
        where: {
          shopId: ctx.shopId,
          productId: parent.id
        },
        select: {
          tag: true
        }
      });

      return rows.map((r) => r.tag);
    }
  },

  VariantRollup: {
    minPrice: (parent: any) =>
      parent.minPrice != null ? Number(parent.minPrice) : null,

    maxPrice: (parent: any) =>
      parent.maxPrice != null ? Number(parent.maxPrice) : null,

    totalInventory: (parent: any) =>
      parent.totalInventory
  },

  Query: {

    planFilter: planFilterResolver,

    productsByFilter: productsByFilterResolver,

    ...fastProductsResolvers.Query
  }
};

export const schema = createSchema({
  typeDefs,
  resolvers
});
