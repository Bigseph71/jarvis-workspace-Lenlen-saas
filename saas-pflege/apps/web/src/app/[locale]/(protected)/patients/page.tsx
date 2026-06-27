"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { listPatients, type GeocodingStatus, type Patient } from "@/lib/api/patients";

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
    listPatients({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined })
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
  }, [page, debouncedSearch]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("columns.name")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.address")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {state === "loading" ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  {t("loading")}
                </td>
              </tr>
            ) : state === "error" ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-red-600">
                  {t("error")}
                </td>
              </tr>
            ) : patients.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              patients.map((patient) => (
                <tr key={patient.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {patient.lastName}, {patient.firstName}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {patient.normalizedAddress ?? patient.rawAddress}
                  </td>
                  <td className="px-4 py-3">
                    <GeocodingBadge status={patient.geocodingStatus} />
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
