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
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  storage: { getAccessToken, setAccessToken, getRefreshToken, setRefreshToken },
});
