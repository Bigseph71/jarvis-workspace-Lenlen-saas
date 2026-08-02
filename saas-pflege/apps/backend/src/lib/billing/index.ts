import Stripe from "stripe";
import { env } from "../../config/env.js";
import { AppError } from "../errors.js";
import type { BillingProvider } from "./types.js";
import { StripeBillingProvider } from "./stripe.js";
import { StubBillingProvider } from "./stub.js";

let cached: BillingProvider | undefined;

/** Sind die Stripe-Zugangsdaten vollständig hinterlegt? */
export function stripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Liefert den Billing-Provider (gecacht). Ohne Stripe-Keys -> Stub, damit
 * Dev/Test ohne Stripe laufen.
 *
 * In PRODUKTION ist der Stub verboten und der Aufruf wirft. Der Stub prüft
 * keine Signatur, er nimmt jedes JSON als echtes Stripe-Event an. Liefe er
 * versehentlich in Produktion, könnte jeder per POST auf /billing/webhook den
 * Plan eines fremden Tenants setzen oder dessen Abo kündigen. Ein leer
 * gelassenes STRIPE_SECRET_KEY darf deshalb nicht in einen stillen Rückfall
 * münden, sondern muss den Dienst scheitern lassen.
 */
export function getBillingProvider(): BillingProvider {
  if (cached) return cached;

  if (stripeConfigured()) {
    cached = new StripeBillingProvider(
      new Stripe(env.STRIPE_SECRET_KEY as string),
      env.STRIPE_WEBHOOK_SECRET as string,
    );
    return cached;
  }

  if (env.NODE_ENV === "production") {
    // 503 statt 500: der Dienst ist gesund, nur diese Fähigkeit fehlt. Für
    // Stripe heißt 503 außerdem "später erneut zustellen", ein Event geht also
    // nicht verloren, während die Konfiguration nachgezogen wird.
    throw new AppError(
      503,
      "Stripe ist nicht konfiguriert (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET). " +
        "In Produktion ist der Stub-Provider unzulässig: er akzeptiert unsignierte Webhooks.",
      "BillingNotConfigured",
    );
  }

  cached = new StubBillingProvider();
  return cached;
}

/** Nur für Tests: erzwingt beim nächsten Aufruf eine neue Auswahl. */
export function resetBillingProvider(): void {
  cached = undefined;
}

export type { BillingProvider, BillingEvent } from "./types.js";
