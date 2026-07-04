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

// Pointage (Mobile): Position optional (Web sendet keine), recordedAt für
// Offline-Nachreichung (max. 24h alt, nie in der Zukunft).
export const pointageSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().nonnegative().max(10000).optional(),
    recordedAt: z.coerce
      .date()
      .refine((d) => d.getTime() <= Date.now() + 60_000, "recordedAt liegt in der Zukunft")
      .refine(
        (d) => d.getTime() >= Date.now() - 24 * 60 * 60 * 1000,
        "recordedAt ist älter als 24 Stunden",
      )
      .optional(),
  })
  .partial({ latitude: true, longitude: true })
  .refine(
    (v) => (v.latitude === undefined) === (v.longitude === undefined),
    "latitude und longitude nur gemeinsam",
  )
  .optional();

export type CreateVisitInput = z.infer<typeof createVisitSchema>;
export type CreateEmergencyVisitInput = z.infer<typeof createEmergencyVisitSchema>;
export type RescheduleVisitInput = z.infer<typeof rescheduleVisitSchema>;
export type AssignCaregiverInput = z.infer<typeof assignCaregiverSchema>;
export type ListVisitsQuery = z.infer<typeof listVisitsQuerySchema>;
export type PointageInput = z.infer<typeof pointageSchema>;
