import { useTranslations } from "next-intl";
import { ContentCard } from "@/components/ui/content-card";
import { RULES } from "@/lib/demo/planung";

/**
 * "Règles appliquées".
 *
 * Sechs Marken, die benennen, welche Randbedingungen der Optimierer eingehalten
 * hat. Der Handoff hält ausdrücklich fest, warum sie nicht weggelassen werden
 * dürfen: ohne sie ist der Plan eine Blackbox. Und ein Plan, dem man nicht
 * ansieht, warum er so aussieht, wird von der Koordination überstimmt, statt
 * befolgt zu werden – womit die Optimierung ihren Zweck verliert.
 */
export function RulesCard() {
  const t = useTranslations("planning.rules");

  return (
    <ContentCard title={t("title")} subtitle={t("subtitle")}>
      <ul className="mt-4 flex flex-wrap gap-2">
        {RULES.map((rule) => (
          <li
            key={rule}
            className="rounded-full border border-border-default bg-inset px-3.5 py-2 text-meta font-medium text-ink-body"
          >
            {t(`items.${rule}`)}
          </li>
        ))}
      </ul>
    </ContentCard>
  );
}
