import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth-context";

/** Verteiler: je nach Sitzung zur Anmeldung oder zur Tagesroute. */
export default function Index() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (status !== "authenticated") {
    return <Redirect href="/login" />;
  }
  // Temporäres Passwort: alles andere ist ohnehin serverseitig blockiert.
  return <Redirect href={user?.mustChangePassword ? "/change-password" : "/today"} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
});
