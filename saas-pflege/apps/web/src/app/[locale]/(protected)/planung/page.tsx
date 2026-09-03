"use client";

import { useFormatter, useTranslations } from "next-intl";
import { SecondaryButton } from "@/components/ui/buttons";
import { DemoNotice } from "@/components/overview/demo-notice";
import { ArbitrationsCard } from "@/components/overview/arbitrations-card";
import { MapPanel } from "@/components/planning/map-panel";
import { GainsCard } from "@/components/planning/gains-card";
import { RulesCard } from "@/components/planning/rules-card";
import { PublishAction } from "@/components/planning/publish-action";
import { useArbitrationQueue } from "@/lib/arbitrations";
import { DRAFT } from "@/lib/demo/planung";

/**
 * Planung – Arbeitsplatz der Koordination.
 *
 * Vier Fragen, in dieser Reihenfolge: wie sieht der berechnete Entwurf aus
 * (Karte), was hat die Optimierung gebracht (Gewinne), was muss ich noch
 * entscheiden (Arbitragen), und woran hat sich der Optimierer gehalten
 * (Regeln).
 *
 * Die Reihenfolge ist nicht beliebig. Die Regeln stehen zuletzt, weil man sie
 * erst dann nachschlägt, wenn einem der Plan seltsam vorkommt – aber sie
 * stehen ÜBERHAUPT da, weil ein Plan ohne sichtbare Randbedingungen eine
 * Blackbox ist.
 */
export default function PlanningPage() {
  const t = useTranslations("planning");
  const format = useFormatter();
  const arbitrations = useArbitrationQueue();

  return (
    <section className="flex flex-col gap-6">
      <DemoNotice />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-label font-semibold uppercase tracking-[.14em] text-ink-faint">
            {format.dateTime(DRAFT.date, { weekday: "long", day: "numeric", month: "long" })} ·{" "}
            {t("draft", { version: DRAFT.version })}
          </p>
          <h1 className="mt-2 font-serif text-[40px] font-light leading-[1.1] tracking-[-.02em] text-ink-primary">
            {t("headline", {
              tours: format.number(DRAFT.tours),
              minutes: format.number(DRAFT.minutes),
            })}{" "}
            <span className="text-ink-faint">
              {t("remaining", { count: format.number(arbitrations.open.length) })}
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-start gap-2.5">
          <SecondaryButton>{t("compare", { version: DRAFT.previousVersion })}</SecondaryButton>
          <PublishAction blocked={arbitrations.blocksPublication} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.34fr_1fr]">
        <MapPanel />
        <div className="flex flex-col gap-4">
          <GainsCard />
          {/* Ohne Untertitel: auf diesem Bildschirm ist der Zusammenhang durch
              die Nachbarschaft zur Karte schon gegeben (Handoff). */}
          <ArbitrationsCard queue={arbitrations} withSubtitle={false} />
          <RulesCard />
        </div>
      </div>
    </section>
  );
}
