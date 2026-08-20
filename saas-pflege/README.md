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

   Ces deux variables sont consommées **pendant le build Docker**, via les
   `ARG` déclarés dans `apps/web/Dockerfile`. Docker ignore tout `--build-arg`
   non déclaré : sans ces `ARG`, une variable pourtant correctement définie
   dans Railway n'atteint jamais l'étape de compilation, et le bundle sort
   avec `localhost:4000`. C'est la panne du premier déploiement.
   - `NODE_ENV=production`
4. *Networking → Generate Domain*.
5. **Puis, sur le service backend** : `WEB_ORIGIN` = l'URL obtenue, et
   redéployer.

L'étape 5 n'est pas facultative. `WEB_ORIGIN` détermine l'origine autorisée par
CORS ; tant qu'elle pointe ailleurs, le navigateur bloque chaque requête du
frontend vers l'API et l'application paraît vide sans message d'erreur clair.

Les variables `NEXT_PUBLIC_*` sont lues à la **compilation**, pas au démarrage :
les modifier impose un redéploiement, un simple redémarrage ne suffit pas.

### Application mobile (EAS)

`EXPO_PUBLIC_API_URL` obéit à la même règle que les `NEXT_PUBLIC_*` : la valeur
est **figée au moment du bundle**, pas lue au lancement. Elle doit donc figurer
dans **chaque** profil de `apps/mobile/eas.json`.

| Profil | Sortie | Usage |
|---|---|---|
| `preview` | APK, distribution interne | essais, installation manuelle |
| `production` | AAB (app-bundle) | Play Store / TestFlight |

**Numéro de build.** Les deux profils utilisent `autoIncrement`, et le compteur
vit chez EAS (`cli.appVersionSource: "remote"`) : chaque build reçoit un
`versionCode` unique sans qu'aucun fichier ne soit modifié ni commité. La
valeur est affichée en pied de l'écran de connexion, lue depuis le **paquet
natif** (`expo-application`) et non depuis `app.json` — puisqu'elle n'y figure
pas. C'est le seul chiffre qui identifie le binaire réellement installé, et
l'écran de connexion est accessible sans compte, donc y compris quand quelqu'un
appelle justement parce qu'il n'arrive pas à se connecter.

Le profil `production` n'avait pas cette variable, et le code retombait en
silence sur `http://localhost:4000`, c'est-à-dire le téléphone lui-même : l'app
s'installait, s'ouvrait, et échouait à chaque appel sans rien expliquer. C'est
exactement la panne déjà vécue côté web. Un build de release sans cette
variable **échoue maintenant explicitement** (`src/lib/api-url.ts`) ; en
développement, le repli sur localhost reste en place.

**HTTP en clair.** Interdit dans tous les builds. Pour développer contre un
backend local en `http://192.168.x.y:4000`, poser `EXPO_ALLOW_CLEARTEXT=1` dans
`apps/mobile/.env` : `app.config.js` n'ajoute `usesCleartextTraffic` que dans ce
cas. Ce réglage était auparavant en dur dans `app.json`, donc présent dans les
apps livrées — inutile puisque l'API est en HTTPS, visible pour qui ouvre l'APK,
et surtout il masquait l'erreur de configuration ci-dessus au lieu de la
révéler.

**Distribution.** Une APK installée n'expire pas, mais les artefacts de build
EAS ne sont plus téléchargeables après 30 jours : équiper un nouvel appareil
impose alors un nouveau build. Les builds TestFlight, eux, expirent réellement
au bout de 90 jours (le testeur perd l'app et ses données locales). Pour un
pilote, viser Play Internal Testing et TestFlight plutôt qu'une APK transmise à
la main.

## État

Phase 1 (MVP) et l'essentiel de la Phase 2 livrés : auth multi-tenant, patients,
fachkräfte, contrats, visites, geocodage, VRPTW, tracking temps réel avec
consentement DSGVO, leasing, HR, chat, facturation Stripe, droits des personnes
concernées (auskunft et löschung). Voir le plan dans `CLAUDE.md`.
