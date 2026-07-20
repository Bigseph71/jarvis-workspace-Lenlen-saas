"use client";

import { useEffect, useRef, useState } from "react";
import type { LivePosition } from "@len-len/api-client";
import { getMapsApiKey, loadGoogleMaps } from "@/lib/google-maps";

interface LiveMapProps {
  positions: LivePosition[];
  height: number;
  /** Übersetzte Texte (Komponente bleibt i18n-frei). */
  labels: { empty: string; error: string; fallbackHint: string };
}

const GREEN = "#22c55e";
const RED = "#ef4444";
// Fallback-Zentrum, wenn (noch) keine Position vorliegt: geografische Mitte DE.
const GERMANY_CENTER = { lat: 51.1657, lng: 10.4515 };

function caregiverName(p: LivePosition): string {
  return `${p.caregiver.firstName} ${p.caregiver.lastName}`.trim() || p.caregiverId.slice(0, 8);
}

/**
 * Live-Karte der Fachkräfte. Mit konfiguriertem Schlüssel: echte Google-Maps-
 * Karte mit Markern (grün = im Bereich, rot = Geofence-Alarm). Ohne Schlüssel:
 * schematische Karte (relative Positionen), damit Dev/CI ohne Google laufen.
 */
export function LiveMap({ positions, height, labels }: LiveMapProps) {
  if (!getMapsApiKey()) {
    return <SchematicMap positions={positions} height={height} labels={labels} />;
  }
  return <GoogleLiveMap positions={positions} height={height} labels={labels} />;
}

function GoogleLiveMap({ positions, height, labels }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Karte einmalig erzeugen.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new maps.Map(containerRef.current, {
          center: GERMANY_CENTER,
          zoom: 6,
          disableDefaultUI: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Marker mit den aktuellen Positionen synchronisieren.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map || typeof google === "undefined") return;

    const bounds = new google.maps.LatLngBounds();
    const seen = new Set<string>();

    for (const p of positions) {
      seen.add(p.caregiverId);
      const pos = { lat: p.latitude, lng: p.longitude };
      bounds.extend(pos);

      const icon: google.maps.Symbol = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: p.geofenceBreach ? RED : GREEN,
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      };

      let marker = markersRef.current.get(p.caregiverId);
      if (!marker) {
        marker = new google.maps.Marker({ map, position: pos });
        markersRef.current.set(p.caregiverId, marker);
      } else {
        marker.setPosition(pos);
      }
      marker.setTitle(caregiverName(p));
      marker.setIcon(icon);
      marker.setZIndex(p.geofenceBreach ? 2 : 1);
    }

    // Nicht mehr aktive Fachkräfte entfernen.
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    }

    if (positions.length > 0) {
      map.fitBounds(bounds, 64);
      // Bei nur einer Position würde fitBounds maximal einzoomen -> begrenzen.
      if (positions.length === 1) {
        google.maps.event.addListenerOnce(map, "idle", () => {
          if ((map.getZoom() ?? 0) > 15) map.setZoom(15);
        });
      }
    }
  }, [positions, status]);

  return (
    <div
      className="relative mt-4 overflow-hidden rounded-lg border border-gray-200"
      style={{ height }}
    >
      <div ref={containerRef} className="h-full w-full" />
      {status === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-400">
          …
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-red-600">
          {labels.error}
        </div>
      ) : null}
      {status === "ready" && positions.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs text-gray-500 shadow-sm">
            {labels.empty}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Projiziert lat/lng auf 0..1 innerhalb der Bounding-Box aller Positionen. */
function project(positions: LivePosition[]): (p: LivePosition) => { x: number; y: number } {
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

/** Schematische Fallback-Karte (kein Google-Maps-Schlüssel konfiguriert). */
function SchematicMap({ positions, height, labels }: LiveMapProps) {
  const projectFn = project(positions);
  return (
    <>
      <div
        className="relative mt-4 overflow-hidden rounded-lg border border-gray-200 bg-[linear-gradient(0deg,#f8fafc_1px,transparent_1px),linear-gradient(90deg,#f8fafc_1px,transparent_1px)] bg-[length:32px_32px]"
        style={{ height }}
      >
        {positions.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-400">{labels.empty}</div>
        ) : (
          positions.map((p) => {
            const { x, y } = projectFn(p);
            const name = caregiverName(p);
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
      <p className="mt-2 text-xs text-gray-400">{labels.fallbackHint}</p>
    </>
  );
}
