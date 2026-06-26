# Len Len – SaaS ambulante Pflege

Monorepo (pnpm + Turborepo) pour la plateforme multi-tenant de soins ambulatoires.
La spec produit/technique de référence est dans [`CLAUDE.md`](./CLAUDE.md).

## Structure

```
saas-pflege/
├── apps/
│   ├── backend/        # API Node.js (Fastify) + Prisma + Auth + BullMQ producer
│   ├── web/            # Frontend Next.js (App Router) + next-intl (DE/EN/FR)
│   ├── vrptw-worker/   # Worker BullMQ d'optimisation de tournées (VRPTW)
│   └── ki-service/     # Microservice Python/FastAPI (3 modèles ML)
├── packages/
│   ├── database/       # Schéma Prisma + client partagé + RLS + seed
│   └── types/          # Types TypeScript partagés
├── docker-compose.yml  # Stack dev locale (postgres, redis, services)
├── turbo.json
└── pnpm-workspace.yaml
```

## Prérequis

- Node.js >= 20 (v24 installé sur ce poste)
- pnpm 9 (`corepack enable` puis `corepack prepare pnpm@9.12.0 --activate`)
- Docker + Docker Compose

## Démarrage rapide (Docker)

```bash
cp .env.example .env          # adapter les secrets
docker compose up -d          # postgres, redis, backend, web, worker, ki
```

Services exposés : web `:3000`, backend `:4000`. `postgres`, `redis`, `vrptw-worker`
et `ki-service` restent sur le réseau interne (pas d'accès Internet direct, conforme
à la règle d'isolation réseau du CLAUDE.md).

## Démarrage dev (sans Docker pour les apps)

```bash
pnpm install
docker compose up -d postgres redis      # seulement l'infra
pnpm db:generate                          # génère le client Prisma
pnpm --filter @len-len/database migrate   # crée les tables
pnpm --filter @len-len/database rls       # applique la Row-Level Security
pnpm --filter @len-len/database seed      # données de démo (optionnel)
pnpm dev                                  # lance les apps via Turborepo
```

## Multi-tenant & sécurité

- Chaque table métier porte `organization_id`.
- La **Row-Level Security** PostgreSQL (`packages/database/prisma/rls.sql`) force
  l'isolation : l'app exécute ses requêtes via `withTenant(orgId, ...)` qui pose
  `app.current_org` au niveau transaction.
- TypeScript strict partout, validation Zod côté API, Argon2id pour les mots de
  passe, AES-256 pour les données patients sensibles.

## État

Scaffolding initial (Phase 1 – MVP en cours). Les entrypoints exposent un `/health`
fonctionnel ; la logique métier reste à implémenter (voir plan de dev dans `CLAUDE.md`).
