import { z } from "zod";
import { GeocodingStatus } from "@len-len/database";
import { paginationSchema, booleanQuery } from "../../lib/pagination.js";

export const createPatientSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  rawAddress: z.string().min(3).max(300),
  assignedCaregiverId: z.string().uuid().optional(),
});

export const updatePatientSchema = z
  .object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    rawAddress: z.string().min(3).max(300),
    assignedCaregiverId: z.string().uuid().nullable(),
  })
  .partial();

export const listPatientsQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
  geocodingStatus: z.nativeEnum(GeocodingStatus).optional(),
  includeInactive: booleanQuery,
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;
