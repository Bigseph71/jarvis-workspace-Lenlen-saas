import { describe, it, expect } from "vitest";
import { TAB_HREF, TAB_ORDER, tabNavigation } from "../src/lib/tabs";

/**
 * Stapel-Semantik der Reiterleiste.
 *
 * Die App hat keinen Tab-Navigator, sondern einen Stack: die Leiste ist Optik,
 * das richtige Verhalten muss von Hand gesetzt werden. Ein zu tiefer Stapel
 * sieht auf dem Telefon exakt richtig aus, bis jemand auf Zurück drückt und
 * rückwärts durch die Reiter blättert.
 */

describe("TAB_ORDER", () => {
  it("führt den Verlauf als DRITTEN Reiter", () => {
    expect(TAB_ORDER).toEqual(["tour", "chat", "history"]);
  });

  it("hat für jeden Reiter genau eine Adresse", () => {
    expect(TAB_ORDER.map((key) => TAB_HREF[key])).toEqual(["/today", "/chat", "/history"]);
  });
});

describe("tabNavigation", () => {
  it("tut nichts, wenn der aktive Reiter erneut angetippt wird", () => {
    // Sonst legte ein zweites Antippen eine Kopie desselben Bildschirms an.
    for (const key of TAB_ORDER) {
      expect(tabNavigation(key, key), key).toEqual({ kind: "none" });
    }
  });

  it("räumt den Stapel bis zur Tagesroute ab, statt sie erneut aufzulegen", () => {
    // dismissTo statt push: die Tour ist die Wurzel. Ein push legte eine
    // zweite Tour ÜBER den Verlauf, und die Zurück-Taste führte dorthin.
    expect(tabNavigation("history", "tour")).toEqual({ kind: "dismissTo", href: "/today" });
    expect(tabNavigation("chat", "tour")).toEqual({ kind: "dismissTo", href: "/today" });
  });

  it("legt Chat und Verlauf ÜBER die Tagesroute", () => {
    // push, damit die Tour im Stapel bleibt: der Chat-Bildschirm hat eine
    // Zurück-Taste, die auf sie führen soll.
    expect(tabNavigation("tour", "chat")).toEqual({ kind: "push", href: "/chat" });
    expect(tabNavigation("tour", "history")).toEqual({ kind: "push", href: "/history" });
  });

  it("ersetzt beim Wechsel zwischen zwei Blättern, statt zu stapeln", () => {
    // Sonst läge unter dem Chat der Verlauf und darunter die Tour – die
    // Zurück-Taste liefe rückwärts durch die Reiterleiste.
    expect(tabNavigation("chat", "history")).toEqual({ kind: "replace", href: "/history" });
    expect(tabNavigation("history", "chat")).toEqual({ kind: "replace", href: "/chat" });
  });
});
