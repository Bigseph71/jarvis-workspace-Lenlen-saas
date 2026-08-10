import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "./helpers/render";

/**
 * Sprachumschalter.
 *
 * Er muss auf DERSELBEN Seite bleiben. Ein Umschalter, der auf die Startseite
 * zurückwirft, ist auf einer Detailseite schlimmer als keiner: der Nutzer
 * verliert seinen Kontext und findet ihn ohne die ID nicht wieder.
 */

const pathname = vi.hoisted(() => ({ value: "/" }));

vi.mock("@/i18n/navigation", async () => {
  const { default: NextLink } = await import("next/link");
  return {
    // Nachbildung des next-intl-Links: er stellt das Sprachsegment voran.
    Link: ({ href, locale, ...rest }: { href: string; locale?: string } & Record<string, unknown>) => (
      <NextLink href={`/${locale ?? "de"}${href === "/" ? "" : href}`} {...rest} />
    ),
    usePathname: () => pathname.value,
  };
});

import { LocaleSwitcher } from "../src/components/locale-switcher";

describe("LocaleSwitcher", () => {
  it("bietet alle drei Sprachen an", () => {
    pathname.value = "/";
    render(<LocaleSwitcher />);
    for (const label of ["DE", "EN", "FR"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("markiert die aktive Sprache", () => {
    pathname.value = "/";
    render(<LocaleSwitcher />, "de");
    expect(screen.getByRole("link", { name: "DE" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "EN" })).not.toHaveAttribute("aria-current");
  });

  it("bleibt auf der aktuellen Seite", () => {
    pathname.value = "/billing";
    render(<LocaleSwitcher />);
    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute("href", "/en/billing");
  });

  it("erhält die ID einer Detailseite", () => {
    // usePathname liefert den Pfad mit eingesetzten Werten – ein Wechsel darf
    // die ID nicht verlieren und auf einer kaputten URL landen.
    pathname.value = "/patients/52500ab5-8909-474f-9430-4c9fb718f6d9";
    render(<LocaleSwitcher />);
    expect(screen.getByRole("link", { name: "FR" })).toHaveAttribute(
      "href",
      "/fr/patients/52500ab5-8909-474f-9430-4c9fb718f6d9",
    );
  });
});
