import type { WebSocket } from "@fastify/websocket";
import type { UserRole } from "@len-len/database";
import { verifyAccessToken, type AccessTokenClaims } from "./tokens.js";
import { isAccessTokenRevoked } from "./token-revocation.js";

/**
 * Authentifizierung für WebSocket-Verbindungen.
 *
 * Das Gegenstück zum preHandler `authenticate` (plugins/authenticate.ts), den
 * ein WebSocket nicht benutzen kann: der Browser darf beim Verbindungsaufbau
 * keinen Authorization-Header setzen, das Token kommt daher aus der Query.
 *
 * Der Grund für diese Datei: jeder der drei Streams hatte seine eigene, per
 * Hand gebaute Prüfung – und jede war anders unvollständig. Zwei fragten die
 * Rolle nicht ab, alle drei übersprangen Sperrliste und erzwungenen
 * Passwortwechsel. Ein Token, das an jeder REST-Route abgewiesen wurde, öffnete
 * am WebSocket weiterhin den Datenstrom. Wer künftig einen Stream hinzufügt,
 * ruft hier auf und bekommt dieselben Prüfungen wie das REST.
 */

/** Abbruchgrund mit passendem WebSocket-Schließcode (1008 = Policy Violation). */
export class SocketAuthError extends Error {
  constructor(
    readonly closeCode: number,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "SocketAuthError";
  }
}

export interface SocketAuthOptions {
  /**
   * Erlaubte Rollen. Fehlt die Angabe, wird die Rolle NICHT geprüft – das ist
   * nur richtig, wenn der Stream für jede angemeldete Rolle offensteht, und
   * gehört dann an der Aufrufstelle begründet.
   */
  allow?: readonly UserRole[];
}

/**
 * Prüft das Token einer WebSocket-Verbindung. Wirft `SocketAuthError`, sonst
 * liefert es die Claims.
 *
 * Reihenfolge wie im REST: Signatur, Sperrliste, erzwungener Passwortwechsel,
 * Rolle.
 */
export async function authenticateSocket(
  token: string,
  options: SocketAuthOptions = {},
): Promise<AccessTokenClaims> {
  let claims: AccessTokenClaims;
  try {
    claims = verifyAccessToken(token);
  } catch {
    throw new SocketAuthError(1008, "Nicht authentifiziert");
  }

  if (await isAccessTokenRevoked(claims.sub, claims.iat)) {
    throw new SocketAuthError(1008, "Sitzung wurde beendet");
  }

  // Ein Konto mit erzwungenem Passwortwechsel ist bis zum Wechsel funktionslos.
  // Am WebSocket muss das genauso gelten, sonst bliebe der Datenstrom offen,
  // während jede REST-Route 403 liefert.
  if (claims.chpw === true) {
    throw new SocketAuthError(1008, "Passwortwechsel erforderlich");
  }

  if (options.allow && !options.allow.includes(claims.role)) {
    throw new SocketAuthError(1008, "Keine Berechtigung");
  }

  return claims;
}

/** Schließt den Socket mit dem Grund aus dem Fehler (sonst: interner Fehler). */
export function closeWithAuthError(socket: WebSocket, err: unknown): void {
  if (err instanceof SocketAuthError) {
    socket.close(err.closeCode, err.reason);
    return;
  }
  socket.close(1011, "Interner Fehler");
}
