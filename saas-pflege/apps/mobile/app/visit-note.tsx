import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ApiError, myVisits, writeVisitNote, type MyVisit } from "@len-len/api-client";
import { useAuth } from "@/lib/auth-context";

/** Zwei Stunden, wie in visit.rules.ts (NOTE_EDIT_WINDOW_MS) im Backend. */
const NOTE_EDIT_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Besuchsnotiz schreiben oder ändern.
 *
 * Eigener Bildschirm statt eines Feldes in der Tagesliste: die Notiz ist ein
 * Fliesstext, der Platz und Tastatur braucht, und die Liste bleibt scanbar.
 *
 * Der Besuch wird hier neu geladen statt über Parameter durchgereicht – so
 * steht garantiert der aktuelle Stand da, auch wenn die Liste im Hintergrund
 * älter ist. Ein Formular, das auf veralteten Daten aufsetzt, überschreibt
 * sonst stillschweigend eine Notiz, die inzwischen jemand geändert hat.
 */
export default function VisitNoteScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { status } = useAuth();
  const { visitId } = useLocalSearchParams<{ visitId: string }>();

  const [visit, setVisit] = useState<MyVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [hasIncident, setHasIncident] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    myVisits()
      .then((day) => {
        if (!active) return;
        const found = day.visits.find((v) => v.id === visitId) ?? null;
        setVisit(found);
        setNote(found?.visitNote ?? "");
        setHasIncident(found?.hasIncident ?? false);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(t("common.errorGeneric"));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visitId, t]);

  if (status === "unauthenticated") return <Redirect href="/login" />;

  // Bei gemeldetem Vorfall ist der Text Pflicht – dieselbe Regel wie im
  // Backend, hier nur damit der Knopf nicht in einen 422 führt.
  const trimmed = note.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit || !visit) return;
    setSubmitting(true);
    setError(null);
    try {
      await writeVisitNote(visit.id, { note: trimmed, hasIncident });
      router.replace("/today");
    } catch (err) {
      // Die Meldung des Backends ist deutsch. Sie hier durchzureichen würde in
      // einer französischen oder englischen Sitzung deutschen Text anzeigen, und
      // sie durch „Etwas ist schiefgelaufen“ zu ersetzen würde den Grund
      // verschweigen. Also aus Status + bekanntem Zustand rekonstruieren: der
      // Bildschirm weiss, ob schon eine Notiz existiert, und das trennt die
      // beiden 409-Fälle eindeutig.
      if (err instanceof ApiError && err.status === 409) {
        setError(t(visit.visitNote ? "visitNote.windowExpired" : "visitNote.notStarted"));
      } else if (err instanceof ApiError && err.status === 422) {
        setError(t(hasIncident ? "visitNote.incidentNeedsNote" : "visitNote.emptyNote"));
      } else {
        setError(t("common.errorGeneric"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!visit) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{t("visitNote.notFound")}</Text>
        <Pressable onPress={() => router.replace("/today")}>
          <Text style={styles.link}>{t("visitNote.back")}</Text>
        </Pressable>
      </View>
    );
  }

  const started = visit.gpsArrivalAt !== null;
  // Gespiegelte Backend-Regel (checkVisitNote): eine bereits geschriebene Notiz
  // ist zwei Stunden nach der Abfahrt festgeschrieben. Hier nur, um ein Formular
  // zu vermeiden, das nach dem Tippen abgewiesen wird – entschieden wird
  // serverseitig.
  const locked =
    visit.visitNote !== null &&
    visit.gpsDepartureAt !== null &&
    Date.now() - new Date(visit.gpsDepartureAt).getTime() > NOTE_EDIT_WINDOW_MS;
  const time = new Date(visit.scheduledAt).toLocaleTimeString(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("visitNote.title")}</Text>
        <Text style={styles.patient}>
          {visit.patient.firstName} {visit.patient.lastName}
        </Text>
        <Text style={styles.meta}>{time}</Text>

        {!started ? (
          <View style={styles.blocked}>
            <Text style={styles.blockedText}>{t("visitNote.notStarted")}</Text>
          </View>
        ) : locked ? (
          <>
            <View style={styles.blocked}>
              <Text style={styles.blockedText}>{t("visitNote.windowExpired")}</Text>
            </View>
            <Text style={styles.label}>{t("visitNote.field")}</Text>
            <Text style={styles.readonly}>{visit.visitNote}</Text>
            {visit.hasIncident ? (
              <Text style={styles.incidentTitle}>{t("visitNote.incident")}</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.label}>{t("visitNote.field")}</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={8}
              maxLength={4000}
              textAlignVertical="top"
              placeholder={t("visitNote.placeholder")}
              editable={!submitting}
            />

            <View style={styles.switchRow}>
              <Switch
                value={hasIncident}
                onValueChange={setHasIncident}
                disabled={submitting}
                accessibilityLabel={t("visitNote.incident")}
              />
              <View style={styles.switchLabel}>
                <Text style={styles.incidentTitle}>{t("visitNote.incident")}</Text>
                <Text style={styles.hint}>{t("visitNote.incidentHint")}</Text>
              </View>
            </View>

            {visit.visitNote ? <Text style={styles.hint}>{t("visitNote.editWindow")}</Text> : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.button, !canSubmit && styles.disabled]}
              onPress={onSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t("visitNote.save")}</Text>
              )}
            </Pressable>
          </>
        )}

        <Pressable onPress={() => router.replace("/today")} disabled={submitting}>
          <Text style={styles.link}>{t("visitNote.back")}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f4f5" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 20 },
  content: { padding: 20, gap: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  patient: { fontSize: 17, fontWeight: "600", marginTop: 8 },
  meta: { fontSize: 13, color: "#666", marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#333", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#fff",
    minHeight: 160,
    marginTop: 4,
  },
  switchRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 16 },
  switchLabel: { flex: 1 },
  incidentTitle: { fontSize: 15, fontWeight: "600" },
  hint: { fontSize: 12, color: "#666", marginTop: 4 },
  blocked: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 14,
    marginTop: 12,
  },
  blockedText: { fontSize: 14, color: "#92400e" },
  readonly: {
    borderWidth: 1,
    borderColor: "#e4e4e7",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#fafafa",
    color: "#3f3f46",
    marginTop: 4,
  },
  error: { color: "#b91c1c", fontSize: 13, marginTop: 12 },
  button: {
    marginTop: 20,
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  link: { color: "#1d4ed8", textAlign: "center", marginTop: 20, fontSize: 15 },
});
