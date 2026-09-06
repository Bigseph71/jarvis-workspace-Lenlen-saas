"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listAbsences,
  listCaregivers,
  listRoutes,
  visitDaySummary,
  type Absence,
  type Caregiver,
  type RouteDay,
  type UserRole,
  type VisitDaySummary,
} from "@len-len/api-client";

/**
 * Daten der Übersicht.
 *
 * Diese Datei ersetzt lib/demo/uebersicht.ts als Quelle des Bildschirms. Der
 * Kopf jener Datei hatte den Weg schon beschrieben: "der Ersatz durch echte
 * Abfragen tauscht diese Datei gegen Hooks aus". Genau das passiert hier.
 *
 * Drei Eigenschaften, die dem Hook seine Form geben:
 *
 * 1. NACH ROLLE GETRENNT ABGEFRAGT. Die Übersicht ist der Startbildschirm
 *    ALLER angemeldeten Rollen, auch der Personalverwaltung – und die darf
 *    weder die Tagesbilanz der Besuche noch die Touren lesen (beide Endpunkte
 *    antworten ihr mit 403). Diese Aufrufe unterbleiben deshalb für sie, statt
 *    vorhersehbar zu scheitern. Die Liste unten spiegelt die requireRole-
 *    Wächter des Backends, wie die Navigation in app-shell.tsx.
 *
 * 2. JEDE QUELLE SCHEITERT FÜR SICH. `allSettled` statt `all`: fällt ein
 *    Endpunkt aus, bleibt der Rest des Bildschirms stehen. Ein Startbildschirm,
 *    der wegen einer Karte vollständig leer bleibt, ist schlechter als einer,
 *    dem eine Karte fehlt.
 *
 * 3. `null` HEISST "NICHT GELADEN", NICHT "NULL". Eine Karte ohne Daten zeigt
 *    ihren eigenen Zustand an und niemals eine 0 – auf diesem Bildschirm wäre
 *    eine erfundene Null genauso schädlich wie eine erfundene Zahl.
 */

export type OverviewState = "loading" | "ready" | "error";

export interface OverviewData {
  state: OverviewState;
  /** Tagesbilanz der Besuche. null für Rollen ohne Zugriff oder bei Fehler. */
  summary: VisitDaySummary | null;
  /** Touren des Tages. null für Rollen ohne Zugriff oder bei Fehler. */
  routes: RouteDay | null;
  /** Heute laufende Abwesenheiten. null bei Fehler. */
  absences: Absence[] | null;
  caregivers: Caregiver[] | null;
  reload: () => void;
}

/** Rollen, die Besuche und Touren lesen dürfen (visit/vrptw.routes: canPlan). */
const PLANNING: readonly UserRole[] = ["STRUKTUR_ADMIN", "KOORDINATOR"];

/** Kalendertag als YYYY-MM-DD, in der Zeitzone des Browsers. */
export function isoDay(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function valueOf<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

export function useOverview(role: UserRole | undefined): OverviewData {
  const [state, setState] = useState<OverviewState>("loading");
  const [summary, setSummary] = useState<VisitDaySummary | null>(null);
  const [routes, setRoutes] = useState<RouteDay | null>(null);
  const [absences, setAbsences] = useState<Absence[] | null>(null);
  const [caregivers, setCaregivers] = useState<Caregiver[] | null>(null);

  const load = useCallback(async () => {
    if (!role) return;
    setState("loading");

    const canPlan = PLANNING.includes(role);
    const today = isoDay(new Date());

    const [summaryResult, routesResult, absencesResult, caregiversResult] = await Promise.allSettled([
      canPlan ? visitDaySummary(today) : Promise.resolve(null),
      // Eine Seite, gross genug für einen ganzen Tag: die Kennzahl daneben
      // stammt ohnehin aus der Tagesaggregation des Endpunkts.
      canPlan ? listRoutes({ date: today, pageSize: 500 }) : Promise.resolve(null),
      // Überschneidung mit HEUTE, nicht Beginn heute: eine Krankmeldung von
      // vorgestern läuft weiter und gehört auf den Bildschirm.
      listAbsences({ from: today, to: today, pageSize: 50 }),
      listCaregivers({ pageSize: 100 }),
    ]);

    setSummary(valueOf(summaryResult));
    setRoutes(valueOf(routesResult));
    setAbsences(valueOf(absencesResult)?.data ?? null);
    setCaregivers(valueOf(caregiversResult)?.data ?? null);

    // "Fehler" heisst: NICHTS ist angekommen. Solange eine Quelle antwortet,
    // ist der Bildschirm brauchbar, und die stille Karte sagt es selbst.
    const anySucceeded = [summaryResult, routesResult, absencesResult, caregiversResult].some(
      (result) => result.status === "fulfilled",
    );
    setState(anySucceeded ? "ready" : "error");
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, summary, routes, absences, caregivers, reload: () => void load() };
}
