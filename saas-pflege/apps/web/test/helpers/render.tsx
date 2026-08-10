import { NextIntlClientProvider } from "next-intl";
import { render as rtlRender, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import de from "../../messages/de.json";

/**
 * Rendert mit den ECHTEN deutschen Übersetzungen, nicht mit Attrappen.
 *
 * So schlägt ein Test auch dann fehl, wenn ein Schlüssel fehlt oder falsch
 * geschrieben ist – ein Fehler, der sonst erst im Browser als roher
 * Schlüsselname auffiele. Die Tests dürfen dafür auf sichtbaren Text prüfen,
 * was zugleich näher an dem liegt, was der Nutzer sieht.
 */
export function render(ui: ReactElement, locale = "de"): RenderResult {
  return rtlRender(
    <NextIntlClientProvider locale={locale} messages={de} timeZone="Europe/Berlin">
      {ui}
    </NextIntlClientProvider>,
  );
}

/** Übersetzter Text aus den echten Nachrichten, für Erwartungen im Test. */
export function t(path: string): string {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, de);
  if (typeof value !== "string") {
    throw new Error(`Übersetzungsschlüssel fehlt oder ist kein Text: ${path}`);
  }
  return value;
}
