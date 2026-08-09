import { configureApiClient } from "@len-len/api-client";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "./auth/tokens";

// Modul-Nebeneffekt: konfiguriert den gemeinsamen API-Client für das Web.
// Wird über auth-context.tsx in jedes Client-Bundle gezogen, bevor der erste
// API-Aufruf (immer nach Mount, in Effekten) stattfindet.
configureApiClient({
  // Der Rückfall gilt nur der Entwicklung: dort läuft das Backend tatsächlich
  // auf localhost:4000. Im Produktions-Build kann er nicht greifen – dort
  // bricht next.config.mjs ab, wenn NEXT_PUBLIC_API_URL fehlt. Ohne diese
  // Sperre entstünde ein ausgeliefertes Bundle, das den Rechner des Besuchers
  // anspricht.
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  storage: { getAccessToken, setAccessToken, getRefreshToken, setRefreshToken },
});
