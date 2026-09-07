import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { UserRole, withTenant } from "@len-len/database";
import { authenticateSocket, closeWithAuthError } from "../../lib/ws-auth.js";
import { subscribeToOrgChat, type ChatEvent } from "../../lib/realtime.js";

const querySchema = z.object({
  token: z.string().min(1),
  /**
   * Konversation, die der Planer offen hat. Für die Fachkraft verboten: sie
   * hat genau eine, und die bestimmt ihr Konto -- nicht die Adresszeile.
   */
  caregiverId: z.string().uuid().optional(),
});

/** Dieselbe Rollenmenge wie die REST-Endpunkte (chat.routes: canChat). */
const CHAT_ROLES: readonly UserRole[] = [
  UserRole.STRUKTUR_ADMIN,
  UserRole.KOORDINATOR,
  UserRole.FACHKRAFT,
];

/** Sendet nur, wenn der Socket offen ist (OPEN === 1). */
function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

/**
 * WebSocket-Strom des Chats.
 *
 * Verbindung: GET /chat/ws?token=<access-jwt>[&caregiverId=<uuid>]
 * (Browser können bei WS keinen Authorization-Header setzen -> Token als Query.)
 *
 * Ersetzt das Abfragen im 30-Sekunden-Takt auf beiden Seiten. Dreissig Sekunden
 * sind für eine Rückfrage aus dem Treppenhaus zu lang: die Fachkraft steht beim
 * Patienten und wartet auf eine Antwort, die längst geschrieben ist.
 *
 * WER WAS SIEHT -- der Kanal trägt den ganzen Tenant, gefiltert wird hier:
 *
 *   Fachkraft   ausschliesslich die eigene Konversation. Ihre `caregiverId`
 *               kommt aus ihrem Konto, nie aus der Anfrage; ein mitgegebener
 *               Parameter wird abgewiesen statt ignoriert, sonst hielte der
 *               Aufrufer sich für berechtigt.
 *   Planung     eine Konversation nach Wahl, oder alle ohne Angabe. Das
 *               entspricht der Übersicht, die im Web ohnehin alle Fachkräfte
 *               nebeneinander zeigt.
 *
 * Ohne diesen Filter bekäme jede Fachkraft die Unterhaltungen ihrer
 * Kolleginnen -- Gesundheitsdaten von Patienten, die sie nicht betreut.
 */
export async function chatWsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/chat/ws", { websocket: true }, async (socket: WebSocket, request: FastifyRequest) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success) {
      socket.close(1008, "Ungültige Anfrage");
      return;
    }

    let organizationId: string;
    let userId: string;
    let role: UserRole;
    try {
      const claims = await authenticateSocket(query.data.token, { allow: CHAT_ROLES });
      organizationId = claims.org;
      userId = claims.sub;
      role = claims.role as UserRole;
    } catch (err) {
      closeWithAuthError(socket, err);
      return;
    }

    // Auf welche Konversation dieser Socket hört. `null` = alle (nur Planung).
    let scope: string | null = null;

    if (role === UserRole.FACHKRAFT) {
      if (query.data.caregiverId !== undefined) {
        socket.close(1008, "Fachkräfte haben nur Zugriff auf die eigene Konversation");
        return;
      }
      try {
        const caregiver = await withTenant(organizationId, (tx) =>
          tx.caregiver.findFirst({
            where: { userId, organizationId },
            select: { id: true },
          }),
        );
        if (!caregiver) {
          socket.close(1008, "Kein Fachkraft-Profil mit deinem Konto verknüpft");
          return;
        }
        scope = caregiver.id;
      } catch {
        socket.close(1011, "Interner Fehler");
        return;
      }
    } else {
      scope = query.data.caregiverId ?? null;
    }

    // Bestätigung, bevor irgendetwas fliesst: der Client weiss damit, dass er
    // sein Abfragen im Takt einstellen darf. Ohne dieses Zeichen müsste er
    // raten, ob die Verbindung wirklich steht.
    send(socket, { type: "ready", caregiverId: scope });

    const unsubscribe = subscribeToOrgChat(organizationId, (event: ChatEvent) => {
      if (scope !== null && event.caregiverId !== scope) return;
      send(socket, { type: "message", ...event });
    });

    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });
}
