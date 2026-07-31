import { useState } from "react";
import {
  ActivityIndicator,
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
import { ApiError } from "@len-len/api-client";
import { useAuth } from "@/lib/auth-context";

// Muss zu passwordSchema im Backend passen (auth.schemas.ts).
const MIN_LENGTH = 12;
const RULES = [/[a-z]/, /[A-Z]/, /[0-9]/];

/**
 * Erzwungener Passwortwechsel: erscheint nach dem Login mit einem vom Admin
 * erzeugten temporären Passwort. Bis zum Wechsel blockiert das Backend jeden
 * anderen Endpoint (403 PasswordChangeRequired).
 */
export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, user, changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "unauthenticated") {
    return <Redirect href="/login" />;
  }
  // Freiwilliger Aufruf bei bereits gewechseltem Passwort: nichts zu tun.
  if (status === "authenticated" && user && !user.mustChangePassword) {
    return <Redirect href="/today" />;
  }

  const canSubmit =
    currentPassword.length > 0 && newPassword.length > 0 && confirmation.length > 0 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;

    if (newPassword.length < MIN_LENGTH || !RULES.every((r) => r.test(newPassword))) {
      setError(t("auth.changePassword.rules"));
      return;
    }
    if (newPassword !== confirmation) {
      setError(t("auth.changePassword.mismatch"));
      return;
    }
    if (newPassword === currentPassword) {
      setError(t("auth.changePassword.sameAsCurrent"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await changePassword({ currentPassword, newPassword });
      router.replace("/today");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 401
            ? t("auth.changePassword.wrongCurrent")
            : err.status === 400
              ? t("auth.changePassword.rules")
              : t("common.errorGeneric"),
        );
      } else {
        setError(t("auth.login.networkError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{t("auth.changePassword.title")}</Text>
        <Text style={styles.subtitle}>{t("auth.changePassword.subtitle")}</Text>

        <Text style={styles.label}>{t("auth.changePassword.current")}</Text>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!submitting}
        />

        <Text style={styles.label}>{t("auth.changePassword.new")}</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!submitting}
        />
        <Text style={styles.hint}>{t("auth.changePassword.rules")}</Text>

        <Text style={styles.label}>{t("auth.changePassword.confirm")}</Text>
        <TextInput
          style={styles.input}
          value={confirmation}
          onChangeText={setConfirmation}
          secureTextEntry
          autoCapitalize="none"
          editable={!submitting}
          onSubmitEditing={onSubmit}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t("auth.changePassword.submit")}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", backgroundColor: "#f4f4f5", padding: 20 },
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
  title: { fontSize: 20, fontWeight: "700", textAlign: "center" },
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
  hint: { fontSize: 12, color: "#666", marginTop: 4 },
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
});
