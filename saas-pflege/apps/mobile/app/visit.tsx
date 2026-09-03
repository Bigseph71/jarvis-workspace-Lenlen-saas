import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { myVisits, type MyVisit } from "@len-len/api-client";
import { useAuth } from "@/lib/auth-context";
import { performPointage } from "@/lib/pointage";
import { color, font, radius, MIN_TOUCH_HEIGHT } from "@/lib/theme";
import { initialsFromName } from "@/lib/initials";
import { driftMinutes } from "@/lib/tour";
import { CARE_TASKS, type CareTaskState } from "@/lib/demo-visit";

/**
 * Laufender Besuch.
 *
 * Der Bildschirm mischt Echtes und Beispielhaftes, und die Trennung ist hier
 * strenger als im Web:
 *
 *   ECHT       Ankunft, Abweichung zum Termin, Patient, Position im Tag,
 *              die Besuchsnotiz und das Pointage der Abfahrt.
 *   BEISPIEL   die Leistungsliste und die Anweisung der Koordination – beide
 *              NICHT bedienbar (siehe lib/demo-visit für die Begründung).
 */
export default function VisitScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { status } = useAuth();
  const { visitId } = useLocalSearchParams<{ visitId: string }>();

  const [visit, setVisit] = useState<MyVisit | null>(null);
  const [position, setPosition] = useState<{ index: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    myVisits()
      .then((day) => {
        if (!active) return;
        const index = day.visits.findIndex((v) => v.id === visitId);
        setVisit(index >= 0 ? day.visits[index]! : null);
        setPosition(index >= 0 ? { index: index + 1, total: day.visits.length } : null);
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
        <Pressable style={styles.linkTarget} onPress={() => router.replace("/today")}>
          <Text style={styles.link}>{t("visitNote.back")}</Text>
        </Pressable>
      </View>
    );
  }

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  const drift = driftMinutes(visit);
  const pointable = visit.status === "PLANNED" || visit.status === "IN_PROGRESS";

  const onClose = async () => {
    setBusy(true);
    setError(null);
    try {
      await performPointage(visit.id, visit.status === "PLANNED" ? "check-in" : "check-out");
      router.replace("/today");
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          accessibilityLabel={t("visitNote.back")}
          onPress={() => router.replace("/today")}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t("visit.title")}</Text>
        {visit.gpsArrivalAt ? (
          <Text style={styles.arrivalPill}>
            {t("visit.arrivedAt", { time: timeOf(visit.gpsArrivalAt) })}
          </Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <View style={styles.bigAvatar}>
            <Text style={styles.bigAvatarText}>
              {initialsFromName(`${visit.patient.firstName} ${visit.patient.lastName}`)}
            </Text>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.patientName}>
              {visit.patient.firstName} {visit.patient.lastName}
            </Text>
            <Text style={styles.patientMeta}>
              {position ? t("visit.position", { index: position.index, total: position.total }) : ""}
              {visit.isEmergency ? ` · ${t("today.emergency")}` : ""}
            </Text>
            <Text style={styles.patientMeta}>
              {visit.patient.normalizedAddress ?? visit.patient.rawAddress}
            </Text>
          </View>
        </View>

        <View style={styles.tiles}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>{t("visit.scheduled")}</Text>
            <Text style={styles.tileValue}>{timeOf(visit.scheduledAt)}</Text>
          </View>
          {/* Abweichung nur, wenn es eine gibt: vor der Ankunft ist sie nicht
              berechenbar, und eine "0 Min." dort wäre eine Behauptung. */}
          <View style={[styles.tile, drift !== null && drift > 0 ? styles.tileAlert : null]}>
            <Text style={styles.tileLabel}>{t("visit.drift")}</Text>
            <Text
              style={[styles.tileValue, drift !== null && drift > 0 ? styles.tileValueAlert : null]}
            >
              {drift === null ? "—" : t("visit.driftValue", { minutes: drift })}
            </Text>
          </View>
        </View>

        {/* Echte Dokumentation: die Besuchsnotiz. */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("visit.documentation")}</Text>
          {visit.visitNote ? (
            <Text style={styles.noteText} numberOfLines={4}>
              {visit.visitNote}
            </Text>
          ) : (
            <Text style={styles.noteEmpty}>{t("visit.noNote")}</Text>
          )}
          <Pressable
            style={styles.noteButton}
            onPress={() => router.push({ pathname: "/visit-note", params: { visitId: visit.id } })}
          >
            <Text style={styles.noteButtonText}>
              {t(visit.visitNote ? "today.noteEdit" : "today.noteWrite")}
            </Text>
          </Pressable>
        </View>

        {/* Beispielinhalt, ausdrücklich NICHT bedienbar (lib/demo-visit). */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>{t("visit.tasks")}</Text>
            <Text style={styles.demoTag}>{t("visit.demoTag")}</Text>
          </View>
          {CARE_TASKS.map((task) => (
            <View key={task.id} style={styles.taskRow}>
              <View style={[styles.checkbox, checkboxStyle(task.state)]} />
              <Text style={[styles.taskLabel, task.state === "done" ? styles.taskDone : null]}>
                {t(`visit.taskItems.${task.id}`)}
              </Text>
            </View>
          ))}
          <Text style={styles.demoNote}>{t("visit.tasksDemo")}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {pointable ? (
        <View style={styles.footer}>
          <Pressable
            style={[styles.closeButton, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void onClose()}
          >
            {busy ? (
              <ActivityIndicator color={color.onClay} />
            ) : (
              <Text style={styles.closeButtonText}>
                {t(visit.status === "PLANNED" ? "today.checkIn" : "visit.close")}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function checkboxStyle(state: CareTaskState) {
  if (state === "done") return { backgroundColor: color.sage, borderColor: color.sage };
  if (state === "inProgress") return { borderColor: color.clay };
  return { borderColor: color.neutralDot };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.app, paddingTop: 44 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 20 },
  content: { paddingBottom: 24 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  back: {
    width: MIN_TOUCH_HEIGHT,
    height: MIN_TOUCH_HEIGHT,
    marginLeft: -12,
    alignItems: "center",
    justifyContent: "center",
  },
  backGlyph: { fontSize: 28, color: color.inkBody, lineHeight: 30 },
  headerTitle: { flex: 1, fontFamily: font.sansSemi, fontSize: 15, color: color.ink },
  arrivalPill: {
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: color.sageWash,
    color: color.sageText,
    fontFamily: font.sansSemi,
    fontSize: 12.5,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: color.neutralTrack,
  },
  bigAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.sageWash,
    alignItems: "center",
    justifyContent: "center",
  },
  bigAvatarText: { fontFamily: font.serif, fontSize: 20, color: color.sageDeep },
  identityText: { flex: 1, minWidth: 0 },
  patientName: { fontFamily: font.serif, fontSize: 23, color: color.ink },
  patientMeta: { fontFamily: font.sans, fontSize: 12.5, color: color.inkMuted, marginTop: 3 },

  tiles: { flexDirection: "row", gap: 10, paddingHorizontal: 22, marginTop: 18 },
  tile: {
    flex: 1,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.soft,
    backgroundColor: color.surface,
  },
  tileAlert: { backgroundColor: color.clayWash, borderColor: color.clayWashBorder },
  tileLabel: { fontFamily: font.sans, fontSize: 12.5, color: color.inkTertiary },
  tileValue: { fontFamily: font.serif, fontSize: 26, color: color.ink, marginTop: 4 },
  tileValueAlert: { color: color.clayDeep },

  card: {
    marginHorizontal: 22,
    marginTop: 16,
    padding: 18,
    borderRadius: radius.mobileCard,
    borderWidth: 1,
    borderColor: color.soft,
    backgroundColor: color.white,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: { fontFamily: font.serif, fontSize: 18, color: color.ink },
  demoTag: {
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: color.inset,
    color: color.inkFaint,
    fontFamily: font.sansSemi,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  demoNote: { fontFamily: font.sans, fontSize: 11.5, color: color.inkFaint, marginTop: 12 },

  noteText: { fontFamily: font.sans, fontSize: 13.5, color: color.inkBody, marginTop: 10 },
  noteEmpty: { fontFamily: font.sans, fontSize: 13.5, color: color.inkMuted, marginTop: 10 },
  noteButton: {
    marginTop: 14,
    minHeight: MIN_TOUCH_HEIGHT,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.strong,
    backgroundColor: color.inset,
    alignItems: "center",
    justifyContent: "center",
  },
  noteButtonText: { fontFamily: font.sansSemi, fontSize: 14, color: color.inkBody },

  taskRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 13 },
  checkbox: { width: 20, height: 20, borderRadius: radius.check, borderWidth: 1.6 },
  taskLabel: { flex: 1, fontFamily: font.sans, fontSize: 13.5, color: color.ink },
  taskDone: { color: color.inkMuted },

  footer: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: color.neutralTrack,
    backgroundColor: color.app,
  },
  closeButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: color.clay,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: { fontFamily: font.sansSemi, fontSize: 15, color: color.onClay },

  error: { color: color.clayDeep, fontFamily: font.sans, fontSize: 13, paddingHorizontal: 22, marginTop: 14 },
  linkTarget: { minHeight: MIN_TOUCH_HEIGHT, justifyContent: "center" },
  link: { color: color.clayDeep, fontFamily: font.sansMedium, fontSize: 15 },
  disabled: { opacity: 0.5 },
});
