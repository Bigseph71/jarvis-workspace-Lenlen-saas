import { describe, it, expect } from "vitest";
import {
  changePasswordSchema,
  loginSchema,
  registerOrganizationSchema,
} from "../../src/modules/auth/auth.schemas.js";

describe("loginSchema", () => {
  it("akzeptiert gültige Eingaben und normalisiert die E-Mail", () => {
    const parsed = loginSchema.parse({ email: "Admin@Demo.DE", password: "x" });
    expect(parsed.email).toBe("admin@demo.de");
  });

  it("lehnt ungültige E-Mail ab", () => {
    expect(() => loginSchema.parse({ email: "nope", password: "x" })).toThrow();
  });
});

describe("registerOrganizationSchema", () => {
  const base = {
    organizationName: "Demo Pflege",
    adminEmail: "admin@demo.de",
  };

  it("erzwingt eine starke Passwortrichtlinie", () => {
    // zu kurz / keine Großbuchstaben / keine Ziffer
    expect(() => registerOrganizationSchema.parse({ ...base, adminPassword: "kurz" })).toThrow();
    expect(() => registerOrganizationSchema.parse({ ...base, adminPassword: "alllowercase1" })).toThrow();
  });

  it("akzeptiert ein konformes Passwort und setzt country-Default", () => {
    const parsed = registerOrganizationSchema.parse({ ...base, adminPassword: "Sehr-Sicher-123" });
    expect(parsed.country).toBe("DE");
  });
});

describe("changePasswordSchema", () => {
  it("akzeptiert einen gültigen Wechsel", () => {
    const parsed = changePasswordSchema.parse({
      currentPassword: "TempAbc23xyzQ",
      newPassword: "Sehr-Sicher-123",
    });
    expect(parsed.newPassword).toBe("Sehr-Sicher-123");
  });

  it("erzwingt die Passwortrichtlinie für das neue Passwort", () => {
    expect(() =>
      changePasswordSchema.parse({ currentPassword: "TempAbc23xyzQ", newPassword: "kurz" }),
    ).toThrow();
    expect(() =>
      changePasswordSchema.parse({ currentPassword: "TempAbc23xyzQ", newPassword: "alllowercase1" }),
    ).toThrow();
  });

  it("lehnt ein unverändertes Passwort ab", () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: "Sehr-Sicher-123",
        newPassword: "Sehr-Sicher-123",
      }),
    ).toThrow();
  });

  it("verlangt das aktuelle Passwort", () => {
    expect(() =>
      changePasswordSchema.parse({ currentPassword: "", newPassword: "Sehr-Sicher-123" }),
    ).toThrow();
  });
});
