import { z } from "zod";
import { AuditAction, SubscriptionPlan, SubscriptionStatus } from "@len-len/database";
import { paginationSchema } from "../../lib/pagination.js";

/**
 * Eingaben des Super-Admin-Panels.
 *
 * Hier hängt mehr an der Validierung als sonst: diese Endpunkte laufen über den
 * Systempfad, ohne Tenant-Filter und ohne RLS. Ein durchgerutschter Wert trifft
 * nicht einen Kunden, sondern alle.
 */

export const organizationIdParamSchema = z.object({ id: z.string().uuid() });

export const listOrganizationsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(SubscriptionStatus).optional(),
  plan: z.nativeEnum(SubscriptionPlan).optional(),
  /** Namenssuche, ohne Berücksichtigung der Gross-/Kleinschreibung. */
  search: z.string().trim().min(1).max(120).optional(),
  /** Gelöschte Organisationen mit anzeigen (Vorgabe: nein). */
  includeDeleted: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

/**
 * Änderungen an einer Organisation. Mindestens ein Feld muss gesetzt sein –
 * ein leerer Aufruf wäre sonst ein stiller Erfolg, der nichts tut, und träfe
 * trotzdem den Audit-Log.
 */
export const updateOrganizationSchema = z
  .object({
    plan: z.nativeEnum(SubscriptionPlan).optional(),
    /**
     * Neues Ende der Testphase. Nur in die Zukunft: eine Testphase rückwirkend
     * zu verkürzen würde den Tenant beim nächsten Lauf des Billing-Workers
     * ohne Vorwarnung suspendieren.
     */
    trialEndsAt: z.coerce
      .date()
      .refine((d) => d.getTime() > Date.now(), "trialEndsAt muss in der Zukunft liegen")
      .optional(),
    /**
     * Nur die Zustände, die von Hand vergeben werden dürfen. ACTIVE und
     * PAST_DUE gehören Stripe: sie von Hand zu setzen hiesse, die Anzeige von
     * der Zahlung zu entkoppeln.
     */
    status: z.enum([SubscriptionStatus.SUSPENDED, SubscriptionStatus.TRIAL]).optional(),
    /** Hebt eine Sperre auf und lässt den Tenant wieder arbeiten. */
    reactivate: z.boolean().optional(),
  })
  .refine(
    (v) => Object.values(v).some((field) => field !== undefined),
    "Mindestens ein Feld muss geändert werden",
  )
  .refine(
    (v) => !(v.reactivate === true && v.status !== undefined),
    "reactivate und status schliessen einander aus",
  );

export const deleteOrganizationSchema = z.object({
  /**
   * Pflichtbegründung. Die Untergrenze ist kein Formalismus: "test" oder "x"
   * beantworten in sechs Monaten nicht, warum ein Kunde verschwunden ist.
   */
  reason: z.string().trim().min(10, "Begründung: mindestens 10 Zeichen").max(500),
});

export const auditLogQuerySchema = paginationSchema.extend({
  organizationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  action: z.nativeEnum(AuditAction).optional(),
  entityType: z.string().trim().min(1).max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Wie oben, aber ohne Seitenzahlen: der Export umfasst den ganzen Filter. */
export const auditLogExportQuerySchema = auditLogQuerySchema
  .omit({ page: true, pageSize: true })
  .extend({
    /**
     * Obergrenze der Zeilen. Ein Export ohne Deckel liest bei einem
     * gewachsenen Bestand die halbe Tabelle in den Speicher.
     */
    limit: z.coerce.number().int().min(1).max(10000).default(5000),
  });

export type ListOrganizationsQuery = z.infer<typeof listOrganizationsQuerySchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type DeleteOrganizationInput = z.infer<typeof deleteOrganizationSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type AuditLogExportQuery = z.infer<typeof auditLogExportQuerySchema>;
