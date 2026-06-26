import type { PrismaClient } from "@len-len/database";

/** Akteur + Tenant eines Requests (aus request.user abgeleitet). */
export interface TenantContext {
  organizationId: string;
  userId: string;
}

/**
 * Transaktions-Client, wie ihn withTenant() an den Callback übergibt
 * (PrismaClient ohne die $-Lifecycle-Methoden).
 */
export type TenantTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
