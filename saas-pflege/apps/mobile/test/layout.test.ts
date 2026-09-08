import { describe, it, expect } from "vitest";
import { tabBarLayout, chatInputLayout, CHAT_INPUT_PADDING } from "../src/lib/layout";
import { MIN_TAB_HEIGHT, MIN_TOUCH_HEIGHT } from "../src/lib/theme";

/**
 * Berührungsflächen am unteren Bildschirmrand.
 *
 * Zwei Fehler derselben Art sind durch die CI gegangen und erst am Gerät
 * aufgefallen: die Reiterleiste (PR #66) und die Eingabezeile des Chats
 * (PR #74) waren auf einem Telefon mit Android-Gestensteuerung kaum zu
 * treffen. Der Wischbalken des Systems beansprucht die untersten Bildpunkte;
 * was dort gezeichnet wird, ist sichtbar, aber Berührungen gehen an das System.
 *
 * Diese Tests FINDEN so einen Fehler nicht -- dazu braucht es ein Gerät. Sie
 * halten fest, was nach den beiden Korrekturen bekannt ist, damit es nicht
 * unbemerkt zurückkommt. Eine Sperrklinke, kein Melder.
 *
 * Der wichtigste steht als erster: der Abstand muss dem Sicherheitsabstand
 * FOLGEN. Genau das war vorher nicht so -- dort stand eine feste 20.
 */

/** Typische Werte: 0 = Tasten-Navigation oder iPhone ohne Notch. */
const OHNE_LEISTE = 0;
const MIT_GESTEN = 48;

describe("tabBarLayout", () => {
  it("folgt dem Sicherheitsabstand, statt ihn zu erfinden", () => {
    // DER Test dieser Datei. Vorher stand in der Reiterleiste ein fester
    // Innenabstand (20); auf jedem Gerät derselbe, auf keinem richtig. Zwei
    // verschiedene Systemabstände MÜSSEN zu zwei verschiedenen Abständen
    // führen -- sonst ist die Zahl wieder geraten.
    expect(tabBarLayout(MIT_GESTEN).paddingBottom).not.toBe(
      tabBarLayout(OHNE_LEISTE).paddingBottom,
    );
    expect(tabBarLayout(MIT_GESTEN).paddingBottom - tabBarLayout(OHNE_LEISTE).paddingBottom).toBe(
      MIT_GESTEN,
    );
  });

  it("haelt die Mindesthoehe auch ohne Systemleiste", () => {
    // Die zweite Haelfte der Korrektur: wo das System nichts beansprucht, ist
    // der Abstand 0 -- und nur die Hoehe verhindert, dass der Reiter wieder so
    // flach wird wie vorher.
    expect(tabBarLayout(OHNE_LEISTE).minHeight).toBe(MIN_TAB_HEIGHT);
    expect(tabBarLayout(MIT_GESTEN).minHeight).toBe(MIN_TAB_HEIGHT);
  });

  it("bleibt deutlich ueber der allgemeinen Untergrenze", () => {
    // Ein Reiter wird im Treppenhaus mit Handschuhen getroffen, nicht am
    // Schreibtisch. Sinkt MIN_TAB_HEIGHT je auf MIN_TOUCH_HEIGHT, faellt das
    // hier auf und nicht erst beim naechsten Geraet.
    expect(MIN_TAB_HEIGHT).toBeGreaterThan(MIN_TOUCH_HEIGHT);
  });

  it("gibt nie einen negativen Abstand zurueck", () => {
    // Ein negativer Abstand zoege die Flaeche AUS dem Bild -- also genau der
    // Fehler, den diese Datei verhindern soll, nur schlimmer.
    expect(tabBarLayout(-10).paddingBottom).toBe(0);
    expect(tabBarLayout(Number.NaN).paddingBottom).toBe(0);
  });
});

describe("chatInputLayout", () => {
  it("folgt dem Sicherheitsabstand", () => {
    expect(chatInputLayout(MIT_GESTEN).paddingBottom - chatInputLayout(OHNE_LEISTE).paddingBottom).toBe(
      MIT_GESTEN,
    );
  });

  it("behaelt den eigenen Innenabstand, auch ohne Systemleiste", () => {
    // Anders als die Reiterleiste: das Feld soll nicht am Rand kleben, auch
    // wenn das System nichts beansprucht. Der Sicherheitsabstand kommt oben
    // drauf, er ersetzt ihn nicht.
    expect(chatInputLayout(OHNE_LEISTE).paddingBottom).toBe(CHAT_INPUT_PADDING);
    expect(chatInputLayout(MIT_GESTEN).paddingBottom).toBe(CHAT_INPUT_PADDING + MIT_GESTEN);
  });

  it("haelt die Mindesthoehe fuer Feld und Sendeknopf", () => {
    expect(chatInputLayout(OHNE_LEISTE).minHeight).toBe(MIN_TOUCH_HEIGHT);
    expect(chatInputLayout(MIT_GESTEN).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_HEIGHT);
  });

  it("gibt nie einen negativen Abstand zurueck", () => {
    expect(chatInputLayout(-10).paddingBottom).toBe(CHAT_INPUT_PADDING);
  });
});

describe("Untergrenzen der Beruehrungsflaechen", () => {
  it("unterschreitet nie 44 Punkte", () => {
    // Der Handoff nennt 44 als absolute Untergrenze. Beide Flaechen liegen
    // darueber, bei JEDEM Systemabstand -- auch bei 0.
    for (const inset of [0, 12, 24, 48, 96]) {
      expect(tabBarLayout(inset).minHeight, `Reiter bei ${inset}`).toBeGreaterThanOrEqual(44);
      expect(chatInputLayout(inset).minHeight, `Chat bei ${inset}`).toBeGreaterThanOrEqual(44);
    }
  });
});
