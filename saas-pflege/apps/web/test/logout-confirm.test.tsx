import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import type { UserRole } from "@len-len/api-client";
import { render, t } from "./helpers/render";

/**
 * Abmelden mit Rückfrage.
 *
 * "Abmelden" sitzt in der Kopfzeile neben dem Sprachumschalter und dem
 * Namensblock -- inmitten von Bedienelementen, die man beiläufig anfasst. Ein
 * Fehlgriff warf die Koordination mitten in der Disposition zurück auf den
 * Anmeldebildschirm. Dasselbe Verhalten wie auf dem Telefon (PR #66).
 */

const { useAuth, logout } = vi.hoisted(() => ({ useAuth: vi.fn(), logout: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => useAuth() }));
vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return { Link: NextLink, usePathname: () => "/dashboard" };
});
vi.mock("@/components/locale-switcher", () => ({ LocaleSwitcher: () => null }));

import { AppShell } from "../src/components/app-shell";

function renderAs(role: UserRole = "KOORDINATOR") {
  useAuth.mockReturnValue({ user: { role, email: "sabine.krueger@nord.de" }, logout });
  render(
    <AppShell>
      <p>Inhalt</p>
    </AppShell>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Abmelden", () => {
  it("meldet NICHT sofort ab", async () => {
    // Der Kern des Fehlers: ein Klick, und die Sitzung war weg.
    renderAs();

    fireEvent.click(screen.getByRole("button", { name: t("common.logout") }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(logout).not.toHaveBeenCalled();
  });

  it("stellt die Frage im Klartext", async () => {
    renderAs();

    fireEvent.click(screen.getByRole("button", { name: t("common.logout") }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(t("common.logoutConfirmTitle"));
    expect(dialog).toHaveTextContent(t("common.logoutConfirmMessage"));
  });

  it("meldet erst nach der Bestätigung ab", async () => {
    renderAs();

    fireEvent.click(screen.getByRole("button", { name: t("common.logout") }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      screen.getAllByRole("button", { name: t("common.logout") }).find((b) => dialog.contains(b))!,
    );

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it("meldet nach Abbrechen nicht ab und schliesst den Dialog", async () => {
    renderAs();

    fireEvent.click(screen.getByRole("button", { name: t("common.logout") }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: t("common.cancel") }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(logout).not.toHaveBeenCalled();
  });

  it("schliesst mit Escape, wie überall im Produkt", async () => {
    renderAs();

    fireEvent.click(screen.getByRole("button", { name: t("common.logout") }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(logout).not.toHaveBeenCalled();
  });

  it("legt den Fokus auf ABBRECHEN, nicht auf Abmelden", async () => {
    // Wer mit der Eingabetaste durch die Seite geht, darf sich nicht
    // versehentlich abmelden.
    renderAs();

    fireEvent.click(screen.getByRole("button", { name: t("common.logout") }));
    await screen.findByRole("dialog");

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: t("common.cancel") }),
    );
  });

  it("fragt auch den Super-Admin", async () => {
    // Er hat ein eigenes Chrome (dunkle Plattform-Kopfzeile) mit einem
    // zweiten Abmelde-Knopf. Ihn zu vergessen hiesse, den Fehler an genau
    // einer Stelle stehen zu lassen.
    renderAs("SUPER_ADMIN");

    fireEvent.click(screen.getByRole("button", { name: t("common.logout") }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(logout).not.toHaveBeenCalled();
  });
});
