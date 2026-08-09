# ── Build-Stage ──────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@9.12.0

# Manifeste ZUERST, Quellen später: so bleibt die Installationsschicht im
# Cache, solange sich keine Abhängigkeit ändert.
#
# packages/api-client MUSS dabei sein: apps/web hängt als workspace:* davon ab
# und konsumiert es als TypeScript-Quelle (transpilePackages in
# next.config.mjs). Fehlt es, scheitert bereits pnpm install an einer nicht
# auflösbaren Workspace-Referenz.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/

# --frozen-lockfile ohne Rückfallebene: ein "|| pnpm install" verdeckte einen
# nicht mehr passenden Lockfile und baute ein Image mit anderen Versionen als
# in CI geprüft.
RUN pnpm install --frozen-lockfile --filter @len-len/web...

COPY packages/api-client packages/api-client
COPY apps/web apps/web

# NEXT_PUBLIC_* muss zur BAUZEIT im Image stehen: Next schreibt diese Werte
# fest ins Bundle, zur Laufzeit werden sie nie gelesen.
#
# ARG ist dabei zwingend. Docker verwirft jedes --build-arg, das die Datei
# nicht deklariert – die in Railway gesetzten Variablen erreichen den
# Build-Schritt sonst NICHT, obwohl sie dort sauber hinterlegt sind. Genau
# daran scheiterte das erste Deployment: das Bundle zeigte auf localhost:4000,
# und die Suche lief über CORS und WEB_ORIGIN am Problem vorbei.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

RUN pnpm --filter @len-len/web build

# ── Runtime-Stage (Next.js standalone) ───────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Ohne eigenen Benutzer liefe der Prozess als root.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# standalone enthält den Server samt der tatsächlich benötigten node_modules;
# static und public liegen außerhalb und werden getrennt kopiert.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

# Railway gibt den Port über die Umgebung vor; 3000 ist nur der Rückfall.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
