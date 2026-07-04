import { apiFetch } from "./client";
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
