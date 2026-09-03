import { useTranslations } from "next-intl";

/**
 * Hinweis, dass die Zahlen dieser Oberfläche noch Beispielwerte sind.
 *
 * Notwendig, weil die Werte GLAUBWÜRDIG sind: Namen von Fachkräften, Gebiete,
 * Kilometer. Auf einem Bildschirm sind sie von echten Daten nicht zu
 * unterscheiden, und eine Koordination, die danach disponiert, richtet Schaden
 * an. Der Streifen verschwindet mit der Anbindung an echte Endpunkte – er ist
 * kein Dauerzustand, sondern die ehrliche Kennzeichnung eines Zwischenstands.
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
