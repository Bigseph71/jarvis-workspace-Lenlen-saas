import type { FastifyInstance } from "fastify";
import {
  getBillingProvider,
  type BillingEvent,
  type BillingProvider,
} from "../../lib/billing/index.js";
import { handleStripeEvent } from "./billing.service.js";

/**
 * Stripe-Webhook. Eigenes Plugin, weil die Signaturprüfung den ROHEN Body
 * braucht: der Content-Type-Parser (buffer) ist hier gekapselt und betrifft
 * keine anderen Routen. Keine Auth (Stripe ruft direkt, Sicherheit = Signatur).
 */
export async function billingWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/billing/webhook", async (request, reply) => {
    const signature = request.headers["stripe-signature"];
    const sig = typeof signature === "string" ? signature : undefined;

    // Provider-Auswahl BEWUSST außerhalb des Signatur-try: eine fehlende
    // Stripe-Konfiguration ist kein ungültiges Event. Als 400 getarnt hieße
    // Stripe "verwirf das Event" und der Verlust fiele niemandem auf; als 503
    // stellt Stripe später erneut zu, und im Log steht der wahre Grund.
    let provider: BillingProvider;
    try {
      provider = getBillingProvider();
    } catch (err) {
      request.log.error({ err }, "Stripe-Webhook: Billing nicht konfiguriert");
      return reply.status(503).send({ error: "BillingNotConfigured" });
    }

    let event: BillingEvent;
    try {
      event = provider.constructEvent(request.body as Buffer, sig);
    } catch (err) {
      request.log.warn({ err }, "Stripe-Webhook: Signaturprüfung fehlgeschlagen");
      return reply.status(400).send({ error: "InvalidSignature" });
    }

    await handleStripeEvent(event);
    return reply.status(200).send({ received: true });
  });
}
