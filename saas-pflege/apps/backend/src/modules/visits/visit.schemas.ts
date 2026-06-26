import { z } from "zod";
import { VisitStatus } from "@len-len/database";
import { paginationSchema } from "../../lib/pagination.js";

export const createVisitSchema = z.object({
  patientId: z.string().uuid(),
  scheduledAt: z.coerce.date(),
  // Optional: überschreibt die Stamm-Fachkraft des Patienten.
  assignedCaregiverId: z.string().uuid().optional(),
  // Optional: effektive Fachkraft (Vertretung). Default = Stamm-Fachkraft.
  caregiverId: z.string().uuid().optional(),
});

export const createEmergencyVisitSchema = z.object({
  patientId: z.string().uuid(),
  scheduledAt: z.coerce.date(),
  caregiverId: z.string().uuid().optional(),
  // Regel métier 2: Motiv bei Notfallbesuch verpflichtend.
  emergencyReason: z.string().min(3).max(500),
});

export const rescheduleVisitSchema = z.object({
  scheduledAt: z.coerce.date(),
});

export const assignCaregiverSchema = z.object({
  caregiverId: z.string().uuid(),
});

// includeEmergency defaultet auf true (anders als booleanQuery -> false).
const includeEmergencyQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v !== "false");

export const listVisitsQuerySchema = paginationSchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  patientId: z.string().uuid().optional(),
  caregiverId: z.string().uuid().optional(),
  status: z.nativeEnum(VisitStatus).optional(),
  includeEmergency: includeEmergencyQuery,
});

export const missingWeekQuerySchema = z.object({
  weekOf: z.coerce.date().optional(),
});

export const myVisitsQuerySchema = z.object({
  date: z.coerce.date().optional(),
});

export type CreateVisitInput = z.infer<typeof createVisitSchema>;
export type CreateEmergencyVisitInput = z.infer<typeof createEmergencyVisitSchema>;
export type RescheduleVisitInput = z.infer<typeof rescheduleVisitSchema>;
export type AssignCaregiverInput = z.infer<typeof assignCaregiverSchema>;
export type ListVisitsQuery = z.infer<typeof listVisitsQuerySchema>;
