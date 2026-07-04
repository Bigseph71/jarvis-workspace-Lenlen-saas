// Nebeneffekt-Imports zuerst: API-Client konfigurieren, i18n initialisieren.
import "@/lib/api-setup";
import "@/i18n";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/lib/auth-context";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
