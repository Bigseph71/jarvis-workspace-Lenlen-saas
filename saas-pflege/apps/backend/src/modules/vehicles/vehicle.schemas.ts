import { z } from "zod";
import { paginationSchema, booleanQuery } from "../../lib/pagination.js";

// leasingEndDate optional; null hebt ein bestehendes Datum auf.
const endDateSchema = z.coerce.date().nullable().optional();

export const createVehicleSchema = z.object({
  label: z.string().trim().min(1).max(120),
  leasingKmLimit: z.number().int().positive().max(2_000_000),
  leasingKmUsed: z.number().int().min(0).max(2_000_000).optional(),
  leasingEndDate: endDateSchema,
});

// Voll-Update (PUT). km_used wird nicht hier, sondern über /km gepflegt.
export const updateVehicleSchema = z.object({
  label: z.string().trim().min(1).max(120),
  leasingKmLimit: z.number().int().positive().max(2_000_000),
  leasingEndDate: endDateSchema,
});

// Kilometerstand nach einer Tour erhöhen.
export const addKmSchema = z.object({
  km: z.number().int().positive().max(100_000),
});

export const listVehiclesQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
  includeInactive: booleanQuery,
});

export const assignRouteQuerySchema = z.object({
  km: z.coerce.number().int().min(0).max(100_000),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type AddKmInput = z.infer<typeof addKmSchema>;
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;
export type AssignRouteQuery = z.infer<typeof assignRouteQuerySchema>;
