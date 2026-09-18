import { z } from "zod";
import { Locale } from "@len-len/database";

/**
 * Anlegen eines Fachkraft-Kontos zu einer bereits bestehenden Fachkraft.
 * Es wird kein Passwort erzeugt: die Antwort enthält einen Einladungslink.
 */
export const createFachkraftUserSchema = z.object({
  caregiverId: z.string().uuid(),
  email: z.string().email().max(254).toLowerCase(),
  language: z.nativeEnum(Locale).default(Locale.DE),
});

/** Route-Parameter beim Ausstellen einer Einladung (User-ID, nicht Caregiver-ID). */
export const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateFachkraftUserInput = z.infer<typeof createFachkraftUserSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
