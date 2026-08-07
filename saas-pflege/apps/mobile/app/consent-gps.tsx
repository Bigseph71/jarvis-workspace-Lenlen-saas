import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  getGpsConsent,
  grantGpsConsent,
  revokeGpsConsent,
  type ConsentLocale,
  type GpsConsentStatus,
} from "@len-len/api-client";
import { useAuth } from "@/lib/auth-context";

/**
 * Einwilligung in die Standorterfassung (DSGVO Art. 6/7, § 26 BDSG).
 *
 * Der Text steht bewusst VOLLSTÄNDIG auf diesem Bildschirm und nicht hinter
 * einem Link: eingewilligt werden kann nur in etwas, das man gelesen hat.
 * Die Zustimmung ist eine bewusste Handlung – kein vorangekreuztes Kästchen,
 * kein "weiter heißt einverstanden" (Art. 4 Nr. 11: unmissverständlich).
 *
 * Der Widerruf steht gleichrangig daneben, nicht in einem Untermenü
 * (Art. 7 Abs. 3: so einfach wie die Erteilung).
 */
export default function ConsentGpsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { status: authStatus } = useAuth();

  const [consent, setConsent] = useState<GpsConsentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConsent(await getGpsConsent());
      setError(null);
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onGrant = useCallback(async () => {
    if (!consent) return;
    setBusy(true);
    try {
      // Die angezeigte Version wird mitgeschickt: das Backend lehnt ab, wenn
      // die App einen veralteten Text zeigt. So kann keine Zustimmung zu einem
      // nie gezeigten Text entstehen.
      const locale = i18n.language.toUpperCase() as ConsentLocale;
      setConsent(await grantGpsConsent(consent.currentVersion, locale));
      setError(null);
      router.back();
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }, [consent, i18n.language, router, t]);

  const onRevoke = useCallback(async () => {
    setBusy(true);
    try {
      setConsent(await revokeGpsConsent());
      setError(null);
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  if (authStatus === "unauthenticated") return <Redirect href="/login" />;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const granted = consent?.granted ?? false;
  // Zugestimmt, aber einer älteren Fassung: der Text hat sich geändert und
  // muss erneut bestätigt werden.
  const outdated =
    !granted && consent?.acceptedVersion !== null && consent?.revokedAt === null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t("consentGps.title")}</Text>

      {granted ? (
        <View style={[styles.banner, styles.bannerOk]}>
          <Text style={styles.bannerTextOk}>{t("consentGps.stateGranted")}</Text>
        </View>
      ) : outdated ? (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerTextWarn}>{t("consentGps.stateOutdated")}</Text>
        </View>
      ) : (
        <View style={[styles.banner, styles.bannerNeutral]}>
          <Text style={styles.bannerTextNeutral}>{t("consentGps.stateMissing")}</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>{t("consentGps.whatTitle")}</Text>
      <Text style={styles.body}>{t("consentGps.whatBody")}</Text>

      <Text style={styles.sectionTitle}>{t("consentGps.whenTitle")}</Text>
      <Text style={styles.body}>{t("consentGps.whenBody")}</Text>

      <Text style={styles.sectionTitle}>{t("consentGps.whyTitle")}</Text>
      <Text style={styles.body}>{t("consentGps.whyBody")}</Text>

      <Text style={styles.sectionTitle}>{t("consentGps.retentionTitle")}</Text>
      <Text style={styles.body}>{t("consentGps.retentionBody")}</Text>

      <Text style={styles.sectionTitle}>{t("consentGps.rightsTitle")}</Text>
      <Text style={styles.body}>{t("consentGps.rightsBody")}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {granted ? (
        <Pressable
          style={[styles.button, styles.buttonSecondary, busy && styles.buttonDisabled]}
          disabled={busy}
          onPress={() => void onRevoke()}
        >
          <Text style={styles.buttonSecondaryText}>{t("consentGps.revoke")}</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          disabled={busy}
          onPress={() => void onGrant()}
        >
          <Text style={styles.buttonText}>{t("consentGps.grant")}</Text>
        </Pressable>
      )}

      <Text style={styles.version}>
        {t("consentGps.version", { version: consent?.currentVersion ?? "—" })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 20, paddingBottom: 40, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 12 },
  banner: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  bannerOk: { backgroundColor: "#dcfce7" },
  bannerWarn: { backgroundColor: "#fef3c7" },
  bannerNeutral: { backgroundColor: "#f3f4f6" },
  bannerTextOk: { color: "#166534", fontSize: 14 },
  bannerTextWarn: { color: "#92400e", fontSize: 14 },
  bannerTextNeutral: { color: "#374151", fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#111827", marginTop: 14 },
  body: { fontSize: 14, lineHeight: 21, color: "#374151", marginTop: 4 },
  error: { color: "#b91c1c", fontSize: 14, marginTop: 16 },
  button: {
    marginTop: 24,
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  buttonSecondary: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d1d5db" },
  buttonSecondaryText: { color: "#b91c1c", fontSize: 16, fontWeight: "600" },
  version: { marginTop: 16, fontSize: 12, color: "#9ca3af", textAlign: "center" },
});
