"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { formatDate, formatDateTime } from "@/lib/datetime";
import {
  ApiError,
  adminDeleteOrganization,
  adminGetOrganization,
  adminUpdateOrganization,
  type AdminOrganizationDetail,
  type SubscriptionPlan,
} from "@len-len/api-client";

type LoadState = "loading" | "ready" | "error";

const PLANS: SubscriptionPlan[] = ["BASIC", "PRO", "ENTERPRISE"];
const MIN_REASON = 10;

const fieldClass =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";
const buttonClass =
  "rounded-md border border-gray-300 px-3 py-2 text-sm transition hover:bg-gray-100 disabled:opacity-40";

/** Date du jour + n jours, au format attendu par <input type="date">. */
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function AdminOrganizationDetailPage() {
  const t = useTranslations("admin.detail");
  const ts = useTranslations("admin.status");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [org, setOrg] = useState<AdminOrganizationDetail | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [plan, setPlan] = useState<SubscriptionPlan | "">("");
  const [trialUntil, setTrialUntil] = useState(inDays(14));
  const [reason, setReason] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** Suppression faite, mais l'abonnement n'a pas pu être résilié. */
  const [billingWarning, setBillingWarning] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    setState("loading");
    adminGetOrganization(id)
      .then((res) => {
        if (!active) return;
        setOrg(res);
        setPlan(res.subscriptionPlan);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => load(), [load]);

  /** Exécute une action puis recharge : l'écran doit refléter la base, pas un état deviné. */
  async function run(action: () => Promise<unknown>, successKey: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(t(successKey));
      load();
    } catch (err) {
      if (err instanceof ApiError && err.message) setError(err.message);
      else setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <p className="text-sm text-gray-500">{t("loading")}</p>;
  if (state === "error" || !org) return <p className="text-sm text-red-600">{t("error")}</p>;

  const deleted = org.deletedAt !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{org.name}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {ts(org.subscriptionStatus)} · {org.subscriptionPlan} · {t("since", { date: formatDate(new Date(org.createdAt), locale) })}
          </p>
        </div>
        <Link href="/admin/organizations" className="text-sm text-gray-600 underline-offset-2 hover:underline">
          {t("back")}
        </Link>
      </div>

      {deleted ? (
        <div data-testid="deleted-banner" className="rounded-lg border border-gray-300 bg-gray-100 p-4">
          <p className="text-sm font-medium text-gray-900">
            {t("deletedOn", { date: formatDateTime(org.deletedAt!, locale) })}
          </p>
          <p className="mt-1 text-sm text-gray-700">{org.deletionReason}</p>
        </div>
      ) : null}

      {/* L'organisation est supprimée mais l'abonnement court toujours : le
          client continue d'être prélevé tant que personne n'intervient. */}
      {billingWarning ? (
        <div
          data-testid="billing-warning"
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4"
        >
          <p className="text-sm font-medium text-red-900">{t("billing.cancelFailedTitle")}</p>
          <p className="mt-1 text-sm text-red-800">{t("billing.cancelFailedBody")}</p>
          <p className="mt-2 font-mono text-xs text-red-700">{billingWarning}</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      ) : null}

      {/* Chiffres du tenant */}
      <div className="grid gap-4 sm:grid-cols-4">
        {(["users", "patients", "caregivers", "visits"] as const).map((key) => (
          <div key={key} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">{t(`counts.${key}`)}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{org._count[key]}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      {!deleted ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-900">{t("actions.title")}</p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="plan" className="block text-xs font-medium text-gray-600">
                {t("actions.plan")}
              </label>
              <select
                id="plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}
                className={`${fieldClass} mt-1`}
              >
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={busy || plan === org.subscriptionPlan || plan === ""}
              onClick={() => void run(() => adminUpdateOrganization(id, { plan: plan as SubscriptionPlan }), "actions.planDone")}
              className={buttonClass}
            >
              {t("actions.changePlan")}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="trial" className="block text-xs font-medium text-gray-600">
                {t("actions.trialUntil")}
              </label>
              <input
                id="trial"
                type="date"
                value={trialUntil}
                min={inDays(1)}
                onChange={(e) => setTrialUntil(e.target.value)}
                className={`${fieldClass} mt-1`}
              />
            </div>
            <button
              type="button"
              disabled={busy || !trialUntil}
              onClick={() =>
                void run(
                  () =>
                    adminUpdateOrganization(id, {
                      // Fin de journée : une date seule vaudrait minuit, soit
                      // une journée d'essai de moins que ce qui est affiché.
                      trialEndsAt: new Date(`${trialUntil}T23:59:59`).toISOString(),
                    }),
                  "actions.trialDone",
                )
              }
              className={buttonClass}
            >
              {t("actions.extendTrial")}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || org.subscriptionStatus === "SUSPENDED"}
              onClick={() => void run(() => adminUpdateOrganization(id, { status: "SUSPENDED" }), "actions.suspendDone")}
              className={`${buttonClass} border-amber-300 text-amber-800 hover:bg-amber-50`}
            >
              {t("actions.suspend")}
            </button>
            <button
              type="button"
              disabled={busy || org.subscriptionStatus === "ACTIVE"}
              onClick={() => void run(() => adminUpdateOrganization(id, { reactivate: true }), "actions.reactivateDone")}
              className={`${buttonClass} border-green-300 text-green-800 hover:bg-green-50`}
            >
              {t("actions.reactivate")}
            </button>
          </div>

          {/* Suppression : motif obligatoire, confirmation explicite */}
          <div className="mt-6 border-t border-gray-200 pt-4">
            <p className="text-sm font-medium text-red-800">{t("actions.deleteTitle")}</p>
            <p className="mt-1 text-xs text-gray-600">{t("actions.deleteHint")}</p>

            <textarea
              aria-label={t("actions.reason")}
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("actions.reasonPlaceholder")}
              className={`${fieldClass} mt-2 w-full max-w-xl`}
            />

            {!confirmingDelete ? (
              <button
                type="button"
                disabled={busy || reason.trim().length < MIN_REASON}
                onClick={() => setConfirmingDelete(true)}
                className={`${buttonClass} mt-2 border-red-300 text-red-700 hover:bg-red-50`}
              >
                {t("actions.delete")}
              </button>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="text-sm text-red-800">{t("actions.deleteConfirm", { name: org.name })}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await adminDeleteOrganization(id, reason.trim());
                      if (result.subscription.error) {
                        // L'organisation EST supprimée, mais l'abonnement court
                        // encore : rester sur la fiche pour que l'avertissement
                        // soit lu. Rediriger l'enterrerait.
                        setBillingWarning(result.subscription.error);
                        return;
                      }
                      router.replace("/admin/organizations");
                    }, "actions.deleteDone")
                  }
                  className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:opacity-40"
                >
                  {t("actions.deleteYes")}
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className={buttonClass}>
                  {tc("cancel")}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Dernières factures */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-900">{t("invoices.title")}</p>
        {org.invoices.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">{t("invoices.empty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100 text-sm">
            {org.invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-gray-900">{inv.number ?? inv.id.slice(0, 8)}</span>
                <span className="text-gray-600">
                  {new Intl.NumberFormat(locale, {
                    style: "currency",
                    currency: inv.currency.toUpperCase(),
                  }).format(inv.amountDue / 100)}
                </span>
                <span className="text-xs text-gray-500">{inv.status}</span>
                <span className="text-xs text-gray-500">{formatDate(new Date(inv.issuedAt), locale)}</span>
                {inv.hostedInvoiceUrl ? (
                  <a
                    href={inv.hostedInvoiceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-gray-700 underline-offset-2 hover:underline"
                  >
                    {t("invoices.open")}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Audit log du tenant */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-900">{t("audit.title")}</p>
          <Link
            href={`/admin/audit-logs?organizationId=${org.id}`}
            className="text-xs text-gray-600 underline-offset-2 hover:underline"
          >
            {t("audit.all")}
          </Link>
        </div>
        {org.auditLogs.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">{t("audit.empty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100 text-sm">
            {org.auditLogs.map((entry) => (
              <li key={entry.id} className="py-2">
                <span className="text-gray-500">{formatDateTime(entry.createdAt, locale)}</span>{" "}
                <span className="font-medium text-gray-900">{entry.action}</span>{" "}
                <span className="text-gray-700">{entry.entityType}</span>
                {entry.user ? <span className="text-gray-500"> · {entry.user.email}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
