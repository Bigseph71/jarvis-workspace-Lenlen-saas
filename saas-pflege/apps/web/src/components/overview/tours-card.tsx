"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { RouteDay, RouteRow } from "@len-len/api-client";
import { Link } from "@/i18n/navigation";
import { ContentCard } from "@/components/ui/content-card";
import { StatusPill } from "@/components/ui/status-pill";
import { initialsFromName } from "@/lib/display-name";

/**
 * "Laufende Touren" – die breite Spalte der Übersicht.
 *
 * Angebunden an GET /routes. Was der Entwurf zusätzlich zeigte, steht nicht
 * mehr hier, und zwar weil es keine Quelle dafür gibt:
 *
 *   Gebiet ("West", "Nord")   eine Tour trägt kein Gebiet; die Gebietseinteilung
 *                             ist ein eigener Vorgang ohne Persistenz (Gebiete)
 *   Fortschritt "3 / 9"       die Tagesliste liefert die ZAHL der Besuche, nicht
 *                             ihre Zustände; dafür bräuchte es je Tour eine
 *                             zweite Abfrage
 *   Dienstumschalter          kein Endpunkt liefert Touren nach Dienst
 *
 * Statt sie mit erfundenen Werten zu füllen, zeigt die Karte, was eine Tour
 * wirklich hat: wer sie fährt, wie viele Besuche, wie viele Kilometer, und ob
 * sie optimiert wurde. Der Balken trägt jetzt den VRPTW-Score – die einzige
 * Verhältniszahl, die eine Tour tatsächlich mitbringt.
 */

function TourRow({ route }: { route: RouteRow }) {
  const t = useTranslations("overview.tours");
  const format = useFormatter();

  const name = route.caregiver
    ? `${route.caregiver.firstName} ${route.caregiver.lastName}`
    : t("unassigned");

  return (
    <li className="flex items-center gap-4 border-b border-hairline px-0.5 py-4 transition-colors duration-120 hover:bg-surface">
      <span
        aria-hidden="true"
        className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-avatar text-micro font-bold ${
          route.optimized ? "bg-sage-wash text-sage-deep" : "bg-neutral-pill text-ink-tertiary"
        }`}
      >
        {route.caregiver ? initialsFromName(name) : "—"}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-row font-semibold text-ink-primary">{name}</span>
        <span className="block truncate text-meta text-ink-muted">
          {t("meta", {
            visits: format.number(route.visitCount),
            km: route.totalKm === null ? t("noKm") : format.number(route.totalKm),
          })}
        </span>
      </span>

      {/*
        Der Balken zeigt den VRPTW-Score, nicht einen Fortschritt: 100 heisst,
        die optimierte Reihenfolge ist so gut wie die geplante gemeint war.
        Ohne Optimierung gibt es keinen Score und deshalb keinen Balken – ein
        leerer Balken sähe aus wie "0 %".
      */}
      <span className="w-24 flex-none">
        {route.vrptwScore === null ? (
          <span className="block text-micro text-ink-faint">{t("noScore")}</span>
        ) : (
          <>
            <span
              role="progressbar"
              aria-valuenow={route.vrptwScore}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("score", { score: format.number(route.vrptwScore) })}
              className="block h-[5px] w-full overflow-hidden rounded-full bg-neutral-track"
            >
              <span
                className="block h-full rounded-full bg-sage"
                style={{ width: `${Math.min(100, Math.max(0, route.vrptwScore))}%` }}
              />
            </span>
            <span className="mt-1.5 block text-micro text-ink-faint">
              {t("score", { score: format.number(route.vrptwScore) })}
            </span>
          </>
        )}
      </span>

      <StatusPill tone={route.optimized ? "positive" : "neutral"}>
        {t(route.optimized ? "state.optimized" : "state.notOptimized")}
      </StatusPill>
    </li>
  );
}

export function ToursCard({ routes, pending }: { routes: RouteDay | null; pending: boolean }) {
  const t = useTranslations("overview.tours");
  const format = useFormatter();

  const subtitle = routes
    ? t("summary", {
        tours: format.number(routes.totals.routes),
        km: format.number(routes.totals.totalKm),
      })
    : t("summaryPending");

  return (
    <ContentCard
      title={t("title")}
      subtitle={subtitle}
      className="pb-3"
      footer={
        <Link
          href="/visits"
          className="mt-1 inline-block px-0.5 py-4 text-label-lg font-medium text-clay-deep transition-colors duration-120 hover:text-clay-hover"
        >
          {t("openPlanning")} →
        </Link>
      }
    >
      {pending ? (
        <p className="py-8 text-center text-meta text-ink-faint">{t("loading")}</p>
      ) : routes === null ? (
        <p className="py-8 text-center text-meta text-ink-muted">{t("unavailable")}</p>
      ) : routes.data.length === 0 ? (
        /*
          Der wahrscheinlichste Fall im laufenden Betrieb, und deshalb keine
          blosse Leerzeile: Touren entstehen aus der Optimierung, und wer den
          Bildschirm zum ersten Mal öffnet, soll erfahren, wo.
        */
        <p className="py-8 text-center text-meta text-ink-muted">{t("empty")}</p>
      ) : (
        <ul className="mt-1">
          {routes.data.map((route) => (
            <TourRow key={route.id} route={route} />
          ))}
        </ul>
      )}
    </ContentCard>
  );
}
