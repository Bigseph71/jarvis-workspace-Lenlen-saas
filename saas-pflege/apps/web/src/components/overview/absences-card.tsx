import { useFormatter, useTranslations } from "next-intl";
import { ContentCard } from "@/components/ui/content-card";
import { initialsFromName } from "@/lib/display-name";
import { ABSENCES } from "@/lib/demo/uebersicht";

/**
 * "Absences déclarées".
 *
 * Der Untertitel ist die eigentliche Aussage: die Auswirkung STEHT SCHON in den
 * Touren. Die Liste meldet also keine offene Aufgabe, sie belegt, dass etwas
 * bereits berücksichtigt wurde – bis auf die Zeilen, deren Deckungsstatus das
 * Gegenteil sagt.
 */
export function AbsencesCard() {
  const t = useTranslations("overview.absences");
  const format = useFormatter();

  return (
    <ContentCard title={t("title")} subtitle={t("subtitle")}>
      <ul className="mt-4 flex flex-col gap-3.5">
        {ABSENCES.map((absence) => (
          <li key={absence.id} className="flex items-center gap-3.5">
            <span
              aria-hidden="true"
              className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-avatar bg-sage-wash text-micro font-bold text-sage-deep"
            >
              {initialsFromName(absence.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label-lg font-semibold text-ink-primary">
                {absence.name}
              </span>
              <span className="block truncate text-meta text-ink-muted">
                {t(`reasons.${absence.reason}`)}
              </span>
            </span>
            <span className="flex-none text-right text-meta font-medium text-ink-secondary">
              {t(`coverage.${absence.coverage}`, {
                count: format.number(absence.count ?? 0),
              })}
            </span>
          </li>
        ))}
      </ul>
    </ContentCard>
  );
}
