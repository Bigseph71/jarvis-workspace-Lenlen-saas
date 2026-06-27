"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { deactivatePatient, listPatients, type GeocodingStatus, type Patient } from "@/lib/api/patients";

const PAGE_SIZE = 20;

type LoadState = "loading" | "ready" | "error";

const STATUS_STYLES: Record<GeocodingStatus, string> = {
  VALID: "bg-green-100 text-green-800",
  PENDING: "bg-amber-100 text-amber-800",
  INVALID: "bg-red-100 text-red-800",
};

function GeocodingBadge({ status }: { status: GeocodingStatus }) {
  const t = useTranslations("patients.status");
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {t(status)}
    </span>
  );
}

export default function PatientsPage() {
  const t = useTranslations("patients");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<LoadState>("loading");

  // Suche entprellen und auf Seite 1 zurücksetzen.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let active = true;
    setState("loading");
    listPatients({
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch || undefined,
      includeInactive: includeInactive || undefined,
    })
      .then((res) => {
        if (!active) return;
        setPatients(res.data);
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
  }, [page, debouncedSearch, includeInactive, reloadKey]);

  async function onDeactivate(patient: Patient) {
    const name = `${patient.lastName}, ${patient.firstName}`;
    if (!window.confirm(t("confirmDeactivate", { name }))) return;
    try {
      await deactivatePatient(patient.id);
      setReloadKey((k) => k + 1);
    } catch {
      /* Liste neu laden zeigt den realen Zustand; Fehler still. */
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <Link
            href="/patients/new"
            className="whitespace-nowrap rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            {t("new")}
          </Link>
        </div>
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
              <th className="px-4 py-3 font-medium">{t("columns.name")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.address")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.status")}</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">{t("columns.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {state === "loading" ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  {t("loading")}
                </td>
              </tr>
            ) : state === "error" ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-red-600">
                  {t("error")}
                </td>
              </tr>
            ) : patients.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              patients.map((patient) => (
                <tr key={patient.id} className={patient.isActive ? "hover:bg-gray-50" : "bg-gray-50 text-gray-400"}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {patient.lastName}, {patient.firstName}
                    {!patient.isActive ? (
                      <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                        {t("inactiveBadge")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {patient.normalizedAddress ?? patient.rawAddress}
                  </td>
                  <td className="px-4 py-3">
                    <GeocodingBadge status={patient.geocodingStatus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/patients/${patient.id}/edit`}
                        className="text-sm font-medium text-gray-700 underline-offset-2 hover:underline"
                      >
                        {t("actions.edit")}
                      </Link>
                      {patient.isActive ? (
                        <button
                          type="button"
                          onClick={() => void onDeactivate(patient)}
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
