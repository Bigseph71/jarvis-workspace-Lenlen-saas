import { useFormatter, useTranslations } from "next-intl";
import {
  REVENUE_AREA_FILL,
  REVENUE_AREA_PATH,
  REVENUE_MONTHS,
  REVENUE_TREND_PERCENT,
} from "@/lib/demo/plattform";

/**
 * "Revenu récurrent" – eine der drei dunklen Flächen der ganzen Anwendung.
 *
 * Der aktuelle Betrag ist ECHT (aus `adminDashboard`). Die Verlaufskurve
 * darunter ist es nicht: es gibt keinen Endpunkt für die letzten sechs Monate.
 * Der Hinweis steht deshalb an der Kurve und nicht über dem Bildschirm – der
 * Rest der Seite ist echt, und das soll man ihr ansehen.
 *
 * Fehlt der Betrag (Stripe nicht erreichbar), steht hier KEINE 0 €. Ein
 * nicht erreichbarer Anbieter ist kein Umsatz von null, und der Unterschied
 * entscheidet, ob jemand nachsieht.
 */
export function RevenueCard({
  amountCents,
  currency,
  available,
  truncated,
}: {
  amountCents: number;
  currency: string;
  available: boolean;
  truncated: boolean;
}) {
  const t = useTranslations("admin.revenue");
  const format = useFormatter();

  return (
    <section className="relative overflow-hidden rounded-card bg-forest p-[26px]">
      {/* Halo: rein dekorativ, gibt der Fläche Tiefe ohne ein zweites Element
          mit Bedeutung. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-[60px] -top-20 h-[250px] w-[250px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(211,161,131,.26), transparent 70%)",
        }}
      />

      <div className="relative">
        <h2 className="font-serif text-[23px] font-normal text-on-forest-primary">{t("title")}</h2>
        <p className="mt-1 text-label text-on-forest-faint">{t("subtitle")}</p>

        <div className="mt-4 flex flex-wrap items-baseline gap-3">
          {available ? (
            <p className="font-serif text-[44px] leading-none text-on-forest-primary">
              {truncated ? "≥ " : ""}
              {format.number(amountCents / 100, {
                style: "currency",
                currency: currency.toUpperCase(),
                maximumFractionDigits: 0,
              })}
            </p>
          ) : (
            <p className="text-body font-medium text-sand">{t("unavailable")}</p>
          )}
          {available ? (
            <p className="text-label text-sand-deep">
              {t("trend", {
                percent: format.number(REVENUE_TREND_PERCENT, { maximumFractionDigits: 1 }),
              })}
            </p>
          ) : null}
        </div>

        <svg
          viewBox="0 0 320 96"
          preserveAspectRatio="none"
          role="img"
          aria-label={t("chartAlt")}
          className="mt-5 h-24 w-full"
        >
          <defs>
            <linearGradient id="ll-revenue-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D3A183" stopOpacity=".5" />
              <stop offset="100%" stopColor="#D3A183" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={REVENUE_AREA_FILL} fill="url(#ll-revenue-area)" />
          <path
            d={REVENUE_AREA_PATH}
            stroke="#E8BFA0"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={1400}
            className="ll-draw"
            style={{ strokeDashoffset: 1400, animationDuration: "2.2s" }}
          />
          <circle cx="320" cy="16" r="4" fill="#FBF8F0" />
        </svg>

        <ul className="mt-2 flex justify-between text-micro text-on-forest-dim">
          {REVENUE_MONTHS.map((month) => (
            <li key={month}>
              {format.dateTime(new Date(Date.UTC(2026, month, 1)), { month: "short" })}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-micro text-on-forest-dim">{t("historyDemo")}</p>
      </div>
    </section>
  );
}
