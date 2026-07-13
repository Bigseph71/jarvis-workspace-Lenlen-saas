import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { verifyAccessToken } from "../../lib/tokens.js";
import { canViewOrgLive } from "../../lib/tracking/scope.js";
import { subscribeToOrg, type TrackingEvent } from "../../lib/realtime.js";
import { livePositions } from "./tracking.service.js";

const querySchema = z.object({ token: z.string().min(1) });

/** Sendet nur, wenn der Socket offen ist (OPEN === 1). */
function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

/**
 * WebSocket-Stream der Live-Positionen für die Koordination (Karte /planung).
 *
 * Verbindung: GET /tracking/live/ws?token=<access-jwt>
 * (Browser können bei WS keinen Authorization-Header setzen -> Token als Query.)
 *
 * Ablauf: Auth + Rollenprüfung (nur organisationsweit berechtigte Rollen) ->
 * initialer Snapshot (livePositions) -> Abonnement des Redis-Pub/Sub-Streams
 * des Tenants. Jede neue Position wird als `{type:"position", ...}` gepusht.
 */
export async function trackingWsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tracking/live/ws", { websocket: true }, async (socket: WebSocket, request: FastifyRequest) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success) {
      socket.close(1008, "Ungültige Anfrage");
      return;
    }

    let ctx;
    try {
      const claims = verifyAccessToken(query.data.token);
      if (!canViewOrgLive(claims.role)) {
        socket.close(1008, "Keine Berechtigung");
        return;
      }
      ctx = { organizationId: claims.org, userId: claims.sub };
    } catch {
      socket.close(1008, "Nicht authentifiziert");
      return;
    }

    // Initialer Snapshot (aktueller Stand beim Verbindungsaufbau).
    try {
      send(socket, { type: "snapshot", positions: await livePositions(ctx) });
    } catch {
      socket.close(1011, "Interner Fehler");
      return;
    }

    // Live-Abonnement des Tenants.
    const unsubscribe = subscribeToOrg(ctx.organizationId, (event: TrackingEvent) => {
      send(socket, { type: "position", ...event });
    });

    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });
}
