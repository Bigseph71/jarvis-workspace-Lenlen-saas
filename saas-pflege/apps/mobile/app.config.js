/**
 * Dynamische Ergänzung zu app.json.
 *
 * Einziger Zweck: unverschlüsselten HTTP-Verkehr NUR dann erlauben, wenn er
 * ausdrücklich verlangt wird (EXPO_ALLOW_CLEARTEXT=1 in apps/mobile/.env).
 *
 * Vorher stand `usesCleartextTraffic: true` fest in app.json und galt damit
 * auch für jeden ausgelieferten Build. Zwei Gründe, das zu trennen:
 *
 *   1. Das Backend läuft über HTTPS, die Erlaubnis wird also nirgends
 *      gebraucht – wohl aber gefunden: eine APK ist in Sekunden entpackt und
 *      das Manifest gelesen. Bei einer Pflege-App ist das der erste Punkt, den
 *      eine IT-Abteilung anmerkt.
 *   2. Sie verwandelt einen lauten Fehler in eine stille Panne. Fehlte
 *      EXPO_PUBLIC_API_URL, ging die Anfrage an http://localhost:4000 und lief
 *      in eine Zeitüberschreitung. Ohne die Erlaubnis blockt Android den
 *      Klartext-Aufruf und sagt sofort, was los ist.
 *
 * Für die Entwicklung gegen ein lokales Backend (http://192.168.x.y:4000)
 * genügt EXPO_ALLOW_CLEARTEXT=1 in der lokalen .env – in den EAS-Profilen ist
 * die Variable nicht gesetzt, ausgelieferte Builds bleiben also HTTPS-only.
 */
module.exports = ({ config }) => {
  if (process.env.EXPO_ALLOW_CLEARTEXT !== "1") return config;

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ["expo-build-properties", { android: { usesCleartextTraffic: true } }],
    ],
  };
};
