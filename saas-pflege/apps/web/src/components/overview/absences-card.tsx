"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Absence } from "@len-len/api-client";
import { ContentCard } from "@/components/ui/content-card";
import { initialsFromName } from "@/lib/display-name";

/**
 * "Abwesenheiten heute" – angebunden an GET /hr/absences.
 *
 * Abgefragt wird die ÜBERSCHNEIDUNG mit dem heutigen Tag, nicht der Beginn:
 * eine Krankmeldung von vorgestern läuft weiter und gehört auf den Bildschirm.
 *
 * Was der Entwurf zusätzlich zeigte, fehlt bewusst: der Deckungsstatus
 * ("umbesetzt", "abgedeckt", "zu ersetzen"). Ihn gibt es im Datenmodell nicht,
 * und er wäre die heikelste Angabe der ganzen Karte – "abgedeckt" zu lesen, wo
 * niemand eingeteilt ist, kostet einen Patientenbesuch. Stattdessen steht der
 * Zustand des Antrags, den es wirklich gibt.
 *
 * Die Personalverwaltung sieht diese Karte ebenfalls: /hr/absences steht
 * ihrem Wächter offen (hr.routes: canRead).
 */

/** Tönung nach Antragszustand. Nur Genehmigtes wirkt auf die Planung. */
const STATUS_TONE: Record<string, string> = {
  APPROVED: "text-sage-deep",
  REQUESTED: "text-clay-deep",
  REJECTED: "text-ink-muted",
  CANCELED: "text-ink-muted",
};

export function AbsencesCard({
  absences,
  pending,
}: {
  absences: Absence[] | null;
  pending: boolean;
}) {
  const t = useTranslations("overview.absences");
  const format = useFormatter();

  return (
    <ContentCard title={t("title")} subtitle={t("subtitle")}>
      {pending ? (
        <p className="mt-4 text-meta text-ink-faint">{t("loading")}</p>
      ) : absences === null ? (
        <p className="mt-4 text-meta text-ink-muted">{t("unavailable")}</p>
      ) : absences.length === 0 ? (
        <p className="mt-4 text-meta text-ink-muted">{t("empty")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3.5">
          {absences.map((absence) => {
            const name = absence.caregiver
              ? `${absence.caregiver.firstName} ${absence.caregiver.lastName}`
              : t("unknownCaregiver");
            return (
              <li key={absence.id} className="flex items-center gap-3.5">
                <span
                  aria-hidden="true"
                  className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-avatar bg-sage-wash text-micro font-bold text-sage-deep"
                >
                  {absence.caregiver ? initialsFromName(name) : "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label-lg font-semibold text-ink-primary">
                    {name}
                  </span>
                  <span className="block truncate text-meta text-ink-muted">
                    {t(`types.${absence.type}`)} ·{" "}
                    {t("until", {
                      date: format.dateTime(new Date(absence.endDate), {
                        day: "2-digit",
                        month: "2-digit",
                      }),
                    })}
                  </span>
                </span>
                <span
                  className={`flex-none text-right text-meta font-medium ${
                    STATUS_TONE[absence.status] ?? "text-ink-secondary"
                  }`}
                >
                  {t(`status.${absence.status}`)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </ContentCard>
  );
}
