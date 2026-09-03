import { useFormatter, useTranslations } from "next-intl";
import type { AdminOrganizationRow, SubscriptionStatus } from "@len-len/api-client";
import { Link } from "@/i18n/navigation";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { initialsFromName } from "@/lib/display-name";

const TONE: Record<SubscriptionStatus, PillTone> = {
  ACTIVE: "positive",
  TRIAL: "attention",
  PAST_DUE: "attention",
  SUSPENDED: "attention",
  CANCELED: "neutral",
};

/**
 * Die Organisationen der Plattform.
 *
 * Die Spalten weichen vom Entwurf ab, und zwar dort, wo er Daten zeigt, die es
 * nicht gibt:
 *
 *   Entwurf "Ville"    -> `country`. Der Datensatz führt das LAND, keine Stadt.
 *   Entwurf "Mensuel"  -> `subscriptionPlan`. Ein Betrag JE Organisation
 *                         liegt bei Stripe und kommt über keinen unserer
 *                         Endpunkte; der Plan ist die nächstbeste echte
 *                         Handelsangabe.
 *   Entwurf "Sièges"   -> Zahl der Fachkräfte. Das IST die Abrechnungsgrösse,
 *                         der Entwurf sagt es selbst: "Facturation à la
 *                         Fachkraft active".
 *
 * Eine erfundene Stadt und ein erfundener Betrag hätten hier besser ausgesehen
 * und wären in einer Abrechnungsansicht das Schlechteste von allem.
 */
export function OrganizationsTable({ rows }: { rows: AdminOrganizationRow[] }) {
  const t = useTranslations("admin.table");
  const ts = useTranslations("admin.status");
  const format = useFormatter();

  return (
    <section className="rounded-card border border-soft bg-white px-[26px] pb-2.5 pt-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-[24px] font-normal text-ink-primary">{t("title")}</h2>
        <Link
          href="/admin/organizations"
          className="text-label-lg text-ink-secondary underline-offset-2 transition-colors duration-120 hover:text-ink-body hover:underline"
        >
          {t("openList")}
        </Link>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-soft text-micro font-semibold uppercase tracking-[.12em] text-ink-faint">
              <th scope="col" className="px-1 py-3.5 font-semibold">{t("organisation")}</th>
              <th scope="col" className="px-1 py-3.5 font-semibold">{t("country")}</th>
              <th scope="col" className="px-1 py-3.5 font-semibold">{t("seats")}</th>
              <th scope="col" className="px-1 py-3.5 font-semibold">{t("plan")}</th>
              <th scope="col" className="px-1 py-3.5 font-semibold">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-1 py-10 text-center text-row text-ink-muted">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              rows.map((org) => (
                <tr
                  key={org.id}
                  className="border-b border-hairline text-row transition-colors duration-120 hover:bg-surface"
                >
                  <td className="px-1 py-[18px]">
                    <Link
                      href={`/admin/organizations/${org.id}`}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-sage-wash text-micro font-bold text-sage-deep"
                      >
                        {initialsFromName(org.name)}
                      </span>
                      <span className="truncate font-semibold text-ink-primary">{org.name}</span>
                    </Link>
                  </td>
                  <td className="px-1 py-[18px] text-ink-secondary">{org.country}</td>
                  <td className="px-1 py-[18px] font-serif text-[17px] text-ink-primary">
                    {format.number(org._count.caregivers)}
                  </td>
                  <td className="px-1 py-[18px] text-ink-secondary">{org.subscriptionPlan}</td>
                  <td className="px-1 py-[18px]">
                    <StatusPill tone={TONE[org.subscriptionStatus]}>
                      {ts(org.subscriptionStatus)}
                    </StatusPill>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Link
        href="/admin/audit-logs"
        className="mt-1 inline-block px-1 py-4 text-label-lg font-medium text-clay-deep transition-colors duration-120 hover:text-clay-hover"
      >
        {t("openAuditLog")} →
      </Link>
    </section>
  );
}
