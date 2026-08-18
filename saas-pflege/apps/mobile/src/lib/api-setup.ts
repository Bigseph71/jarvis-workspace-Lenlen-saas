import { configureApiClient } from "@len-len/api-client";
import { tokenStorage } from "./token-storage";
import { resolveApiBaseUrl } from "./api-url";

/**
 * Modul-Nebeneffekt: konfiguriert den gemeinsamen API-Client.
 *
 * Auf einem echten Gerät in der Entwicklung MUSS EXPO_PUBLIC_API_URL auf die
 * LAN-IP des Entwicklungsrechners zeigen (localhost wäre das Gerät selbst),
 * z.B. EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 in apps/mobile/.env
 *
 * In einem Release-Build ist der Wert Pflicht – warum, steht in api-url.ts.
 */
configureApiClient({
  baseUrl: resolveApiBaseUrl({
    configured: process.env.EXPO_PUBLIC_API_URL,
    isDev: __DEV__,
  }),
  storage: tokenStorage,
});
