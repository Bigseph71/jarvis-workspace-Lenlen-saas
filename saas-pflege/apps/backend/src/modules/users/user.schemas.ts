import { z } from "zod";
import { Locale } from "@len-len/database";

/**
 * Anlegen eines Fachkraft-Kontos zu einer bereits bestehenden Fachkraft.
 * Das Passwort wird serverseitig erzeugt und nie vom Client geliefert.
 */
export const createFachkraftUserSchema = z.object({
  caregiverId: z.string().uuid(),
  email: z.string().email().max(254).toLowerCase(),
  language: z.nativeEnum(Locale).default(Locale.DE),
});

/** Route-Parameter beim Zurücksetzen des Passworts (User-ID, nicht Caregiver-ID). */
export const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateFachkraftUserInput = z.infer<typeof createFachkraftUserSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
