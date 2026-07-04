/**
 * Plattformneutrale Konfiguration des API-Clients.
 *
 * Web (Next.js) und Mobile (React Native / Expo) injizieren beim App-Start
 * ihre eigene Token-Ablage und Base-URL:
 *  - Web: Access-Token im Speicher, Refresh-Token in localStorage (synchron)
 *  - Mobile: expo-secure-store (asynchron)
 */
export interface TokenStorage {
  /** Methoden dürfen synchron (Web) oder asynchron (SecureStore) sein. */
  getAccessToken(): string | null | Promise<string | null>;
  setAccessToken(token: string | null): void | Promise<void>;
  getRefreshToken(): string | null | Promise<string | null>;
  setRefreshToken(token: string | null): void | Promise<void>;
}

export interface ApiClientConfig {
  baseUrl: string;
  storage: TokenStorage;
}

let config: ApiClientConfig | null = null;

/** Einmalig beim App-Start aufrufen, vor dem ersten API-Aufruf. */
export function configureApiClient(next: ApiClientConfig): void {
  config = next;
}

export function getApiConfig(): ApiClientConfig {
  if (!config) {
    throw new Error(
      "API-Client nicht konfiguriert: configureApiClient({ baseUrl, storage }) beim App-Start aufrufen",
    );
  }
  return config;
}

/** Leert beide Token (Logout / Sitzungsende). */
export async function clearTokens(): Promise<void> {
  const { storage } = getApiConfig();
  await storage.setAccessToken(null);
  await storage.setRefreshToken(null);
}
