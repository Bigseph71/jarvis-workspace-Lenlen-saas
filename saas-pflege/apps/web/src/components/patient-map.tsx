"use client";

import { useEffect, useRef, useState } from "react";
import { getMapsApiKey, loadGoogleMaps } from "@/lib/google-maps";

interface PatientMapProps {
  latitude: number;
  longitude: number;
  /** Beschriftung des Markers (Patientenname) – auch als Titel im Hover. */
  title: string;
  labels: { error: string; noKey: string };
  height?: number;
}

/** Zoomstufe für eine Hausanschrift: Straße samt Umfeld, nicht das Dach allein. */
const ADDRESS_ZOOM = 16;

/**
 * Kleine Karte mit EINEM Marker auf der geokodierten Anschrift eines Patienten.
 *
 * Bewusst getrennt von LiveMap: dort geht es um eine wechselnde Menge von
 * Fachkräften mit fitBounds und Marker-Abgleich. Hier steht ein einziger,
 * unveränderlicher Punkt – dieselbe Komponente dafür zu verbiegen hätte beide
 * Fälle verschlechtert.
 *
 * Der Aufrufer entscheidet, OB gerendert wird (nur bei geocodingStatus VALID);
 * diese Komponente kümmert sich nur um das Wie.
 */
export function PatientMap({ latitude, longitude, title, labels, height = 260 }: PatientMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const hasKey = Boolean(getMapsApiKey());

  useEffect(() => {
    if (!hasKey) return;
    let cancelled = false;

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const position = { lat: latitude, lng: longitude };
        const map = new maps.Map(containerRef.current, {
          center: position,
          zoom: ADDRESS_ZOOM,
          // Eine Adresskarte wird angeschaut, nicht erkundet: die volle
          // Bedienleiste lenkt hier nur ab.
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        new maps.Marker({ map, position, title });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, title, hasKey]);

  // Ohne Schlüssel wird der Ausfall BENANNT statt still weggelassen: eine
  // fehlende Karte ist sonst nicht von einer nicht geokodierten Anschrift zu
  // unterscheiden.
  if (!hasKey) {
    return (
      <div
        className="mt-3 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500"
        style={{ height }}
      >
        {labels.noKey}
      </div>
    );
  }

  return (
    <div
      className="relative mt-3 overflow-hidden rounded-lg border border-gray-200"
      style={{ height }}
    >
      <div ref={containerRef} className="h-full w-full" />
      {status === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-400">
          …
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 px-4 text-center text-xs text-red-600">
          {labels.error}
        </div>
      ) : null}
    </div>
  );
}
