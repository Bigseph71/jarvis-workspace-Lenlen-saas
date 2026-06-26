# ── Build-Stage ──────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@9.12.0

# Workspace-Manifeste zuerst (Layer-Caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/database/package.json packages/database/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile || pnpm install

# Quellcode
COPY tsconfig.base.json ./
COPY packages/database packages/database
COPY apps/backend apps/backend

RUN pnpm --filter @len-len/database generate
RUN pnpm --filter @len-len/backend build

# ── Runtime-Stage ────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@9.12.0

COPY --from=builder /app/ ./
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "@len-len/backend", "start"]
