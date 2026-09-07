import { apiFetch } from "./client";
import { getApiConfig } from "./config";
import type { UserRole } from "./auth";

/**
 * Chat Fachkraft <-> Koordination (MVP, Polling).
 * Fachkraft: caregiverId weglassen (eigene Konversation).
 * Planer: caregiverId erforderlich.
 */

export interface ChatSender {
  id: string;
  email: string;
  role: UserRole;
}

export interface ChatMessage {
  id: string;
  caregiverId: string;
  senderUserId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  sender: ChatSender;
}

export interface ChatConversation {
  caregiverId: string;
  count: number;
  messages: ChatMessage[];
}

export interface ListChatParams {
  caregiverId?: string;
  /** Nur Nachrichten nach diesem Zeitpunkt (Polling inkrementell). */
  after?: string;
  limit?: number;
}

/** Liest die Konversation; eingehende Nachrichten werden serverseitig als gelesen markiert. */
export async function listChatMessages(params: ListChatParams = {}): Promise<ChatConversation> {
  const query = new URLSearchParams();
  if (params.caregiverId) query.set("caregiverId", params.caregiverId);
  if (params.after) query.set("after", params.after);
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<ChatConversation>(`/chat/messages${qs ? `?${qs}` : ""}`);
}

export async function sendChatMessage(body: string, caregiverId?: string): Promise<ChatMessage> {
  return apiFetch<ChatMessage>("/chat/messages", { method: "POST", body: { body, caregiverId } });
}

/** Anzahl ungelesener eingehender Nachrichten (Badge). */
export async function chatUnreadCount(): Promise<number> {
  const res = await apiFetch<{ count: number }>("/chat/unread-count");
  return res.count;
}

export interface CaregiverUnread {
  caregiverId: string;
  count: number;
}

/**
 * Ungelesene Nachrichten je Konversation (nur Planer).
 * Konversationen ohne Ungelesene fehlen in der Liste – als 0 behandeln.
 */
export async function chatUnreadByCaregiver(): Promise<CaregiverUnread[]> {
  return apiFetch<CaregiverUnread[]>("/chat/unread-by-caregiver");
}

// ── Live-Strom (WebSocket) ────────────────────────────────────────────────

/**
 * Über WebSocket gepushte Nachricht.
 *
 * `ready` bestätigt, dass die Verbindung steht und gefiltert ist. Der Client
 * darf sein Abfragen im Takt erst danach einstellen -- vorher wüsste er nicht,
 * ob er gerade gar nichts empfängt oder nur nichts passiert.
 */
export type ChatSocketMessage =
  | { type: "ready"; caregiverId: string | null }
  | ({ type: "message" } & ChatMessage & { caregiverId: string });

/**
 * Baut die WebSocket-URL des Chat-Stroms. Der Token wird als Query
 * mitgegeben, da Browser bei WS keinen Authorization-Header setzen können.
 *
 * `caregiverId` nur für die Planung: sie wählt die offene Konversation. Eine
 * Fachkraft darf ihn nicht mitgeben -- das Backend weist die Verbindung sonst
 * ab, statt den Parameter stillschweigend zu übergehen.
 */
export function chatSocketUrl(token: string, caregiverId?: string): string {
  const { baseUrl } = getApiConfig();
  const wsBase = baseUrl.replace(/^http/i, "ws");
  const query = new URLSearchParams({ token });
  if (caregiverId) query.set("caregiverId", caregiverId);
  return `${wsBase}/chat/ws?${query.toString()}`;
}
