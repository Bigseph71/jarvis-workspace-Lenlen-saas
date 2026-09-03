import { useFormatter, useTranslations } from "next-intl";
import { ContentCard } from "@/components/ui/content-card";
import { QUALIFICATIONS } from "@/lib/demo/uebersicht";

const TEXT: Record<string, string> = {
  sage: "text-sage-deep",
  clay: "text-clay",
  clayDeep: "text-clay-deep",
};

const BAR: Record<string, string> = {
  sage: "bg-sage",
  clay: "bg-clay",
  clayDeep: "bg-clay-deep",
};

/**
 * "Couverture des qualifications".
 *
 * Vier Balken, und der Wert rechts sagt in Worten, was der Balken zeigt –
 * "1 fehlt" statt nur "88 %". Ein Prozentwert allein liesse offen, ob die
 * Lücke eine Person oder zehn betrifft, und genau das entscheidet, ob heute
 * jemand telefonieren muss.
 */
export function QualificationsCard() {
  const t = useTranslations("overview.qualifications");
  const format = useFormatter();

  return (
    <ContentCard title={t("title")}>
      <ul className="mt-4 flex flex-col gap-[15px]">
        {QUALIFICATIONS.map((q) => (
          <li key={q.id}>
            <p className="flex items-baseline justify-between gap-3 text-label-lg">
              <span className="min-w-0 truncate text-ink-secondary">{t(`items.${q.id}`)}</span>
              <span className={`flex-none font-semibold ${TEXT[q.tone]}`}>
                {t(`status.${q.id}`, { count: format.number(q.count ?? 0) })}
              </span>
            </p>
            <span
              role="progressbar"
              aria-valuenow={q.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t(`items.${q.id}`)}
              className="mt-2 block h-[5px] w-full overflow-hidden rounded-full bg-neutral-track"
            >
              <span
                className={`block h-full rounded-full ${BAR[q.tone]}`}
                style={{ width: `${q.percent}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </ContentCard>
  );
}
