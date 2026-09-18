import { z } from "zod";

// Identisch zu auth.schemas: wer sein Passwort über eine Einladung setzt,
// unterliegt denselben Regeln wie beim Wechsel. Bewusst dupliziert statt
// importiert – auth.schemas beschreibt die Anmeldung, dies hier die Einladung;
// eine gemeinsame Konstante verknüpfte zwei Module, die sich sonst nicht kennen.
const passwordSchema = z
  .string()
  .min(12, "Mindestens 12 Zeichen")
  .max(128)
  .regex(/[a-z]/, "Mindestens ein Kleinbuchstabe")
  .regex(/[A-Z]/, "Mindestens ein Großbuchstabe")
  .regex(/[0-9]/, "Mindestens eine Ziffer");

// base64url aus 32 Byte ergibt 43 Zeichen. Die Untergrenze hält offensichtlich
// Untaugliches von der Datenbank fern, ohne die Länge festzuschreiben.
export const invitationParamSchema = z.object({
  token: z.string().min(20).max(200),
});

export const acceptInvitationSchema = z.object({
  password: passwordSchema,
});
