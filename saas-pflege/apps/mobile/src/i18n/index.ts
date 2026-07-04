import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import de from "./de.json";
import en from "./en.json";
import fr from "./fr.json";

/**
 * i18n wie im Web: DE Standard, EN/FR unterstützt. Die Gerätesprache
 * bestimmt die Startsprache; unbekannte Sprachen fallen auf DE zurück.
 */
const SUPPORTED = ["de", "en", "fr"] as const;

const deviceLanguage = getLocales()[0]?.languageCode ?? "de";
const initialLanguage = (SUPPORTED as readonly string[]).includes(deviceLanguage)
  ? deviceLanguage
  : "de";

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: initialLanguage,
  fallbackLng: "de",
  interpolation: {
    // React escapt selbst; doppeltes Escaping würde z.B. Umlaute-Entities zeigen.
    escapeValue: false,
  },
});

export default i18n;
