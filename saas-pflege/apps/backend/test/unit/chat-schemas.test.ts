import { describe, expect, it } from "vitest";
import {
  listMessagesQuerySchema,
  markReadSchema,
  sendMessageSchema,
} from "../../src/modules/chat/chat.schemas.js";

describe("sendMessageSchema", () => {
  it("akzeptiert eine einfache Nachricht", () => {
    const parsed = sendMessageSchema.parse({ body: "Hallo Koordination" });
    expect(parsed.body).toBe("Hallo Koordination");
    expect(parsed.caregiverId).toBeUndefined();
  });

  it("trimmt Whitespace und lehnt leere Nachrichten ab", () => {
    expect(() => sendMessageSchema.parse({ body: "   " })).toThrow();
  });

  it("lehnt Nachrichten über 2000 Zeichen ab", () => {
    expect(() => sendMessageSchema.parse({ body: "x".repeat(2001) })).toThrow();
  });

  it("akzeptiert eine caregiverId (UUID)", () => {
    const parsed = sendMessageSchema.parse({
      body: "Hallo",
      caregiverId: "d98dd8e7-94ec-4803-b51e-cb10fa21b083",
    });
    expect(parsed.caregiverId).toBe("d98dd8e7-94ec-4803-b51e-cb10fa21b083");
  });

  it("lehnt eine ungültige caregiverId ab", () => {
    expect(() => sendMessageSchema.parse({ body: "Hallo", caregiverId: "nope" })).toThrow();
  });
});

describe("listMessagesQuerySchema", () => {
  it("defaultet limit auf 50", () => {
    const parsed = listMessagesQuerySchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.after).toBeUndefined();
  });

  it("parst after als Datum und begrenzt limit auf 200", () => {
    const parsed = listMessagesQuerySchema.parse({ after: "2026-07-04T10:00:00.000Z", limit: "100" });
    expect(parsed.after).toBeInstanceOf(Date);
    expect(parsed.limit).toBe(100);
    expect(() => listMessagesQuerySchema.parse({ limit: "201" })).toThrow();
  });
});

describe("markReadSchema", () => {
  it("akzeptiert leeren Body (Fachkraft) und caregiverId (Planer)", () => {
    expect(markReadSchema.parse({}).caregiverId).toBeUndefined();
    expect(
      markReadSchema.parse({ caregiverId: "d98dd8e7-94ec-4803-b51e-cb10fa21b083" }).caregiverId,
    ).toBeDefined();
  });
});
