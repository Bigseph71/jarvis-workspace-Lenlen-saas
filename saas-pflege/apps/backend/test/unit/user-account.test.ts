import { describe, expect, it } from "vitest";
import {
  createFachkraftUserSchema,
  userIdParamSchema,
} from "../../src/modules/users/user.schemas.js";
import { generateTemporaryPassword } from "../../src/lib/password.js";

const CAREGIVER_ID = "d98dd8e7-94ec-4803-b51e-cb10fa21b083";

describe("createFachkraftUserSchema", () => {
  it("normalisiert die E-Mail und defaultet die Sprache auf DE", () => {
    const parsed = createFachkraftUserSchema.parse({
      caregiverId: CAREGIVER_ID,
      email: "Anna.Schmidt@Example.DE",
    });
    expect(parsed.email).toBe("anna.schmidt@example.de");
    expect(parsed.language).toBe("DE");
  });

  it("akzeptiert eine explizite Sprache", () => {
    const parsed = createFachkraftUserSchema.parse({
      caregiverId: CAREGIVER_ID,
      email: "anna@example.de",
      language: "FR",
    });
    expect(parsed.language).toBe("FR");
  });

  it("lehnt ungültige E-Mail und caregiverId ab", () => {
    expect(() =>
      createFachkraftUserSchema.parse({ caregiverId: CAREGIVER_ID, email: "keine-mail" }),
    ).toThrow();
    expect(() =>
      createFachkraftUserSchema.parse({ caregiverId: "nope", email: "anna@example.de" }),
    ).toThrow();
  });

  it("nimmt kein Passwort vom Client entgegen", () => {
    const parsed = createFachkraftUserSchema.parse({
      caregiverId: CAREGIVER_ID,
      email: "anna@example.de",
      password: "GewaehltesPasswort1",
    });
    expect(parsed).not.toHaveProperty("password");
  });
});

describe("userIdParamSchema", () => {
  it("akzeptiert eine UUID und lehnt alles andere ab", () => {
    expect(userIdParamSchema.parse({ id: CAREGIVER_ID }).id).toBe(CAREGIVER_ID);
    expect(() => userIdParamSchema.parse({ id: "42" })).toThrow();
    expect(() => userIdParamSchema.parse({})).toThrow();
  });
});

describe("generateTemporaryPassword", () => {
  it("erfüllt die Passwortregeln (Länge, Klein-, Großbuchstabe, Ziffer)", () => {
    for (let i = 0; i < 50; i++) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(16);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
    }
  });

  it("vermeidet mehrdeutige Zeichen (l, I, O, 0, 1)", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateTemporaryPassword()).not.toMatch(/[lIO01]/);
    }
  });

  it("liefert bei jedem Aufruf ein anderes Passwort", () => {
    const generated = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()));
    expect(generated.size).toBe(100);
  });
});
