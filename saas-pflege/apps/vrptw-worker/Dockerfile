# ── Build-Stage ──────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@9.12.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/database/package.json packages/database/
COPY apps/vrptw-worker/package.json apps/vrptw-worker/
RUN pnpm install --frozen-lockfile || pnpm install

COPY tsconfig.base.json ./
COPY packages/database packages/database
COPY apps/vrptw-worker apps/vrptw-worker

RUN pnpm --filter @len-len/database generate
RUN pnpm --filter @len-len/vrptw-worker build

# ── Runtime-Stage ────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@9.12.0

COPY --from=builder /app/ ./
CMD ["pnpm", "--filter", "@len-len/vrptw-worker", "start"]
