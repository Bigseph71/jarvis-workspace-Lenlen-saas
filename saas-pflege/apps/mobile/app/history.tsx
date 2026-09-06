import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ApiError, myVisitHistory, type MyHistoryVisit } from "@len-len/api-client";
import { useAuth } from "@/lib/auth-context";
import { TabBar } from "@/components/tab-bar";
import { color, font, radius } from "@/lib/theme";
import { durationParts, visitDurationMinutes } from "@/lib/history";

/** Wie der Endpunkt vorgibt (GET /visits/my-history?page=&limit=20). */
const PAGE_SIZE = 20;

/**
 * Verlauf: die erledigten Besuche der angemeldeten Fachkraft, neueste zuerst.
 *
 * Gedacht für die Frage „war ich diese Woche schon bei Frau Vogel, und wie
 * lange?“ – nicht als Arbeitsliste. Deshalb keine Aktionen auf den Zeilen und
 * kein Zustandspunkt: hier ist alles erledigt.
 */
export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const { status, user, logout } = useAuth();
  const router = useRouter();

  const [visits, setVisits] = useState<MyHistoryVisit[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Eine Seite holen. `nextPage === 1` ersetzt die Liste, alles darüber hängt
   * an – ein Herunterziehen zum Aktualisieren soll nicht die schon
   * nachgeladenen Seiten unten stehen lassen.
   */
  const loadPage = useCallback(
    async (nextPage: number) => {
      try {
        setError(null);
        const result = await myVisitHistory({ page: nextPage, limit: PAGE_SIZE });
        setTotalPages(result.totalPages);
        setPage(result.page);
        setVisits((current) =>
          nextPage === 1 || current === null ? result.data : [...current, ...result.data],
        );
      } catch (err) {
        // Gleiche Unterscheidung wie in der Tagesansicht: eine abgelaufene
        // Sitzung führt zur Anmeldung, ein fehlendes Fachkraft-Profil bekommt
        // seinen eigenen Satz, alles andere ist eine Störung.
        const httpStatus = err instanceof ApiError ? err.status : null;
        if (httpStatus === 401) {
          await logout();
          router.replace("/login");
          return;
        }
        setError(
          httpStatus === 403 ? t("today.noCaregiverProfile") : t("common.errorGeneric"),
        );
      }
    },
    [t, logout, router],
  );

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(1);
    setRefreshing(false);
  }, [loadPage]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || refreshing || visits === null || page >= totalPages) return;
    setLoadingMore(true);
    await loadPage(page + 1);
    setLoadingMore(false);
  }, [loadingMore, refreshing, visits, page, totalPages, loadPage]);

  if (status === "unauthenticated") return <Redirect href="/login" />;
  // Ohne Passwortwechsel liefert das Backend hier nur 403.
  if (user?.mustChangePassword) return <Redirect href="/change-password" />;

  const dateOf = (iso: string): string =>
    new Date(iso).toLocaleDateString(i18n.language, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const timeOf = (iso: string): string =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  /**
   * Dauer als Text. Ohne beide Zeitstempel ein Strich statt einer Null – siehe
   * lib/history.ts.
   */
  const durationOf = (visit: MyHistoryVisit): string => {
    const minutes = visitDurationMinutes(visit);
    if (minutes === null) return t("history.durationUnknown");
    const parts = durationParts(minutes);
    return parts.hours > 0
      ? t("history.durationHours", { hours: parts.hours, minutes: parts.minutes })
      : t("history.durationMinutes", { minutes: parts.minutes });
  };

  const renderRow = ({ item }: { item: MyHistoryVisit }) => (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowDate}>{dateOf(item.scheduledAt)}</Text>
        <Text style={styles.rowDuration}>{durationOf(item)}</Text>
      </View>
      <Text style={styles.rowName} numberOfLines={1}>
        {item.patient.firstName} {item.patient.lastName}
      </Text>
      <Text style={styles.rowMeta} numberOfLines={1}>
        {item.isEmergency ? `${t("today.emergency")} · ` : ""}
        {item.hasIncident ? `${t("today.incident")} · ` : ""}
        {item.gpsArrivalAt
          ? t("history.arrivedAt", { time: timeOf(item.gpsArrivalAt) })
          : t("history.arrivalUnknown")}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={visits ?? []}
        keyExtractor={(v) => v.id}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => void onEndReached()}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.overline}>{t("history.overline")}</Text>
            <Text style={styles.title}>{t("history.title")}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          visits === null ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
            </View>
          ) : error ? null : (
            <Text style={styles.empty}>{t("history.empty")}</Text>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator />
            </View>
          ) : null
        }
      />

      <TabBar active="history" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.app, paddingTop: 44 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 48 },
  list: { paddingBottom: 24 },
  footer: { paddingVertical: 16 },

  header: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14 },
  overline: {
    fontFamily: font.sansSemi,
    fontSize: 11.5,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: color.inkFaint,
  },
  title: { fontFamily: font.serif, fontSize: 27, color: color.ink, marginTop: 4 },
  error: { color: color.clayDeep, marginTop: 10, fontFamily: font.sans },

  row: {
    marginHorizontal: 22,
    marginBottom: 9,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.soft,
    backgroundColor: color.surface,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  rowDate: { fontFamily: font.sansSemi, fontSize: 12.5, color: color.inkSecondary },
  rowDuration: { fontFamily: font.serif, fontSize: 15, color: color.ink },
  rowName: { fontFamily: font.sansSemi, fontSize: 14, color: color.ink, marginTop: 6 },
  rowMeta: { fontFamily: font.sans, fontSize: 12.5, color: color.inkMuted, marginTop: 2 },

  empty: {
    textAlign: "center",
    color: color.inkMuted,
    marginTop: 32,
    fontFamily: font.sans,
  },
});
