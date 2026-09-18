import { createHmac, randomBytes } from "node:crypto";
import type { Locale } from "@len-len/database";
import { env } from "../config/env.js";
import { parseDurationMs } from "./tokens.js";

/**
 * Einladungs-Token: erlaubt einmalig, das Passwort eines Kontos zu setzen.
 *
 * Es ersetzt das temporäre Passwort, das die API bisher im Klartext
 * zurückgab. Der Unterschied ist nicht bloss technischer Natur: bei einem
 * vergebenen Passwort KENNT der Admin das Geheimnis der Fachkraft und kann
 * sich vor ihr in deren Namen anmelden. Was danach im Audit-Log unter ihrem
 * Namen steht, ist damit nicht mehr ihr zurechenbar. Mit einer Einladung
 * wählt sie ihr Passwort selbst, und niemand sonst kennt es je.
 */

/** 32 Byte = 256 Bit. Raten ist aussichtslos, Länge im Link noch vertretbar. */
const TOKEN_BYTES = 32;

export interface GeneratedInvitation {
  /** Klartext – steht nur in der Antwort des Anlegens, nie in der Datenbank. */
  token: string;
  /** HMAC-Hash – nur dieser wird gespeichert. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * HMAC-SHA256 wie bei den Refresh-Token, aber mit vorangestelltem
 * Verwendungszweck.
 *
 * Die Trennung ist der Grund für das Präfix: dasselbe Secret bedient zwei
 * Token-Arten, und ohne Domänentrennung ergäbe ein Einladungs-Token denselben
 * Hash wie ein gleichlautendes Refresh-Token. Ein eigenes Secret wäre sauberer,
 * hiesse aber eine weitere Pflichtvariable beim Deployen – und eine vergessene
 * Variable ist ein realeres Risiko als diese Kollision.
 */
export function hashInvitationToken(token: string): string {
  return createHmac("sha256", env.JWT_REFRESH_SECRET)
    .update(`invitation:${token}`)
    .digest("hex");
}

export function generateInvitation(): GeneratedInvitation {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return {
    token,
    tokenHash: hashInvitationToken(token),
    expiresAt: new Date(Date.now() + parseDurationMs(env.INVITATION_TTL)),
  };
}

/**
 * Der Link, den der Admin weitergibt.
 *
 * In der Sprache des eingeladenen Kontos: wer auf Französisch arbeitet, soll
 * nicht auf einer deutschen Seite landen und raten müssen, welches Feld das
 * Passwort ist.
 */
export function invitationUrl(token: string, language: Locale): string {
  return `${env.WEB_ORIGIN}/${language.toLowerCase()}/invitation/${token}`;
}
