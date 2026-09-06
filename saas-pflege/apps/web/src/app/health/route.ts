import { NextResponse } from "next/server";
import { deployedCommit } from "@/lib/version";

/**
 * Health-Check des Frontends: `GET /health`.
 *
 * Anlass: nach einem Merge liess sich von aussen nicht feststellen, welcher
 * Stand des Webs ausgeliefert wird. Beim Backend beantwortet `/health` das seit
 * längerem; beim Web blieb nur Raten – und eine Änderung, die nur eine
 * Menüreihenfolge betrifft, ist von aussen gar nicht zu erkennen. Die Frage
 * "läuft das schon?" hing damit an einem Blick ins Hoster-Dashboard.
 *
 * Bewusst SCHMAL: nur Dienst, Version und Zeitstempel. Das Web hat keine
 * eigenen Abhängigkeiten zu prüfen – die Datenbank und Redis hängen am Backend,
 * und dessen `/health` beantwortet das bereits. Ein Frontend, das seinerseits
 * das Backend anpingt, würde bei einer Backend-Störung ebenfalls auf "krank"
 * springen und den Neustart eines völlig gesunden Containers auslösen.
 *
 * Liegt ausserhalb von `[locale]`: der Pfad soll `/health` heissen und nicht
 * `/de/health`. Die next-intl-Middleware lässt ihn deshalb aus (siehe
 * `middleware.ts`).
 */

// Ohne dies würde Next die Antwort zur Bauzeit einfrieren, und der Zeitstempel
// wäre für die Lebensdauer des Containers derselbe – also wertlos.
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json({
    status: "ok",
    service: "web",
    version: deployedCommit(),
    ts: new Date().toISOString(),
  });
}
