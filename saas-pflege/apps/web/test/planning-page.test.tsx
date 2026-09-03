import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { render, t } from "./helpers/render";

/**
 * Planung – Arbeitsplatz der Koordination.
 *
 * Die Prüfungen zielen auf die eine Regel, die dieser Bildschirm durchsetzt und
 * die kein Design-Detail ist: eine QUALIFIKATIONS-Arbitrage sperrt die
 * Veröffentlichung, eine Zeitfenster-Arbitrage nicht.
 *
 * Der Unterschied ist rechtlich. Regel métier 4 verlangt für eine Vertretung
 * dieselbe Qualifikation; ein Plan, der eine Fachkraft zu einer Leistung
 * schickt, für die sie nicht qualifiziert ist, ist nicht "unpraktisch",
 * sondern unzulässig. Ein verpasstes Zeitfenster ist ärgerlich und erlaubt.
 */

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => useAuth() }));

vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return { Link: NextLink, usePathname: () => "/planung" };
});

import PlanningPage from "../src/app/[locale]/(protected)/planung/page";

function renderPage() {
  useAuth.mockReturnValue({
    user: { role: "KOORDINATOR", email: "sabine.krueger@pflegedienst-nord.de" },
    logout: vi.fn(),
  });
  render(<PlanningPage />);
}

const publishButton = () => screen.getByRole("button", { name: t("planning.publish.action") });

describe("Planung", () => {
  it("sperrt die Veröffentlichung, solange die Qualifikation offen ist", () => {
    renderPage();

    expect(publishButton()).toBeDisabled();
  });

  it("nennt den Grund der Sperre sichtbar", () => {
    // Ein ausgegrauter Knopf ohne Erklärung ist eine Sackgasse: er sagt "nein",
    // nicht "noch nicht, und deswegen".
    renderPage();

    expect(screen.getByText(t("planning.publish.blocked"))).toBeInTheDocument();
    expect(publishButton()).toHaveAttribute("aria-describedby");
  });

  it("eine entschiedene ZEITFENSTER-Arbitrage hebt die Sperre NICHT auf", async () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: t("overview.arbitrations.timeWindow.primary") }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText(t("overview.arbitrations.timeWindow.statement")),
      ).not.toBeInTheDocument(),
    );
    // Die Qualifikation steht noch offen, also bleibt gesperrt.
    expect(publishButton()).toBeDisabled();
  });

  it("gibt die Veröffentlichung frei, sobald die Qualifikation entschieden ist", async () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: t("overview.arbitrations.qualification.primary") }),
    );

    await waitFor(() => expect(publishButton()).toBeEnabled());
    expect(screen.queryByText(t("planning.publish.blocked"))).not.toBeInTheDocument();
  });

  it("fasst vor der Veröffentlichung zusammen, was gleich passiert", async () => {
    // Der Vorgang erreicht Dutzende Telefone auf einmal und lässt sich nicht
    // zurücknehmen. Die Zahlen davor sind die letzte Gelegenheit, einen
    // Fehlgriff zu bemerken.
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: t("overview.arbitrations.qualification.primary") }),
    );
    await waitFor(() => expect(publishButton()).toBeEnabled());
    fireEvent.click(publishButton());

    const dialog = await screen.findByRole("dialog");
    for (const key of ["tours", "visits", "kilometers", "notified"]) {
      expect(within(dialog).getByText(t(`planning.publish.summary.${key}`))).toBeInTheDocument();
    }
  });

  it("schliesst die Bestätigung mit Escape", async () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: t("overview.arbitrations.qualification.primary") }),
    );
    await waitFor(() => expect(publishButton()).toBeEnabled());
    fireEvent.click(publishButton());
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("beschriftet die Karte für die Sprachausgabe", () => {
    // Der Hintergrund ist ein SVG ohne Text. Ohne Beschriftung wäre er für
    // eine Sprachausgabe ein leeres Bild in der Mitte des Bildschirms.
    renderPage();

    expect(screen.getByRole("img")).toHaveAccessibleName(/./);
  });

  it("zeigt die sechs angewandten Regeln", () => {
    // Ohne sie ist der Plan eine Blackbox.
    renderPage();

    for (const rule of [
      "continuity",
      "legalBreak",
      "maxTravel",
      "qualification",
      "timeWindows",
      "preferredSector",
    ]) {
      expect(screen.getByText(t(`planning.rules.items.${rule}`))).toBeInTheDocument();
    }
  });
});
