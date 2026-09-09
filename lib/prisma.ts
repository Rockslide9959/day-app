import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Reuse one client across dev hot-reloads AND across warm serverless
// invocations in production. A fresh PrismaClient per invocation re-pays
// the connection handshake on every not-quite-cold request, which is a
// meaningful slice of first-load latency on Vercel's free tier.
globalForPrisma.prisma = prisma;
