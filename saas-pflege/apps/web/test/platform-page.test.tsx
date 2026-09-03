import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { AdminDashboard, AdminOrganizationRow } from "@len-len/api-client";
import { render, t } from "./helpers/render";

/**
 * Plattform-Verwaltung, Übersicht.
 *
 * Anders als Übersicht und Planung steht dieser Bildschirm auf ECHTEN Daten.
 * Die Prüfungen zielen deshalb auf die Stellen, an denen echte Daten schiefgehen:
 * ein nicht erreichbarer Zahlungsanbieter, eine leere Plattform, ein
 * Leerzustand, der eine nützliche Auskunft geben soll statt einer Verneinung.
 */

const { adminDashboard, adminListOrganizations } = vi.hoisted(() => ({
  adminDashboard: vi.fn(),
  adminListOrganizations: vi.fn(),
}));

vi.mock("@len-len/api-client", () => ({
  adminDashboard: (...args: unknown[]) => adminDashboard(...args),
  adminListOrganizations: (...args: unknown[]) => adminListOrganizations(...args),
}));

vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return { Link: NextLink, usePathname: () => "/admin" };
});

import PlatformOverviewPage from "../src/app/[locale]/(protected)/admin/page";

function dashboard(overrides: Partial<AdminDashboard> = {}): AdminDashboard {
  return {
    organizations: {
      total: 4,
      byStatus: { ACTIVE: 3, TRIAL: 1, PAST_DUE: 0, SUSPENDED: 0, CANCELED: 0 },
    },
    revenue: {
      amountCents: 200000,
      currency: "eur",
      subscriptions: 1,
      truncated: false,
      available: true,
    },
    growth: { last7Days: 0, last30Days: 2 },
    alerts: { trialsEndingSoon: [], paymentFailures: [] },
    ...overrides,
  };
}

function org(overrides: Partial<AdminOrganizationRow> = {}): AdminOrganizationRow {
  return {
    id: "o-1",
    name: "Pflegedienst Nord",
    country: "DE",
    subscriptionPlan: "PRO",
    subscriptionStatus: "ACTIVE",
    trialEndsAt: null,
    pastDueSince: null,
    deletedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    _count: { users: 12, patients: 180, caregivers: 42 },
    ...overrides,
  };
}

function page(rows: AdminOrganizationRow[] = [org()], trials: AdminOrganizationRow[] = []) {
  adminListOrganizations.mockImplementation((params: { status?: string } = {}) =>
    Promise.resolve({
      data: params.status === "TRIAL" ? trials : rows,
      total: rows.length,
      page: 1,
      pageSize: 5,
      totalPages: 1,
    }),
  );
  render(<PlatformOverviewPage />);
}

describe("Plattform-Übersicht", () => {
  beforeEach(() => {
    adminDashboard.mockReset().mockResolvedValue(dashboard());
    adminListOrganizations.mockReset();
  });

  it("zeigt die Kennzahlen aus dem Backend", async () => {
    page();

    // Über die Einordnungszeile geprüft und nicht über die Beschriftung:
    // "Organisationen" steht auch als Titel der Tabelle darunter.
    expect(await screen.findByText("3 aktiv, 1 in der Testphase")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("meldet einen nicht erreichbaren Zahlungsanbieter, statt 0 € zu behaupten", async () => {
    // Der wichtigste Fall der ganzen Seite. "0 €" hiesse "niemand zahlt" und
    // löste eine Suche aus, die ins Leere führt; die Wahrheit ist "wir wissen
    // es gerade nicht".
    adminDashboard.mockResolvedValue(
      dashboard({
        revenue: {
          amountCents: 0,
          currency: "eur",
          subscriptions: 0,
          truncated: false,
          available: false,
        },
      }),
    );
    page();

    expect(await screen.findAllByText(t("admin.revenue.unavailable"))).not.toHaveLength(0);
    expect(screen.queryByText("0 €")).not.toBeInTheDocument();
  });

  it("nennt im Leerzustand die nächste fällige Testphase", async () => {
    // Der Entwurfsgedanke: ein Leerzustand gibt die nächste nützliche Angabe,
    // statt den Titel im Negativ zu wiederholen.
    page(
      [org()],
      [org({ id: "o-2", name: "Ambulante Hilfe Süd", trialEndsAt: "2026-09-12T00:00:00.000Z" })],
    );

    const card = await screen.findByTestId("alert-trials");
    expect(within(card).getByText(/Ambulante Hilfe Süd/)).toBeInTheDocument();
  });

  it("wählt die FRÜHESTE Testphase, nicht die erste der Liste", async () => {
    page(
      [org()],
      [
        org({ id: "o-2", name: "Spät GmbH", trialEndsAt: "2026-10-01T00:00:00.000Z" }),
        org({ id: "o-3", name: "Früh GmbH", trialEndsAt: "2026-09-05T00:00:00.000Z" }),
      ],
    );

    const card = await screen.findByTestId("alert-trials");
    expect(within(card).getByText(/Früh GmbH/)).toBeInTheDocument();
    expect(within(card).queryByText(/Spät GmbH/)).not.toBeInTheDocument();
  });

  it("zeigt die Plätze einer Organisation, also ihre Fachkräfte", async () => {
    // Die Abrechnung erfolgt je aktiver Fachkraft; die Spalte muss deshalb
    // diese Zahl tragen und nicht die der Nutzerkonten oder der Patienten.
    page([org({ _count: { users: 12, patients: 180, caregivers: 42 } })]);

    const table = await screen.findByRole("table");
    expect(within(table).getByText("42")).toBeInTheDocument();
    expect(within(table).queryByText("180")).not.toBeInTheDocument();
  });

  it("übersteht eine Plattform ohne Organisationen", async () => {
    // Division durch null in der Aufschlüsselung: der Bildschirm erscheint
    // auch auf einer frisch aufgesetzten Plattform.
    adminDashboard.mockResolvedValue(
      dashboard({
        organizations: {
          total: 0,
          byStatus: { ACTIVE: 0, TRIAL: 0, PAST_DUE: 0, SUSPENDED: 0, CANCELED: 0 },
        },
      }),
    );
    page([]);

    expect(await screen.findByText(t("admin.table.empty"))).toBeInTheDocument();
    for (const bar of screen.getAllByRole("progressbar")) {
      expect(bar).toHaveAttribute("aria-valuenow", "0");
    }
  });

  it("kennzeichnet die Umsatzkurve als Beispielwert", async () => {
    // Der Betrag ist echt, der Verlauf nicht. Der Hinweis steht deshalb an der
    // Kurve und nicht über der Seite.
    page();

    expect(await screen.findByText(t("admin.revenue.historyDemo"))).toBeInTheDocument();
  });

  it("meldet einen Ladefehler, statt eine leere Seite zu zeigen", async () => {
    adminDashboard.mockRejectedValue(new Error("Netz"));
    page();

    await waitFor(() =>
      expect(screen.getByText(t("admin.dashboard.error"))).toBeInTheDocument(),
    );
  });
});
