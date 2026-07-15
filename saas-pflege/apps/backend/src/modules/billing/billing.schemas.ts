import { z } from "zod";
import { SubscriptionPlan } from "@len-len/database";

/**
 * Locale der Rückkehr-URL nach Checkout/Portal. Muss zu den next-intl-Routen
 * des Webs passen (/de /en /fr); DE ist Standard.
 */
const locale = z.enum(["de", "en", "fr"]).default("de");

export const checkoutSchema = z.object({
  plan: z.nativeEnum(SubscriptionPlan),
  locale,
});

export const portalSchema = z.object({
  locale,
});

export const listInvoicesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type PortalInput = z.infer<typeof portalSchema>;
export type ListInvoicesInput = z.infer<typeof listInvoicesSchema>;
