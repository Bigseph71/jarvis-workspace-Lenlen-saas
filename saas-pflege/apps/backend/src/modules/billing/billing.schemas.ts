import { z } from "zod";
import { SubscriptionPlan } from "@len-len/database";

export const checkoutSchema = z.object({
  plan: z.nativeEnum(SubscriptionPlan),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
