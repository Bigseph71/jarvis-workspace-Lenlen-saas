"use client";

import { useTranslations, useLocale } from "next-intl";
import type { Contract } from "@len-len/api-client";

/**
 * Vertragshistorie einer Fachkraft (GET /hr/contracts).
 *
 * Sie ist der sichtbare Teil dessen, was das HR-Modul geändert hat: die
 * Vertragsfelder auf der Fachkraft sind nur noch eine Momentaufnahme, die
 * Wahrheit ist diese Abfolge von Versionen. Ohne sie ließe sich nach einer
 * Änderung nicht mehr sagen, ab wann welcher Vertrag galt.
 */
export function ContractHistory({ contracts }: { contracts: Contract[] }) {
  const t = useTranslations("caregivers");
  const locale = useLocale();

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });

  if (contracts.length === 0) {
    return <p className="text-sm text-gray-400">{t("history.empty")}</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2 font-medium">{t("history.columns.period")}</th>
            <th className="px-4 py-2 font-medium">{t("history.columns.type")}</th>
            <th className="px-4 py-2 font-medium">{t("history.columns.hours")}</th>
            <th className="px-4 py-2 font-medium">{t("history.columns.days")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {contracts.map((c) => {
            const running = c.validUntil === null;
            return (
              <tr key={c.id} className={running ? "bg-green-50/50" : undefined}>
                <td className="px-4 py-2 text-gray-900">
                  {formatDate(c.validFrom)} — {c.validUntil ? formatDate(c.validUntil) : t("history.open")}
                  {running ? (
                    <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">
                      {t("history.current")}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-gray-600">{t(`contractTypes.${c.contractType}`)}</td>
                <td className="px-4 py-2 text-gray-600">{c.weeklyHours}</td>
                <td className="px-4 py-2 text-gray-600">
                  {c.workDays.map((d) => t(`weekdays.${d}`)).join(", ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
