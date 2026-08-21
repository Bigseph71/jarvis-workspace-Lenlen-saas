"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/datetime";
import {
  adminListOrganizations,
  type AdminOrganizationRow,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@len-len/api-client";

type LoadState = "loading" | "ready" | "error";

const STATUSES: SubscriptionStatus[] = ["ACTIVE", "TRIAL", "PAST_DUE", "SUSPENDED", "CANCELED"];
const PLANS: SubscriptionPlan[] = ["BASIC", "PRO", "ENTERPRISE"];

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  TRIAL: "bg-blue-100 text-blue-800",
  PAST_DUE: "bg-amber-100 text-amber-800",
  SUSPENDED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-100 text-gray-600",
};

const fieldClass =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

export default function AdminOrganizationsPage() {
  const t = useTranslations("admin.organizations");
  const ts = useTranslations("admin.status");
  const locale = useLocale();
  const params = useSearchParams();

  // Le dashboard renvoie ici avec ?status=… : la vue s'ouvre déjà filtrée.
  const initialStatus = params.get("status") as SubscriptionStatus | null;

  const [status, setStatus] = useState<SubscriptionStatus | "">(initialStatus ?? "");
  const [plan, setPlan] = useState<SubscriptionPlan | "">("");
  const [search, setSearch] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminOrganizationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(() => {
    let active = true;
    setState("loading");
    adminListOrganizations({
      page,
      pageSize: 20,
      ...(status ? { status } : {}),
      ...(plan ? { plan } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(includeDeleted ? { includeDeleted: true } : {}),
    })
      .then((res) => {
        if (!active) return;
        setRows(res.data);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [page, status, plan, search, includeDeleted]);

  useEffect(() => load(), [load]);

  // Tout changement de filtre ramène à la première page : sinon on reste sur
  // une page 4 qui n'existe plus dans le nouveau résultat, et la liste paraît
  // vide alors qu'elle ne l'est pas.
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="search" className="block text-xs font-medium text-gray-600">
            {t("search")}
          </label>
          <input
            id="search"
            value={search}
            onChange={(e) => changeFilter(() => setSearch(e.target.value))}
            placeholder={t("searchPlaceholder")}
            className={`${fieldClass} mt-1`}
          />
        </div>

        <div>
          <label htmlFor="status" className="block text-xs font-medium text-gray-600">
            {t("statusFilter")}
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => changeFilter(() => setStatus(e.target.value as SubscriptionStatus | ""))}
            className={`${fieldClass} mt-1`}
          >
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="plan" className="block text-xs font-medium text-gray-600">
            {t("planFilter")}
          </label>
          <select
            id="plan"
            value={plan}
            onChange={(e) => changeFilter(() => setPlan(e.target.value as SubscriptionPlan | ""))}
            className={`${fieldClass} mt-1`}
          >
            <option value="">{t("allPlans")}</option>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => changeFilter(() => setIncludeDeleted(e.target.checked))}
            className="h-4 w-4 rounded border-gray-300"
          />
          {t("includeDeleted")}
        </label>
      </div>

      <p className="mt-3 text-sm text-gray-500">{t("count", { total })}</p>

      <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("columns.name")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.plan")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.status")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.usage")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.createdAt")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {state === "loading" ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {t("loading")}
                </td>
              </tr>
            ) : state === "error" ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-red-600">
                  {t("error")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              rows.map((org) => (
                <tr key={org.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link
                      href={`/admin/organizations/${org.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {org.name}
                    </Link>
                    {org.deletedAt ? (
                      <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700">
                        {t("deletedBadge")}
                      </span>
                    ) : null}
                    <span className="ml-2 text-xs text-gray-400">{org.country}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{org.subscriptionPlan}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[org.subscriptionStatus]}`}
                    >
                      {ts(org.subscriptionStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {t("usage", {
                      users: org._count.users,
                      patients: org._count.patients,
                      caregivers: org._count.caregivers,
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(new Date(org.createdAt), locale)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100 disabled:opacity-40"
          >
            {t("previous")}
          </button>
          <span className="text-sm text-gray-600">{t("pageOf", { page, totalPages })}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100 disabled:opacity-40"
          >
            {t("next")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
