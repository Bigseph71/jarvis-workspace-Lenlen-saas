"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/auth-context";
import { firstNameFromEmail } from "@/lib/display-name";
import { SecondaryButton } from "@/components/ui/buttons";
import { KpiCard } from "@/components/ui/kpi-card";
import { DemoNotice } from "@/components/overview/demo-notice";
import { ToursCard } from "@/components/overview/tours-card";
import { ArbitrationsCard } from "@/components/overview/arbitrations-card";
import { AbsencesCard } from "@/components/overview/absences-card";
import { QualificationsCard } from "@/components/overview/qualifications-card";
import { useArbitrationQueue } from "@/lib/arbitrations";
import { useOverview } from "@/lib/overview/use-overview";
import { PLANNING_TIME_DEMO } from "@/lib/demo/uebersicht";

/**
 * Übersicht – Startbildschirm der Koordination.
 *
 * Sie beantwortet eine einzige Frage: was verlangt heute Morgen meine
 * Aufmerksamkeit? Aufbau von oben nach unten in der Reihenfolge, in der diese
 * Frage zerfällt: geht es dem Betrieb gut (Kennzahlen), läuft der Tag (Touren),
 * muss ICH etwas entscheiden (Arbitragen), was fehlt an Personal
 * (Abwesenheiten, Qualifikationen).
 *
 * Die Zahlen kommen jetzt aus der Datenbank (lib/overview/use-overview). Zwei
 * Stellen nicht, und sie tragen eine sichtbare Marke: die Planungsdauer, die
 * nirgends gemessen wird, und die Arbitragen, für die der Vorgang fehlt.
 *
 * Der Name der Organisation stand hier einmal in der Kopfzeile – als
 * Festwert, "Pflegedienst Nord". Er ist ersatzlos entfallen und nicht als
 * Beispiel markiert worden: in einer mandantenfähigen Anwendung ist der Name
 * eines FREMDEN Trägers über den eigenen Zahlen schlimmer als eine erfundene
 * Kennzahl. Ein Endpunkt, der ihn liefert, existiert für Tenant-Rollen nicht.
 */
export default function OverviewPage() {
  const t = useTranslations("overview");
  const format = useFormatter();
  const { user } = useAuth();
  const arbitrations = useArbitrationQueue();
  const { state, summary, routes, absences, caregivers } = useOverview(user?.role);

  if (!user) return null;

  const firstName = firstNameFromEmail(user.email);
  const pending = state === "loading";

  return (
    <section className="flex flex-col gap-6">
      <DemoNotice />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-label font-semibold uppercase tracking-[.14em] text-ink-faint">
            {/* Heute, und nicht mehr ein fester Tag aus dem Entwurf. */}
            {format.dateTime(new Date(), { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="mt-2 font-serif text-[40px] font-light leading-[1.1] tracking-[-.02em] text-ink-primary">
            {firstName ? t("greetingNamed", { name: firstName }) : t("greeting")}
          </h1>
        </div>

        {/*
          "Morgen planen" ist entfallen: der Knopf führte nirgendwohin, und ein
          Knopf, der nichts tut, ist auf einem Arbeitsbildschirm schlimmer als
          gar keiner. Der Wochenbericht bleibt, er ist ein Ausblick auf ein
          vorhandenes Ziel.
        */}
        <div className="flex flex-wrap gap-2.5">
          <SecondaryButton>{t("actions.weeklyReport")}</SecondaryButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("kpi.visits.label")}
          value={format.number(summary?.total ?? 0)}
          hint={
            summary
              ? t("kpi.visits.hint", {
                  done: format.number(summary.completed),
                  open: format.number(summary.planned + summary.inProgress),
                })
              : t("kpi.unavailable")
          }
          tone="sage"
          pending={pending || summary === null}
        />
        <KpiCard
          label={t("kpi.delays.label")}
          value={format.number(summary?.delayed ?? 0)}
          hint={
            summary
              ? t("kpi.delays.hint", { minutes: format.number(summary.delayThresholdMinutes) })
              : t("kpi.unavailable")
          }
          // Rot nur, wenn es tatsächlich Verspätungen gibt: eine Null in Warnfarbe
          // gewöhnt das Auge an das Rot und entwertet es für den Tag, an dem es zählt.
          tone={summary && summary.delayed > 0 ? "clay" : "sage"}
          pending={pending || summary === null}
        />
        <KpiCard
          label={t("kpi.kilometers.label")}
          value={format.number(routes?.totals.totalKm ?? 0)}
          hint={
            routes
              ? t("kpi.kilometers.hint", { tours: format.number(routes.totals.routes) })
              : t("kpi.unavailable")
          }
          tone="sage"
          pending={pending || routes === null}
        />
        {/* Ohne Quelle: nirgends wird gemessen, wie lange eine Planung dauert. */}
        <KpiCard
          label={t("kpi.planningTime.label")}
          value={format.number(PLANNING_TIME_DEMO.value)}
          unit={t("kpi.planningTime.unit")}
          hint={t("kpi.planningTime.delta")}
          tone="sage"
          spark={PLANNING_TIME_DEMO.spark}
          demo
        />
      </div>

      {/*
        Unterhalb von xl eine Spalte, und die Touren stehen zuerst: sie sind der
        Lagebericht. Die Entscheidungen folgen darunter, weil man erst die Lage
        liest und dann entscheidet.
      */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.35fr_1fr]">
        <ToursCard routes={routes} pending={pending} />
        <div className="flex flex-col gap-4">
          <ArbitrationsCard queue={arbitrations} />
          <AbsencesCard absences={absences} pending={pending} />
          <QualificationsCard caregivers={caregivers} pending={pending} />
        </div>
      </div>
    </section>
  );
}
