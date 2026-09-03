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
import { color, font, radius, MIN_TOUCH_HEIGHT } from "@/lib/theme";
import { initialsFrom } from "@/lib/initials";
import { currentVisit, remainingCount } from "@/lib/tour";
import { MiniMap } from "@/components/mini-map";

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

/** Farbe des Zustandspunkts einer Zeile. */
function dotColor(visit: MyVisit): string {
  if (visit.hasIncident || visit.isEmergency) return color.clay;
  if (visit.status === "COMPLETED") return color.sage;
  return color.neutralDot;
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
      // einer Netzstörung nicht zu unterscheiden.
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
  // Visite (IN_PROGRESS), wird getrackt; sonst gestoppt.
  //
  // Fehlt die Einwilligung, wird NICHT still auf das Tracking verzichtet: die
  // Fachkraft bekommt den Einwilligungs-Bildschirm zu sehen und entscheidet.
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
      // das Tracking stillschweigend nicht.
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

  // An den FOKUS gebunden, nicht nur an `visits`: der Weg zurück vom
  // Einwilligungs-Bildschirm ändert `visits` nicht, ein reiner useEffect liefe
  // dort nie erneut und das Tracking bliebe trotz erteilter Einwilligung aus.
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

  const current = visits ? currentVisit(visits) : null;
  const rest = visits ? visits.filter((v) => v.id !== current?.id) : [];
  const lastVisit = visits && visits.length > 0 ? visits[visits.length - 1] : null;

  const renderRow = ({ item }: { item: MyVisit }) => (
    <Pressable
      style={styles.row}
      onPress={() => router.push({ pathname: "/visit", params: { visitId: item.id } })}
    >
      <Text style={styles.rowTime}>{timeOf(item.scheduledAt)}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.patient.firstName} {item.patient.lastName}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.isEmergency ? `${t("today.emergency")} · ` : ""}
          {item.patient.normalizedAddress ?? item.patient.rawAddress}
        </Text>
      </View>
      <View style={[styles.rowDot, { backgroundColor: dotColor(item) }]} />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={rest}
        keyExtractor={(v) => v.id}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.overline}>
                  {new Date(dateForDay(day)).toLocaleDateString(i18n.language, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </Text>
                <Text style={styles.title}>{t("today.title")}</Text>
              </View>
              <Pressable onPress={() => void logout()}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initialsFrom(user.email)}</Text>
                </View>
              </Pressable>
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
              <>
                <View style={styles.mapWrap}>
                  <MiniMap />
                  {/* Echte Angaben: verbleibende Besuche und der Termin des
                      letzten. Der Entwurf zeigt hier Restkilometer – die
                      berechnet heute niemand, und eine erfundene Zahl auf einer
                      Karte wird geglaubt. */}
                  <View style={styles.mapBanner}>
                    <Text style={styles.mapBannerText}>
                      {t("today.remaining", {
                        count: remainingCount(visits),
                        end: lastVisit ? timeOf(lastVisit.scheduledAt) : "—",
                      })}
                    </Text>
                  </View>
                </View>

                {current ? (
                  <View style={styles.nextCard}>
                    <Text style={styles.nextOverline}>{t("today.nextVisit")}</Text>
                    <Text style={styles.nextName}>
                      {current.patient.firstName} {current.patient.lastName}
                    </Text>
                    <Text style={styles.nextMeta}>
                      {current.patient.normalizedAddress ?? current.patient.rawAddress}
                    </Text>

                    <View style={styles.nextActions}>
                      <Pressable
                        style={[styles.nextPrimary, busyVisitId === current.id && styles.disabled]}
                        disabled={busyVisitId === current.id}
                        onPress={() => onPointage(current)}
                      >
                        {busyVisitId === current.id ? (
                          <ActivityIndicator color={color.forestDeep} />
                        ) : (
                          <Text style={styles.nextPrimaryText}>
                            {t(current.status === "PLANNED" ? "today.checkIn" : "today.checkOut")}
                          </Text>
                        )}
                      </Pressable>
                      <Pressable
                        style={styles.nextIcon}
                        accessibilityLabel={t("today.navigate")}
                        onPress={() => openNavigation(current.patient)}
                      >
                        <Text style={styles.nextIconGlyph}>➤</Text>
                      </Pressable>
                    </View>

                    <Pressable
                      style={styles.nextOpen}
                      onPress={() =>
                        router.push({ pathname: "/visit", params: { visitId: current.id } })
                      }
                    >
                      <Text style={styles.nextOpenText}>{t("today.openVisit")}</Text>
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{t("today.upNext")}</Text>
                  <Text style={styles.sectionCount}>
                    {t("today.visitsCount", { count: rest.length })}
                  </Text>
                </View>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          visits === null ? null : <Text style={styles.empty}>{t("today.empty")}</Text>
        }
      />

      {/*
        Zwei Reiter, nicht vier. Der Entwurf zeigt zusätzlich "Carte" und
        "Temps"; beide gibt es nicht, weder als Bildschirm noch als Endpunkt.
        Ein Reiter, der nirgendwohin führt, ist in einer Pflege-App schlechter
        als eine kürzere Leiste: er kostet im Treppenhaus einen Fehlgriff.
      */}
      <View style={styles.tabBar}>
        <View style={styles.tab}>
          <View style={[styles.tabMark, styles.tabMarkActive]} />
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>{t("today.tabTour")}</Text>
        </View>
        <Link href="/chat" asChild>
          <Pressable style={styles.tab}>
            <View style={styles.tabMark}>
              {unread > 0 ? <View style={styles.tabDot} /> : null}
            </View>
            <Text style={styles.tabLabel}>{t("chat.title")}</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.app, paddingTop: 44 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 48 },
  list: { paddingBottom: 24 },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  overline: {
    fontFamily: font.sansSemi,
    fontSize: 11.5,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: color.inkFaint,
  },
  title: { fontFamily: font.serif, fontSize: 27, color: color.ink, marginTop: 4 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: color.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: font.sansSemi, fontSize: 12.5, color: color.onForestBody },

  dayTabs: { flexDirection: "row", gap: 8, paddingHorizontal: 22, marginBottom: 10 },
  dayTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: color.inset,
  },
  dayTabActive: { backgroundColor: color.forest },
  dayTabText: { fontFamily: font.sansSemi, fontSize: 13, color: color.inkSecondary },
  dayTabTextActive: { color: color.page },

  error: { color: color.clayDeep, paddingHorizontal: 22, marginBottom: 8, fontFamily: font.sans },
  // Ambre und nicht rot: das Tracking fehlt, der Besuch selbst läuft weiter.
  trackingNotice: {
    color: "#92400e",
    paddingHorizontal: 22,
    marginBottom: 8,
    fontSize: 13,
    fontFamily: font.sans,
  },
  pendingSync: {
    color: color.clay,
    paddingHorizontal: 22,
    marginBottom: 8,
    fontFamily: font.sansSemi,
  },

  mapWrap: {
    marginHorizontal: 22,
    marginTop: 6,
    marginBottom: 14,
    height: 150,
    borderRadius: radius.block,
    overflow: "hidden",
    backgroundColor: color.forestMap,
    justifyContent: "flex-end",
  },
  mapBanner: {
    alignSelf: "flex-start",
    margin: 12,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: "rgba(20,25,18,.55)",
  },
  mapBannerText: { fontFamily: font.sansMedium, fontSize: 12, color: color.onForestBody },

  nextCard: {
    marginHorizontal: 22,
    marginBottom: 16,
    padding: 20,
    borderRadius: radius.block,
    backgroundColor: color.forest,
  },
  nextOverline: {
    fontFamily: font.sansSemi,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: color.sand,
  },
  nextName: { fontFamily: font.serif, fontSize: 24, color: color.onForest, marginTop: 6 },
  nextMeta: { fontFamily: font.sans, fontSize: 13.5, color: color.onForestMuted, marginTop: 4 },
  nextActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  nextPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: color.onForestBody,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  nextPrimaryText: { fontFamily: font.sansSemi, fontSize: 14.5, color: color.forestDeep },
  nextIcon: {
    width: 50,
    height: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(239,237,226,.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  nextIconGlyph: { color: color.onForestBody, fontSize: 17 },
  nextOpen: { marginTop: 14, minHeight: MIN_TOUCH_HEIGHT, justifyContent: "center" },
  nextOpenText: { fontFamily: font.sansMedium, fontSize: 13.5, color: color.sand },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    marginBottom: 10,
  },
  sectionTitle: { fontFamily: font.sansSemi, fontSize: 14.5, color: color.ink },
  sectionCount: { fontFamily: font.sans, fontSize: 12.5, color: color.inkMuted },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 22,
    marginBottom: 9,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.soft,
    backgroundColor: color.surface,
  },
  rowTime: { width: 42, fontFamily: font.serif, fontSize: 15, color: color.ink },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: font.sansSemi, fontSize: 14, color: color.ink },
  rowMeta: { fontFamily: font.sans, fontSize: 12.5, color: color.inkMuted, marginTop: 2 },
  rowDot: { width: 8, height: 8, borderRadius: 4 },

  empty: {
    textAlign: "center",
    color: color.inkMuted,
    marginTop: 32,
    fontFamily: font.sans,
  },

  tabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: color.neutralTrack,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 20,
    backgroundColor: color.app,
  },
  tab: { alignItems: "center", gap: 6, minHeight: MIN_TOUCH_HEIGHT, minWidth: 64 },
  tabMark: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 1.6,
    borderColor: color.inkFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  tabMarkActive: { borderColor: color.clay, backgroundColor: color.clayWash },
  tabDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.clay },
  tabLabel: { fontFamily: font.sansSemi, fontSize: 10.5, color: color.inkFaint },
  tabLabelActive: { color: color.clay },

  disabled: { opacity: 0.5 },
});
