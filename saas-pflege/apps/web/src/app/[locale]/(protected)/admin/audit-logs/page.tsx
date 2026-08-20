"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { formatDateTime } from "@/lib/datetime";
import {
  adminExportAuditLogsCsv,
  adminListAuditLogs,
  type AdminAuditEntry,
  type AuditAction,
} from "@len-len/api-client";

type LoadState = "loading" | "ready" | "error";

const ACTIONS: AuditAction[] = ["CREATE", "READ", "UPDATE", "DELETE", "EXPORT", "LOGIN", "LOGOUT"];

const fieldClass =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

export default function AdminAuditLogsPage() {
  const t = useTranslations("admin.audit");
  const tc = useTranslations("common");
  const locale = useLocale();
  const params = useSearchParams();

  // La fiche organisation renvoie ici avec ?organizationId=…
  const [organizationId, setOrganizationId] = useState(params.get("organizationId") ?? "");
  const [action, setAction] = useState<AuditAction | "">("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<LoadState>("loading");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Filtres partagés par la liste et l'export : une seule source. */
  const filters = useCallback(
    () => ({
      ...(organizationId.trim() ? { organizationId: organizationId.trim() } : {}),
      ...(action ? { action } : {}),
      ...(entityType.trim() ? { entityType: entityType.trim() } : {}),
      ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
      ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
    }),
    [organizationId, action, entityType, from, to],
  );

  const load = useCallback(() => {
    let active = true;
    setState("loading");
    adminListAuditLogs({ page, pageSize: 50, ...filters() })
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
  }, [page, filters]);

  useEffect(() => load(), [load]);

  /**
   * Le CSV arrive par l'API (avec le jeton dans l'en-tête) et devient un
   * fichier ici. Un lien direct aurait obligé à mettre le jeton dans l'URL,
   * donc dans les journaux d'accès.
   */
  async function onExport() {
    setExporting(true);
    setError(null);
    try {
      const csv = await adminExportAuditLogsCsv({ ...filters(), limit: 5000 });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setExporting(false);
    }
  }

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="org" className="block text-xs font-medium text-gray-600">
            {t("organizationId")}
          </label>
          <input
            id="org"
            value={organizationId}
            onChange={(e) => changeFilter(() => setOrganizationId(e.target.value))}
            placeholder="uuid"
            className={`${fieldClass} mt-1 w-72`}
          />
        </div>

        <div>
          <label htmlFor="action" className="block text-xs font-medium text-gray-600">
            {t("action")}
          </label>
          <select
            id="action"
            value={action}
            onChange={(e) => changeFilter(() => setAction(e.target.value as AuditAction | ""))}
            className={`${fieldClass} mt-1`}
          >
            <option value="">{t("allActions")}</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="entity" className="block text-xs font-medium text-gray-600">
            {t("entityType")}
          </label>
          <input
            id="entity"
            value={entityType}
            onChange={(e) => changeFilter(() => setEntityType(e.target.value))}
            placeholder="patient, visit, organization…"
            className={`${fieldClass} mt-1`}
          />
        </div>

        <div>
          <label htmlFor="from" className="block text-xs font-medium text-gray-600">
            {t("from")}
          </label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(e) => changeFilter(() => setFrom(e.target.value))}
            className={`${fieldClass} mt-1`}
          />
        </div>

        <div>
          <label htmlFor="to" className="block text-xs font-medium text-gray-600">
            {t("to")}
          </label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(e) => changeFilter(() => setTo(e.target.value))}
            className={`${fieldClass} mt-1`}
          />
        </div>

        <button
          type="button"
          onClick={() => void onExport()}
          disabled={exporting}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-40"
        >
          {exporting ? t("exporting") : t("exportCsv")}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <p className="mt-3 text-sm text-gray-500">{t("count", { total })}</p>

      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("columns.when")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.organization")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.user")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.action")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.entity")}</th>
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
              rows.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-900">
                    {formatDateTime(entry.createdAt, locale)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{entry.organization?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {entry.user ? `${entry.user.email} (${entry.user.role})` : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{entry.action}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {entry.entityType}
                    {entry.entityId ? (
                      <span className="ml-1 text-xs text-gray-400">{entry.entityId.slice(0, 8)}</span>
                    ) : null}
                  </td>
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
