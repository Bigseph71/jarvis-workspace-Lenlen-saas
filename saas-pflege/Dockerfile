FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY packages/api-client/package.json ./packages/api-client/

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/backend ./apps/backend

RUN pnpm db:generate
RUN pnpm --filter @len-len/backend build

EXPOSE 4000
CMD ["node", "apps/backend/dist/index.js"]
