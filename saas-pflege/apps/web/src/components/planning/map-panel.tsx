"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { RouteMap } from "@/components/planning/route-map";
import { MAP_HEADER, MAP_LAYERS, SELECTED_TOUR, type MapLayer } from "@/lib/demo/planung";

/**
 * Die Karte mit ihren beiden aufgesetzten Glasflächen.
 *
 * Warum Glas und nicht undurchsichtige Kästen: die Karte ist die Information,
 * die Bedienelemente liegen darauf. Ein deckender Kasten schnitte ein Loch
 * hinein, gerade dort, wo eine Route verlaufen kann. Das Blur hält beides
 * lesbar, ohne die Fläche darunter zu verlieren.
 *
 * Der Ebenenumschalter ist heute reine Oberfläche – es gibt weder eine
 * Dichte- noch eine Verspätungsebene. Er steht dennoch hier, weil sein
 * Zustand später genau der Parameter der Kartenabfrage ist.
 */
export function MapPanel() {
  const t = useTranslations("planning.map");
  const ts = useTranslations("overview.sectors");
  const format = useFormatter();
  const [layer, setLayer] = useState<MapLayer>("routes");

  const metrics = [
    {
      key: "visits",
      value: t("panel.visitsValue", {
        done: format.number(SELECTED_TOUR.done),
        total: format.number(SELECTED_TOUR.visits),
      }),
    },
    {
      key: "drift",
      value: t("panel.driftValue", { minutes: format.number(SELECTED_TOUR.driftMinutes) }),
    },
    {
      key: "remaining",
      value: t("panel.remainingValue", {
        km: format.number(SELECTED_TOUR.remainingKm, { maximumFractionDigits: 1 }),
      }),
    },
    {
      key: "end",
      value: format.dateTime(SELECTED_TOUR.expectedEnd, { hour: "2-digit", minute: "2-digit" }),
    },
  ];

  return (
    <section className="relative flex min-h-[620px] flex-col overflow-hidden rounded-card bg-forest">
      <RouteMap label={t("alt", { sector: ts(MAP_HEADER.sector) })} />

      <header className="relative flex flex-wrap items-start justify-between gap-4 px-[26px] pt-[26px]">
        <div className="min-w-0">
          <h2 className="font-serif text-[24px] font-normal leading-tight text-on-forest-primary">
            {t("sectorTitle", { sector: ts(MAP_HEADER.sector) })}
          </h2>
          <p className="mt-1.5 text-label text-on-forest-faint">
            {t("subtitle", {
              tours: format.number(MAP_HEADER.overlaidTours),
              patients: format.number(MAP_HEADER.geocodedPatients),
            })}
          </p>
        </div>

        <div
          role="tablist"
          aria-label={t("layers")}
          className="flex gap-1 rounded-full border border-on-forest-body/[.14] bg-[rgba(20,25,18,.42)] p-1 backdrop-blur-[8px]"
        >
          {MAP_LAYERS.map((value) => {
            const active = value === layer;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setLayer(value)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-meta transition-colors duration-120 ${
                  active
                    ? "bg-on-forest-body font-semibold text-forest-deep"
                    : "text-on-forest-secondary hover:text-on-forest-body"
                }`}
              >
                {t(`layer.${value}`)}
              </button>
            );
          })}
        </div>
      </header>

      <div className="relative mt-auto p-[26px]">
        <div className="rounded-mobile-card border border-on-forest-body/[.14] bg-[rgba(20,25,18,.5)] px-[22px] py-5 backdrop-blur-[14px]">
          <div className="flex flex-wrap items-center gap-3">
            <span aria-hidden="true" className="h-[9px] w-[9px] flex-none rounded-full bg-sand" />
            <p className="min-w-0 flex-1 truncate font-serif text-[19px] text-on-forest-primary">
              {t("panel.identity", {
                number: SELECTED_TOUR.number,
                caregiver: SELECTED_TOUR.caregiver,
              })}
            </p>
            <span className="flex-none whitespace-nowrap rounded-full bg-sand px-[11px] py-[5px] text-pill font-semibold text-forest-deep">
              {t("panel.enRoute")}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-[18px] sm:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.key}>
                <dt className="text-micro font-semibold uppercase tracking-[.1em] text-on-forest-dim">
                  {t(`panel.${metric.key}`)}
                </dt>
                <dd className="mt-1 font-serif text-[22px] text-on-forest-primary">{metric.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
