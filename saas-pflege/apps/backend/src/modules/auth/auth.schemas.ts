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

/** Passwortwechsel des eingeloggten Users (auch der erzwungene beim 1. Login). */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "Neues Passwort muss sich vom bisherigen unterscheiden",
    path: ["newPassword"],
  });

export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
