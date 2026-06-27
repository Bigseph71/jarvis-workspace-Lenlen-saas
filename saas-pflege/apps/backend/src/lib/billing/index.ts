import Stripe from "stripe";
import { env } from "../../config/env.js";
import type { BillingProvider } from "./types.js";
import { StripeBillingProvider } from "./stripe.js";
import { StubBillingProvider } from "./stub.js";

let cached: BillingProvider | undefined;

/**
 * Liefert den Billing-Provider (gecacht). Ohne Stripe-Keys -> Stub, damit
 * Dev/Test ohne Stripe laufen.
 */
export function getBillingProvider(): BillingProvider {
  if (cached) return cached;
  if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) {
    cached = new StripeBillingProvider(new Stripe(env.STRIPE_SECRET_KEY), env.STRIPE_WEBHOOK_SECRET);
  } else {
    cached = new StubBillingProvider();
  }
  return cached;
}

export type { BillingProvider, BillingEvent } from "./types.js";
