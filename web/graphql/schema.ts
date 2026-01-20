// web/graphql/schema.ts
import { createSchema } from "graphql-yoga";
import { prisma } from "../db/prisma";
import { fastSyncQueue } from "../jobs/queue";

const typeDefs = /* GraphQL */ `
  scalar DateTime

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

  type Query {
    bootstrapProducts(first: Int! = 25, after: String): BootstrapProductsPayload!
  }
`;

function encodeCursor(d: Date): string {
  return Buffer.from(d.toISOString(), "utf8").toString("base64url");
}
function decodeCursor(s: string): Date | null {
  try {
    const iso = Buffer.from(s, "base64url").toString("utf8");
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// IMPORTANT:
// In a real Shopify app, shopId/shopDomain/accessToken come from your session middleware.
// Here we assume ctx has them.
type Ctx = {
  shopId: string;
  shopDomain: string;
  accessToken: string;
};

const resolvers = {
  Query: {
    bootstrapProducts: async (_: any, args: { first: number; after?: string | null }, ctx: Ctx) => {
      const first = Math.min(Math.max(args.first ?? 25, 1), 100);
      const afterDate = args.after ? decodeCursor(args.after) : null;

      const state = await prisma.shopState.upsert({
        where: { shopId: ctx.shopId },
        create: { shopId: ctx.shopId, fastReady: false, fastRevision: 0 },
        update: {},
      });

      const where: any = { shopId: ctx.shopId };
      if (afterDate) {
        // page by updatedAtShopify DESC. Cursor is a timestamp boundary.
        where.updatedAtShopify = { lt: afterDate };
      }

      const items = await prisma.productLite.findMany({
        where,
        orderBy: [{ updatedAtShopify: "desc" }, { id: "desc" }],
        take: first,
        select: {
          id: true,
          title: true,
          handle: true,
          status: true,
          vendor: true,
          productType: true,
          tags: true,
          hasImages: true,
          updatedAtShopify: true,
        },
      });

      // If FAST is not ready and there’s no data, enqueue a full sync.
      let syncEnqueued = false;
      if (!state.fastReady) {
        const anyRow = await prisma.productLite.findFirst({
          where: { shopId: ctx.shopId },
          select: { id: true },
        });

        if (!anyRow) {
          const ledger = await prisma.jobLedger.create({
            data: { shopId: ctx.shopId, type: "FAST_FULL_SYNC", status: "PENDING" },
          });

          const job = await fastSyncQueue.add("fast_full_sync", {
            shopId: ctx.shopId,
            shopDomain: ctx.shopDomain,
            accessToken: ctx.accessToken,
            jobLedgerId: ledger.id,
          });

          await prisma.jobLedger.update({
            where: { id: ledger.id },
            data: { queueJobId: String(job.id) },
          });

          syncEnqueued = true;
        }
      }

      const nextCursor =
        items.length === first && items[items.length - 1]?.updatedAtShopify
          ? encodeCursor(items[items.length - 1].updatedAtShopify as Date)
          : null;

      return {
        status: {
          fastReady: state.fastReady,
          fastLastSyncAt: state.fastLastSyncAt,
          fastRevision: state.fastRevision,
          syncEnqueued,
        },
        page: { items, nextCursor },
      };
    },
  },
};

export const schema = createSchema({ typeDefs, resolvers });
