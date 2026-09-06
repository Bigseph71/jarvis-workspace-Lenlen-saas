"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Caregiver, Qualification } from "@len-len/api-client";
import { ContentCard } from "@/components/ui/content-card";

/**
 * "Qualifikationen im Team" – abgeleitet aus GET /caregivers.
 *
 * DER TITEL HAT SICH GEÄNDERT, und das ist keine Kosmetik. Der Entwurf zeigte
 * eine "Abdeckung der Qualifikationen" mit Kategorien wie "Grundpflege",
 * "Führerschein" oder "Arabisch" – Fähigkeiten, die das Datenmodell nirgends
 * führt. Eine Fachkraft trägt genau EIN Merkmal, ihre Qualifikationsstufe.
 *
 * Aus diesen Stufen lässt sich die Zusammensetzung des Teams zeigen, und das
 * ist eine ehrliche Aussage. Eine "Abdeckung" wäre es nicht: sie hiesse, der
 * Bedarf sei bekannt und ihm gegenübergestellt – nichts davon existiert. Den
 * alten Titel über den neuen Balken zu lassen, hätte einen Anteil als Deckung
 * gelesen werden lassen, und 72 % klingt nach einer Lücke, wo nur eine
 * Verteilung steht.
 */

const ORDER: readonly Qualification[] = [
  "PFLEGEFACHKRAFT",
  "PFLEGEHILFSKRAFT",
  "BETREUUNGSKRAFT",
  "AUSZUBILDENDE",
];

/** Nur die Fachkraft-Stufe ist regulatorisch bindend (Regel métier 4). */
const TONE: Record<Qualification, { text: string; bar: string }> = {
  PFLEGEFACHKRAFT: { text: "text-sage-deep", bar: "bg-sage" },
  PFLEGEHILFSKRAFT: { text: "text-ink-secondary", bar: "bg-clay-dim" },
  BETREUUNGSKRAFT: { text: "text-ink-secondary", bar: "bg-clay-dim" },
  AUSZUBILDENDE: { text: "text-ink-secondary", bar: "bg-neutral-dot" },
};

export interface QualificationShare {
  qualification: Qualification;
  count: number;
  percent: number;
}

/**
 * Anteile je Qualifikationsstufe unter den AKTIVEN Fachkräften.
 *
 * Ausgeschiedene zählen nicht mit: die Karte beschreibt, wer heute fahren
 * kann. Als eigene Funktion, damit sie ohne Oberfläche prüfbar ist.
 */
export function qualificationShares(caregivers: readonly Caregiver[]): QualificationShare[] {
  const active = caregivers.filter((caregiver) => caregiver.isActive);
  return ORDER.map((qualification) => {
    const count = active.filter((c) => c.qualification === qualification).length;
    return {
      qualification,
      count,
      // Ohne aktive Fachkraft ist der Anteil 0 und nicht NaN – eine Division
      // durch null erzeugte sonst einen Balken mit der Breite "NaN%", den der
      // Browser stillschweigend als 0 zeichnet.
      percent: active.length === 0 ? 0 : Math.round((count / active.length) * 100),
    };
  });
}

export function QualificationsCard({
  caregivers,
  pending,
}: {
  caregivers: Caregiver[] | null;
  pending: boolean;
}) {
  const t = useTranslations("overview.qualifications");
  const format = useFormatter();

  if (pending) {
    return (
      <ContentCard title={t("title")}>
        <p className="mt-4 text-meta text-ink-faint">{t("loading")}</p>
      </ContentCard>
    );
  }

  if (caregivers === null) {
    return (
      <ContentCard title={t("title")}>
        <p className="mt-4 text-meta text-ink-muted">{t("unavailable")}</p>
      </ContentCard>
    );
  }

  const shares = qualificationShares(caregivers);
  const active = shares.reduce((sum, share) => sum + share.count, 0);

  return (
    <ContentCard title={t("title")} subtitle={t("subtitle", { count: format.number(active) })}>
      {active === 0 ? (
        <p className="mt-4 text-meta text-ink-muted">{t("empty")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-[15px]">
          {shares.map((share) => (
            <li key={share.qualification}>
              <p className="flex items-baseline justify-between gap-3 text-label-lg">
                <span className="min-w-0 truncate text-ink-secondary">
                  {t(`items.${share.qualification}`)}
                </span>
                <span className={`flex-none font-semibold ${TONE[share.qualification].text}`}>
                  {t("share", {
                    count: format.number(share.count),
                    percent: format.number(share.percent),
                  })}
                </span>
              </p>
              <span
                role="progressbar"
                aria-valuenow={share.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t(`items.${share.qualification}`)}
                className="mt-2 block h-[5px] w-full overflow-hidden rounded-full bg-neutral-track"
              >
                <span
                  className={`block h-full rounded-full ${TONE[share.qualification].bar}`}
                  style={{ width: `${share.percent}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </ContentCard>
  );
}
