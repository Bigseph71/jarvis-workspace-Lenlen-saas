"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  addVehicleKm,
  deactivateVehicle,
  listVehicles,
  type Vehicle,
  type VehicleStatus,
} from "@len-len/api-client";

const PAGE_SIZE = 20;

type LoadState = "loading" | "ready" | "error";

const STATUS_STYLES: Record<VehicleStatus, string> = {
  OK: "bg-green-100 text-green-800",
  Warnung: "bg-amber-100 text-amber-800",
  Kritisch: "bg-red-100 text-red-800",
  Ablauf: "bg-purple-100 text-purple-800",
};

const BAR_STYLES: Record<VehicleStatus, string> = {
  OK: "bg-green-500",
  Warnung: "bg-amber-500",
  Kritisch: "bg-red-500",
  Ablauf: "bg-purple-500",
};

function StatusBadge({ status }: { status: VehicleStatus }) {
  const t = useTranslations("leasing.status");
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {t(status)}
    </span>
  );
}

export default function LeasingPage() {
  const t = useTranslations("leasing");
  const locale = useLocale();

  const [page, setPage] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    listVehicles({ page, pageSize: PAGE_SIZE, includeInactive: includeInactive || undefined })
      .then((res) => {
        if (!active) return;
        setVehicles(res.data);
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
  }, [page, includeInactive, reloadKey]);

  async function onDeactivate(vehicle: Vehicle) {
    if (!window.confirm(t("confirmDeactivate", { label: vehicle.label }))) return;
    try {
      await deactivateVehicle(vehicle.id);
      setReloadKey((k) => k + 1);
    } catch {
      /* Neuladen zeigt den realen Zustand. */
    }
  }

  async function onAddKm(vehicle: Vehicle) {
    const input = window.prompt(t("addKmPrompt", { label: vehicle.label }));
    if (input == null) return;
    const km = Number(input.trim());
    if (!Number.isInteger(km) || km <= 0) {
      window.alert(t("addKmInvalid"));
      return;
    }
    try {
      await addVehicleKm(vehicle.id, km);
      setReloadKey((k) => k + 1);
    } catch {
      /* Neuladen zeigt den realen Zustand. */
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  const numberFmt = new Intl.NumberFormat(locale);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <Link
          href="/leasing/new"
          className="whitespace-nowrap rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          {t("new")}
        </Link>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => {
            setIncludeInactive(e.target.checked);
            setPage(1);
          }}
        />
        {t("showInactive")}
      </label>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("columns.label")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.usage")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.endDate")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.status")}</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">{t("columns.actions")}</span>
              </th>
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
            ) : vehicles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              vehicles.map((v) => (
                <tr key={v.id} className={v.isActive ? "hover:bg-gray-50" : "bg-gray-50 text-gray-400"}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {v.label}
                    {!v.isActive ? (
                      <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                        {t("inactiveBadge")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="w-44">
                      <div className="mb-1 flex justify-between text-xs text-gray-600">
                        <span>
                          {numberFmt.format(v.leasingKmUsed)} / {numberFmt.format(v.leasingKmLimit)} km
                        </span>
                        <span>{v.usagePercent}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full ${BAR_STYLES[v.status]}`}
                          style={{ width: `${Math.min(100, v.usagePercent)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(v.leasingEndDate)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {v.isActive ? (
                        <button
                          type="button"
                          onClick={() => void onAddKm(v)}
                          className="text-sm font-medium text-gray-700 underline-offset-2 hover:underline"
                        >
                          {t("actions.addKm")}
                        </button>
                      ) : null}
                      <Link
                        href={`/leasing/${v.id}/edit`}
                        className="text-sm font-medium text-gray-700 underline-offset-2 hover:underline"
                      >
                        {t("actions.edit")}
                      </Link>
                      {v.isActive ? (
                        <button
                          type="button"
                          onClick={() => void onDeactivate(v)}
                          className="text-sm font-medium text-red-600 underline-offset-2 hover:underline"
                        >
                          {t("actions.deactivate")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {state === "ready" && total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>{t("count", { total })}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 disabled:opacity-40"
            >
              {t("previous")}
            </button>
            <span>{t("pageOf", { page, totalPages })}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 disabled:opacity-40"
            >
              {t("next")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
