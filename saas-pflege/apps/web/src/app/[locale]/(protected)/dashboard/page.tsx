"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/auth-context";
import { firstNameFromEmail } from "@/lib/display-name";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { KpiCard } from "@/components/ui/kpi-card";
import { DemoNotice } from "@/components/overview/demo-notice";
import { ToursCard } from "@/components/overview/tours-card";
import { ArbitrationsCard } from "@/components/overview/arbitrations-card";
import { AbsencesCard } from "@/components/overview/absences-card";
import { QualificationsCard } from "@/components/overview/qualifications-card";
import { KPIS, ORGANISATION_NAME, OVERVIEW_DATE } from "@/lib/demo/uebersicht";

/**
 * Übersicht – Startbildschirm der Koordination.
 *
 * Ersetzt den bisherigen Bildschirm, der nur die Rolle und die Organisations-
 * UUID zeigte. Er beantwortet eine einzige Frage: was verlangt heute Morgen
 * meine Aufmerksamkeit?
 *
 * Aufbau von oben nach unten in der Reihenfolge, in der diese Frage zerfällt:
 * geht es dem Betrieb gut (Kennzahlen), läuft der Tag (Touren), muss ICH etwas
 * entscheiden (Arbitragen), was fehlt an Personal (Abwesenheiten,
 * Qualifikationen).
 *
 * Die Werte stammen noch aus lib/demo – siehe DemoNotice und die Kopfzeile
 * jener Dateien.
 */
export default function OverviewPage() {
  const t = useTranslations("overview");
  const format = useFormatter();
  const { user } = useAuth();

  if (!user) return null;

  const firstName = firstNameFromEmail(user.email);

  return (
    <section className="flex flex-col gap-6">
      <DemoNotice />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-label font-semibold uppercase tracking-[.14em] text-ink-faint">
            {format.dateTime(OVERVIEW_DATE, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}{" "}
            · {ORGANISATION_NAME}
          </p>
          <h1 className="mt-2 font-serif text-[40px] font-light leading-[1.1] tracking-[-.02em] text-ink-primary">
            {firstName ? t("greetingNamed", { name: firstName }) : t("greeting")}{" "}
            {/* Zweite Hälfte gedämpft: die Begrüssung ist der Einstieg, die
                Lagemeldung die eigentliche Information. */}
            <span className="text-ink-faint">{t("subline")}</span>
          </h1>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <SecondaryButton>{t("actions.weeklyReport")}</SecondaryButton>
          <PrimaryButton>{t("actions.planTomorrow")}</PrimaryButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((kpi) => (
          <KpiCard
            key={kpi.id}
            label={t(`kpi.${kpi.id}.label`)}
            value={format.number(kpi.value)}
            unit={t(`kpi.${kpi.id}.unit`)}
            delta={t(`kpi.${kpi.id}.delta`)}
            tone={kpi.tone}
            spark={kpi.spark}
          />
        ))}
      </div>

      {/*
        Unterhalb von xl eine Spalte, und die Touren stehen zuerst: sie sind der
        Lagebericht. Die Entscheidungen folgen darunter, weil man erst die Lage
        liest und dann entscheidet.
      */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.35fr_1fr]">
        <ToursCard />
        <div className="flex flex-col gap-4">
          <ArbitrationsCard />
          <AbsencesCard />
          <QualificationsCard />
        </div>
      </div>
    </section>
  );
}
