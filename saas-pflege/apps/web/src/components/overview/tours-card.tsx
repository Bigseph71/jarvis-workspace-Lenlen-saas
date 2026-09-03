"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ContentCard } from "@/components/ui/content-card";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { initialsFromName } from "@/lib/display-name";
import { TOURS, TOUR_SUMMARY, type TourFixture, type TourState } from "@/lib/demo/uebersicht";

const SHIFTS = ["morning", "afternoon", "night"] as const;
type Shift = (typeof SHIFTS)[number];

/** Avatar-, Balken- und Pastillenfarbe folgen demselben Zustand. */
const AVATAR: Record<TourState, string> = {
  enRoute: "bg-sage-wash text-sage-deep",
  overloaded: "bg-clay-wash text-clay-deep",
  notStarted: "bg-neutral-pill text-ink-tertiary",
};

const BAR: Record<TourState, string> = {
  enRoute: "bg-sage",
  overloaded: "bg-clay",
  notStarted: "bg-neutral-dot",
};

const PILL: Record<TourState, PillTone> = {
  enRoute: "positive",
  overloaded: "attention",
  notStarted: "neutral",
};

/** Füllstand des Balkens: Fortschritt, oder Auslastung bei Überlast. */
function fillPercent(tour: TourFixture): number {
  if (tour.state === "overloaded") return tour.load ?? 0;
  if (tour.state === "notStarted") return 0;
  return Math.round(((tour.done ?? 0) / tour.visits) * 100);
}

function TourRow({ tour }: { tour: TourFixture }) {
  const t = useTranslations("overview.tours");
  const ts = useTranslations("overview.sectors");
  const format = useFormatter();

  const percent = fillPercent(tour);
  const progressLabel =
    tour.state === "overloaded"
      ? t("load", { percent: format.number(tour.load ?? 0) })
      : tour.state === "notStarted"
        ? t("notStarted")
        : t("doneOf", {
            done: format.number(tour.done ?? 0),
            total: format.number(tour.visits),
          });

  return (
    <li className="flex items-center gap-4 border-b border-hairline px-0.5 py-4 transition-colors duration-120 hover:bg-surface">
      <span
        aria-hidden="true"
        className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-avatar text-micro font-bold ${AVATAR[tour.state]}`}
      >
        {initialsFromName(tour.name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-row font-semibold text-ink-primary">{tour.name}</span>
        <span className="block truncate text-meta text-ink-muted">
          {t("meta", {
            sector: ts(tour.sector),
            visits: format.number(tour.visits),
            km: format.number(tour.kilometers),
          })}
        </span>
      </span>

      <span className="w-24 flex-none">
        <span
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={progressLabel}
          className="block h-[5px] w-full overflow-hidden rounded-full bg-neutral-track"
        >
          <span className={`block h-full rounded-full ${BAR[tour.state]}`} style={{ width: `${percent}%` }} />
        </span>
        <span className="mt-1.5 block text-micro text-ink-faint">{progressLabel}</span>
      </span>

      <StatusPill tone={PILL[tour.state]}>{t(`state.${tour.state}`)}</StatusPill>
    </li>
  );
}

/**
 * "Tournées en cours" – die breite Spalte der Übersicht.
 *
 * Der Schichtumschalter ist heute reine Oberfläche: es gibt keinen Endpunkt,
 * der Touren nach Schicht liefert. Er steht trotzdem hier, weil er zum
 * Bildaufbau des Handoffs gehört und weil sein Zustand später genau der
 * Filterparameter ist.
 */
export function ToursCard() {
  const t = useTranslations("overview.tours");
  const format = useFormatter();
  const [shift, setShift] = useState<Shift>("morning");

  return (
    <ContentCard
      title={t("title")}
      subtitle={t("summary", {
        tours: format.number(TOUR_SUMMARY.tours),
        km: format.number(TOUR_SUMMARY.kilometers),
        seconds: format.number(TOUR_SUMMARY.refreshedSecondsAgo),
      })}
      className="pb-3"
      action={
        <div role="tablist" aria-label={t("shift")} className="flex gap-1.5 rounded-full bg-inset p-1">
          {SHIFTS.map((value) => {
            const active = value === shift;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setShift(value)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-meta transition-colors duration-120 ${
                  active ? "bg-app font-semibold text-ink-primary shadow-pill" : "text-ink-tertiary"
                }`}
              >
                {t(`shifts.${value}`)}
              </button>
            );
          })}
        </div>
      }
      footer={
        <Link
          href="/visits"
          className="mt-1 inline-block px-0.5 py-4 text-label-lg font-medium text-clay-deep transition-colors duration-120 hover:text-clay-hover"
        >
          {t("openPlanning")} →
        </Link>
      }
    >
      <ul className="mt-1">
        {TOURS.map((tour) => (
          <TourRow key={tour.id} tour={tour} />
        ))}
      </ul>
    </ContentCard>
  );
}
