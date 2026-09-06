import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/**
 * Beschriftungen, die NUR im Menü „Mehr“ stehen.
 *
 * Zwei Eigenheiten der Komponente, ohne die diese Funktion falsch aussieht:
 *
 *   - Das Menü rendert erst nach dem Klick. Ein geschlossenes Menü ist nicht
 *     im Dokument, es ist also kein Suchen nach versteckten Knoten möglich.
 *   - Das offene Menü enthält AUCH die Punkte der Leiste, mit `lg:hidden`.
 *     Unterhalb von lg trägt die Zeile sie nicht mehr nebeneinander, dann
 *     erscheinen sie hier (siehe MoreMenu). jsdom wertet keine Medienabfragen
 *     aus, also stehen im Test beide Gruppen nebeneinander.
 *
 * Gefragt ist die zweite Gruppe: was auf einem breiten Bildschirm nur über das
 * Menü erreichbar ist. Deshalb der Filter auf `lg:hidden`.
 */
async function menuOnlyLabels(): Promise<string[]> {
  await userEvent.click(screen.getByRole("button", { name: new RegExp(t("nav.more")) }));
  return within(screen.getByRole("menu"))
    .getAllByRole("menuitem")
    .filter((el) => !el.classList.contains("lg:hidden"))
    .map((el) => el.textContent?.trim() ?? "")
    .filter(Boolean);
}

describe("Navigationsleiste je Rolle", () => {
  it("gibt dem Super-Admin die Plattform-Kopfzeile statt einer Tenant-Navigation", () => {
    // Seit der Überarbeitung bekommt diese Rolle ein eigenes Chrome: dunkle
    // Kopfzeile, Plattform-Marke, KEINE Modulleiste. Innerhalb des Bereichs
    // führt die Reiterleiste der Seite (Übersicht / Organisationen /
    // Audit-Log); eine Leiste mit einem einzigen Punkt wäre Zierde.
    renderAs("SUPER_ADMIN");

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByText(t("nav.admin"))).toBeInTheDocument();
  });

  it("blendet dem Super-Admin die Tenant-Module aus", () => {
    renderAs("SUPER_ADMIN");

    for (const key of ["dashboard", "patients", "caregivers", "visits", "absences"]) {
      expect(screen.queryByText(t(`nav.${key}`)), key).not.toBeInTheDocument();
    }
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

  /**
   * Reihenfolge der Leiste, wörtlich.
   *
   * Nicht nur „ist enthalten“: an dieser Leiste zählt die Reihenfolge, weil
   * die Koordination sie den ganzen Tag blind ansteuert. Ein Punkt, der die
   * Stelle wechselt, kostet jeden Klick einen Blick.
   *
   * nav.visitList ist „Besuche“ (die Wochenliste, /visits), nav.visits ist
   * „Planung“ (der Arbeitsplatz, /planung) – die Schlüssel sind historisch und
   * lesen sich verkehrt herum.
   */
  it("stellt die Leiste in der festgelegten Reihenfolge auf", () => {
    renderAs("STRUKTUR_ADMIN");

    expect(navLabels()).toEqual([
      t("nav.dashboard"),
      t("nav.patients"),
      t("nav.caregivers"),
      t("nav.visitList"),
      t("nav.visits"),
    ]);
  });

  it("hat die Besuchsliste aus dem Menü in die Leiste geholt", async () => {
    // Sie ist der meistbenutzte Bildschirm der Koordination: einzelne Termine
    // anlegen, absagen, umbesetzen. Hinter einem Aufklappmenü kostete das
    // jedes Mal zwei Klicks.
    renderAs("KOORDINATOR");

    expect(navLabels()).toContain(t("nav.visitList"));
    expect(await menuOnlyLabels()).not.toContain(t("nav.visitList"));
  });

  it("schiebt die Abwesenheiten ins Menü „Mehr“", async () => {
    // Umgekehrter Weg: sie werden nicht im Tagesbetrieb angefasst, sondern
    // wenn ein Urlaubsantrag eintrifft. Erreichbar bleiben sie vollständig.
    renderAs("KOORDINATOR");

    expect(navLabels()).not.toContain(t("nav.absences"));
    expect(await menuOnlyLabels()).toContain(t("nav.absences"));
  });

  it("lässt der Personalverwaltung die Abwesenheiten im Menü", async () => {
    // HR pflegt sie. Der Umzug ins Menü darf sie ihr nicht wegnehmen –
    // sichtbar ist für diese Rolle in der Leiste ohnehin fast nichts.
    renderAs("HR");

    expect(await menuOnlyLabels()).toContain(t("nav.absences"));
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
