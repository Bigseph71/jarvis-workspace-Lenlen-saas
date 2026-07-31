import argon2 from "argon2";
import { randomInt } from "node:crypto";

// Argon2id mit OWASP-Empfehlung (Stand 2024): 19 MiB Speicher, 2 Iterationen,
// Parallelität 1. Argon2id kombiniert Schutz gegen GPU- und Side-Channel-Angriffe.
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

// Zeichensätze ohne visuell mehrdeutige Zeichen (l/I/1, O/0), da das Passwort
// dem Konto-Inhaber vorgelesen oder abgetippt wird.
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALPHABET = LOWER + UPPER + DIGITS;

const TEMP_PASSWORD_LENGTH = 16;

/** Zieht ein Zeichen kryptografisch sicher und gleichverteilt. */
function pick(charset: string): string {
  return charset[randomInt(charset.length)]!;
}

/**
 * Erzeugt ein temporäres Passwort für ein neu angelegtes Konto.
 *
 * Garantiert je mindestens einen Klein-, Großbuchstaben und eine Ziffer, damit
 * es denselben Regeln genügt wie ein selbst gewähltes Passwort (auth.schemas).
 * Entropie bei 16 Zeichen aus 59: ~94 Bit.
 */
export function generateTemporaryPassword(): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  while (chars.length < TEMP_PASSWORD_LENGTH) {
    chars.push(pick(ALPHABET));
  }

  // Fisher-Yates, damit die garantierten Zeichen nicht immer vorne stehen.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  return chars.join("");
}
