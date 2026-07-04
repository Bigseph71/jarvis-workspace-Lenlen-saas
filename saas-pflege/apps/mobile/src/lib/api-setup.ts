import { configureApiClient } from "@len-len/api-client";
import { tokenStorage } from "./token-storage";

/**
 * Modul-Nebeneffekt: konfiguriert den gemeinsamen API-Client.
 * Auf einem echten Gerät MUSS EXPO_PUBLIC_API_URL auf die LAN-IP des
 * Entwicklungsrechners zeigen (localhost wäre das Gerät selbst), z.B.
 * EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 in apps/mobile/.env
 */
configureApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000",
  storage: tokenStorage,
});
