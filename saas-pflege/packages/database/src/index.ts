import { PrismaClient } from "@prisma/client";

// Singleton, damit im Dev (Hot-Reload) nicht zig Verbindungen entstehen.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Führt eine Operation im Tenant-Kontext aus. Setzt `app.current_org`
 * transaktionslokal, damit die RLS-Policies greifen.
 */
export async function withTenant<T>(
  organizationId: string,
  fn: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_org', $1, true)`,
      organizationId,
    );
    return fn(tx);
  });
}

export * from "@prisma/client";
