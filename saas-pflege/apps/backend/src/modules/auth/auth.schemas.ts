import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12, "Mindestens 12 Zeichen")
  .max(128)
  .regex(/[a-z]/, "Mindestens ein Kleinbuchstabe")
  .regex(/[A-Z]/, "Mindestens ein Großbuchstabe")
  .regex(/[0-9]/, "Mindestens eine Ziffer");

/** Bootstrap: neue Organisation + erster Struktur-Admin. */
export const registerOrganizationSchema = z.object({
  organizationName: z.string().min(2).max(120),
  country: z.string().length(2).default("DE"),
  adminEmail: z.string().email().toLowerCase(),
  adminPassword: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
  // Optional, falls dieselbe E-Mail in mehreren Tenants existiert.
  organizationId: z.string().uuid().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
