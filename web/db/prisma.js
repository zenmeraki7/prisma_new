import { PrismaClient } from "@prisma/client";

/** @type {PrismaClient} */
let prisma;

if (global.__prisma) {
  prisma = global.__prisma;
} else {
  prisma = new PrismaClient({ log: ["error", "warn"] });
  if (process.env.NODE_ENV !== "production") global.__prisma = prisma;
}

export { prisma };
