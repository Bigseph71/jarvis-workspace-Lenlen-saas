import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
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
  useAuth.mockReturnValue({ user: { role }, logout: vi.fn() });
  render(
    <AppShell>
      <p>Inhalt</p>
    </AppShell>,
  );
}

/** Sichtbare Beschriftungen der Leiste (ohne den Inhalt der Seite). */
function navLabels(): string[] {
  return screen
    .getAllByRole("link")
    .map((el) => el.textContent?.trim() ?? "")
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
    // Auch kein Aufklappmenü: es wäre leer.
    expect(screen.queryByText(t("nav.more"))).not.toBeInTheDocument();
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
