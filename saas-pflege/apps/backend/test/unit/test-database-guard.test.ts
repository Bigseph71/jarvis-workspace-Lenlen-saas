import { describe, it, expect, afterEach } from "vitest";
import { assertLocalTestDatabase } from "../helpers/test-database.js";

const LOCAL = "postgresql://test:test@localhost:5432/test?schema=public";
const PROD = "postgresql://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

describe("assertLocalTestDatabase", () => {
  afterEach(() => {
    delete process.env.ALLOW_REMOTE_DB_TESTS;
  });

  it("laisse passer une base locale", () => {
    expect(() => assertLocalTestDatabase(LOCAL)).not.toThrow();
    expect(() => assertLocalTestDatabase("postgresql://u:p@127.0.0.1:5432/db")).not.toThrow();
  });

  it("accepte les hôtes de service CI et Docker", () => {
    expect(() => assertLocalTestDatabase("postgresql://u:p@postgres:5432/db")).not.toThrow();
    expect(() => assertLocalTestDatabase("postgresql://u:p@db:5432/db")).not.toThrow();
  });

  it("refuse une base distante et nomme l'hôte fautif", () => {
    expect(() => assertLocalTestDatabase(PROD)).toThrow(/pooler\.supabase\.com/);
  });

  it("refuse une URL absente ou illisible", () => {
    expect(() => assertLocalTestDatabase(undefined)).toThrow(/manquante/);
    expect(() => assertLocalTestDatabase("pas-une-url")).toThrow(/exploitable/);
  });

  it("ALLOW_REMOTE_DB_TESTS=1 lève la restriction, mais rien d'autre ne le fait", () => {
    process.env.ALLOW_REMOTE_DB_TESTS = "1";
    expect(() => assertLocalTestDatabase(PROD)).not.toThrow();

    process.env.ALLOW_REMOTE_DB_TESTS = "true";
    expect(() => assertLocalTestDatabase(PROD)).toThrow();
  });
});
