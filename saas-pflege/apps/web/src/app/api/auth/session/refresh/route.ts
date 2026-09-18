import { NextResponse } from "next/server";
import {
  callBackend,
  isAuthResult,
  readRefreshCookie,
  withRefreshCookie,
  withoutRefreshCookie,
} from "@/lib/server/session-cookie";

export const dynamic = "force-dynamic";

/**
 * `POST /api/auth/session/refresh` – tauscht das Cookie gegen einen frischen
 * Access-Token und rotiert dabei das Refresh-Token.
 *
 * Der eigentliche Zweck der ganzen Umstellung: dieser Schritt läuft alle 15
 * Minuten und bei jedem Seitenaufruf, das Token ist also praktisch immer
 * verfügbar. Genau deshalb darf es nicht dort liegen, wo JavaScript es findet.
 *
 * Antwortet mit 200 und `{ session: null }`, wenn keine gültige Sitzung
 * besteht – das ist der Normalfall beim ersten Aufruf ohne Anmeldung und kein
 * Fehler. Ein 401 an dieser Stelle würde in der Browser-Konsole jeden ersten
 * Seitenaufruf rot einfärben und echte Fehler darin untergehen lassen.
 */
export async function POST(): Promise<NextResponse> {
  const refreshToken = await readRefreshCookie();
  if (!refreshToken) return NextResponse.json({ session: null });

  const { status, body } = await callBackend("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });

  if (status >= 500) {
    // Backend gestört: das Cookie NICHT anfassen. Es könnte gültig sein, und
    // ein Ausfall von einer Minute darf nicht jede Sitzung der Plattform
    // beenden – die Benutzer müssten sich danach alle neu anmelden.
    return NextResponse.json(
      { error: "BadGateway", message: "Anmeldedienst nicht erreichbar" },
      { status: 502 },
    );
  }

  if (!isAuthResult(body)) {
    // Abgelaufen, widerrufen oder wiederverwendet: das Cookie ist wertlos.
    return withoutRefreshCookie({ session: null });
  }

  return withRefreshCookie(
    { session: { accessToken: body.accessToken, user: body.user } },
    body.refreshToken,
  );
}
