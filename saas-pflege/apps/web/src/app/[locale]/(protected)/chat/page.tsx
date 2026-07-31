"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  listCaregivers,
  listChatMessages,
  sendChatMessage,
  chatUnreadCount,
  chatUnreadByCaregiver,
  type Caregiver,
  type ChatMessage,
  type UserRole,
} from "@len-len/api-client";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * Chat Koordination <-> Fachkraft (Planer-Seite).
 *
 * Das Backend führt je Fachkraft eine Konversation und verlangt von Planern
 * eine caregiverId – daher die zweispaltige Ansicht: links die Fachkraft
 * wählen, rechts der Verlauf.
 *
 * Polling wie in der mobilen App (MVP; WebSocket ist für Phase 2 vorgesehen).
 */

// Rollen, die das Backend auf /chat zulässt (ohne FACHKRAFT: die nutzt die App).
const PLANNER_ROLES: readonly UserRole[] = ["SUPER_ADMIN", "STRUKTUR_ADMIN", "KOORDINATOR"];

const POLL_INTERVAL_MS = 30_000;
const CAREGIVER_PAGE_SIZE = 100;
const MESSAGE_LIMIT = 100;
const MAX_BODY_LENGTH = 2000;

type LoadState = "loading" | "ready" | "error";

export default function ChatPage() {
  const t = useTranslations("chat");
  const locale = useLocale();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [caregiverState, setCaregiverState] = useState<LoadState>("loading");
  const [truncated, setTruncated] = useState(false);

  const [selected, setSelected] = useState<Caregiver | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [messageState, setMessageState] = useState<LoadState>("ready");

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [unread, setUnread] = useState(0);
  const [unreadByCaregiver, setUnreadByCaregiver] = useState<Map<string, number>>(new Map());

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Fachkräfte für die Auswahlliste (nur aktive – inaktive haben keinen Zugang).
  useEffect(() => {
    let active = true;
    setCaregiverState("loading");
    listCaregivers({ pageSize: CAREGIVER_PAGE_SIZE, search: debouncedSearch || undefined })
      .then((res) => {
        if (!active) return;
        setCaregivers(res.data);
        setTruncated(res.total > res.data.length);
        setCaregiverState("ready");
      })
      .catch(() => {
        if (active) setCaregiverState("error");
      });
    return () => {
      active = false;
    };
  }, [debouncedSearch]);

  const loadMessages = useCallback(async (caregiverId: string) => {
    try {
      const conv = await listChatMessages({ caregiverId, limit: MESSAGE_LIMIT });
      setMessages(conv.messages);
      setMessageState("ready");
    } catch {
      setMessageState("error");
    }
  }, []);

  const loadUnread = useCallback(async () => {
    try {
      const [total, perCaregiver] = await Promise.all([
        chatUnreadCount(),
        chatUnreadByCaregiver(),
      ]);
      setUnread(total);
      setUnreadByCaregiver(new Map(perCaregiver.map((u) => [u.caregiverId, u.count])));
    } catch {
      /* Badges sind Beiwerk – Fehler nicht anzeigen. */
    }
  }, []);

  // Verlauf der gewählten Konversation + Badge, initial und per Polling.
  useEffect(() => {
    if (!selected) {
      setMessages(null);
      return;
    }
    const caregiverId = selected.id;
    setMessageState("loading");
    setMessages(null);

    // Reihenfolge zählt: das Abrufen markiert eingehende Nachrichten als
    // gelesen. Die Badges erst danach holen, sonst zeigen sie bis zum nächsten
    // Poll einen veralteten Stand.
    const refresh = () => void loadMessages(caregiverId).then(loadUnread);

    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [selected, loadMessages, loadUnread]);

  useEffect(() => {
    void loadUnread();
  }, [loadUnread]);

  // Nach neuen Nachrichten ans Ende springen.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selected || sending) return;

    setSending(true);
    setSendError(false);
    try {
      await sendChatMessage(body, selected.id);
      setDraft("");
      await loadMessages(selected.id);
      await loadUnread();
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  }

  const formatStamp = (iso: string) => {
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleString(locale, {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
  };

  // Zugriffsschutz zusätzlich zur Nav-Filterung (Backend erzwingt es ohnehin).
  if (user && !PLANNER_ROLES.includes(user.role)) {
    return null;
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        {unread > 0 ? (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
            {t("unread", { count: unread })}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {/* Auswahl der Fachkraft (= Konversation). */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white md:col-span-1">
          <div className="border-b border-gray-200 p-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>

          <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto">
            {caregiverState === "loading" ? (
              <li className="px-4 py-8 text-center text-sm text-gray-400">{t("loading")}</li>
            ) : caregiverState === "error" ? (
              <li className="px-4 py-8 text-center text-sm text-red-600">{t("caregiversError")}</li>
            ) : caregivers.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-gray-400">{t("noCaregivers")}</li>
            ) : (
              caregivers.map((c) => {
                const active = selected?.id === c.id;
                const pending = unreadByCaregiver.get(c.id) ?? 0;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(c)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition ${
                        active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className={pending > 0 && !active ? "font-semibold text-gray-900" : ""}>
                        {c.lastName}, {c.firstName}
                      </span>
                      {pending > 0 ? (
                        <span
                          aria-label={t("unread", { count: pending })}
                          className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white"
                        >
                          {pending}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {truncated ? (
            <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-400">
              {t("searchHint")}
            </p>
          ) : null}
        </div>

        {/* Verlauf + Eingabe. */}
        <div className="flex min-h-[32rem] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white md:col-span-2">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-400">
              {t("noSelection")}
            </div>
          ) : (
            <>
              <div className="border-b border-gray-200 px-4 py-3">
                <span className="text-sm font-medium text-gray-900">
                  {selected.lastName}, {selected.firstName}
                </span>
              </div>

              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-gray-50 p-4">
                {messageState === "loading" ? (
                  <p className="py-8 text-center text-sm text-gray-400">{t("loading")}</p>
                ) : messageState === "error" ? (
                  <p className="py-8 text-center text-sm text-red-600">{t("error")}</p>
                ) : messages && messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">{t("empty")}</p>
                ) : (
                  messages?.map((m) => {
                    // Eigenes Lager = Koordination. Nachrichten von Kolleginnen
                    // und Kollegen stehen auf derselben Seite, aber mit Absender.
                    const fromPlanner = m.sender.role !== "FACHKRAFT";
                    const fromColleague = fromPlanner && m.sender.id !== user?.id;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${fromPlanner ? "items-end" : "items-start"}`}
                      >
                        {fromColleague ? (
                          <span className="mb-0.5 text-xs text-gray-400">{m.sender.email}</span>
                        ) : null}
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            fromPlanner
                              ? "bg-gray-900 text-white"
                              : "border border-gray-200 bg-white text-gray-900"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <span className="mt-1 block text-right text-[10px] text-gray-400">
                            {formatStamp(m.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form onSubmit={onSend} className="border-t border-gray-200 p-3">
                {sendError ? (
                  <p role="alert" className="mb-2 text-sm text-red-600">
                    {t("sendError")}
                  </p>
                ) : null}
                <div className="flex items-end gap-2">
                  <label htmlFor="chatBody" className="sr-only">
                    {t("placeholder")}
                  </label>
                  <textarea
                    id="chatBody"
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={MAX_BODY_LENGTH}
                    placeholder={t("placeholder")}
                    disabled={sending}
                    className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || sending}
                    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
                  >
                    {sending ? t("sending") : t("send")}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
