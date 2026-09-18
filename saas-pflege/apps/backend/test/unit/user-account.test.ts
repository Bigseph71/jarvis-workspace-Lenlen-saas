import { describe, expect, it } from "vitest";
import {
  createFachkraftUserSchema,
  userIdParamSchema,
} from "../../src/modules/users/user.schemas.js";

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
