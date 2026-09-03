import { useTranslations } from "next-intl";
import { ContentCard } from "@/components/ui/content-card";
import { GAINS, type GainTone } from "@/lib/demo/planung";

const VALUE_TONE: Record<GainTone, string> = {
  forest: "text-forest",
  sageDeep: "text-sage-deep",
  clayDeep: "text-clay-deep",
};

/**
 * "Ce que l'optimisation a gagné".
 *
 * Vier Kacheln, und die vierte ist der Grund, warum diese Karte glaubwürdig
 * ist: "9 / 11 ausgeglichen" steht in clay, nicht in grün. Zwei Touren sind es
 * eben nicht. Eine Bilanz, die nur ihre guten Zahlen einfärbt, liest sich als
 * Werbung, und die Koordination hört auf, ihr zu glauben.
 */
export function GainsCard() {
  const t = useTranslations("planning.gains");

  return (
    <ContentCard title={t("title")} subtitle={t("subtitle")}>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GAINS.map((gain) => (
          <div
            key={gain.id}
            className="rounded-tile border border-soft bg-surface px-[18px] py-4"
          >
            <p className="text-meta text-ink-tertiary">{t(`items.${gain.id}.label`)}</p>
            <p className={`mt-1 font-serif text-[26px] leading-tight ${VALUE_TONE[gain.tone]}`}>
              {t(`items.${gain.id}.value`)}
            </p>
          </div>
        ))}
      </div>
    </ContentCard>
  );
}
