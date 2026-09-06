import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render, t } from "./helpers/render";

/**
 * Übersicht – der Startbildschirm, jetzt an echte Daten gebunden.
 *
 * Bis zu dieser Fassung stand hier eine Nachbildung des Entwurfs mit
 * erfundenen Zahlen. Geprüft wird deshalb vor allem, dass der Bildschirm
 * NICHTS mehr behauptet, was er nicht aus der Datenbank hat:
 *
 *   - die Kennzahlen stammen aus den Endpunkten, samt der Schwelle für
 *     Verspätungen (sie darf nicht ein zweites Mal in der Oberfläche stehen),
 *   - solange nichts geladen ist, steht ein Strich und keine 0,
 *   - eine Rolle ohne Leserecht bekommt eine leere Karte, keinen Fehler,
 *   - und was noch Beispiel ist, trägt eine sichtbare Marke.
 */

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
const api = vi.hoisted(() => ({
  visitDaySummary: vi.fn(),
  listRoutes: vi.fn(),
  listAbsences: vi.fn(),
  listCaregivers: vi.fn(),
}));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => useAuth() }));
vi.mock("@len-len/api-client", () => api);
vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return { Link: NextLink, usePathname: () => "/dashboard" };
});

import OverviewPage from "../src/app/[locale]/(protected)/dashboard/page";

const SUMMARY = {
  date: "2026-09-07T00:00:00.000Z",
  total: 42,
  planned: 30,
  inProgress: 4,
  completed: 8,
  missed: 0,
  canceled: 3,
  emergencies: 1,
  delayed: 5,
  delayThresholdMinutes: 15,
};

const ROUTES = {
  date: "2026-09-07",
  totals: { routes: 2, optimized: 1, totalKm: 41.8 },
  data: [
    {
      id: "r-1",
      date: "2026-09-07",
      caregiver: { id: "c-1", firstName: "Nadia", lastName: "Reinhardt" },
      vehicleId: null,
      optimized: true,
      vrptwScore: 88,
      totalKm: 24.5,
      visitCount: 9,
    },
    {
      id: "r-2",
      date: "2026-09-07",
      caregiver: null,
      vehicleId: null,
      optimized: false,
      vrptwScore: null,
      totalKm: 17.3,
      visitCount: 6,
    },
  ],
  page: 1,
  pageSize: 500,
  total: 2,
  totalPages: 1,
};

const CAREGIVERS = {
  data: [
    { id: "c-1", qualification: "PFLEGEFACHKRAFT", isActive: true },
    { id: "c-2", qualification: "PFLEGEFACHKRAFT", isActive: true },
    { id: "c-3", qualification: "PFLEGEHILFSKRAFT", isActive: true },
    // Ausgeschieden: zaehlt in keinem Anteil mit.
    { id: "c-4", qualification: "AUSZUBILDENDE", isActive: false },
  ],
};

const ABSENCES = {
  data: [
    {
      id: "a-1",
      type: "SICK",
      status: "APPROVED",
      startDate: "2026-09-05",
      endDate: "2026-09-09",
      caregiver: { id: "c-9", firstName: "Petra", lastName: "Weiss" },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.visitDaySummary.mockResolvedValue(SUMMARY);
  api.listRoutes.mockResolvedValue(ROUTES);
  api.listCaregivers.mockResolvedValue(CAREGIVERS);
  api.listAbsences.mockResolvedValue(ABSENCES);
});

function renderPage(
  { role = "STRUKTUR_ADMIN", email = "sabine.krueger@pflegedienst-nord.de" } = {},
): void {
  useAuth.mockReturnValue({ user: { role, email }, logout: vi.fn() });
  render(<OverviewPage />);
}

describe("Übersicht", () => {
  it("begrüsst mit dem Vornamen aus der Kontoadresse", async () => {
    // Das Konto trägt keinen Namen; der Entwurf zeigt an dieser Stelle einen.
    // Statt ihn zu erfinden, wird die Adresse gelesen.
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sabine"),
    );
  });

  it("beginnt nie mit einer leeren Zeile, was auch immer in der Adresse steht", async () => {
    // Der Bildschirm oeffnet mit dieser Ueberschrift. Bleibt sie leer, wirkt
    // die Seite kaputt, bevor eine einzige Zahl geladen ist. Geprueft wird
    // deshalb der Gruss selbst und nicht der Name -- ein Postfach ohne
    // brauchbaren Namensteil ergibt einfach die kurze Fassung.
    renderPage({ email: "@pflegedienst-nord.de" });

    await waitFor(() => {
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      expect(heading).toHaveTextContent(/Guten Tag/);
    });
  });

  it("zeigt die Kennzahlen aus den Endpunkten", async () => {
    renderPage();

    // 42 Besuche, 5 Verspätungen, 41,8 km – nichts davon steht in der Oberfläche.
    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("41,8")).toBeInTheDocument();
  });

  it("nimmt die Verspätungs-Schwelle aus der Antwort, nicht aus der Oberfläche", async () => {
    // Sonst stünde dieselbe Zahl an zwei Stellen, und eine Änderung im Backend
    // liesse die Oberfläche eine falsche Schwelle nennen.
    api.visitDaySummary.mockResolvedValue({ ...SUMMARY, delayThresholdMinutes: 30 });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(t("overview.kpi.delays.hint").replace("{minutes}", "30"))).toBeInTheDocument(),
    );
  });

  it("schreibt einen Strich statt einer Null, solange nichts geladen ist", async () => {
    // Eine 0 ist eine Aussage über den Tag; ein Strich ist das Eingeständnis,
    // nichts zu wissen. Auf einem Dispositionsbildschirm ist das der
    // Unterschied zwischen "nichts zu tun" und "unbekannt".
    api.visitDaySummary.mockReturnValue(new Promise(() => {}));
    api.listRoutes.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("listet die Touren des Tages mit ihren echten Werten", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Nadia Reinhardt")).toBeInTheDocument());
    // Die Tour ohne Fachkraft wird benannt und nicht verschwiegen: sie ist
    // genau die, um die sich jemand kümmern muss.
    expect(screen.getByText(t("overview.tours.unassigned"))).toBeInTheDocument();
    expect(screen.getByText(t("overview.tours.state.optimized"))).toBeInTheDocument();
    expect(screen.getByText(t("overview.tours.state.notOptimized"))).toBeInTheDocument();
  });

  it("erklärt eine leere Tourenliste, statt sie leer zu lassen", async () => {
    // Der wahrscheinlichste Fall im Betrieb: die Touren entstehen erst aus
    // einer Optimierung. Wer das nicht weiss, hält den Bildschirm für kaputt.
    api.listRoutes.mockResolvedValue({ ...ROUTES, data: [], totals: { routes: 0, optimized: 0, totalKm: 0 } });
    renderPage();

    await waitFor(() => expect(screen.getByText(t("overview.tours.empty"))).toBeInTheDocument());
  });

  it("rechnet die Qualifikationen nur über AKTIVE Fachkräfte", async () => {
    // Drei aktive: zwei Fachkräfte (67 %), eine Hilfskraft (33 %). Die
    // ausgeschiedene Auszubildende zählt nicht mit – die Karte beschreibt,
    // wer heute fahren kann.
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(t("overview.qualifications.title"))).toBeInTheDocument(),
    );
    expect(screen.getByText("2 · 67 %")).toBeInTheDocument();
    expect(screen.getByText("1 · 33 %")).toBeInTheDocument();
  });

  it("zeigt die laufenden Abwesenheiten mit ihrem Antragszustand", async () => {
    // Und NICHT mit einem Deckungsstatus: den gibt es im Datenmodell nicht,
    // und "abgedeckt" zu lesen, wo niemand eingeteilt ist, kostet einen Besuch.
    renderPage();

    await waitFor(() => expect(screen.getByText("Petra Weiss")).toBeInTheDocument());
    expect(screen.getByText(t("overview.absences.status.APPROVED"))).toBeInTheDocument();
  });
});

/**
 * Der Startbildschirm gehoert ALLEN angemeldeten Rollen, auch der
 * Personalverwaltung. Sie darf weder die Tagesbilanz der Besuche noch die
 * Touren lesen -- beide Endpunkte antworten ihr mit 403 (canPlan).
 *
 * Der Bildschirm muss das VORHER wissen und darf nicht ins offene Messer
 * laufen: ein vorhersehbarer Fehler ist kein Fehler, er ist ein Versaeumnis.
 */
describe("Übersicht je Rolle", () => {
  it("fragt für die Personalverwaltung nichts ab, was sie nicht lesen darf", async () => {
    renderPage({ role: "HR", email: "hr@pflegedienst-nord.de" });

    await waitFor(() => expect(api.listCaregivers).toHaveBeenCalled());
    expect(api.visitDaySummary).not.toHaveBeenCalled();
    expect(api.listRoutes).not.toHaveBeenCalled();
  });

  it("zeigt ihr die Karten, die sie lesen darf", async () => {
    // Abwesenheiten und Fachkraefte stehen ihrem Waechter offen
    // (hr.routes: canRead, caregiver.routes: canRead).
    renderPage({ role: "HR", email: "hr@pflegedienst-nord.de" });

    await waitFor(() => expect(screen.getByText("Petra Weiss")).toBeInTheDocument());
    expect(screen.getByText(t("overview.qualifications.title"))).toBeInTheDocument();
  });

  it("sagt bei den gesperrten Karten, dass nichts da ist – ohne Zahl", async () => {
    renderPage({ role: "HR", email: "hr@pflegedienst-nord.de" });

    await waitFor(() =>
      expect(screen.getByText(t("overview.tours.unavailable"))).toBeInTheDocument(),
    );
    // Und keine erfundene Null an der Stelle der Kennzahlen.
    expect(screen.queryByText("42")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("bleibt stehen, wenn eine einzelne Quelle ausfällt", async () => {
    // `allSettled` und nicht `all`: ein Startbildschirm, der wegen einer
    // Karte vollstaendig leer bleibt, ist schlechter als einer, dem eine
    // Karte fehlt.
    api.listRoutes.mockRejectedValue(new Error("kaputt"));
    renderPage();

    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
    expect(screen.getByText(t("overview.tours.unavailable"))).toBeInTheDocument();
  });
});

/**
 * Was noch erfunden ist, muss man SEHEN. Ein Kommentar im Quelltext schuetzt
 * niemanden, der auf den Bildschirm schaut und disponiert.
 */
describe("Übersicht – was noch Beispiel ist", () => {
  it("benennt im Hinweisstreifen nur noch die zwei verbliebenen Stellen", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(t("overview.demo.body")),
    );
  });

  it("markiert genau zwei Stellen im Inhalt: die Planungsdauer und die Arbitragen", async () => {
    // Drei Marken insgesamt, und die dritte ist der Hinweisstreifen selbst.
    // Gezaehlt werden deshalb die Marken AUSSERHALB des Streifens -- sonst
    // schluege dieser Test bei jeder Umformulierung des Streifens an, statt
    // bei einer falsch markierten Karte.
    renderPage();

    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());

    const banner = screen.getByRole("status");
    const marksInContent = screen
      .getAllByText(t("overview.demo.tag"))
      .filter((mark) => !banner.contains(mark));

    expect(marksInContent).toHaveLength(2);
  });

  it("markiert die angebundenen Kennzahlen NICHT", async () => {
    // Sonst waere die Marke wertlos: eine, die ueberall steht, sagt nichts.
    // Die Kennzahl "Besuche heute" traegt den Wert 42 aus dem Endpunkt --
    // ihre Karte darf keine Marke enthalten.
    renderPage();

    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());

    const kpiCard = screen.getByText("42").closest("div.rounded-kpi");
    expect(kpiCard).not.toBeNull();
    expect(kpiCard?.textContent).not.toContain(t("overview.demo.tag"));
  });

  it("zeigt zu jedem Arbitrage BEIDE Entscheidungen", async () => {
    // Der Kern des Bausteins: der Optimierer legt den Konflikt offen und nennt
    // die Kosten in beide Richtungen. Eine Liste mit nur einer Handlung waere
    // eine Benachrichtigung, kein Arbitrage.
    renderPage();

    for (const id of ["qualification", "timeWindow"]) {
      expect(
        screen.getByRole("button", { name: t(`overview.arbitrations.${id}.primary`) }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: t(`overview.arbitrations.${id}.secondary`) }),
      ).toBeInTheDocument();
    }
  });

  it("nimmt ein entschiedenes Arbitrage aus der Liste", async () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: t("overview.arbitrations.qualification.primary") }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText(t("overview.arbitrations.qualification.statement")),
      ).not.toBeInTheDocument(),
    );
    // Das zweite bleibt stehen: entschieden wurde genau eines.
    expect(screen.getByText(t("overview.arbitrations.timeWindow.statement"))).toBeInTheDocument();
  });

  it("gibt jedem Fortschrittsbalken einen lesbaren Namen", async () => {
    // Ein Balken ohne Beschriftung ist fuer eine Sprachausgabe eine leere
    // Angabe. Eine bewertete Tour plus vier Qualifikationsstufen.
    renderPage();

    await waitFor(() => expect(screen.getAllByRole("progressbar").length).toBeGreaterThan(0));
    for (const bar of screen.getAllByRole("progressbar")) {
      expect(bar.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
