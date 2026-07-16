"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  createCheckout,
  createPortal,
  getSubscription,
  listInvoices,
  type BillingLocale,
  type Invoice,
  type InvoiceStatus,
  type PlanLimits,
  type Subscription,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@len-len/api-client";

type LoadState = "loading" | "ready" | "error";

const PLAN_ORDER: readonly SubscriptionPlan[] = ["BASIC", "PRO", "ENTERPRISE"];

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  PAST_DUE: "bg-amber-100 text-amber-800",
  SUSPENDED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-200 text-gray-700",
};

const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  PAID: "bg-green-100 text-green-800",
  OPEN: "bg-blue-100 text-blue-800",
  FAILED: "bg-red-100 text-red-800",
  VOID: "bg-gray-200 text-gray-700",
};

/** Auslastungsbalken färbt sich, je näher das Plan-Limit rückt. */
function usageBarStyle(percent: number): string {
  if (percent >= 100) return "bg-red-500";
  if (percent >= 80) return "bg-amber-500";
  return "bg-gray-900";
}

function UsageRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const t = useTranslations("billing.usage");
  const locale = useLocale();
  const numberFmt = new Intl.NumberFormat(locale);

  // null = unbegrenzt: kein Balken, es gibt keine Grenze zum Anzeigen.
  if (limit === null) {
    return (
      <div className="flex items-center justify-between py-2 text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="text-gray-900">
          {numberFmt.format(used)} <span className="text-gray-400">/ {t("unlimited")}</span>
        </span>
      </div>
    );
  }

  const percent = limit > 0 ? Math.round((used / limit) * 100) : 100;

  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="text-gray-900">{t("ofLimit", { used: numberFmt.format(used), limit: numberFmt.format(limit) })}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full ${usageBarStyle(percent)}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  current,
  limits,
  busy,
  onSelect,
}: {
  plan: SubscriptionPlan;
  current: SubscriptionPlan;
  limits: PlanLimits;
  busy: boolean;
  onSelect: (plan: SubscriptionPlan) => void;
}) {
  const t = useTranslations("billing");
  const locale = useLocale();
  const numberFmt = new Intl.NumberFormat(locale);

  const isCurrent = plan === current;
  const isUpgrade = PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(current);

  return (
    <div
      className={`rounded-lg border p-4 ${
        isCurrent ? "border-gray-900 bg-white ring-1 ring-gray-900" : "border-gray-200 bg-white"
      }`}
    >
      <h3 className="font-semibold text-gray-900">{t(`plans.${plan}`)}</h3>

      <ul className="mt-3 space-y-1 text-sm text-gray-600">
        <li>{t("planFeatures.patients", { count: numberFmt.format(limits.patients) })}</li>
        <li>{t("planFeatures.caregivers", { count: numberFmt.format(limits.caregivers) })}</li>
        <li>
          {limits.vehicles === null
            ? t("planFeatures.vehiclesUnlimited")
            : t("planFeatures.vehicles", { count: numberFmt.format(limits.vehicles) })}
        </li>
        <li>{limits.ki ? t("planFeatures.kiIncluded") : t("planFeatures.kiExcluded")}</li>
      </ul>

      <button
        type="button"
        disabled={isCurrent || busy}
        onClick={() => onSelect(plan)}
        className={`mt-4 w-full rounded-md px-4 py-2 text-sm font-medium transition ${
          isCurrent
            ? "cursor-default border border-gray-300 bg-gray-100 text-gray-500"
            : "bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40"
        }`}
      >
        {isCurrent ? t("actions.current") : isUpgrade ? t("actions.upgrade") : t("actions.downgrade")}
      </button>
    </div>
  );
}

export default function BillingPage() {
  const t = useTranslations("billing");
  const locale = useLocale() as BillingLocale;
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get("checkout");

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesFailed, setInvoicesFailed] = useState(false);
  const [state, setState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState("loading");

    // Abo und Rechnungen getrennt behandeln: eine leere/fehlerhafte Historie
    // darf die Plan-Verwaltung nicht unbenutzbar machen.
    getSubscription()
      .then((sub) => {
        if (!active) return;
        setSubscription(sub);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });

    listInvoices()
      .then((res) => {
        if (!active) return;
        setInvoices(res.data);
        setInvoicesFailed(false);
      })
      .catch(() => {
        if (active) setInvoicesFailed(true);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const onSelectPlan = useCallback(
    async (plan: SubscriptionPlan) => {
      setBusy(true);
      try {
        const { url } = await createCheckout(plan, locale);
        window.location.href = url;
      } catch {
        setBusy(false);
      }
    },
    [locale],
  );

  const onOpenPortal = useCallback(async () => {
    setBusy(true);
    try {
      const { url } = await createPortal(locale);
      window.location.href = url;
    } catch {
      setBusy(false);
    }
  }, [locale]);

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function formatAmount(cents: number, currency: string): string {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(
      cents / 100,
    );
  }

  if (state === "loading") {
    return <p className="text-gray-400">{t("loading")}</p>;
  }

  if (state === "error" || !subscription) {
    return (
      <div>
        <p className="text-red-600">{t("error")}</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  const { plan, status, limits, catalog, usage, grace, portalAvailable } = subscription;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-gray-600">{t("subtitle")}</p>
        </div>
        {portalAvailable ? (
          <button
            type="button"
            onClick={() => void onOpenPortal()}
            disabled={busy}
            className="whitespace-nowrap rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
          >
            {busy ? t("actions.redirecting") : t("actions.portal")}
          </button>
        ) : null}
      </div>

      {checkoutResult === "success" ? (
        <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {t("checkout.success")}
        </p>
      ) : checkoutResult === "cancel" ? (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {t("checkout.canceled")}
        </p>
      ) : null}

      {/* Karenzzeit läuft: der Zugang besteht noch, endet aber zum Stichtag. */}
      {status === "PAST_DUE" && grace ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium text-amber-900">{t("grace.title")}</h2>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
              {grace.daysRemaining <= 1
                ? t("grace.lastDay")
                : t("grace.daysRemaining", { days: grace.daysRemaining })}
            </span>
          </div>
          <p className="mt-1 text-sm text-amber-800">
            {t("grace.message", { deadline: formatDate(grace.deadline) })}
          </p>
        </div>
      ) : null}

      {status === "SUSPENDED" ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <h2 className="font-medium text-red-900">{t("suspended.title")}</h2>
          <p className="mt-1 text-sm text-red-800">{t("suspended.message")}</p>
        </div>
      ) : null}

      {status === "CANCELED" ? (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
          <h2 className="font-medium text-gray-900">{t("canceled.title")}</h2>
          <p className="mt-1 text-sm text-gray-700">{t("canceled.message")}</p>
        </div>
      ) : null}

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{t("currentPlan")}</span>
            <span className="text-lg font-semibold text-gray-900">{t(`plans.${plan}`)}</span>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
            {t(`status.${status}`)}
          </span>
        </div>

        <h2 className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">
          {t("usage.title")}
        </h2>
        <div className="mt-1 divide-y divide-gray-100">
          <UsageRow label={t("usage.patients")} used={usage.patients} limit={limits.patients} />
          <UsageRow label={t("usage.caregivers")} used={usage.caregivers} limit={limits.caregivers} />
          <UsageRow label={t("usage.vehicles")} used={usage.vehicles} limit={limits.vehicles} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {PLAN_ORDER.map((p) => (
          <PlanCard
            key={p}
            plan={p}
            current={plan}
            // Der aktuelle Plan zeigt die tatsächlich geltenden (ggf.
            // ausgehandelten) Limits, die übrigen ihre Katalog-Limits.
            limits={p === plan ? limits : catalog[p]}
            busy={busy}
            onSelect={(next) => void onSelectPlan(next)}
          />
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold text-gray-900">{t("invoices.title")}</h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("invoices.columns.number")}</th>
                <th className="px-4 py-3 font-medium">{t("invoices.columns.date")}</th>
                <th className="px-4 py-3 font-medium">{t("invoices.columns.amount")}</th>
                <th className="px-4 py-3 font-medium">{t("invoices.columns.status")}</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">{t("invoices.columns.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoicesFailed ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-red-600">
                    {t("invoices.error")}
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    {t("invoices.empty")}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{inv.number ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(inv.issuedAt)}</td>
                    <td className="px-4 py-3 text-gray-900">{formatAmount(inv.amountDue, inv.currency)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_STYLES[inv.status]}`}
                      >
                        {t(`invoices.status.${inv.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {inv.hostedInvoiceUrl ? (
                          <a
                            href={inv.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-gray-700 underline-offset-2 hover:underline"
                          >
                            {t("invoices.view")}
                          </a>
                        ) : null}
                        {inv.invoicePdfUrl ? (
                          <a
                            href={inv.invoicePdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-gray-700 underline-offset-2 hover:underline"
                          >
                            {t("invoices.pdf")}
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
