// web/db/prisma.js
import { PrismaClient } from "@prisma/client";

/**
 * In development (especially with Vite / HMR),
 * we must avoid creating multiple Prisma clients.
 *
 * In production, a fresh instance is fine.
 */
const globalForPrisma = globalThis;

/** @type {PrismaClient | undefined} */
const prismaClient =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prismaClient;
}

export const prisma = prismaClient;
