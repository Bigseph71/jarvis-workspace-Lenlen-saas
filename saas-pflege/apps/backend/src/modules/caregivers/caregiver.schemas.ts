import { z } from "zod";
import { Qualification, ContractType } from "@len-len/database";
import { paginationSchema, booleanQuery } from "../../lib/pagination.js";

export const weekDaySchema = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

// Vertrags-Block: bei jeder Fachkraft Pflicht (Regel métier 5).
const contractFields = {
  contractType: z.nativeEnum(ContractType),
  weeklyHours: z.number().positive().max(60),
  workDays: z.array(weekDaySchema).min(1).max(7),
  maxPatients: z.number().int().min(0).max(500),
};

export const createCaregiverSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  qualification: z.nativeEnum(Qualification),
  // Optionale Verknüpfung mit einem bestehenden Benutzerkonto.
  userId: z.string().uuid().optional(),
  ...contractFields,
});

export const updateCaregiverSchema = z
  .object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    qualification: z.nativeEnum(Qualification),
    userId: z.string().uuid().nullable(),
  })
  .partial();

/** Dediziertes Vertragsmodul (HR / Struktur-Admin). */
export const updateContractSchema = z.object(contractFields);

export const listCaregiversQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
  qualification: z.nativeEnum(Qualification).optional(),
  includeInactive: booleanQuery,
});

export type CreateCaregiverInput = z.infer<typeof createCaregiverSchema>;
export type UpdateCaregiverInput = z.infer<typeof updateCaregiverSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type ListCaregiversQuery = z.infer<typeof listCaregiversQuerySchema>;
