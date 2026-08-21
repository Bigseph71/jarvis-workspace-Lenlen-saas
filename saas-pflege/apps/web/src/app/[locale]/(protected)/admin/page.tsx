"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatDateTime } from "@/lib/datetime";
import { adminDashboard, type AdminDashboard } from "@len-len/api-client";

type LoadState = "loading" | "ready" | "error";

const STATUS_ORDER = ["ACTIVE", "TRIAL", "PAST_DUE", "SUSPENDED", "CANCELED"] as const;

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  TRIAL: "bg-blue-100 text-blue-800",
  PAST_DUE: "bg-amber-100 text-amber-800",
  SUSPENDED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-100 text-gray-600",
};

function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(
    cents / 100,
  );
}

export default function AdminDashboardPage() {
  const t = useTranslations("admin.dashboard");
  const ts = useTranslations("admin.status");
  const locale = useLocale();

  const [data, setData] = useState<AdminDashboard | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let active = true;
    adminDashboard()
      .then((res) => {
        if (!active) return;
        setData(res);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") return <p className="text-sm text-gray-500">{t("loading")}</p>;
  if (state === "error" || !data) return <p className="text-sm text-red-600">{t("error")}</p>;

  const { organizations, revenue, growth, alerts } = data;

  return (
    <div className="space-y-6">
      {/* Chiffres-clés */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">{t("totalOrgs")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{organizations.total}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">{t("mrr")}</p>
          {revenue.available ? (
            <>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {revenue.truncated ? "≥ " : ""}
                {formatMoney(revenue.amountCents, revenue.currency, locale)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {t("mrrSubscriptions", { count: revenue.subscriptions })}
              </p>
            </>
          ) : (
            // Kein "0 €": ein nicht erreichbarer Anbieter ist kein Umsatz von
            // null, und die Unterscheidung entscheidet, ob jemand nachsieht.
            <p className="mt-1 text-sm text-amber-700">{t("mrrUnavailable")}</p>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">{t("new7")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{growth.last7Days}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">{t("new30")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{growth.last30Days}</p>
        </div>
      </div>

      {/* Répartition par statut */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-900">{t("byStatus")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_ORDER.map((status) => (
            <Link
              key={status}
              href={`/admin/organizations?status=${status}`}
              data-testid={`status-${status}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition hover:opacity-80 ${STATUS_STYLES[status]}`}
            >
              {ts(status)} · {organizations.byStatus[status] ?? 0}
            </Link>
          ))}
        </div>
      </div>

      {/* Alertes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div
          data-testid="alert-trials"
          className="rounded-lg border border-blue-200 bg-blue-50 p-4"
        >
          <p className="text-sm font-medium text-blue-900">
            {t("trialsEnding", { count: alerts.trialsEndingSoon.length })}
          </p>
          {alerts.trialsEndingSoon.length === 0 ? (
            <p className="mt-2 text-sm text-blue-800">{t("noTrials")}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-blue-900">
              {alerts.trialsEndingSoon.map((org) => (
                <li key={org.id}>
                  <Link href={`/admin/organizations/${org.id}`} className="underline-offset-2 hover:underline">
                    {org.name}
                  </Link>
                  {org.trialEndsAt ? ` · ${formatDateTime(org.trialEndsAt, locale)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          data-testid="alert-payments"
          className="rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm font-medium text-red-900">
            {t("paymentFailures", { count: alerts.paymentFailures.length })}
          </p>
          {alerts.paymentFailures.length === 0 ? (
            <p className="mt-2 text-sm text-red-800">{t("noPaymentFailures")}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-red-900">
              {alerts.paymentFailures.map((org) => (
                <li key={org.id}>
                  <Link href={`/admin/organizations/${org.id}`} className="underline-offset-2 hover:underline">
                    {org.name}
                  </Link>
                  {org.pastDueSince ? ` · ${formatDateTime(org.pastDueSince, locale)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
