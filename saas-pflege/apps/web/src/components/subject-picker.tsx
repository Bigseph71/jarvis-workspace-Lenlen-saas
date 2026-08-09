"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  listCaregivers,
  listPatients,
  type SubjectKind,
} from "@len-len/api-client";

/** Eine betroffene Person, unabhängig davon, ob Patient oder Fachkraft. */
export interface Subject {
  id: string;
  kind: SubjectKind;
  name: string;
  /** Zusatzangabe zur Unterscheidung von Namensgleichen (Anschrift bzw. Rolle). */
  detail: string;
  isActive: boolean;
}

/**
 * Auswahl einer betroffenen Person für Auskunft und Löschung.
 *
 * Gesucht wird serverseitig, nicht über eine vollständig geladene Liste: bei
 * 5 000 Patienten je Organisation wäre das weder zumutbar noch zulässig – ein
 * Auskunftswerkzeug soll nicht nebenbei den gesamten Bestand ins Frontend
 * holen.
 *
 * Inaktive werden mitgeladen: eine ausgetretene Fachkraft oder ein
 * abgeschlossener Patient sind gerade die Fälle, in denen ein Löschverlangen
 * eintrifft.
 */
export function SubjectPicker({
  kind,
  selected,
  onSelect,
}: {
  kind: SubjectKind;
  selected: Subject | null;
  onSelect: (subject: Subject | null) => void;
}) {
  const t = useTranslations("dsgvo.picker");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (term: string, signal: AbortSignal) => {
      setLoading(true);
      setFailed(false);
      try {
        const subjects: Subject[] =
          kind === "patient"
            ? (
                await listPatients({ search: term || undefined, pageSize: 20, includeInactive: true })
              ).data.map((p) => ({
                id: p.id,
                kind: "patient" as const,
                name: `${p.lastName}, ${p.firstName}`,
                detail: p.normalizedAddress ?? p.rawAddress,
                isActive: p.isActive,
              }))
            : (
                await listCaregivers({ search: term || undefined, pageSize: 20, includeInactive: true })
              ).data.map((c) => ({
                id: c.id,
                kind: "caregiver" as const,
                name: `${c.lastName}, ${c.firstName}`,
                detail: c.qualification,
                isActive: c.isActive,
              }));
        if (!signal.aborted) setResults(subjects);
      } catch {
        if (!signal.aborted) setFailed(true);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [kind],
  );

  // Entprellt: bei jedem Tastendruck zu suchen erzeugte eine Anfrage je
  // Zeichen, und die Antworten könnten in falscher Reihenfolge eintreffen.
  // Der AbortController verwirft überholte Läufe.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(search, controller.signal), 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, load]);

  // Auswahl fallen lassen, wenn die Art wechselt: eine Fachkraft-ID in einem
  // Patienten-Formular wäre ein stiller Fehlgriff.
  useEffect(() => {
    onSelect(null);
    setSearch("");
  }, [kind, onSelect]);

  return (
    <div>
      <label htmlFor="subject-search" className="block text-sm font-medium text-gray-700">
        {t("label")}
      </label>
      <input
        id="subject-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t(kind === "patient" ? "placeholderPatient" : "placeholderCaregiver")}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
      />

      <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-gray-200">
        {failed ? (
          <p className="px-3 py-4 text-sm text-red-600">{t("error")}</p>
        ) : loading ? (
          <p className="px-3 py-4 text-sm text-gray-400">{t("loading")}</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-4 text-sm text-gray-400">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {results.map((s) => {
              const active = selected?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(active ? null : s)}
                    aria-pressed={active}
                    className={`block w-full px-3 py-2 text-left text-sm transition ${
                      active ? "bg-gray-900 text-white" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="font-medium">{s.name}</span>
                    {!s.isActive ? (
                      <span
                        className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${
                          active ? "bg-gray-700 text-gray-200" : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {t("inactive")}
                      </span>
                    ) : null}
                    <span className={`block truncate text-xs ${active ? "text-gray-300" : "text-gray-500"}`}>
                      {s.detail}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
