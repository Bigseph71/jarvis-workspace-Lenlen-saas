"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  getLivePositions,
  liveTrackingSocketUrl,
  type LivePosition,
  type TrackingSocketMessage,
} from "@len-len/api-client";
import { getAccessToken } from "@/lib/auth/tokens";
import { useAuth } from "@/lib/auth/auth-context";

type ConnState = "connecting" | "connected" | "disconnected";

const MAP_HEIGHT = 420;

/** Projiziert lat/lng auf 0..1 innerhalb der Bounding-Box aller Positionen. */
function project(
  positions: LivePosition[],
): (p: LivePosition) => { x: number; y: number } {
  const lats = positions.map((p) => p.latitude);
  const lngs = positions.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;
  // 8 % Rand, damit Marker nicht am Kartenrand kleben.
  return (p) => ({
    x: 0.08 + 0.84 * ((p.longitude - minLng) / spanLng),
    y: 0.08 + 0.84 * ((maxLat - p.latitude) / spanLat), // lat invertiert (Norden oben)
  });
}

export default function PlanungPage() {
  const t = useTranslations("tracking");
  const locale = useLocale();
  const { user } = useAuth();

  const [positions, setPositions] = useState<Map<string, LivePosition>>(new Map());
  const [conn, setConn] = useState<ConnState>("connecting");
  const [error, setError] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upsert = useCallback((list: LivePosition[]) => {
    setPositions((prev) => {
      const next = new Map(prev);
      for (const p of list) next.set(p.caregiverId, p);
      return next;
    });
  }, []);

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token) {
      setConn("disconnected");
      return;
    }
    const ws = new WebSocket(liveTrackingSocketUrl(token));
    socketRef.current = ws;
    setConn("connecting");

    ws.onopen = () => setConn("connected");
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as TrackingSocketMessage;
        if (msg.type === "snapshot") upsert(msg.positions);
        else if (msg.type === "position") {
          // Ein Positions-Event trägt keinen Fachkraft-Namen -> vorhandenen behalten.
          setPositions((prev) => {
            const existing = prev.get(msg.caregiverId);
            const next = new Map(prev);
            next.set(msg.caregiverId, {
              ...(existing ?? {
                id: msg.caregiverId,
                caregiver: { id: msg.caregiverId, firstName: "", lastName: "" },
              }),
              caregiverId: msg.caregiverId,
              visitId: msg.visitId,
              latitude: msg.latitude,
              longitude: msg.longitude,
              accuracy: msg.accuracy,
              distanceToPatientM: msg.distanceToPatientM,
              geofenceBreach: msg.geofenceBreach,
              recordedAt: msg.recordedAt,
            } as LivePosition);
            return next;
          });
        }
      } catch {
        /* Ungültige Nachricht ignorieren. */
      }
    };
    const scheduleRetry = () => {
      setConn("disconnected");
      if (retryRef.current) clearTimeout(retryRef.current);
      retryRef.current = setTimeout(() => connect(), 5000);
    };
    ws.onclose = scheduleRetry;
    ws.onerror = () => ws.close();
  }, [upsert]);

  useEffect(() => {
    let active = true;
    // Zuerst per HTTP laden (erneuert bei Bedarf den Access-Token), dann WS öffnen.
    getLivePositions()
      .then((list) => {
        if (!active) return;
        upsert(list);
        connect();
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        connect();
      });
    return () => {
      active = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      socketRef.current?.close();
    };
  }, [connect, upsert]);

  const list = useMemo(
    () =>
      [...positions.values()].sort((a, b) =>
        `${a.caregiver.lastName}${a.caregiver.firstName}`.localeCompare(
          `${b.caregiver.lastName}${b.caregiver.firstName}`,
        ),
      ),
    [positions],
  );
  const projectFn = useMemo(() => project(list), [list]);
  const alerts = list.filter((p) => p.geofenceBreach).length;

  const timeFmt = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const connStyle: Record<ConnState, string> = {
    connected: "bg-green-100 text-green-800",
    connecting: "bg-amber-100 text-amber-800",
    disconnected: "bg-red-100 text-red-800",
  };

  // Zugriffsschutz zusätzlich zur Nav-Filterung (Backend erzwingt es ohnehin).
  if (user && !["SUPER_ADMIN", "STRUKTUR_ADMIN", "KOORDINATOR"].includes(user.role)) {
    return null;
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${connStyle[conn]}`}>
          {t(conn)}
        </span>
      </div>

      <div className="mt-3 flex gap-3 text-sm text-gray-600">
        <span>{t("activeCount", { count: list.length })}</span>
        {alerts > 0 ? (
          <span className="font-semibold text-red-600">{t("alertsCount", { count: alerts })}</span>
        ) : null}
      </div>

      {/* Schematische Karte: relative Positionen der Fachkräfte. */}
      <div
        className="relative mt-4 overflow-hidden rounded-lg border border-gray-200 bg-[linear-gradient(0deg,#f8fafc_1px,transparent_1px),linear-gradient(90deg,#f8fafc_1px,transparent_1px)] bg-[length:32px_32px]"
        style={{ height: MAP_HEIGHT }}
      >
        {error ? (
          <div className="flex h-full items-center justify-center text-red-600">{t("error")}</div>
        ) : list.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-400">{t("empty")}</div>
        ) : (
          list.map((p) => {
            const { x, y } = projectFn(p);
            const name = `${p.caregiver.firstName} ${p.caregiver.lastName}`.trim() || p.caregiverId.slice(0, 8);
            return (
              <div
                key={p.caregiverId}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              >
                <div className="flex flex-col items-center">
                  <span
                    className={`h-4 w-4 rounded-full border-2 border-white shadow ${
                      p.geofenceBreach ? "bg-red-500 ring-4 ring-red-200" : "bg-green-500"
                    }`}
                    title={name}
                  />
                  <span className="mt-1 whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-gray-700 shadow-sm">
                    {name}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <p className="mt-2 text-xs text-gray-400">{t("mapHint")}</p>

      {/* Tabelle mit Geofence-Alarmen. */}
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("columns.caregiver")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.status")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.distance")}</th>
              <th className="px-4 py-3 font-medium">{t("columns.lastSeen")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              list.map((p) => (
                <tr key={p.caregiverId} className={p.geofenceBreach ? "bg-red-50" : "hover:bg-gray-50"}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {`${p.caregiver.firstName} ${p.caregiver.lastName}`.trim() || p.caregiverId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    {p.geofenceBreach ? (
                      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        {t("geofenceAlert")}
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        {t("inRange")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.distanceToPatientM == null
                      ? t("noVisit")
                      : t("distanceToPatient", { meters: Math.round(p.distanceToPatientM) })}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t("lastSeen", { time: timeFmt(p.recordedAt) })}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
