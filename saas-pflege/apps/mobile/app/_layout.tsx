// Nebeneffekt-Imports zuerst: API-Client konfigurieren, i18n initialisieren.
import "@/lib/api-setup";
import "@/i18n";

import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Newsreader_300Light,
  Newsreader_400Regular,
} from "@expo-google-fonts/newsreader";
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from "@expo-google-fonts/hanken-grotesk";
import { AuthProvider } from "@/lib/auth-context";
import { color } from "@/lib/theme";

export default function RootLayout() {
  /**
   * Schriften der Überarbeitung.
   *
   * Über die @expo-google-fonts-Pakete: die Dateien liegen IM Bundle und
   * werden nicht von Google geladen. Für eine Pflege-App ist das kein Detail –
   * ein Schriftabruf beim CDN übermittelte bei jedem Start die IP der
   * Fachkraft an einen Dritten.
   *
   * Gerendert wird erst danach. React Native kennt keinen Fallback-Stapel wie
   * der Browser: ein Textstil mit einer noch nicht geladenen Familie ist kein
   * hässlicher Ersatz, sondern je nach Plattform ein Fehler.
   */
  const [fontsLoaded] = useFonts({
    Newsreader_300Light,
    Newsreader_400Regular,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.app }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
