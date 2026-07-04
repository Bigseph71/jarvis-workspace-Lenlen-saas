import { ApiError, type ApiErrorBody } from "./errors";
import { clearTokens, getApiConfig } from "./config";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Bearer-Token anhängen (Standard: true). Für öffentliche Endpoints false. */
  auth?: boolean;
  signal?: AbortSignal;
}

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

// Verhindert parallele Refresh-Aufrufe (sonst würde die Rotation ein Token
// doppelt einlösen -> Backend erkennt Wiederverwendung und beendet die Sitzung).
let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const { baseUrl, storage } = getApiConfig();
  const refreshToken = await storage.getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      await clearTokens();
      return false;
    }
    const data = (await res.json()) as RefreshResult;
    await storage.setAccessToken(data.accessToken);
    await storage.setRefreshToken(data.refreshToken); // Rotation: neues Token persistieren.
    return true;
  } catch {
    await clearTokens();
    return false;
  }
}

function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * Typisierter Fetch gegen das Backend. Hängt den Bearer-Token an und erneuert
 * ihn bei 401 einmalig automatisch. Wirft ApiError bei Nicht-2xx.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, signal } = options;
  const { baseUrl, storage } = getApiConfig();

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = await storage.getAccessToken();
    if (auth && token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  };

  let res = await send();

  // Access abgelaufen -> einmal refreshen und Request wiederholen.
  if (res.status === 401 && auth && (await storage.getRefreshToken())) {
    const ok = await refreshAccessToken();
    if (ok) res = await send();
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const errBody = (payload ?? {}) as ApiErrorBody;
    throw new ApiError(
      res.status,
      typeof errBody.error === "string" ? errBody.error : "Error",
      typeof errBody.message === "string" ? errBody.message : res.statusText,
      errBody.details,
    );
  }

  return payload as T;
}
