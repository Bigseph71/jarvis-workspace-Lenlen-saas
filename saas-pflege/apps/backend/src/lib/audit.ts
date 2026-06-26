import { type AuditAction, type Prisma } from "@len-len/database";
import type { TenantContext, TenantTx } from "./context.js";

interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Schreibt einen Audit-Eintrag innerhalb derselben Tenant-Transaktion.
 * DSGVO: jeder Zugriff (Lesen/Schreiben/Löschen) auf Patientendaten wird
 * protokolliert. Läuft im RLS-Kontext, daher tenant-isoliert.
 */
export async function writeAudit(
  tx: TenantTx,
  ctx: TenantContext,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    },
  });
}
