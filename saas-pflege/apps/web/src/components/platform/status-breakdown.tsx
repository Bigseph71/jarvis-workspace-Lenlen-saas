import { useFormatter, useTranslations } from "next-intl";
import type { SubscriptionStatus } from "@len-len/api-client";
import { ContentCard } from "@/components/ui/content-card";
import { Link } from "@/i18n/navigation";

/** Reihenfolge und Farbe je Status (Handoff § Carte « Par statut »). */
const ROWS: { status: SubscriptionStatus; dot: string; bar: string }[] = [
  { status: "ACTIVE", dot: "bg-sage", bar: "bg-sage" },
  { status: "TRIAL", dot: "bg-sand", bar: "bg-sand" },
  { status: "PAST_DUE", dot: "bg-clay", bar: "bg-clay" },
  { status: "SUSPENDED", dot: "bg-clay-dim", bar: "bg-clay-dim" },
  { status: "CANCELED", dot: "bg-neutral-dot", bar: "bg-neutral-dot" },
];

/**
 * Aufschlüsselung nach Abo-Status.
 *
 * Ersetzt die frühere Reihe farbiger Pastillen. Die gab einem Zustand mit 0
 * dasselbe optische Gewicht wie einem mit 4 – eine Verwaltungsansicht soll
 * aber auf einen Blick zeigen, wo die Masse liegt. Der Balken tut das, die
 * Pastille konnte es nicht.
 *
 * Jede Zeile bleibt ein Link auf die gefilterte Liste: die Zahl ist der
 * Einstieg in die Arbeit, nicht nur eine Anzeige.
 */
export function StatusBreakdown({
  byStatus,
  total,
}: {
  byStatus: Record<SubscriptionStatus, number>;
  total: number;
}) {
  const t = useTranslations("admin");
  const format = useFormatter();

  return (
    <ContentCard title={t("byStatusTitle")}>
      <ul className="mt-4 flex flex-col gap-[13px]">
        {ROWS.map((row) => {
          const count = byStatus[row.status] ?? 0;
          // Bei 0 Organisationen keine Division: die Karte erscheint auch auf
          // einer frisch aufgesetzten Plattform.
          const percent = total > 0 ? Math.round((count / total) * 100) : 0;

          return (
            <li key={row.status}>
              <Link
                href={`/admin/organizations?status=${row.status}`}
                data-testid={`status-${row.status}`}
                className="flex items-center gap-3.5 rounded-field px-1 py-1 transition-colors duration-120 hover:bg-surface"
              >
                <span aria-hidden="true" className={`h-2 w-2 flex-none rounded-full ${row.dot}`} />
                <span className="w-[110px] flex-none truncate text-row text-ink-secondary">
                  {t(`status.${row.status}`)}
                </span>
                <span
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t(`status.${row.status}`)}
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline"
                >
                  <span
                    className={`block h-full rounded-full ${row.bar}`}
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className="w-[26px] flex-none text-right font-serif text-[18px] text-ink-primary">
                  {format.number(count)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </ContentCard>
  );
}
