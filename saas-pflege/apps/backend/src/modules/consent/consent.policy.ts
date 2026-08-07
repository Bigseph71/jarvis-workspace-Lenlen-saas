/**
 * Aktuelle Version des GPS-Einwilligungstextes.
 *
 * Diese Konstante ist der Hebel für die Neu-Einholung: eine Einwilligung deckt
 * immer nur den Text, der ihr vorlag (DSGVO Art. 7 Abs. 2 – die Erklärung muss
 * verständlich und in klarer Sprache vorliegen). Wird der Text inhaltlich
 * geändert, MUSS diese Version hochgezogen werden; alle bestehenden
 * Einwilligungen verlieren damit ihre Deckung und werden erneut abgefragt.
 *
 * Rein redaktionelle Korrekturen (Tippfehler) rechtfertigen keine neue Version:
 * jede Erhöhung stoppt das Tracking aller Fachkräfte, bis sie erneut zustimmen.
 */
export const GPS_POLICY_VERSION = "2026-08-07";
