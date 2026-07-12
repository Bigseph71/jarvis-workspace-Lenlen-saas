import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { verifyAccessToken } from "../../lib/tokens.js";
import {
  getVrptwJobStatus,
  getVrptwQueueEvents,
  type VrptwJobStatus,
} from "../../lib/queue.js";
import { getRoute } from "./vrptw.service.js";
import { AppError } from "../../lib/errors.js";

const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({ token: z.string().min(1) });

interface StatusMessage {
  type: "status";
  routeId: string;
  status: VrptwJobStatus;
  at: string;
  result?: unknown;
  error?: string;
}

/** Sendet nur, wenn der Socket offen ist (OPEN === 1). */
function send(socket: WebSocket, msg: StatusMessage): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(msg));
}

function statusMsg(routeId: string, status: VrptwJobStatus, extra?: { result?: unknown; error?: string }): StatusMessage {
  return { type: "status", routeId, status, at: new Date().toISOString(), ...extra };
}

/** QueueEvents liefert returnvalue als String – best-effort in JSON parsen. */
function parseReturnValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * WebSocket-Statusstream einer VRPTW-Optimierung (Echtzeit, CLAUDE.md Phase 2).
 *
 * Verbindung: GET /routes/:id/status/ws?token=<access-jwt>
 * (Browser können bei WS keinen Authorization-Header setzen -> Token als Query.)
 *
 * Ablauf: Auth + Tenant-Prüfung -> initialer Snapshot (aktueller Job-/DB-Stand)
 * -> Abonnement des Redis-basierten QueueEvents-Streams, gefiltert auf jobId ===
 * routeId. Statusfolge: pending -> processing -> done | failed.
 */
export async function vrptwWsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/routes/:id/status/ws", { websocket: true }, async (socket: WebSocket, request: FastifyRequest) => {
    // 1) Validierung + Auth (Fehler -> Socket sauber schließen).
    const params = paramsSchema.safeParse(request.params);
    const query = querySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      socket.close(1008, "Ungültige Anfrage");
      return;
    }
    const routeId = params.data.id;

    let ctx;
    try {
      const claims = verifyAccessToken(query.data.token);
      ctx = { organizationId: claims.org, userId: claims.sub };
    } catch {
      socket.close(1008, "Nicht authentifiziert");
      return;
    }

    // 2) Tenant-Prüfung: Route muss zur Organisation gehören (sonst 404 -> close).
    try {
      const route = await getRoute(ctx, routeId);
      // 3) Initialer Snapshot: aktiver Job-Zustand hat Vorrang, sonst DB-Stand.
      const job = await getVrptwJobStatus(routeId);
      if (job.status !== "unknown") {
        send(socket, statusMsg(routeId, job.status, {
          result: job.status === "done" ? parseReturnValue(job.result) : undefined,
          error: job.error,
        }));
      } else {
        send(
          socket,
          route.optimized
            ? statusMsg(routeId, "done", {
                result: {
                  order: route.visitsOrder,
                  totalKm: route.totalKm,
                  score: route.vrptwScore,
                  vehicleId: route.vehicleId,
                },
              })
            : statusMsg(routeId, "pending"),
        );
      }
    } catch (err) {
      const code = err instanceof AppError && err.statusCode === 404 ? 1008 : 1011;
      socket.close(code, err instanceof AppError ? err.message : "Interner Fehler");
      return;
    }

    // 4) Live-Abonnement (QueueEvents, gefiltert nach jobId === routeId).
    const events = getVrptwQueueEvents();

    const onWaiting = ({ jobId }: { jobId: string }): void => {
      if (jobId === routeId) send(socket, statusMsg(routeId, "pending"));
    };
    const onActive = ({ jobId }: { jobId: string }): void => {
      if (jobId === routeId) send(socket, statusMsg(routeId, "processing"));
    };
    const onCompleted = ({ jobId, returnvalue }: { jobId: string; returnvalue: unknown }): void => {
      if (jobId === routeId) {
        send(socket, statusMsg(routeId, "done", { result: parseReturnValue(returnvalue) }));
      }
    };
    const onFailed = ({ jobId, failedReason }: { jobId: string; failedReason: string }): void => {
      if (jobId === routeId) send(socket, statusMsg(routeId, "failed", { error: failedReason }));
    };

    events.on("waiting", onWaiting);
    events.on("active", onActive);
    events.on("completed", onCompleted);
    events.on("failed", onFailed);

    // 5) Aufräumen: Listener beim Schließen der Verbindung entfernen (kein Leak).
    const cleanup = (): void => {
      events.off("waiting", onWaiting);
      events.off("active", onActive);
      events.off("completed", onCompleted);
      events.off("failed", onFailed);
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });
}
