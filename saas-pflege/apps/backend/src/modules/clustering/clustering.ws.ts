import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { verifyAccessToken } from "../../lib/tokens.js";
import {
  clusteringJobId,
  getClusteringJobStatus,
  getClusteringQueueEvents,
  type VrptwJobStatus,
} from "../../lib/queue.js";
import { clusteringSocketQuerySchema } from "./clustering.schemas.js";

interface StatusMessage {
  type: "status";
  date: string;
  status: VrptwJobStatus;
  at: string;
  result?: unknown;
  error?: string;
}

function send(socket: WebSocket, msg: StatusMessage): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(msg));
}

function statusMsg(
  date: string,
  status: VrptwJobStatus,
  extra?: { result?: unknown; error?: string },
): StatusMessage {
  return { type: "status", date, status, at: new Date().toISOString(), ...extra };
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
 * Statusstrom einer asynchronen Gebietsaufteilung.
 *
 * Verbindung: GET /clustering/status/ws?token=<access-jwt>&date=YYYY-MM-DD
 * (Browser können bei WebSockets keinen Authorization-Header setzen.)
 *
 * Die Job-ID wird aus Organisation und Datum HERGELEITET, nicht übergeben. Das
 * ist der Punkt, an dem die Tenant-Trennung hier hängt: ein Client kann keine
 * fremde Job-ID nennen, weil er die ID gar nicht liefert – die Organisation
 * kommt aus dem signierten Token. Ohne diese Herleitung wäre der Stream ein
 * Weg, das Ergebnis einer anderen Struktur mitzulesen.
 *
 * Statusfolge: pending -> processing -> done | failed.
 */
export async function clusteringWsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/clustering/status/ws", { websocket: true }, async (socket: WebSocket, request: FastifyRequest) => {
    const query = clusteringSocketQuerySchema.safeParse(request.query);
    if (!query.success) {
      socket.close(1008, "Ungültige Anfrage");
      return;
    }
    const { date } = query.data;

    let organizationId: string;
    try {
      organizationId = verifyAccessToken(query.data.token).org;
    } catch {
      socket.close(1008, "Nicht authentifiziert");
      return;
    }

    const jobId = clusteringJobId(organizationId, date);

    // Erster Schnappschuss: wer sich nach Abschluss verbindet, bekommt das
    // Ergebnis trotzdem (der Job überlebt seinen Abschluss um eine Stunde).
    try {
      const job = await getClusteringJobStatus(organizationId, date);
      send(
        socket,
        statusMsg(date, job.status, {
          result: job.status === "done" ? parseReturnValue(job.result) : undefined,
          error: job.error,
        }),
      );
    } catch {
      socket.close(1011, "Status nicht abrufbar");
      return;
    }

    const events = getClusteringQueueEvents();

    const onWaiting = (e: { jobId: string }): void => {
      if (e.jobId === jobId) send(socket, statusMsg(date, "pending"));
    };
    const onActive = (e: { jobId: string }): void => {
      if (e.jobId === jobId) send(socket, statusMsg(date, "processing"));
    };
    const onCompleted = (e: { jobId: string; returnvalue: unknown }): void => {
      if (e.jobId === jobId) {
        send(socket, statusMsg(date, "done", { result: parseReturnValue(e.returnvalue) }));
      }
    };
    const onFailed = (e: { jobId: string; failedReason: string }): void => {
      if (e.jobId === jobId) send(socket, statusMsg(date, "failed", { error: e.failedReason }));
    };

    events.on("waiting", onWaiting);
    events.on("active", onActive);
    events.on("completed", onCompleted);
    events.on("failed", onFailed);

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
