import { NextResponse, type NextRequest } from "next/server";
import {
  callBackend,
  readRefreshCookie,
  withRefreshCookie,
  withoutRefreshCookie,
} from "@/lib/server/session-cookie";

// Liest und schreibt Cookies – darf nicht vorgerendert werden.
export const dynamic = "force-dynamic";

/**
 * `POST /api/auth/session` – nimmt das Refresh-Token einer frischen Anmeldung
 * entgegen und legt es ins httpOnly-Cookie.
 *
 * WARUM DER LOGIN NICHT HIER DURCHLÄUFT: das Backend begrenzt `/auth/login`
 * auf 10 Versuche je Minute und IP. Liefe die Anmeldung über diesen Handler,
 * käme sie für das Backend von genau einer Adresse – der des Web-Servers.
 * Alle Benutzer teilten sich dann einen Zähler: wer sich zehnmal vertippt,
 * sperrt die gesamte Organisation aus, und ein Angreifer bräuchte nur zehn
 * Fehlversuche, um den Login für alle lahmzulegen. Der Brute-Force-Schutz
 * verlangt die echte Absender-IP, also den direkten Weg vom Browser.
 *
 * Der Preis: das Refresh-Token ist einmal, für die Dauer eines Funktionsaufrufs,
 * im Browser-JavaScript sichtbar, bevor es hierher wandert. Es wird dabei
 * nirgends abgelegt. Wer in diesem Moment Code auf der Seite ausführt, könnte
 * es mitlesen – dann aber ebenso das gerade eingetippte Passwort. Was zählt,
 * ist der Dauerzustand: zwischen den Anmeldungen, also fast immer, ist das
 * Token für JavaScript unerreichbar.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "BadRequest", message: "Ungültiger Rumpf" }, { status: 400 });
  }

  const refreshToken = (payload as { refreshToken?: unknown })?.refreshToken;
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    return NextResponse.json(
      { error: "BadRequest", message: "refreshToken fehlt" },
      { status: 400 },
    );
  }

  // Das Token wird hier nicht geprüft: die einzige Prüfung wäre eine Rotation,
  // und die würde es verbrauchen. Ein untaugliches Token kostet nichts – der
  // nächste Refresh scheitert und räumt das Cookie ab.
  return withRefreshCookie({ ok: true }, refreshToken);
}

/**
 * `DELETE /api/auth/session` – Abmeldung: widerruft das Token im Backend und
 * löscht das Cookie.
 *
 * Das Cookie wird auch dann gelöscht, wenn der Widerruf scheitert. Andernfalls
 * bliebe nach einer Netzstörung ein Cookie zurück, das den Benutzer beim
 * nächsten Aufruf wieder anmeldet – obwohl er auf "Abmelden" geklickt hat.
 */
export async function DELETE(): Promise<NextResponse> {
  const refreshToken = await readRefreshCookie();
  if (refreshToken) {
    await callBackend("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  return withoutRefreshCookie({ ok: true });
}
