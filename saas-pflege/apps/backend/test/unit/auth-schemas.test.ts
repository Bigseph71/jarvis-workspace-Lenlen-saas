import { describe, it, expect } from "vitest";
import {
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
