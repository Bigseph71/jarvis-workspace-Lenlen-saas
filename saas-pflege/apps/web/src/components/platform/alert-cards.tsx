import { useFormatter, useTranslations } from "next-intl";
import type { AdminDashboard } from "@len-len/api-client";
import { Link } from "@/i18n/navigation";

type Alerts = AdminDashboard["alerts"];

/**
 * Die beiden Warnkarten am Fuss der Plattform-Übersicht.
 *
 * Ihr Leerzustand ist der eigentliche Entwurfsgedanke: er wiederholt nicht den
 * Titel im Negativ ("keine Warnungen"), sondern nennt die NÄCHSTE nützliche
 * Angabe – wann die nächste Testphase endet. "Nichts zu tun" und "nichts zu
 * tun, und das Nächste kommt am 12." sind zwei verschiedene Auskünfte, und nur
 * die zweite erspart das Nachsehen.
 *
 * `nextTrialEnd` wird auf der Seite aus den echten Testphasen berechnet, nicht
 * erfunden. Fehlt sie, bleibt die kürzere Fassung stehen.
 */
export function AlertCards({
  alerts,
  nextTrialEnd,
}: {
  alerts: Alerts;
  nextTrialEnd: { name: string; endsAt: string } | null;
}) {
  const t = useTranslations("admin.alerts");
  const format = useFormatter();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section
        data-testid="alert-trials"
        className="rounded-kpi border border-soft bg-surface p-6"
      >
        <h2 className="font-serif text-[19px] font-normal text-ink-primary">
          {alerts.trialsEndingSoon.length === 0
            ? t("noTrialsTitle")
            : t("trialsTitle", { count: format.number(alerts.trialsEndingSoon.length) })}
        </h2>

        {alerts.trialsEndingSoon.length === 0 ? (
          <p className="mt-2 text-label-lg text-ink-tertiary">
            {nextTrialEnd
              ? t("nextTrial", {
                  name: nextTrialEnd.name,
                  date: format.dateTime(new Date(nextTrialEnd.endsAt), {
                    day: "numeric",
                    month: "long",
                  }),
                })
              : t("noTrialsAtAll")}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5 text-label-lg text-ink-secondary">
            {alerts.trialsEndingSoon.map((org) => (
              <li key={org.id}>
                <Link
                  href={`/admin/organizations/${org.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {org.name}
                </Link>
                {org.trialEndsAt
                  ? ` · ${format.dateTime(new Date(org.trialEndsAt), { day: "numeric", month: "long" })}`
                  : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        data-testid="alert-payments"
        className="rounded-kpi border border-clay-wash-border bg-clay-wash p-6"
      >
        <h2 className="font-serif text-[19px] font-normal text-ink-primary">
          {alerts.paymentFailures.length === 0
            ? t("noPaymentsTitle")
            : t("paymentsTitle", { count: format.number(alerts.paymentFailures.length) })}
        </h2>

        {alerts.paymentFailures.length === 0 ? (
          <p className="mt-2 text-label-lg text-clay-soft">{t("noPaymentsBody")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5 text-label-lg text-clay-deep">
            {alerts.paymentFailures.map((org) => (
              <li key={org.id}>
                <Link
                  href={`/admin/organizations/${org.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {org.name}
                </Link>
                {org.pastDueSince
                  ? ` · ${format.dateTime(new Date(org.pastDueSince), { day: "numeric", month: "long" })}`
                  : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
