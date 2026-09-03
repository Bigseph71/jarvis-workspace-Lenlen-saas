import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render, t } from "./helpers/render";

/**
 * Übersicht – der neue Startbildschirm.
 *
 * Er ersetzt einen Bildschirm, der nur die Rolle und die Organisations-UUID
 * zeigte. Geprüft wird deshalb weniger das Aussehen als die Zusagen, die der
 * Handoff an ihn knüpft:
 *
 *   - die Planungsdauer steht VORNE (sie ist das Produktversprechen),
 *   - die Arbitragen sind keine Meldungsliste, sondern tragen je zwei
 *     einander ausschliessende Entscheidungen,
 *   - eine getroffene Entscheidung nimmt die Karte weg,
 *   - und der Beispielcharakter der Zahlen ist sichtbar gekennzeichnet.
 */

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => useAuth() }));

vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return { Link: NextLink, usePathname: () => "/dashboard" };
});

import OverviewPage from "../src/app/[locale]/(protected)/dashboard/page";

function renderPage(email = "sabine.krueger@pflegedienst-nord.de") {
  useAuth.mockReturnValue({ user: { role: "STRUKTUR_ADMIN", email }, logout: vi.fn() });
  render(<OverviewPage />);
}

describe("Übersicht", () => {
  it("begrüsst mit dem Vornamen aus der Kontoadresse", () => {
    // Das Konto trägt keinen Namen; der Entwurf zeigt an dieser Stelle einen.
    // Statt ihn zu erfinden, wird die Adresse gelesen.
    renderPage();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sabine");
  });

  it("kommt ohne verwertbare Adresse trotzdem zu einer Begrüssung", () => {
    // Ein Postfach wie info@… ergibt keinen Vornamen. Der Bildschirm darf
    // deswegen nicht mit einer leeren Zeile beginnen.
    renderPage("info@pflegedienst-nord.de");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("overview.subline"));
  });

  it("weist die Zahlen als Beispielwerte aus", () => {
    // Die Namen und Kilometer sind glaubwürdig und damit von echten Daten
    // nicht zu unterscheiden. Ohne diesen Hinweis könnte jemand danach
    // disponieren.
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(t("overview.demo.body"));
  });

  it("stellt die Planungsdauer an die erste Stelle", () => {
    // Sie IST das Produktversprechen (Stunden auf Minuten). Der Handoff hält
    // diese Position ausdrücklich fest.
    renderPage();

    const labels = screen
      .getAllByText(/./, { selector: "div.text-label.font-medium" })
      .map((el) => el.textContent);

    expect(labels[0]).toBe(t("overview.kpi.planningTime.label"));
  });

  it("zeigt zu jedem Arbitrage BEIDE Entscheidungen", () => {
    // Der Kern des Bausteins: der Optimierer legt den Konflikt offen und nennt
    // die Kosten in beide Richtungen. Eine Liste mit nur einer Handlung wäre
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

  it("beschriftet jede der sechs Touren mit ihrem Zustand", () => {
    // Vier unterwegs, eine überlastet, eine wartet. Die Überlastete ist der
    // Grund, warum die Karte überhaupt Zustände führt: sie ist derselbe Fall,
    // der unten als Arbitrage wiederkehrt.
    renderPage();

    expect(screen.getAllByText(t("overview.tours.state.enRoute"))).toHaveLength(4);
    expect(screen.getAllByText(t("overview.tours.state.overloaded"))).toHaveLength(1);
    expect(screen.getAllByText(t("overview.tours.state.notStarted"))).toHaveLength(1);
  });

  it("gibt jedem Fortschrittsbalken einen lesbaren Namen", () => {
    // Ein Balken ohne Beschriftung ist für eine Sprachausgabe eine leere
    // Angabe. Sechs Touren plus vier Qualifikationen.
    renderPage();

    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(10);
    for (const bar of bars) {
      expect(bar.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
