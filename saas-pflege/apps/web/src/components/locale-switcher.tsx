"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = { de: "DE", en: "EN", fr: "FR" };

/**
 * Sprachumschalter.
 *
 * Bleibt auf DERSELBEN Seite und tauscht nur das Sprachsegment: `usePathname`
 * aus @/i18n/navigation liefert den Pfad ohne Präfix, `Link` setzt es neu.
 * Ein Wechsel führt also nicht auf die Startseite zurück – wer auf der
 * Abrechnung steht, bleibt dort.
 *
 * `usePathname` liefert den Pfad mit BEREITS eingesetzten Werten, nicht die
 * Vorlage: auf einer Detailseite bleibt die ID darin erhalten.
 *
 * Zwei Fassungen: die helle für die Organisationsansicht, die dunkle für die
 * Plattform-Kopfzeile. Die Reihenfolge DE EN FR bleibt unverändert – sie ist
 * gelernt, und der Handoff bestätigt sie ausdrücklich.
 */
export function LocaleSwitcher({
  variant = "light",
  className = "",
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const active = useLocale();
  const pathname = usePathname();

  const shell =
    variant === "dark"
      ? "border-transparent bg-on-forest-primary/[.12]"
      : "border-border-default bg-inset";

  return (
    <div
      className={`flex items-center gap-0.5 rounded-full border p-[3px] ${shell} ${className}`}
      role="group"
    >
      {routing.locales.map((locale) => {
        const isActive = locale === active;
        const tone = isActive
          ? variant === "dark"
            ? "bg-on-forest-body font-bold text-forest-deep"
            : "bg-forest font-bold text-page"
          : variant === "dark"
            ? "font-semibold text-on-forest-faint hover:text-on-forest-body"
            : "font-semibold text-ink-muted hover:text-ink-body";

        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            aria-current={isActive ? "true" : undefined}
            className={`rounded-full px-2.5 py-[5px] text-micro leading-none transition-colors duration-120 ${tone}`}
          >
            {LABELS[locale] ?? locale.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
