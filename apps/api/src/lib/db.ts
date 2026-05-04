import { PrismaClient } from "@prisma/client";

import { env } from "./env.js";

/**
 * Single shared Prisma client.
 *
 * In dev, `tsx watch` re-imports modules on every save, which would otherwise
 * spawn a new PrismaClient (and a new connection pool) on every change. We
 * stash the client on globalThis to keep one across hot reloads.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
