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
 */
export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const active = useLocale();
  const pathname = usePathname();

  return (
    <div className={`flex items-center gap-0.5 ${className}`} role="group">
      {routing.locales.map((locale) => {
        const isActive = locale === active;
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            aria-current={isActive ? "true" : undefined}
            className={`rounded px-1.5 py-0.5 text-xs font-medium transition ${
              isActive ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {LABELS[locale] ?? locale.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
