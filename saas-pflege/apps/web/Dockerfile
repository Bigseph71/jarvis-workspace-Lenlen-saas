# ── Build-Stage ──────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@9.12.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile || pnpm install

COPY apps/web apps/web
RUN pnpm --filter @len-len/web build

# ── Runtime-Stage (Next.js standalone) ───────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
