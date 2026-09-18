import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Das Refresh-Token als httpOnly-Cookie – serverseitige Hälfte.
 *
 * WARUM ÜBERHAUPT: bis hierhin lag das Refresh-Token in localStorage. Ein
 * einziger XSS genügte, um es auszulesen und die Sitzung dauerhaft zu
 * übernehmen – dauerhaft deshalb, weil es sieben Tage gilt und die Rotation
 * dem Dieb genauso dient wie dem Besitzer. Im httpOnly-Cookie ist es für
 * JavaScript unsichtbar; nur dieser Server liest es.
 *
 * WAS DAS NICHT LEISTET, damit niemand sich täuscht: ein aktiver XSS kann
 * weiterhin `/api/auth/session/refresh` aufrufen – der Browser hängt das
 * Cookie ja von selbst an – und bekommt einen Access-Token. Verhindert wird
 * das HERAUSTRAGEN des langlebigen Tokens, nicht seine Verwendung auf der
 * Seite selbst. Der Unterschied ist trotzdem gross: gestohlen ist gestohlen,
 * auf der Seite gefangen endet mit dem Schliessen des Tabs.
 *
 * WARUM NICHT DAS BACKEND DAS COOKIE SETZT: Web und API liegen auf getrennten
 * Railway-Domänen, ein Cookie des Backends wäre also ein Drittanbieter-Cookie
 * – von Safari heute schon blockiert. Und `.up.railway.app` steht auf der
 * Public Suffix List, ein gemeinsames Eltern-Cookie ist dort unmöglich. Erst
 * mit einer eigenen Domain (app./api.) wäre der direkte Weg gangbar.
 */
export const REFRESH_COOKIE = "lenlen_rt";

/**
 * Lebensdauer des Cookies. Muss zu JWT_REFRESH_TTL des Backends passen
 * (Vorgabe dort: 7d).
 *
 * Läuft es zu lange, überlebt das Cookie das Token: der nächste Refresh
 * antwortet mit "keine Sitzung", das Cookie wird gelöscht, der Benutzer meldet
 * sich neu an – unschön, aber harmlos. Läuft es zu kurz, fliegt er früher
 * heraus als nötig. Der erste Fehler ist der billigere, deshalb im Zweifel
 * eher zu lang.
 */
const DEFAULT_DAYS = 7;

function maxAgeSeconds(): number {
  const raw = Number(process.env.REFRESH_COOKIE_DAYS);
  const days = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAYS;
  return Math.round(days * 24 * 60 * 60);
}

/**
 * Basis-URL des Backends.
 *
 * Dieselbe Variable wie im Browser-Bundle: Next ersetzt NEXT_PUBLIC_* zur
 * Bauzeit überall, auch in Serverdateien. Eine zweite, serverseitige Variable
 * wäre eine weitere Stellschraube, die beim Deployen vergessen werden kann –
 * und deren Fehlen sich erst beim Anmelden zeigt.
 */
export function backendUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

/**
 * SameSite=Strict, nicht Lax.
 *
 * Das Cookie wird ausschliesslich von unserem eigenen JavaScript per fetch
 * benutzt, nie bei einer Navigation. Solche Aufrufe gelten auch unter Strict
 * als same-site, es geht also nichts verloren – und ein fremder Ursprung
 * bekommt das Cookie unter keinen Umständen angehängt. Damit ist CSRF auf
 * diesen Endpoints ohne zusätzliches Token erledigt.
 *
 * `path` beschränkt es zusätzlich auf die Auth-Endpoints: bei jedem anderen
 * Seitenaufruf wird es gar nicht erst mitgeschickt.
 */
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    // In der Entwicklung läuft das Web auf http://localhost – ein Secure-Cookie
    // würde dort verworfen, und niemand bliebe angemeldet.
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
  };
}

/** Antwort mit gesetztem Refresh-Cookie. */
export function withRefreshCookie<T>(body: T, refreshToken: string): NextResponse {
  const res = NextResponse.json(body);
  res.cookies.set(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions(),
    maxAge: maxAgeSeconds(),
  });
  return res;
}

/** Antwort, die das Refresh-Cookie löscht. */
export function withoutRefreshCookie<T>(body: T, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  // maxAge 0 statt delete(): delete() setzt den Pfad nicht, und ein Cookie
  // mit abweichendem Pfad wird nicht überschrieben, sondern verdoppelt.
  res.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return res;
}

/** Das gespeicherte Refresh-Token, oder null. */
export async function readRefreshCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value ?? null;
}

interface BackendCall {
  status: number;
  body: unknown;
}

/**
 * Ruft das Backend auf und gibt Status und Rumpf unverändert zurück.
 *
 * Fehler werden bewusst NICHT vereinheitlicht: der Client unterscheidet
 * anhand von Status und Fehlercode (401 InvalidCredentials, 403
 * PasswordChangeRequired, 429 ...). Ein Route Handler, der alles zu "500"
 * einebnet, nähme ihm genau diese Information.
 */
export async function callBackend(path: string, init: RequestInit): Promise<BackendCall> {
  const res = await fetch(`${backendUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    // Kein Zwischenspeicher für Auth-Aufrufe.
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

interface AuthResultShape {
  accessToken: string;
  refreshToken: string;
  user: unknown;
}

/** Prüft, ob das Backend ein vollständiges Token-Paar geliefert hat. */
export function isAuthResult(body: unknown): body is AuthResultShape {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.accessToken === "string" &&
    typeof candidate.refreshToken === "string" &&
    typeof candidate.user === "object" &&
    candidate.user !== null
  );
}
