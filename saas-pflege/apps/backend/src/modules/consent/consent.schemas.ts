import { z } from "zod";
import { Locale } from "@len-len/database";

/**
 * Erteilung der GPS-Einwilligung. Die Version wird MITGESCHICKT, nicht
 * serverseitig gesetzt: nur so ist belegt, dass die App genau den Text
 * angezeigt hat, dem zugestimmt wurde. Stimmt sie nicht mit der aktuellen
 * überein (veraltete App), lehnt der Service ab.
 */
export const grantGpsConsentSchema = z.object({
  policyVersion: z.string().min(1).max(40),
  locale: z.nativeEnum(Locale).default(Locale.DE),
});

export type GrantGpsConsentInput = z.infer<typeof grantGpsConsentSchema>;
