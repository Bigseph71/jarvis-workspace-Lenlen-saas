import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { render, t } from "./helpers/render";
import HomePage from "../src/app/[locale]/page";

/**
 * Startseite.
 *
 * Sie war lange eine Sackgasse: Titel, Untertitel, kein einziger Link. Wer die
 * Domain aufrief, musste /de/login von Hand tippen. Der Fehler blieb
 * unbemerkt, solange niemand über die Wurzel kam – bis die Registrierung
 * öffentlich wurde und das die erste Seite jedes Interessenten war.
 */

// Der Sprachumschalter zieht usePathname aus der next-intl-Navigation nach.
vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return {
    Link: NextLink,
    usePathname: () => "/",
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  };
});

describe("Startseite", () => {
  it("führt zur Anmeldung UND zur Registrierung", () => {
    render(<HomePage />);

    // Die eigentliche Zusicherung: die Seite ist kein Endpunkt.
    expect(screen.getByRole("link", { name: t("home.login") })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: t("home.register") })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("nennt die Bedingungen der Testphase", () => {
    // Zahlungsmittel erforderlich – das gehört vor die Registrierung, nicht
    // erst auf die Abrechnungsseite.
    render(<HomePage />);
    expect(screen.getByText(t("home.trialHint"))).toBeInTheDocument();
  });

  it("bietet die Sprachwahl an", () => {
    render(<HomePage />);
    for (const label of ["DE", "EN", "FR"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });
});
