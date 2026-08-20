import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { UserRole } from "@len-len/api-client";
import { render, t } from "./helpers/render";

/**
 * Accès au panel plateforme.
 *
 * L'écran n'est pas ce qui protège — le backend le fait (requireSuperAdmin) —
 * mais il décide de ce qu'on propose. Le cas qui compte est le Struktur-Admin :
 * il est tout-puissant dans son organisation, et il ne doit voir ici ni les
 * onglets ni les données des autres.
 */

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => useAuth() }));

vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return { Link: NextLink, usePathname: () => "/admin", useRouter: () => ({ replace: vi.fn() }) };
});

import AdminLayout from "../src/app/[locale]/(protected)/admin/layout";

function renderAs(role: UserRole | undefined, status = "authenticated") {
  useAuth.mockReturnValue({ user: role ? { role } : null, status });
  render(
    <AdminLayout>
      <p>Inhalt des Panels</p>
    </AdminLayout>,
  );
}

describe("Zugang zum Plattform-Panel", () => {
  it("zeigt dem Super-Admin die Navigation und den Inhalt", () => {
    renderAs("SUPER_ADMIN");

    expect(screen.getByText(t("admin.tabs.organizations"))).toBeInTheDocument();
    expect(screen.getByText("Inhalt des Panels")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-forbidden")).not.toBeInTheDocument();
  });

  it("weist den Struktur-Admin mit 403 ab", () => {
    // Der eigentliche Fall: in seiner Organisation darf er alles.
    renderAs("STRUKTUR_ADMIN");

    expect(screen.getByTestId("admin-forbidden")).toBeInTheDocument();
    expect(screen.getByText("403")).toBeInTheDocument();
    expect(screen.queryByText("Inhalt des Panels")).not.toBeInTheDocument();
  });

  it("weist jede weitere Rolle ab", () => {
    for (const role of ["KOORDINATOR", "HR", "FACHKRAFT"] as UserRole[]) {
      const { unmount } = { unmount: () => undefined };
      renderAs(role);
      expect(screen.getAllByTestId("admin-forbidden").length, role).toBeGreaterThan(0);
      unmount();
    }
  });

  it("zeigt ohne Anmeldung nichts vom Panel", () => {
    renderAs(undefined);
    expect(screen.getByTestId("admin-forbidden")).toBeInTheDocument();
  });

  it("wartet, solange die Sitzung noch geladen wird", () => {
    // Sonst blitzte die 403-Seite auf, bevor die Rolle bekannt ist – und ein
    // Super-Admin sähe bei jedem Laden kurz "Kein Zugriff".
    renderAs("SUPER_ADMIN", "loading");

    expect(screen.queryByTestId("admin-forbidden")).not.toBeInTheDocument();
    expect(screen.queryByText("Inhalt des Panels")).not.toBeInTheDocument();
    expect(screen.getByText(t("admin.loading"))).toBeInTheDocument();
  });
});
