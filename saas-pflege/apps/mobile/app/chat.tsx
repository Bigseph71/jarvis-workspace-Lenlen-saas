import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { listChatMessages, sendChatMessage, type ChatMessage } from "@len-len/api-client";
import { useAuth } from "@/lib/auth-context";

const POLL_INTERVAL_MS = 30_000;

export default function ChatScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { status } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const conv = await listChatMessages({ limit: 100 });
      setMessages(conv.messages);
    } catch {
      setError(t("common.errorGeneric"));
    }
  }, [t]);

  // Initial + Polling alle 30s (MVP; WebSocket kommt in Phase 2).
  useEffect(() => {
    void load();
    pollRef.current = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const onSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendChatMessage(body);
      setDraft("");
      await load();
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setSending(false);
    }
  }, [draft, sending, load, t]);

  if (status === "unauthenticated") return <Redirect href="/login" />;

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const own = item.sender.role === "FACHKRAFT";
    return (
      <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text style={own ? styles.bodyOwn : styles.bodyOther}>{item.body}</Text>
        <Text style={own ? styles.timeOwn : styles.timeOther}>{timeOf(item.createdAt)}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ {t("today.title")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("chat.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {messages === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.empty}>{t("chat.empty")}</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={t("chat.placeholder")}
          multiline
          maxLength={2000}
          editable={!sending}
        />
        <Pressable
          style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}
          onPress={() => void onSend()}
          disabled={!draft.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendText}>{t("chat.send")}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f4f5", paddingTop: 56 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  back: { color: "#1d4ed8", fontWeight: "600", fontSize: 15 },
  title: { fontSize: 18, fontWeight: "700" },
  headerSpacer: { width: 60 },
  error: { color: "#b91c1c", paddingHorizontal: 16, marginBottom: 8 },
  list: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  bubble: { maxWidth: "80%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleOwn: { alignSelf: "flex-end", backgroundColor: "#1d4ed8" },
  bubbleOther: { alignSelf: "flex-start", backgroundColor: "#fff" },
  bodyOwn: { color: "#fff", fontSize: 15 },
  bodyOther: { color: "#18181b", fontSize: 15 },
  timeOwn: { color: "#bfdbfe", fontSize: 10, marginTop: 2, textAlign: "right" },
  timeOther: { color: "#a1a1aa", fontSize: 10, marginTop: 2, textAlign: "right" },
  // inverted-Liste dreht auch das Empty-Layout: zurückdrehen.
  emptyWrap: { transform: [{ scaleY: -1 }], paddingTop: 40 },
  empty: { textAlign: "center", color: "#666" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 100,
    backgroundColor: "#fff",
  },
  send: {
    backgroundColor: "#1d4ed8",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: "#fff", fontWeight: "600" },
});
