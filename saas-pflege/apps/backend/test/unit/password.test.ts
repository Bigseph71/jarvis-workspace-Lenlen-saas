import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/password.js";

describe("password (Argon2id)", () => {
  it("erzeugt einen argon2id-Hash und verifiziert das richtige Passwort", async () => {
    const hash = await hashPassword("Sehr-Sicher-123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "Sehr-Sicher-123")).toBe(true);
  });

  it("lehnt ein falsches Passwort ab", async () => {
    const hash = await hashPassword("Sehr-Sicher-123");
    expect(await verifyPassword(hash, "falsch")).toBe(false);
  });
}, 20_000);
