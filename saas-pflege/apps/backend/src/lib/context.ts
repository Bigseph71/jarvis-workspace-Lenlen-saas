import type { PrismaClient } from "@len-len/database";

/**
 * Akteur + Tenant eines Requests (aus request.user abgeleitet).
 * userId ist null für System-Aktionen (z.B. async Worker ohne eingeloggten User).
 */
export interface TenantContext {
  organizationId: string;
  userId: string | null;
}

/**
 * Transaktions-Client, wie ihn withTenant() an den Callback übergibt
 * (PrismaClient ohne die $-Lifecycle-Methoden).
 */
export type TenantTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
