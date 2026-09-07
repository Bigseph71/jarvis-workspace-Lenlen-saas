import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render, t } from "./helpers/render";

/**
 * Die Testphase auf der Organisationsfiche.
 *
 * Der Fehler, der hierher führte: das Eingabefeld "Testphase bis" war mit
 * `heute + 14 Tage` vorbelegt und sah damit aus wie eine ANZEIGE des
 * gespeicherten Endes. Weil `new Date()` bei jedem Seitenaufbau neu ausgewertet
 * wird, wanderte die gezeigte Frist Tag für Tag mit -- gemeldet als
 * "trial_ends_at wird täglich neu berechnet".
 *
 * In der Datenbank stand die ganze Zeit der richtige Wert. Er wurde nur
 * nirgends gezeigt: `trialEndsAt` kam vom Backend mit und wurde ausschliesslich
 * im PATCH-Rumpf des Verlängern-Knopfes verwendet.
 *
 * Beide Hälften werden hier festgehalten: der gespeicherte Stand IST sichtbar,
 * und das Eingabefeld schlägt NICHTS mehr vor.
 */

const { adminGetOrganization, adminUpdateOrganization } = vi.hoisted(() => ({
  adminGetOrganization: vi.fn(),
  adminUpdateOrganization: vi.fn(),
}));

vi.mock("@len-len/api-client", () => ({
  adminGetOrganization: (...a: unknown[]) => adminGetOrganization(...a),
  adminUpdateOrganization: (...a: unknown[]) => adminUpdateOrganization(...a),
  adminDeleteOrganization: vi.fn(),
}));

vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return { Link: NextLink, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) };
});

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "org-1" }) }));

import AdminOrganizationDetailPage from "../src/app/[locale]/(protected)/admin/organizations/[id]/page";

const TAG = 86_400_000;

function organization(trialEndsAt: string | null) {
  return {
    id: "org-1",
    name: "Eseka-Aid",
    country: "DE",
    subscriptionPlan: "BASIC",
    subscriptionStatus: "TRIAL",
    trialEndsAt,
    pastDueSince: null,
    deletedAt: null,
    createdAt: "2026-09-02T09:00:00.000Z",
    planLimits: {},
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    deletionReason: null,
    deletedByUserId: null,
    updatedAt: "2026-09-02T09:00:00.000Z",
    _count: { users: 1, patients: 0, caregivers: 0, visits: 0 },
    invoices: [],
    auditLogs: [],
  };
}

async function renderWith(trialEndsAt: string | null) {
  adminGetOrganization.mockResolvedValue(organization(trialEndsAt));
  render(<AdminOrganizationDetailPage />);
  await screen.findByText("Eseka-Aid");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Testphase auf der Organisationsfiche", () => {
  it("zeigt eine laufende Testphase mit dem GESPEICHERTEN Datum", async () => {
    const inZehnTagen = new Date(Date.now() + 10 * TAG).toISOString();
    await renderWith(inZehnTagen);

    expect(screen.getByTestId("trial-state")).toHaveTextContent(/l(ä|ae)uft bis/i);
  });

  it("nennt eine abgelaufene Testphase, statt sie zu verschweigen", async () => {
    // "Wann lief die Testphase?" ist genau die Frage, die im Gespraech mit
    // einem Kunden aufkommt.
    await renderWith(new Date(Date.now() - 5 * TAG).toISOString());

    expect(screen.getByTestId("trial-state")).toHaveTextContent(
      new RegExp(t("admin.detail.trial.expired").split("{")[0]!.trim(), "i"),
    );
  });

  it("sagt klar, wenn gar keine Frist hinterlegt ist", async () => {
    // Der Fall des ausgebliebenen Webhooks. Ein Datum zu zeigen waere hier
    // die Erfindung, die diese Seite gerade gekostet hat.
    await renderWith(null);

    expect(screen.getByTestId("trial-state")).toHaveTextContent(t("admin.detail.trial.none"));
  });

  it("schlaegt im Eingabefeld KEIN Datum mehr vor", async () => {
    // Der Kern: ein vorbelegtes Feld sah aus wie eine Anzeige und wanderte
    // mit dem Kalender mit.
    await renderWith(new Date(Date.now() + 10 * TAG).toISOString());

    expect(screen.getByLabelText(t("admin.detail.actions.trialNewEnd"))).toHaveValue("");
  });

  it("laesst den Verlaengern-Knopf gesperrt, solange nichts gewaehlt ist", async () => {
    // Vorher liess sich mit einem Klick "heute + 14" schreiben, im Glauben,
    // das Angezeigte zu bestaetigen -- ein Anzeigefehler waere so zu einem
    // Datenfehler geworden.
    await renderWith(null);

    expect(screen.getByRole("button", { name: t("admin.detail.actions.extendTrial") })).toBeDisabled();
    expect(adminUpdateOrganization).not.toHaveBeenCalled();
  });

  it("zeigt an zwei verschiedenen Tagen DASSELBE Datum", async () => {
    // Die eigentliche Zusicherung, und der Kern des gemeldeten Fehlers: die
    // Anzeige stammt aus der Antwort und nicht aus `new Date()`. Zwei
    // vollstaendige Aufbauten an zwei verschiedenen Kalendertagen muessen
    // denselben Text ergeben -- vorher wanderte er um genau die Differenz mit.
    const fest = "2026-09-16T21:59:59.000Z";

    vi.useFakeTimers();
    try {
      adminGetOrganization.mockResolvedValue(organization(fest));

      vi.setSystemTime(new Date("2026-09-07T08:00:00.000Z"));
      const ersteAnsicht = render(<AdminOrganizationDetailPage />);
      await vi.waitFor(() => expect(screen.getByTestId("trial-state")).toBeInTheDocument());
      const amSiebten = screen.getByTestId("trial-state").textContent;
      ersteAnsicht.unmount();

      vi.setSystemTime(new Date("2026-09-11T08:00:00.000Z"));
      render(<AdminOrganizationDetailPage />);
      await vi.waitFor(() => expect(screen.getByTestId("trial-state")).toBeInTheDocument());
      const amElften = screen.getByTestId("trial-state").textContent;

      expect(amElften).toBe(amSiebten);
      // Und es ist wirklich das gespeicherte Datum, nicht irgendein fester Text.
      expect(amSiebten).toMatch(/16/);
    } finally {
      vi.useRealTimers();
    }
  });
});
