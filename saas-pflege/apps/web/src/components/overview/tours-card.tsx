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
 *
 * Dazu seit GET /routes die Frage, die im Betrieb vor allen anderen kommt:
 * GEHT DIE TOUR ÜBERHAUPT AUF? Pflegezeit plus Fahrzeit gegen den nächsten
 * Termin gerechnet. "Optimiert" sagt nur, dass ein Solver gelaufen ist – eine
 * optimierte Tour kann trotzdem nicht fahrbar sein, und genau die ist die
 * teuerste: sie sieht erledigt aus.
 */

/** Zustand einer Tour, so wie die Karte ihn anzeigt. */
export interface TourFlags {
  /** Die Tour geht zeitlich nicht auf. */
  infeasible: boolean;
  /** Wie viele Anschlüsse daran scheitern. */
  violationCount: number;
  /** Besuche ohne Koordinaten – nicht geprüft, nicht "in Ordnung". */
  uncheckedVisits: number;
  /** Besuche, die diese Fachkraft nicht fahren dürfte (freier Tag, Qualifikation). */
  staffingIssues: number;
  /**
   * Welche EINE Meldung die Zeile trägt.
   *
   * Die Besetzung sticht die Zeit, und zwar nicht nach Anzahl: eine Tour, die
   * jemand nicht fahren DARF, wird nicht dadurch zulässig, dass man sie
   * umsortiert. Die zwölf Minuten Verspätung sind dann nicht das Problem.
   *
   * Und nur eine: zwei Warnpastillen nebeneinander lassen offen, welche zuerst
   * dran ist -- die Zeile hat aber nur eine Entscheidung anzustossen.
   */
  alert: "staffing" | "time" | null;
}

/**
 * Liest die Prüfung einer Tour für die Anzeige.
 *
 * `feasible === false` und nicht `!feasible`: eine Antwort ohne das Feld –
 * ein Backend, das noch nicht neu ausgeliefert ist – darf nicht als "geht
 * nicht auf" gelesen werden. Ein Fehlalarm kostet mehr als ein fehlender
 * Hinweis: nach der dritten falschen Meldung sieht niemand mehr hin.
 */
export function tourFlags(route: RouteRow): TourFlags {
  const infeasible = route.feasible === false;
  const staffingIssues = Math.max(0, route.staffingIssueCount ?? 0);

  return {
    infeasible,
    violationCount: Math.max(0, route.violationCount ?? 0),
    uncheckedVisits: Math.max(0, route.uncheckedVisits ?? 0),
    staffingIssues,
    alert: staffingIssues > 0 ? "staffing" : infeasible ? "time" : null,
  };
}

/**
 * Wie viele Touren des Tages eine Meldung tragen. Steht im Untertitel.
 *
 * Gezählt werden TOUREN, nicht Befunde: die Zahl beantwortet "wie viele muss
 * ich anfassen", nicht "wie viele Einzelheiten gibt es". Eine Tour mit fünf
 * Verstössen bleibt eine Tour.
 */
export function dayIssueCount(routes: readonly RouteRow[]): number {
  return routes.filter((route) => tourFlags(route).alert !== null).length;
}

function TourRow({ route }: { route: RouteRow }) {
  const t = useTranslations("overview.tours");
  const format = useFormatter();

  const name = route.caregiver
    ? `${route.caregiver.firstName} ${route.caregiver.lastName}`
    : t("unassigned");

  const flags = tourFlags(route);

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
        {/*
          Ungeprüfte Besuche stehen in der Zeile und nicht als Pastille: es ist
          eine Lücke in den Stammdaten (fehlende Geokodierung), kein Vorfall
          des Tages. Zwei Alarmstärken nebeneinander entwerten die lautere.
        */}
        <span className="block truncate text-meta text-ink-muted">
          {t(flags.uncheckedVisits > 0 ? "metaUnchecked" : "meta", {
            visits: format.number(route.visitCount),
            km: route.totalKm === null ? t("noKm") : format.number(route.totalKm),
            unchecked: format.number(flags.uncheckedVisits),
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

      {/*
        Die Pastille steht VOR dem Optimierungszustand, weil sie ihn aussticht:
        wer disponiert, sucht die Touren, die nicht aufgehen, nicht die, die
        noch keinen Solver gesehen haben.
      */}
      {flags.alert === null ? null : (
        <StatusPill tone="attention">
          {flags.alert === "staffing"
            ? t("state.staffing", { count: format.number(flags.staffingIssues) })
            : t("state.infeasible", { count: format.number(flags.violationCount) })}
        </StatusPill>
      )}

      <StatusPill tone={route.optimized ? "positive" : "neutral"}>
        {t(route.optimized ? "state.optimized" : "state.notOptimized")}
      </StatusPill>
    </li>
  );
}

export function ToursCard({ routes, pending }: { routes: RouteDay | null; pending: boolean }) {
  const t = useTranslations("overview.tours");
  const format = useFormatter();

  // Der Untertitel zählt über die GELIEFERTE Seite, die Tourenzahl daneben
  // über den ganzen Tag. Bei pageSize 500 ist das dieselbe Menge; bliebe die
  // Seite je abgeschnitten, wäre die kleinere Zahl die ehrliche – sie
  // behauptet nichts über Touren, die der Bildschirm nie gesehen hat.
  const issues = routes ? dayIssueCount(routes.data) : 0;

  const subtitle = routes
    ? t(issues > 0 ? "summaryIssues" : "summary", {
        tours: format.number(routes.totals.routes),
        km: format.number(routes.totals.totalKm),
        issues: format.number(issues),
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
