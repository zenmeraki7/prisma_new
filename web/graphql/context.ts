// web/graphql/context.ts
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export type GraphqlContext = {
  prisma: PrismaClient;
  // For now, shopId is optional; in Phase 1+ we derive from session/JWT.
  shopId?: number;
};

export function createContext(): GraphqlContext {
  // Phase 0: we are not yet resolving actual Shopify shops.
  // Later this will be wired to App Bridge session / JWT.
  return {
    prisma,
    shopId: undefined,
  };
}
