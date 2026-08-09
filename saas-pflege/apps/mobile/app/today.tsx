import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, Redirect, useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  chatUnreadCount,
  myVisits,
  type MyDayPatient,
  type MyVisit,
} from "@len-len/api-client";
import { useAuth } from "@/lib/auth-context";
import { flushPointageQueue, pendingPointageCount, performPointage } from "@/lib/pointage";
import { setOnConsentLost, startTracking, stopTracking } from "@/lib/tracking";

type Day = "today" | "tomorrow";

function dateForDay(day: Day): string {
  const d = new Date();
  if (day === "tomorrow") d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0); // Tagesmitte: robust gegen Zeitzonen-Kanten.
  return d.toISOString();
}

/** Öffnet die Navigations-App mit Koordinaten (bevorzugt) oder Adresse. */
function openNavigation(patient: MyDayPatient): void {
  const address = patient.normalizedAddress ?? patient.rawAddress;
  const dest =
    patient.latitude && patient.longitude
      ? `${patient.latitude},${patient.longitude}`
      : encodeURIComponent(address);
  const url =
    Platform.OS === "ios" ? `maps://?daddr=${dest}` : `google.navigation:q=${dest}`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`),
  );
}

export default function TodayScreen() {
  const { t, i18n } = useTranslation();
  const { status, user, logout } = useAuth();
  const router = useRouter();

  const [day, setDay] = useState<Day>("today");
  const [visits, setVisits] = useState<MyVisit[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Eigener Zustand statt `error`: ein Tracking-Hinweis und ein Ladefehler sind
  // verschiedene Dinge und können gleichzeitig gelten. Über `error` gemeldet,
  // würde ihn der nächste erfolgreiche Ladevorgang stillschweigend löschen.
  const [trackingNotice, setTrackingNotice] = useState<string | null>(null);
  const [busyVisitId, setBusyVisitId] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(null);
      // Offline-Pointages zuerst nachreichen, damit die Liste aktuell ist.
      await flushPointageQueue();
      const result = await myVisits(dateForDay(day));
      setVisits(result.visits);
      setUnread(await chatUnreadCount().catch(() => 0));
    } catch (err) {
      // Nach Status unterscheiden. Zuvor lief JEDER Fehler in dieselbe
      // Sammelmeldung – ein fehlendes Fachkraft-Profil (403) war dadurch von
      // einer Netzstörung nicht zu unterscheiden, und die Ursache blieb im
      // Verborgenen, obwohl der Server sie klar benannt hatte.
      const status = err instanceof ApiError ? err.status : null;
      if (status === 401) {
        // Sitzung endgültig abgelaufen: der Client hat den Refresh bereits
        // erfolglos versucht (siehe apiFetch). Hier hilft nur neu anmelden.
        await logout();
        router.replace("/login");
        return;
      }
      setError(status === 403 ? t("today.noCaregiverProfile") : t("common.errorGeneric"));
    } finally {
      setPendingSync(await pendingPointageCount());
    }
  }, [day, t, logout, router]);

  useEffect(() => {
    setVisits(null);
    void load();
  }, [load]);

  // Echtzeit-GPS-Tracking an den aktiven Besuch koppeln: läuft genau eine
  // Visite (IN_PROGRESS), wird getrackt; sonst gestoppt. Beim Verlassen des
  // Screens ebenfalls stoppen (kein Tracking außerhalb eines Besuchs).
  //
  // Fehlt die Einwilligung, wird NICHT still auf das Tracking verzichtet: die
  // Fachkraft bekommt den Einwilligungs-Bildschirm zu sehen und entscheidet.
  // Ein stiller Verzicht wäre für sie nicht unterscheidbar von einem Defekt.
  const syncTracking = useCallback(() => {
    const active = visits?.find((v) => v.status === "IN_PROGRESS");
    if (!active) {
      stopTracking();
      setTrackingNotice(null);
      return;
    }
    void startTracking(active.id).then((res) => {
      if (res.ok) {
        setTrackingNotice(null);
        return;
      }
      // JEDER Grund wird sichtbar. Zuvor führte nur "consent" irgendwohin; bei
      // verweigerter Ortungsfreigabe oder nicht erreichbarem Server startete
      // das Tracking stillschweigend nicht – für die Fachkraft ununterscheidbar
      // von einem laufenden Tracking, und im Nachhinein nur an fehlenden
      // Punkten in der Datenbank zu erkennen.
      if (res.reason === "consent") {
        router.push("/consent-gps");
        return;
      }
      setTrackingNotice(
        res.reason === "permission"
          ? t("today.trackingNoPermission")
          : t("today.trackingUnavailable"),
      );
    });
  }, [visits, router, t]);

  // An den FOKUS gebunden, nicht nur an `visits`.
  //
  // Der Weg zurück vom Einwilligungs-Bildschirm ändert `visits` nicht: ein
  // reiner useEffect auf [visits] liefe dort nie erneut, die Einwilligung wäre
  // erteilt und das Tracking bliebe trotzdem aus – genau der Fall, der beim
  // Test auftrat. Über den Fokus wird der Versuch bei jeder Rückkehr auf den
  // Screen wiederholt; startTracking ist für dieselbe Visite idempotent.
  useFocusEffect(syncTracking);

  // Widerruf auf einem anderen Gerät: das Backend lehnt den nächsten Punkt ab,
  // der Tracker hält an und meldet es hierher.
  useEffect(() => {
    setOnConsentLost(() => router.push("/consent-gps"));
    return () => setOnConsentLost(null);
  }, [router]);

  useEffect(() => () => stopTracking(), []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onPointage = useCallback(
    async (visit: MyVisit) => {
      setBusyVisitId(visit.id);
      try {
        const action = visit.status === "PLANNED" ? "check-in" : "check-out";
        await performPointage(visit.id, action);
        await load();
      } catch {
        setError(t("common.errorGeneric"));
      } finally {
        setBusyVisitId(null);
      }
    },
    [load, t],
  );

  if (status === "unauthenticated") return <Redirect href="/login" />;
  // Ohne Passwortwechsel liefert das Backend hier nur 403.
  if (user?.mustChangePassword) return <Redirect href="/change-password" />;
  if (status === "loading" || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  const renderVisit = ({ item }: { item: MyVisit }) => {
    const address = item.patient.normalizedAddress ?? item.patient.rawAddress;
    const pointable = item.status === "PLANNED" || item.status === "IN_PROGRESS";
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.time}>{timeOf(item.scheduledAt)}</Text>
          <Text style={[styles.badge, badgeStyle(item.status)]}>
            {t(`today.status.${item.status}`)}
          </Text>
          {item.isEmergency ? (
            <Text style={[styles.badge, styles.badgeEmergency]}>{t("today.emergency")}</Text>
          ) : null}
        </View>
        <Text style={styles.patient}>
          {item.patient.firstName} {item.patient.lastName}
        </Text>
        <Text style={styles.address}>{address}</Text>
        <View style={styles.actions}>
          <Pressable style={styles.actionSecondary} onPress={() => openNavigation(item.patient)}>
            <Text style={styles.actionSecondaryText}>{t("today.navigate")}</Text>
          </Pressable>
          {pointable ? (
            <Pressable
              style={[styles.actionPrimary, busyVisitId === item.id && styles.disabled]}
              disabled={busyVisitId === item.id}
              onPress={() => onPointage(item)}
            >
              {busyVisitId === item.id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.actionPrimaryText}>
                  {t(item.status === "PLANNED" ? "today.checkIn" : "today.checkOut")}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("today.title")}</Text>
        <View style={styles.headerActions}>
          <Link href="/chat" asChild>
            <Pressable style={styles.chatButton}>
              <Text style={styles.chatButtonText}>{t("chat.title")}</Text>
              {unread > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unread > 99 ? "99+" : unread}</Text>
                </View>
              ) : null}
            </Pressable>
          </Link>
          <Pressable onPress={() => void logout()}>
            <Text style={styles.logout}>{t("common.logout")}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.dayTabs}>
        {(["today", "tomorrow"] as const).map((d) => (
          <Pressable
            key={d}
            style={[styles.dayTab, day === d && styles.dayTabActive]}
            onPress={() => setDay(d)}
          >
            <Text style={[styles.dayTabText, day === d && styles.dayTabTextActive]}>
              {t(`today.day_${d}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {trackingNotice ? <Text style={styles.trackingNotice}>{trackingNotice}</Text> : null}
      {pendingSync > 0 ? (
        <Text style={styles.pendingSync}>{t("today.pendingSync", { count: pendingSync })}</Text>
      ) : null}

      {visits === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={visits}
          keyExtractor={(v) => v.id}
          renderItem={renderVisit}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
          ListHeaderComponent={
            <Text style={styles.count}>{t("today.visitsCount", { count: visits.length })}</Text>
          }
          ListEmptyComponent={<Text style={styles.empty}>{t("today.empty")}</Text>}
        />
      )}
    </View>
  );
}

function badgeStyle(status: MyVisit["status"]) {
  switch (status) {
    case "IN_PROGRESS":
      return styles.badgeInProgress;
    case "COMPLETED":
      return styles.badgeCompleted;
    case "MISSED":
      return styles.badgeMissed;
    default:
      return styles.badgePlanned;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f4f5", paddingTop: 56 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#1d4ed8",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chatButtonText: { color: "#1d4ed8", fontWeight: "600", fontSize: 13 },
  unreadBadge: {
    backgroundColor: "#b91c1c",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  logout: { color: "#1d4ed8", fontWeight: "600" },
  dayTabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  dayTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#e4e4e7",
  },
  dayTabActive: { backgroundColor: "#1d4ed8" },
  dayTabText: { fontSize: 14, fontWeight: "600", color: "#3f3f46" },
  dayTabTextActive: { color: "#fff" },
  list: { padding: 16, gap: 12 },
  count: { fontSize: 13, color: "#666", marginBottom: 4 },
  empty: { textAlign: "center", color: "#666", marginTop: 32 },
  error: { color: "#b91c1c", paddingHorizontal: 16, marginBottom: 8 },
  // Ambre und nicht rot: das Tracking fehlt, der Besuch selbst läuft weiter.
  trackingNotice: { color: "#92400e", paddingHorizontal: 16, marginBottom: 8, fontSize: 13 },
  pendingSync: { color: "#d97706", paddingHorizontal: 16, marginBottom: 8, fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  time: { fontSize: 16, fontWeight: "700" },
  badge: {
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
    color: "#fff",
  },
  badgePlanned: { backgroundColor: "#71717a" },
  badgeInProgress: { backgroundColor: "#d97706" },
  badgeCompleted: { backgroundColor: "#15803d" },
  badgeMissed: { backgroundColor: "#b91c1c" },
  badgeEmergency: { backgroundColor: "#b91c1c" },
  patient: { fontSize: 16, fontWeight: "600", marginTop: 2 },
  address: { fontSize: 13, color: "#555" },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1d4ed8",
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
  },
  actionSecondaryText: { color: "#1d4ed8", fontWeight: "600" },
  actionPrimary: {
    flex: 1,
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
  },
  actionPrimaryText: { color: "#fff", fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
