import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { UserRole } from "@len-len/api-client";
import { render, t } from "./helpers/render";

/**
 * Was die Navigationsleiste je Rolle anbietet.
 *
 * Der Super-Admin bekommt AUSSCHLIESSLICH die Plattform-Verwaltung. Er betreibt
 * die Plattform; in den Daten eines Kunden hat er nichts verloren, auch nicht
 * versehentlich über einen Menüpunkt.
 *
 * Wichtig zum Verständnis dieser Datei: das ist eine Entscheidung der
 * OBERFLÄCHE. Die Backend-Wächter führen SUPER_ADMIN bei Patienten,
 * Fachkräften und Planung weiterhin auf – über die URL käme er hinein, und
 * zwar in seine eigene Organisation. Wer daraus eine echte Sperre machen will,
 * ändert die Wächter, nicht diese Liste.
 */

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => useAuth() }));

vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return { Link: NextLink, usePathname: () => "/dashboard" };
});

vi.mock("@/components/locale-switcher", () => ({ LocaleSwitcher: () => null }));

import { AppShell } from "../src/components/app-shell";

function renderAs(role: UserRole) {
  // Mit E-Mail: die Kopfzeile leitet daraus Name und Initialen ab. Ein Mock
  // ohne sie bildete kein Konto ab, das es geben kann.
  useAuth.mockReturnValue({
    user: { role, email: "sabine.krueger@pflegedienst-nord.de" },
    logout: vi.fn(),
  });
  render(
    <AppShell>
      <p>Inhalt</p>
    </AppShell>,
  );
}

/**
 * Sichtbare Beschriftungen der Leiste.
 *
 * Gezielt INNERHALB der Navigation gesucht und nicht im ganzen Dokument: seit
 * der Überarbeitung ist auch die Wortmarke ein Link (sie führt zur Übersicht),
 * und der Seiteninhalt bringt eigene mit. Beide gehören nicht zur Frage, welche
 * Module eine Rolle angeboten bekommt.
 */
function navLabels(): string[] {
  return within(screen.getByRole("navigation"))
    .getAllByRole("link")
    .map((el) => {
      // Ohne Zähler und ohne den Satz für die Sprachausgabe: gefragt ist der
      // Name des Moduls, nicht sein Zustand.
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("[data-nav-badge], .sr-only").forEach((node) => node.remove());
      return clone.textContent?.trim() ?? "";
    })
    .filter(Boolean);
}

describe("Navigationsleiste je Rolle", () => {
  it("zeigt dem Super-Admin nur die Plattform-Verwaltung", () => {
    renderAs("SUPER_ADMIN");

    expect(navLabels()).toEqual([t("nav.admin")]);
  });

  it("blendet dem Super-Admin die Tenant-Module aus", () => {
    renderAs("SUPER_ADMIN");

    for (const key of ["dashboard", "patients", "caregivers", "visits", "absences"]) {
      expect(screen.queryByText(t(`nav.${key}`)), key).not.toBeInTheDocument();
    }
  });

  it("das Menü des Super-Admins enthält nur die Plattform", () => {
    // Seit der Überarbeitung gibt es den Menüknopf auch für ihn: unterhalb von
    // lg wandern die erstrangigen Punkte hinein, und die Plattform IST sein
    // erstrangiger Punkt. Er darf dort nichts anderes finden.
    renderAs("SUPER_ADMIN");

    fireEvent.click(screen.getByRole("button", { name: new RegExp(t("nav.more")) }));

    const entries = screen.getAllByRole("menuitem").map((el) => el.textContent?.trim());
    expect(entries).toEqual([t("nav.admin")]);
  });

  it("lässt die übrigen Rollen unverändert", () => {
    renderAs("STRUKTUR_ADMIN");

    const labels = navLabels();
    expect(labels).toContain(t("nav.dashboard"));
    expect(labels).toContain(t("nav.patients"));
    expect(labels).toContain(t("nav.visits"));
    // Und die Plattform-Verwaltung bleibt ihm verschlossen.
    expect(labels).not.toContain(t("nav.admin"));
  });

  it("zeigt dem Koordinator die Planung, nicht die Plattform", () => {
    renderAs("KOORDINATOR");

    const labels = navLabels();
    expect(labels).toContain(t("nav.visits"));
    expect(labels).not.toContain(t("nav.admin"));
  });

  it("zeigt der Personalverwaltung keine Patientendaten", () => {
    // Unverändertes Verhalten, hier mitgeprüft: die Umstellung auf
    // navigationFor darf die übrigen Rollen nicht angefasst haben.
    renderAs("HR");

    const labels = navLabels();
    expect(labels).toContain(t("nav.caregivers"));
    expect(labels).not.toContain(t("nav.patients"));
    expect(labels).not.toContain(t("nav.admin"));
  });
});
