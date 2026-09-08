import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { color, font } from "@/lib/theme";
import { tabBarLayout } from "@/lib/layout";
import { TAB_ORDER, tabNavigation, type TabKey } from "@/lib/tabs";

/**
 * Untere Reiterleiste, gemeinsam für Tagesroute und Verlauf.
 *
 * Vorher stand sie eingebaut in today.tsx. Herausgezogen, weil sie jetzt auf
 * zwei Bildschirmen erscheint und weil die Korrektur unten (Sicherheitsabstand)
 * genau einmal existieren soll: eine zweite, abgeschriebene Fassung würde beim
 * nächsten Gerät wieder danebenliegen.
 *
 * ZUM UNTEREN RAND. Auf Android mit Gestensteuerung liegt über den untersten
 * Bildpunkten der Wischbalken des Systems; was dort gezeichnet wird, ist
 * sichtbar, aber nicht berührbar. Gemeldet wurde es von einem Redmi Note 13
 * Pro+ 5G, auf dem die Reiter gar nicht mehr zu treffen waren.
 *
 * Zwei Dinge zusammen lösen das:
 *
 *   1. `useSafeAreaInsets().bottom` als unterer Innenabstand. Der Wert kommt
 *      vom System und ist genau die Höhe, die es für sich beansprucht – eine
 *      feste Zahl (vorher 20) trifft ihn auf keinem zweiten Gerät.
 *   2. `MIN_TAB_HEIGHT` (64) je Reiter, damit die Fläche auch dann gross genug
 *      bleibt, wenn das System gar nichts beansprucht (iOS ohne Notch,
 *      Android mit Tastenleiste – dort ist `bottom` gleich 0).
 *
 * Dazu gehört die Konfiguration in app.json (edgeToEdgeEnabled,
 * androidNavigationBar transparent, enforceContrast false): ohne sie meldet
 * Android gar keinen Sicherheitsabstand, und Punkt 1 bliebe wirkungslos.
 */
export function TabBar({ active, unread = 0 }: { active: TabKey; unread?: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Die Regel steht in lib/layout und ist dort ohne Renderer pruefbar.
  const layout = tabBarLayout(insets.bottom);

  const label: Record<TabKey, string> = {
    tour: t("today.tabTour"),
    chat: t("chat.title"),
    history: t("history.title"),
  };

  const go = (target: TabKey): void => {
    const nav = tabNavigation(active, target);
    if (nav.kind === "none") return;
    if (nav.kind === "dismissTo") router.dismissTo(nav.href);
    else if (nav.kind === "push") router.push(nav.href);
    else router.replace(nav.href);
  };

  return (
    <View style={[styles.tabBar, { paddingBottom: layout.paddingBottom }]}>
      {TAB_ORDER.map((key) => {
        const isActive = key === active;
        return (
          <Pressable
            key={key}
            style={[styles.tab, { minHeight: layout.minHeight }]}
            onPress={() => go(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label[key]}
          >
            <TabIcon tab={key} active={isActive} unread={unread} />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{label[key]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Zeichen des Reiters.
 *
 * Tour und Chat behalten die abstrakte Marke der Überarbeitung (ein gerundetes
 * Quadrat, gefüllt wenn aktiv); der Chat trägt darin den Punkt für ungelesene
 * Nachrichten. Der Verlauf bekommt eine Uhr – dieselbe Kantenlänge, damit die
 * drei Reiter auf einer Linie stehen.
 */
function TabIcon({ tab, active, unread }: { tab: TabKey; active: boolean; unread: number }) {
  const stroke = active ? color.clay : color.inkFaint;

  if (tab === "history") {
    return (
      <View style={styles.tabMarkBox}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9} stroke={stroke} strokeWidth={1.8} />
          <Path
            d="M12 6.8V12l3.4 2"
            stroke={stroke}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    );
  }

  return (
    <View style={[styles.tabMark, active && styles.tabMarkActive]}>
      {tab === "chat" && unread > 0 ? <View style={styles.tabDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: color.neutralTrack,
    paddingHorizontal: 22,
    backgroundColor: color.app,
  },
  // minHeight kommt aus tabBarLayout: die Zahl soll genau EINE Quelle haben.
  tab: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 64,
    flex: 1,
  },
  tabMarkBox: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
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
});
