import { useTranslations } from "next-intl";

/**
 * Hinweis, WELCHE Teile dieses Bildschirms noch Beispielwerte zeigen.
 *
 * Der Streifen sagte bis hierher, der ganze Bildschirm sei ein Beispiel. Das
 * stimmt nicht mehr: Besuche, Verspätungen, Kilometer, Touren, Abwesenheiten
 * und Qualifikationen kommen jetzt aus der Datenbank. Zwei Stellen tun es
 * nicht, und für die bleibt der Hinweis – enger gefasst, damit er weiter
 * gelesen wird. Ein Streifen, der pauschal alles verdächtigt, wird nach einer
 * Woche übersehen, und dann trägt er nichts mehr.
 *
 * Er verschwindet, sobald die beiden letzten Karten eine Quelle haben. Beide
 * brauchen dafür kein Feld, sondern einen Vorgang, den es im Backend nicht
 * gibt: eine gemessene Planungsdauer und einen Entwurf mit Arbitragen.
 */
export function DemoNotice() {
  const t = useTranslations("overview.demo");

  return (
    <p
      role="status"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-strong bg-inset px-4 py-2.5 text-meta text-ink-secondary"
    >
      <span className="font-semibold uppercase tracking-[.12em] text-ink-faint">{t("tag")}</span>
      <span>{t("body")}</span>
    </p>
  );
}
