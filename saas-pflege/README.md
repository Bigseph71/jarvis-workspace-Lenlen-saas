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

Les évolutions de schéma appliquées sur les bases existantes vivent dans
`packages/database/prisma/sql/`, écrites à la main et jouées manuellement.
Lire la note d'application en tête de `2026-07-04-add-pointage-gps.sql` avant
d'en créer ou d'en rejouer une : `prisma db execute` ne fonctionne plus à
travers le pooler Supabase, et le CI ne joue aucune migration.

## Multi-tenant & sécurité

- Chaque table métier porte `organization_id`.
- La **Row-Level Security** PostgreSQL (`packages/database/prisma/rls.sql`) force
  l'isolation : l'app exécute ses requêtes via `withTenant(orgId, ...)` qui pose
  `app.current_org` au niveau transaction.
- TypeScript strict partout, validation Zod côté API, Argon2id pour les mots de
  passe.
- **Chiffrement au repos** : assuré par l'hébergeur (Supabase / AWS chiffre les
  volumes de stockage), et TLS pour les données en transit. Il n'y a **pas** de
  chiffrement applicatif champ par champ : les adresses, coordonnées GPS et noms
  de patients sont lisibles en clair par quiconque accède à la base. La
  protection contre les accès inter-tenants repose sur la RLS, pas sur du
  chiffrement.

## Déploiement

### Clés Google : deux, jamais une

Le schlüssel du web est embarqué dans le bundle par Next à la compilation : il
est **public**, lisible depuis n'importe quelle page servie. Le schlüssel du
backend ne doit donc jamais être le même, sinon un visiteur peut geocoder sur
votre compte.

| | Backend | Web |
|---|---|---|
| Variable | `GOOGLE_MAPS_API_KEY` | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| API à autoriser | Geocoding API **seule** | Maps JavaScript API **seule** |
| Restriction | **aucune** par référent (un serveur n'en envoie pas) | référent HTTP limité à votre domaine |
| Exposition | secret | public par construction |

Une restriction par IP sur le schlüssel backend n'est pas praticable ici :
Railway ne garantit pas d'adresse de sortie stable. La protection repose donc
sur la limitation à la seule Geocoding API et sur le fait de ne jamais copier
cette valeur dans une variable `NEXT_PUBLIC_*`.

### Frontend sur Railway

Le frontend est un **service distinct** du backend, construit depuis
`apps/web/Dockerfile` (Next.js en mode `standalone`). `apps/web/railway.json`
porte déjà la configuration de build.

1. Nouveau service dans le même projet, pointant sur ce dépôt.
2. *Settings → Config-as-code* : `saas-pflege/apps/web/railway.json`.
3. Variables :
   - `NEXT_PUBLIC_API_URL` → URL publique du service backend. **Obligatoire** :
     sans elle, le build échoue volontairement (`apps/web/next.config.mjs`).
     Next fige cette valeur dans le bundle ; à défaut, l'application livrée
     appellerait `localhost:4000`, c'est-à-dire la machine du visiteur.
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → le schlüssel **web** (voir ci-dessus)
   - `NODE_ENV=production`
4. *Networking → Generate Domain*.
5. **Puis, sur le service backend** : `WEB_ORIGIN` = l'URL obtenue, et
   redéployer.

L'étape 5 n'est pas facultative. `WEB_ORIGIN` détermine l'origine autorisée par
CORS ; tant qu'elle pointe ailleurs, le navigateur bloque chaque requête du
frontend vers l'API et l'application paraît vide sans message d'erreur clair.

Les variables `NEXT_PUBLIC_*` sont lues à la **compilation**, pas au démarrage :
les modifier impose un redéploiement, un simple redémarrage ne suffit pas.

## État

Phase 1 (MVP) et l'essentiel de la Phase 2 livrés : auth multi-tenant, patients,
fachkräfte, contrats, visites, geocodage, VRPTW, tracking temps réel avec
consentement DSGVO, leasing, HR, chat, facturation Stripe, droits des personnes
concernées (auskunft et löschung). Voir le plan dans `CLAUDE.md`.
