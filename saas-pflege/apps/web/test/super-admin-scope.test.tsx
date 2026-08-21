import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import type { UserRole } from "@len-len/api-client";
import { render } from "./helpers/render";

/**
 * Der Super-Admin bleibt in der Plattform-Verwaltung.
 *
 * Ruft er eine Tenant-Adresse auf, wird er nach /admin geführt. Das ist
 * Bequemlichkeit, keine Absicherung: das Backend antwortet ihm auf diesen
 * Endpunkten seit der Trennung ohnehin mit 403. Ohne die Weiche sähe er
 * lediglich eine Seite voller Fehlermeldungen.
 */

const { useAuth, replace, pathname } = vi.hoisted(() => ({
  useAuth: vi.fn(),
  replace: vi.fn(),
  pathname: { current: "/patients" },
}));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => useAuth() }));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ replace }),
}));

import { SuperAdminScope } from "../src/components/super-admin-scope";

function renderAt(path: string, role: UserRole | undefined, status = "authenticated") {
  pathname.current = path;
  useAuth.mockReturnValue({ user: role ? { role } : null, status });
  render(
    <SuperAdminScope>
      <p>Tenant-Inhalt</p>
    </SuperAdminScope>,
  );
}

beforeEach(() => {
  replace.mockClear();
});

describe("SuperAdminScope", () => {
  it("führt den Super-Admin von einer Tenant-Seite nach /admin", () => {
    renderAt("/patients", "SUPER_ADMIN");

    expect(replace).toHaveBeenCalledWith("/admin");
    // Und zeigt den Inhalt nicht kurz an.
    expect(screen.queryByText("Tenant-Inhalt")).not.toBeInTheDocument();
  });

  it("greift auf jeder Tenant-Adresse", () => {
    for (const path of ["/visits", "/caregivers", "/chat", "/tracking", "/dashboard"]) {
      replace.mockClear();
      renderAt(path, "SUPER_ADMIN");
      expect(replace, path).toHaveBeenCalledWith("/admin");
    }
  });

  it("lässt ihn in der Plattform-Verwaltung in Ruhe", () => {
    renderAt("/admin", "SUPER_ADMIN");

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("Tenant-Inhalt")).toBeInTheDocument();
  });

  it("lässt auch die Unterseiten des Panels in Ruhe", () => {
    renderAt("/admin/organizations", "SUPER_ADMIN");

    expect(replace).not.toHaveBeenCalled();
  });

  it("rührt die übrigen Rollen nicht an", () => {
    for (const role of ["STRUKTUR_ADMIN", "KOORDINATOR", "HR"] as UserRole[]) {
      replace.mockClear();
      renderAt("/patients", role);
      expect(replace, role).not.toHaveBeenCalled();
    }
  });

  it("wartet, solange die Sitzung lädt", () => {
    // Sonst würde jemand umgeleitet, bevor seine Rolle überhaupt feststeht.
    renderAt("/patients", "SUPER_ADMIN", "loading");

    expect(replace).not.toHaveBeenCalled();
  });
});
