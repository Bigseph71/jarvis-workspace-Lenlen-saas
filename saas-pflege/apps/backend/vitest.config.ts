import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Werte VOR dem Modulimport gesetzt – config/env.ts validiert sonst hart.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test?schema=public",
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
