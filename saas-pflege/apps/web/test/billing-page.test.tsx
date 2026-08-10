import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { Subscription } from "@len-len/api-client";
import { render, t } from "./helpers/render";

/**
 * Planauswahl auf der Abrechnungsseite.
 *
 * Der Fehler, den dieser Test festhält, hat es bis in die Produktion
 * geschafft: eine frisch registrierte Organisation trägt `subscriptionPlan =
 * BASIC` als SPALTENVORGABE, nicht als Wahl des Kunden. Die Seite hielt BASIC
 * deshalb für den "aktuellen Plan" und sperrte seinen Knopf – ausgerechnet der
 * Einstiegsplan liess sich damit nicht abschliessen, und niemand konnte
 * zahlender Kunde werden.
 */

const getSubscription = vi.fn();
const listInvoices = vi.fn();
const createCheckout = vi.fn();

vi.mock("@len-len/api-client", () => ({
  getSubscription: () => getSubscription(),
  listInvoices: () => listInvoices(),
  createCheckout: (...args: unknown[]) => createCheckout(...args),
  createPortal: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

// Die Seite liest ?checkout= aus der URL.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const LIMITS = { patients: 100, caregivers: 10, vehicles: 5, ki: false };
const CATALOG = {
  BASIC: LIMITS,
  PRO: { patients: 1000, caregivers: 100, vehicles: 30, ki: true },
  ENTERPRISE: { patients: 5000, caregivers: 500, vehicles: null, ki: true },
};

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    plan: "BASIC",
    status: "SUSPENDED",
    limits: LIMITS,
    catalog: CATALOG,
    usage: { patients: 0, caregivers: 0, vehicles: 0 },
    grace: null,
    trial: null,
    trialDays: 14,
    portalAvailable: false,
    ...overrides,
  } as Subscription;
}

/** Knopf innerhalb der Karte eines Plans. */
function planButton(planLabel: string): HTMLButtonElement {
  const heading = screen.getByRole("heading", { name: planLabel });
  const card = heading.closest("div");
  const button = card?.querySelector("button");
  if (!button) throw new Error(`Kein Knopf in der Karte "${planLabel}"`);
  return button as HTMLButtonElement;
}

async function renderBilling(sub: Subscription): Promise<void> {
  getSubscription.mockResolvedValue(sub);
  listInvoices.mockResolvedValue({ data: [], total: 0 });
  const { default: BillingPage } = await import(
    "../src/app/[locale]/(protected)/billing/page"
  );
  render(<BillingPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: t("billing.title") })).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Abrechnung – Planauswahl ohne Abo", () => {
  it("lässt ALLE Pläne wählen, auch BASIC", async () => {
    // Der eigentliche Regressionstest: BASIC steht in der Spalte, ohne dass je
    // ein Abo bestand. Sein Knopf muss trotzdem bedienbar sein.
    await renderBilling(subscription());

    for (const label of [t("billing.plans.BASIC"), t("billing.plans.PRO"), t("billing.plans.ENTERPRISE")]) {
      expect(planButton(label)).toBeEnabled();
    }
  });

  it("beschriftet sie mit „Plan wählen“, nicht mit Auf- oder Abstieg", async () => {
    await renderBilling(subscription());
    expect(planButton(t("billing.plans.BASIC"))).toHaveTextContent(t("billing.actions.choose"));
    expect(planButton(t("billing.plans.PRO"))).toHaveTextContent(t("billing.actions.choose"));
  });

  it("weist auf die Testphase hin statt auf eine Sperre", async () => {
    // SUSPENDED ohne Stripe-Kunde ist eine frische Registrierung. Sie rot als
    // "Zugang gesperrt" zu melden, würde einen Interessenten verschrecken.
    await renderBilling(subscription());
    expect(screen.getByText(t("billing.onboarding.title"))).toBeInTheDocument();
    expect(screen.queryByText(t("billing.suspended.title"))).not.toBeInTheDocument();
  });

  it("meldet dagegen eine echte Sperre, wenn ein Stripe-Kunde existiert", async () => {
    // Derselbe Status, andere Lage: hier lief ein Abo und die Zahlung blieb aus.
    await renderBilling(subscription({ portalAvailable: true }));
    expect(screen.getByText(t("billing.suspended.title"))).toBeInTheDocument();
    expect(screen.queryByText(t("billing.onboarding.title"))).not.toBeInTheDocument();
  });
});

describe("Abrechnung – mit laufendem Abo", () => {
  it("sperrt den aktuellen Plan und lässt die übrigen wechseln", async () => {
    await renderBilling(subscription({ status: "ACTIVE", plan: "BASIC", portalAvailable: true }));

    expect(planButton(t("billing.plans.BASIC"))).toBeDisabled();
    expect(planButton(t("billing.plans.BASIC"))).toHaveTextContent(t("billing.actions.current"));
    expect(planButton(t("billing.plans.PRO"))).toBeEnabled();
  });

  it("behandelt die Testphase wie ein laufendes Abo", async () => {
    // Während der Testphase liegt bereits ein Zahlungsmittel vor: der gebuchte
    // Plan ist eine echte Wahl und darf nicht erneut abgeschlossen werden.
    await renderBilling(
      subscription({
        status: "TRIAL",
        plan: "PRO",
        portalAvailable: true,
        trial: { endsAt: "2026-08-24T12:00:00.000Z", daysRemaining: 14 },
      }),
    );

    expect(planButton(t("billing.plans.PRO"))).toBeDisabled();
    expect(planButton(t("billing.plans.BASIC"))).toBeEnabled();
    expect(screen.getByText(t("billing.trial.title"))).toBeInTheDocument();
  });

  it("lässt einen gekündigten Kunden wieder BASIC wählen", async () => {
    // Sonst bliebe der Einstiegsplan für Rückkehrer gesperrt.
    await renderBilling(subscription({ status: "CANCELED", plan: "BASIC", portalAvailable: true }));
    expect(planButton(t("billing.plans.BASIC"))).toBeEnabled();
  });
});
