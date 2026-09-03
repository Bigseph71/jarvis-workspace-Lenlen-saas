"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  adminDashboard,
  adminListOrganizations,
  type AdminDashboard,
  type AdminOrganizationRow,
} from "@len-len/api-client";
import { PlatformKpi } from "@/components/platform/platform-kpi";
import { StatusBreakdown } from "@/components/platform/status-breakdown";
import { RevenueCard } from "@/components/platform/revenue-card";
import { OrganizationsTable } from "@/components/platform/organizations-table";
import { AlertCards } from "@/components/platform/alert-cards";

type LoadState = "loading" | "ready" | "error";

/** Nächste endende Testphase, aus den echten Tenants berechnet. */
function nextTrial(rows: AdminOrganizationRow[]): { name: string; endsAt: string } | null {
  const upcoming = rows
    .filter((row): row is AdminOrganizationRow & { trialEndsAt: string } => row.trialEndsAt !== null)
    .sort((a, b) => a.trialEndsAt.localeCompare(b.trialEndsAt));
  const first = upcoming[0];
  return first ? { name: first.name, endsAt: first.trialEndsAt } : null;
}

/**
 * Plattform-Verwaltung, Übersicht.
 *
 * Bis auf die Umsatzkurve steht hier ALLES auf echten Daten: Kennzahlen,
 * Aufschlüsselung, Umsatz, Wachstum, Warnungen und die Organisationsliste
 * kommen aus dem Backend. Der Bildschirm trägt deshalb auch keinen
 * Beispiel-Hinweis über der Seite, sondern nur einen an der Kurve.
 *
 * Zwei Abfragen statt einer: die Kennzahlen und die Liste sind getrennte
 * Endpunkte. Sie laufen NEBENEINANDER, nicht nacheinander – bei der Latenz
 * dieser Datenbank wäre die Reihenfolge sonst direkt zu sehen.
 */
export default function PlatformOverviewPage() {
  const t = useTranslations("admin");
  const format = useFormatter();

  const [data, setData] = useState<AdminDashboard | null>(null);
  const [organizations, setOrganizations] = useState<AdminOrganizationRow[]>([]);
  const [trials, setTrials] = useState<AdminOrganizationRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let active = true;

    Promise.all([
      adminDashboard(),
      adminListOrganizations({ pageSize: 5 }),
      // Nur die Testphasen, für die nächste Fälligkeit im Leerzustand der
      // Warnkarte. Wenige Zeilen, eigene Abfrage statt einer Sortierung, die
      // der Endpunkt nicht anbietet.
      adminListOrganizations({ status: "TRIAL", pageSize: 50 }),
    ])
      .then(([dashboard, list, trialList]) => {
        if (!active) return;
        setData(dashboard);
        setOrganizations(list.data);
        setTrials(trialList.data);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });

    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") return <p className="text-row text-ink-muted">{t("dashboard.loading")}</p>;
  if (state === "error" || !data) {
    return <p className="text-row text-clay-deep">{t("dashboard.error")}</p>;
  }

  const { organizations: orgs, revenue, growth, alerts } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PlatformKpi
          label={t("dashboard.totalOrgs")}
          value={format.number(orgs.total)}
          hint={t("dashboard.orgsHint", {
            active: format.number(orgs.byStatus.ACTIVE ?? 0),
            trial: format.number(orgs.byStatus.TRIAL ?? 0),
          })}
        />

        <PlatformKpi
          label={t("dashboard.mrr")}
          value={
            revenue.available ? (
              <>
                {revenue.truncated ? "≥ " : ""}
                {format.number(revenue.amountCents / 100, {
                  style: "currency",
                  currency: revenue.currency.toUpperCase(),
                  maximumFractionDigits: 0,
                })}
              </>
            ) : (
              // Kein "0 €": ein nicht erreichbarer Anbieter ist kein Umsatz von
              // null, und die Unterscheidung entscheidet, ob jemand nachsieht.
              <span className="text-body text-clay-deep">{t("dashboard.mrrUnavailable")}</span>
            )
          }
          hint={
            revenue.available
              ? t("dashboard.mrrSubscriptions", { count: format.number(revenue.subscriptions) })
              : undefined
          }
          tone="positive"
        />

        <PlatformKpi
          label={t("dashboard.new7")}
          value={format.number(growth.last7Days)}
          hint={growth.last7Days === 0 ? t("dashboard.noSignups") : undefined}
        />

        <PlatformKpi
          label={t("dashboard.new30")}
          value={format.number(growth.last30Days)}
          tone="positive"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <StatusBreakdown byStatus={orgs.byStatus} total={orgs.total} />
        <RevenueCard
          amountCents={revenue.amountCents}
          currency={revenue.currency}
          available={revenue.available}
          truncated={revenue.truncated}
        />
      </div>

      <OrganizationsTable rows={organizations} />

      <AlertCards alerts={alerts} nextTrialEnd={nextTrial(trials)} />
    </div>
  );
}
