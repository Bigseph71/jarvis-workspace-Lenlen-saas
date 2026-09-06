import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Application from "expo-application";
import { ApiError } from "@len-len/api-client";
import { ROLE_NOT_ALLOWED, useAuth } from "@/lib/auth-context";
import { formatAppVersion } from "@/lib/app-version";

// Modulweit statt im Render: der native Wert ändert sich zur Laufzeit nie.
const appVersion = formatAppVersion({
  version: Application.nativeApplicationVersion,
  build: Application.nativeBuildVersion,
});

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, user, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Redirect href={user?.mustChangePassword ? "/change-password" : "/today"} />;
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const loggedIn = await login({ email: email.trim(), password });
      router.replace(loggedIn.mustChangePassword ? "/change-password" : "/today");
    } catch (err) {
      if (err instanceof Error && err.message === ROLE_NOT_ALLOWED) {
        setError(t("auth.login.fachkraftOnly"));
      } else if (err instanceof ApiError) {
        setError(err.status === 401 ? t("auth.login.invalidCredentials") : t("common.errorGeneric"));
      } else {
        setError(t("auth.login.networkError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    /*
      Tastatur und Formular.

      Vorher deckte die Tastatur auf Android das Passwortfeld zu: die Karte
      steht senkrecht zentriert, das Feld liegt in ihrer unteren Hälfte, und
      geschoben wurde nichts. Man tippte ins Blinde.

      Zwei Bausteine zusammen:

        - KeyboardAvoidingView mit `behavior` je Plattform. Auf Android "height"
          statt gar nichts: der Bildschirm hat KEINE eigene Kopfzeile
          (headerShown: false), der Versatz ist also null, und ohne Angabe
          schiebt Android überhaupt nicht – genau der gemeldete Fehler.
        - ScrollView darin. Sie ist die Rückfallebene für den Fall, dass Karte
          und Tastatur zusammen höher sind als der Bildschirm (kleines Gerät,
          grosse Systemschrift): dann bleibt das Feld erreichbar, statt aus dem
          Bild zu wandern. `keyboardShouldPersistTaps="handled"` sorgt dafür,
          dass der Anmeldeknopf beim ERSTEN Tippen auslöst und nicht erst die
          Tastatur schliesst.
    */
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.card}>
          <Text style={styles.appName}>{t("common.appName")}</Text>
          <Text style={styles.title}>{t("auth.login.title")}</Text>
          <Text style={styles.subtitle}>{t("auth.login.subtitle")}</Text>

          <Text style={styles.label}>{t("auth.login.email")}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t("auth.login.emailPlaceholder")}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!submitting}
          />

          <Text style={styles.label}>{t("auth.login.password")}</Text>
          {/*
            Auge zum Aufdecken. Ein Passwort mit zwölf Zeichen, Ziffer und
            Grossbuchstabe (siehe changePassword.rules) vertippt sich auf einer
            Telefontastatur zuverlässig, und die Rückmeldung darauf ist
            "Ungültige Anmeldedaten" – nicht zu unterscheiden von einem falschen
            Konto. Der Knopf liegt IM Feld, damit er die Reihenfolge der
            Beschriftungen nicht bricht.
          */}
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoComplete="password"
              editable={!submitting}
              onSubmitEditing={onSubmit}
            />
            <Pressable
              style={styles.eye}
              onPress={() => setPasswordVisible((visible) => !visible)}
              accessibilityRole="button"
              accessibilityLabel={t(
                passwordVisible ? "auth.login.hidePassword" : "auth.login.showPassword",
              )}
              accessibilityState={{ selected: passwordVisible }}
              hitSlop={8}
            >
              <EyeIcon crossed={passwordVisible} />
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t("auth.login.submit")}</Text>
            )}
          </Pressable>
        </View>

        {/* Sichtbar ohne Anmeldung – genau der Fall, in dem jemand anruft, weil
            er sich NICHT anmelden kann. */}
        {appVersion ? (
          <Text style={styles.version}>{t("common.version", { version: appVersion })}</Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Auge, durchgestrichen sobald das Passwort SICHTBAR ist.
 *
 * Der Strich zeigt, was das Antippen bewirkt (verbergen), nicht den aktuellen
 * Zustand – dieselbe Lesart wie in Browsern und Bankanwendungen. Die
 * Sprachausgabe bekommt die Bedeutung ohnehin über accessibilityLabel.
 */
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"
        stroke="#52525b"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3} stroke="#52525b" strokeWidth={1.7} />
      {crossed ? (
        <Path d="M4 20 20 4" stroke="#52525b" strokeWidth={1.7} strokeLinecap="round" />
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f4f5" },
  // Zentriert, solange der Inhalt passt; darueber hinaus wird gescrollt.
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  appName: { fontSize: 26, fontWeight: "700", textAlign: "center" },
  title: { fontSize: 18, fontWeight: "600", textAlign: "center", marginTop: 4 },
  subtitle: { fontSize: 13, color: "#666", textAlign: "center", marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#333", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  passwordRow: { justifyContent: "center" },
  // Platz rechts fuer das Auge, damit der Text nicht darunter laeuft.
  passwordInput: { paddingRight: 48 },
  eye: {
    position: "absolute",
    right: 4,
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { color: "#b91c1c", fontSize: 13, marginTop: 8 },
  button: {
    marginTop: 16,
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  version: { marginTop: 16, textAlign: "center", fontSize: 12, color: "#9ca3af" },
});
