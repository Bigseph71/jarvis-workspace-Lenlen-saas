import argon2 from "argon2";

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
