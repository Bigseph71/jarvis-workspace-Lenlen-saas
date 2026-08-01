import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Werte VOR dem Modulimport gesetzt – config/env.ts validiert sonst hart.
    // Achtung: diese Werte ÜBERSCHREIBEN die der Shell und der .env. Die
    // Anwendungs-DATABASE_URL erreicht einen Test also nie, auch nicht
    // versehentlich.
    env: {
      NODE_ENV: "test",
      // Nur die Integrationstests (RUN_DB_TESTS=1) brauchen eine echte,
      // migrierte Datenbank; sie kommt über TEST_DATABASE_URL. Der Vorgabewert
      // zeigt auf eine lokale Test-DB – greift ein Unit-Test doch einmal auf
      // die DB zu, scheitert er hier statt irgendwo Daten anzufassen.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://test:test@localhost:5432/test?schema=public",
      REDIS_URL: "redis://localhost:6379",
      JWT_ACCESS_SECRET: "test_access_secret_min_16_chars",
      JWT_REFRESH_SECRET: "test_refresh_secret_min_16_chars",
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL: "7d",
    },
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/modules/**/*.rules.ts", "src/modules/**/*.schemas.ts", "src/plugins/**"],
    },
  },
});
