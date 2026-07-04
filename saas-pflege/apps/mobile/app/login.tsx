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
import { ROLE_NOT_ALLOWED, useAuth } from "@/lib/auth-context";

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Redirect href="/today" />;
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await login({ email: email.trim(), password });
      router.replace("/today");
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
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
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
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
            <Text style={styles.buttonText}>{t("auth.login.submit")}</Text>
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
