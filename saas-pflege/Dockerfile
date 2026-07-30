FROM node:20
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY packages/api-client/package.json ./packages/api-client/

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/backend ./apps/backend

RUN pnpm db:generate
RUN npm install -g tsx

EXPOSE 4000
CMD ["tsx", "apps/backend/src/index.ts"]
