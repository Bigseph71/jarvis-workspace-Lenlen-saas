/**
 * Lädt die Google Maps JavaScript API genau einmal (Singleton) und liefert ein
 * Promise auf den `google.maps`-Namespace. Ohne konfigurierten Schlüssel wird
 * bewusst nicht geladen – die aufrufende Komponente fällt dann auf die
 * schematische Karte zurück (Dev/CI laufen so ohne Google).
 *
 * Der Schlüssel kommt aus NEXT_PUBLIC_GOOGLE_MAPS_API_KEY und wird von Next zur
 * Build-Zeit ins Client-Bundle eingebettet.
 */

// Der globale Callback, den das Maps-Script nach dem Laden aufruft.
const CALLBACK_NAME = "__lenlenInitGoogleMaps";

let loadPromise: Promise<typeof google.maps> | null = null;

/** Konfigurierter Maps-Schlüssel oder undefined (kein Schlüssel -> Fallback). */
export function getMapsApiKey(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || undefined;
}

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps kann nur im Browser geladen werden"));
  }
  if (typeof google !== "undefined" && google.maps) {
    return Promise.resolve(google.maps);
  }
  if (loadPromise) return loadPromise;

  const key = getMapsApiKey();
  if (!key) return Promise.reject(new Error("Kein Google-Maps-Schlüssel konfiguriert"));

  loadPromise = new Promise((resolve, reject) => {
    const globalScope = window as unknown as Record<string, unknown>;
    globalScope[CALLBACK_NAME] = () => resolve(google.maps);

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key,
      language: "de",
      region: "DE",
      loading: "async",
      callback: CALLBACK_NAME,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      loadPromise = null; // erneuter Versuch bei nächstem Aufruf erlauben
      reject(new Error("Google Maps konnte nicht geladen werden"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}
