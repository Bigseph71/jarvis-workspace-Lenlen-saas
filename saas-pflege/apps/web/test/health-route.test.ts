import { describe, it, expect, afterEach, vi } from "vitest";
import { shortCommit, deployedCommit } from "../src/lib/version";

/**
 * Version im Health-Check des Webs.
 *
 * Anlass: nach einem Merge liess sich von aussen nicht feststellen, welcher
 * Stand des Frontends ausgeliefert wird. Beim Backend beantwortet /health das
 * seit laengerem, beim Web blieb nur Raten - und eine Aenderung, die nur eine
 * Menuereihenfolge betrifft, ist von aussen ueberhaupt nicht zu erkennen.
 */

describe("shortCommit", () => {
  it("kuerzt auf die sieben Zeichen von git log --oneline", () => {
    // Dieselbe Kurzform wie im Backend, damit sich beide Antworten direkt
    // miteinander und mit dem Verlauf vergleichen lassen.
    expect(shortCommit("5330eb07cb9851a54d8b2c926b84efe77d0d6694")).toBe("5330eb0");
  });

  it("nennt 'unknown', wenn der Hoster nichts liefert", () => {
    // Ein leeres Feld waere schlimmer als ein ehrliches "unknown": es saehe
    // aus wie eine Version.
    expect(shortCommit(undefined)).toBe("unknown");
    expect(shortCommit("")).toBe("unknown");
    expect(shortCommit("   ")).toBe("unknown");
  });

  it("laesst einen bereits kurzen Wert unveraendert", () => {
    expect(shortCommit("abc123")).toBe("abc123");
  });
});

describe("deployedCommit", () => {
  // Gegen die echte Umgebung geprueft, nicht gegen ein Objekt: genau die
  // Aufloesung von process.env ist der Teil, der falsch sein kann.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bevorzugt GIT_COMMIT_SHA vor der Railway-Variablen", () => {
    // Der von Hand gesetzte Wert gewinnt: er ist die Ausnahme, die jemand
    // bewusst gesetzt hat (anderer Hoster, lokaler Container).
    vi.stubEnv("GIT_COMMIT_SHA", "1111111aaaaaaa");
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "2222222bbbbbbb");

    expect(deployedCommit()).toBe("1111111");
  });

  it("faellt auf die Railway-Variable zurueck, auch wenn die erste LEER ist", () => {
    // Der Fall, der `??` allein nicht loest: eine im Hoster angelegte, aber
    // leer gelassene Variable ist "" und nicht undefined. Ohne diese
    // Behandlung meldete /health auf Dauer "unknown", obwohl der Commit
    // direkt daneben steht.
    vi.stubEnv("GIT_COMMIT_SHA", "");
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "2222222bbbbbbb");

    expect(deployedCommit()).toBe("2222222");
  });

  it("antwortet 'unknown' ohne beide", () => {
    vi.stubEnv("GIT_COMMIT_SHA", "");
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "");

    expect(deployedCommit()).toBe("unknown");
  });
});
