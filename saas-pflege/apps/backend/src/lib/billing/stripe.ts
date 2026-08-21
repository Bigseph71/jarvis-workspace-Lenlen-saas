import Stripe from "stripe";
import { AppError } from "../errors.js";
import { planForPrice, priceForPlan } from "./prices.js";
import type {
  BillingEvent,
  BillingProvider,
  CheckoutParams,
  CheckoutSession,
  PlanChangeParams,
  CancellationResult,
  PortalParams,
  RecurringRevenue,
  SubscriptionState,
} from "./types.js";

/**
 * Stripe-Status, bei denen das Abo fortbesteht: es kann weiter (oder wieder)
 * abrechnen, ein zweiter Checkout würde den Tenant also doppelt belasten.
 *
 * Bewusst enthalten:
 *  - `unpaid`  – Stripe behält das Abo nach erschöpften Zahlungsversuchen. Ob es
 *                stattdessen gekündigt wird, hängt an einer Dashboard-
 *                Einstellung; darauf verlassen wir uns nicht.
 *  - `paused`  – Einzug ausgesetzt, das Abo selbst lebt weiter.
 *
 * Bewusst NICHT enthalten:
 *  - `canceled`, `incomplete_expired` – endgültig beendet.
 *  - `incomplete` – die erste Zahlung kam nie durch. Das Abo verfällt von selbst
 *                   nach 23 Stunden und hat nie abgerechnet; ein neuer Checkout
 *                   kann hier nichts verdoppeln und ist der einzige Weg zurück.
 */
const LIVE_STATUSES = new Set<string>(["active", "trialing", "past_due", "unpaid", "paused"]);

/**
 * Preis des Plans, oder ein sprechender Fehler.
 *
 * 503 und nicht 500: der Dienst ist gesund, es fehlt nur eine Konfiguration –
 * dieselbe Lesart wie beim fehlenden Stripe-Key (siehe index.ts). Die Meldung
 * nennt die Variable, damit im Log steht, was zu setzen ist, statt dass jemand
 * einen generischen 500 im Checkout nachstellen muss.
 */
function requirePrice(plan: string): string {
  const price = priceForPlan(plan);
  if (!price) {
    throw new AppError(
      503,
      `Kein Stripe-Preis für Plan ${plan} hinterlegt (STRIPE_PRICE_${plan} fehlt)`,
      "BillingNotConfigured",
    );
  }
  return price;
}

export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe";

  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string,
  ) {}

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutSession> {
    const price = requirePrice(params.plan);

    const metadata = { organizationId: params.organizationId, plan: params.plan };

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      // Bestehenden Customer wiederverwenden. Ohne das legt Stripe bei jedem
      // Checkout einen neuen an: das alte Abo bliebe an der verwaisten
      // Kundennummer hängen, und stripeCustomerId zeigte nur noch auf die
      // letzte – das Self-Service-Portal und die Rechnungen des alten Abos
      // wären für den Tenant verloren.
      // Stripe verbietet customer und customer_email gleichzeitig.
      ...(params.customerId
        ? { customer: params.customerId }
        : { customer_email: params.customerEmail }),
      metadata,
      // Dieselben Angaben am ABO: customer.subscription.created trifft unter
      // Umständen ein, bevor checkout.session.completed die Customer-ID beim
      // Tenant gespeichert hat. Ohne diese Metadaten wäre das Event dann keinem
      // Tenant zuzuordnen und würde stillschweigend verworfen.
      subscription_data: {
        metadata,
        // Testphase AM ABO, nicht als lokaler Sonderzustand: Stripe zieht die
        // Zahlungsdaten sofort ein, belastet aber erst nach Ablauf und
        // wechselt selbsttätig von "trialing" auf "active". Ohne Kündigung
        // wird der Interessent damit zum zahlenden Kunden – genau das war
        // gefordert.
        //
        // Nur beim ERSTEN Abo: `params.trialDays` bleibt beim Planwechsel
        // ungesetzt, sonst schenkte jeder Upgrade eine neue Testphase.
        ...(params.trialDays && params.trialDays > 0
          ? { trial_period_days: params.trialDays }
          : {}),
      },
    });

    if (!session.url) throw new Error("Stripe lieferte keine Checkout-URL");
    return { id: session.id, url: session.url };
  }

  async getSubscriptionState(subscriptionId: string): Promise<SubscriptionState | null> {
    let subscription: Stripe.Subscription;
    try {
      subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (err) {
      // resource_missing: die gespeicherte ID zeigt ins Leere (in Stripe
      // gelöscht, oder noch aus dem Testmodus). Wie "kein Abo" behandeln, sonst
      // käme der Tenant nie mehr zu einem Abschluss.
      // Jeder ANDERE Fehler (Netz, falscher Key, Rate Limit) wird
      // weitergereicht: dort wüssten wir nichts, und ein Checkout auf Verdacht
      // ist genau die Doppelbelastung, die wir verhindern wollen.
      if (
        err instanceof Stripe.errors.StripeInvalidRequestError &&
        err.code === "resource_missing"
      ) {
        return null;
      }
      throw err;
    }

    const items = subscription.items.data;
    const item = items.length === 1 ? items[0] : undefined;

    return {
      status: subscription.status,
      live: LIVE_STATUSES.has(subscription.status),
      plan: item ? planForPrice(item.price.id) : null,
    };
  }

  /**
   * Tauscht den Preis der bestehenden Abo-Position aus. Kein zweiter Checkout:
   * Stripe erlaubt beliebig viele Abos je Customer, ein Upgrade per Checkout
   * ließe das alte Abo also weiterlaufen und der Tenant zahlte beide.
   */
  async changeSubscriptionPlan(params: PlanChangeParams): Promise<void> {
    const price = requirePrice(params.plan);

    const subscription = await this.stripe.subscriptions.retrieve(params.subscriptionId);
    const items = subscription.items.data;
    const item = items[0];
    // Unsere Checkouts legen genau eine Position an. Mehrere bedeuten ein in
    // Stripe von Hand zusammengestelltes Abo – dort blind die erste zu ersetzen
    // könnte einen ausgehandelten Zusatzposten löschen.
    if (items.length !== 1 || !item) {
      throw new AppError(
        409,
        "Das Abonnement hat mehrere Positionen und kann nicht automatisch gewechselt werden",
        "Conflict",
      );
    }

    // Schon auf dem Zielpreis: nichts zu tun (idempotent bei Doppelklick).
    if (item.price.id === price) return;

    await this.stripe.subscriptions.update(params.subscriptionId, {
      items: [{ id: item.id, price, quantity: 1 }],
      // Anteilige Verrechnung des Restzeitraums. Die Differenz landet auf der
      // nächsten Rechnung, statt sofort eine Zahlung auszulösen – ein Wechsel
      // kann so nicht mitten in einer 3DS-Abfrage stecken bleiben.
      proration_behavior: "create_prorations",
      metadata: { organizationId: params.organizationId, plan: params.plan },
    });
  }

  async createPortalSession(params: PortalParams): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  constructEvent(payload: Buffer, signature: string | undefined): BillingEvent {
    if (!signature) throw new Error("Fehlende Stripe-Signatur");
    const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    return event as unknown as BillingEvent;
  }

  /**
   * Beendet ein Abo sofort.
   *
   * `subscriptions.cancel` IST die sofortige Kündigung – das Abo endet mit dem
   * Aufruf. Das Gegenstück, das Abo bis zum Periodenende weiterlaufen zu
   * lassen, wäre `subscriptions.update({ cancel_at_period_end: true })`; dieser
   * Parameter existiert an `cancel` nicht.
   *
   * `prorate` bleibt beim Standard false: kein Gutschrift-Posten für die
   * angebrochene Periode. Wer eine Organisation im Panel löscht, beendet ein
   * Kundenverhältnis – eine automatische Rückerstattung wäre eine
   * kaufmännische Entscheidung, die nicht in einem Löschknopf versteckt
   * gehören.
   *
   * Ein bereits beendetes oder unbekanntes Abo ist KEIN Fehler: die zweite
   * Löschung desselben Tenants soll durchgehen.
   */
  async cancelSubscription(subscriptionId: string, reason?: string): Promise<CancellationResult> {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId, {
        ...(reason ? { cancellation_details: { comment: reason.slice(0, 500) } } : {}),
      });
      return { canceled: true, alreadyGone: false };
    } catch (err) {
      if (
        err instanceof Stripe.errors.StripeInvalidRequestError &&
        (err.code === "resource_missing" ||
          // Stripe lehnt die Kündigung eines bereits beendeten Abos ab.
          err.message.includes("canceled"))
      ) {
        return { canceled: true, alreadyGone: true };
      }
      throw err;
    }
  }

  /**
   * Monatsumsatz aus den laufenden Abos.
   *
   * Zwei Filter, und beide sind nötig.
   *
   * Bei Stripe wird nur `active` abgefragt. `trialing` zählte hier zunächst
   * mit, mit der Begründung, eine Testphase gehe planmässig in ein zahlendes
   * Abo über. Das war falsch: ein Umsatz, der noch nicht bezahlt wird, ist
   * kein Umsatz, und das Panel wies damit Geld aus, das niemand überwiesen
   * hat. Wer die Testphasen sehen will, liest die Zahl der Tenants im Status
   * TRIAL daneben. `past_due` bleibt ebenfalls draussen – ein Abo, das nicht
   * mehr abrechnet, gehört nicht in den laufenden Umsatz.
   *
   * Und gezählt wird nur, was in `eligible` steht. Stripe kennt weder unsere
   * Status noch unsere Löschungen: eine im Panel gelöschte Organisation hat
   * dort weiterhin ein aktives Abo (die Löschung kündigt es nicht), und ohne
   * diesen zweiten Filter erschiene sie weiter im Umsatz.
   *
   * Jährliche Preise werden auf den Monat umgelegt (das ist die Bedeutung von
   * "monatlich wiederkehrend"), Wochen- und Tagespreise hochgerechnet.
   */
  async getRecurringRevenue(eligible: ReadonlySet<string>): Promise<RecurringRevenue> {
    // Kein zählbares Abo: gar nicht erst bei Stripe nachfragen.
    if (eligible.size === 0) {
      return { amountCents: 0, currency: "eur", subscriptions: 0, truncated: false };
    }

    let amountCents = 0;
    let subscriptions = 0;
    let currency = "eur";
    let truncated = false;

    // Obergrenze: ein Dashboard darf nicht minutenlang durch Stripe blättern.
    // Bei mehr Abos ist der Wert eine Untergrenze und wird als solche
    // ausgewiesen.
    const MAX_PAGES = 10;
    let page = 0;
    let startingAfter: string | undefined;

    do {
      const batch: Stripe.ApiList<Stripe.Subscription> = await this.stripe.subscriptions.list({
        status: "active",
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const subscription of batch.data) {
        if (!eligible.has(subscription.id)) continue;

        for (const item of subscription.items.data) {
          const price = item.price;
          const unit = price.unit_amount;
          // Gestaffelte Preise (tiers) haben kein unit_amount. Sie zu
          // überspringen ist ehrlicher als sie mit 0 zu bewerten.
          if (unit === null || !price.recurring) continue;

          amountCents += monthlyAmount(unit * (item.quantity ?? 1), price.recurring);
          currency = price.currency;
        }
        subscriptions += 1;
      }

      startingAfter = batch.data.at(-1)?.id;
      page += 1;
      if (batch.has_more && page >= MAX_PAGES) {
        truncated = true;
        break;
      }
      if (!batch.has_more) break;
    } while (startingAfter);

    return { amountCents: Math.round(amountCents), currency, subscriptions, truncated };
  }
}

/** Legt einen Betrag auf einen Monat um, je nach Abrechnungsintervall. */
export function monthlyAmount(
  amount: number,
  recurring: { interval: string; interval_count?: number | null },
): number {
  const count = recurring.interval_count ?? 1;
  const perPeriod = amount / count;
  switch (recurring.interval) {
    case "month":
      return perPeriod;
    case "year":
      return perPeriod / 12;
    case "week":
      // 52 Wochen / 12 Monate.
      return (perPeriod * 52) / 12;
    case "day":
      return (perPeriod * 365) / 12;
    default:
      return 0;
  }
}
