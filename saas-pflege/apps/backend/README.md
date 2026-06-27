# Backend – Len Len

API Fastify (TypeScript strict). Contient le **module d'authentification multi-tenant**.

## Authentification

- **Hachage** : Argon2id (19 MiB, t=2, p=1, recommandation OWASP).
- **Access token** : JWT HS256, courte durée (`JWT_ACCESS_TTL`, défaut 15 min).
  Claims : `sub` (userId), `org` (organizationId), `role`.
- **Refresh token** : chaîne opaque aléatoire. Seul son hash HMAC-SHA256
  (poivré avec `JWT_REFRESH_SECRET`) est stocké en base → une fuite de la table
  est inexploitable.
- **Rotation** : chaque `/auth/refresh` révoque l'ancien token et en émet un
  nouveau. **Détection de réutilisation** : rejouer un token révoqué révoque
  toute la famille de tokens de l'utilisateur (session terminée).
- **RBAC** : 5 rôles (`SUPER_ADMIN`, `STRUKTUR_ADMIN`, `KOORDINATOR`, `HR`,
  `FACHKRAFT`) via le preHandler `requireRole(...)`.
- **Rate limit** : 10 req/min sur les endpoints d'auth, 100 req/min ailleurs.

### Endpoints

| Méthode | Route | Accès | Rôle |
|---|---|---|---|
| POST | `/auth/register-organization` | public | crée org + premier `STRUKTUR_ADMIN` |
| POST | `/auth/login` | public | email + password (+ `organizationId` si ambigu) |
| POST | `/auth/refresh` | public | rotation du refresh token |
| POST | `/auth/logout` | public | révoque le refresh token |
| GET | `/auth/me` | Bearer | profil (lecture Tenant-scoped via RLS) |
| GET | `/auth/admin/ping` | Bearer | SUPER_ADMIN / STRUKTUR_ADMIN |

### Flux (exemple)

```bash
# 1. Bootstrap d'une organisation
curl -X POST localhost:4000/auth/register-organization \
  -H 'content-type: application/json' \
  -d '{"organizationName":"Demo Pflege","adminEmail":"admin@demo.de","adminPassword":"Sehr-Sicher-123"}'

# 2. Login -> { accessToken, refreshToken, user }
curl -X POST localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@demo.de","password":"Sehr-Sicher-123"}'

# 3. Route protégée
curl localhost:4000/auth/me -H "authorization: Bearer <accessToken>"

# 4. Rotation
curl -X POST localhost:4000/auth/refresh \
  -H 'content-type: application/json' -d '{"refreshToken":"<refreshToken>"}'
```

## Ressources métier (tenant-scoped)

Toutes ces routes exigent un Bearer token. Les requêtes passent par
`withTenant(orgId, …)` → isolation RLS automatique. Pagination via
`?page=&pageSize=` (max 100).

### Patients (`/patients`)

Accès : `SUPER_ADMIN`, `STRUKTUR_ADMIN`, `KOORDINATOR`.
HR exclu (pas de données patients), Fachkraft exclu (app mobile).

| Méthode | Route | Effet |
|---|---|---|
| GET | `/patients` | liste (filtres `search`, `geocodingStatus`, `includeInactive`) |
| GET | `/patients/:id` | détail (+ audit log READ, DSGVO) |
| POST | `/patients` | création (geocodingStatus=PENDING) |
| PATCH | `/patients/:id` | mise à jour (changement d'adresse → re-geocoding) |
| DELETE | `/patients/:id` | soft-delete (isActive=false, préserve l'historique) |

### Fachkräfte (`/caregivers`)

Lecture : `+ HR` et `KOORDINATOR`. Écriture / contrat : `STRUKTUR_ADMIN`, `HR`.

| Méthode | Route | Effet |
|---|---|---|
| GET | `/caregivers` | liste (filtres `search`, `qualification`, `includeInactive`) |
| GET | `/caregivers/:id` | détail (+ nb de patients attitrés) |
| POST | `/caregivers` | création (avec bloc contrat obligatoire) |
| PATCH | `/caregivers/:id` | mise à jour profil (nom, qualification, lien user) |
| PUT | `/caregivers/:id/contract` | **module Vertrag** : type, heures, jours, max patients |
| DELETE | `/caregivers/:id` | soft-delete |

Règles appliquées : la fachkraft attitrée à un patient doit appartenir au tenant
et être active ; un compte utilisateur ne peut être lié qu'à une seule fachkraft.
Chaque création/modification/suppression écrit un **audit log** (DSGVO).

### Besuche / Planification (`/visits`)

Planification : `SUPER_ADMIN`, `STRUKTUR_ADMIN`, `KOORDINATOR`.
Pointage GPS : `+ FACHKRAFT` (uniquement ses propres visites).

| Méthode | Route | Effet | Accès |
|---|---|---|---|
| GET | `/visits` | liste (filtres `from`,`to`,`patientId`,`caregiverId`,`status`,`includeEmergency`) | planif |
| GET | `/visits/:id` | détail | planif |
| POST | `/visits` | crée un besuch régulier | planif |
| POST | `/visits/emergency` | crée un besuch d'urgence (motif obligatoire) | planif |
| PATCH | `/visits/:id/reschedule` | déplace un besuch | planif |
| PUT | `/visits/:id/caregiver` | assigne une vertretung | planif |
| POST | `/visits/:id/cancel` | annule | planif |
| POST | `/visits/:id/check-in` | pointage arrivée (→ IN_PROGRESS) | track |
| POST | `/visits/:id/check-out` | pointage départ (→ COMPLETED) | track |
| GET | `/visits/alerts/missing-week` | patients sans visite régulière la semaine | planif |
| GET | `/visits/mine` | route du jour de la fachkraft connectée | FACHKRAFT |

**Règles métier appliquées** :
1. **1 visite régulière / semaine / patient** (ISO, lun-dim) → conflit 409 si doublon.
2. **Urgences** hors cycle : motif obligatoire, `isEmergency=true`, ne consomment
   pas la semaine et ignorent les contraintes de jour/qualification.
3. **Alerte** : patients actifs sans visite régulière planifiée/en cours/faite
   pour la semaine demandée.
4. **Remplacement** : la vertretung doit avoir la **même qualification** que la
   stamm-fachkraft ; traçabilité `caregiverId` (effectif) vs `assignedCaregiverId`.
5. **Jours travaillés** : un besuch ne peut tomber que sur un `workDay` de la
   fachkraft effective (les heures contractuelles restent un TODO, faute de
   modèle de durée/horaire de visite).

Transitions de statut : `PLANNED → IN_PROGRESS` (check-in) → `COMPLETED`
(check-out) ; `PLANNED|IN_PROGRESS → CANCELED` (cancel).

### Geocodage (`/geocoding`, `/patients/:id/geocode`)

Convertit l'adresse d'un patient en coordonnées (Google Maps). Sans
`GOOGLE_MAPS_API_KEY`, un **stub déterministe** prend le relais (dev/test).

- **Provider** : abstraction `GeocodingProvider` ; `GoogleMapsProvider` (réel) ou
  `StubGeocodingProvider` (fallback). Le parseur de réponse Google est pur et testé.
- **Statuts** : un succès → `VALID` (+ lat/long, score, adresse normalisée) ;
  aucun résultat → `INVALID` ; en attente → `PENDING`.
- **Async** : à la création d'un patient (ou changement d'adresse), un job BullMQ
  est mis en file (best-effort, ne bloque pas la requête). Un worker in-process
  le traite. Si Redis est indisponible, le patient reste `PENDING` et le geocodage
  se rattrape via `/geocoding/process`.
- **Règle 7** : l'optimisation VRPTW est bloquée tant qu'un patient est `INVALID`.

| Méthode | Route | Effet | Accès |
|---|---|---|---|
| POST | `/patients/:id/geocode` | (re)géocode un patient (synchrone) | admin, koordinator |
| POST | `/geocoding/process?limit=` | traite les patients `PENDING` du tenant | admin |

### Billing / Stripe (`/billing`)

Abonnement multi-tenant. Sans clés Stripe, un **stub** prend le relais (dev/test).

- **Plans & limites** (source de vérité `billing/plan.ts`) : Basic (100 patients,
  10 fachkräfte, 5 véhicules, sans KI), Pro (1000/100/30, KI), Enterprise
  (5000/500/illimité, KI).
- **Enforcement HTTP 402** : la création d'un patient ou d'une fachkraft appelle
  `assertWithinPlan` dans la transaction → `402` si quota atteint ou abo inactif
  (règle 8).
- **Checkout** : `POST /billing/checkout { plan }` crée une session Stripe
  (mode subscription) et renvoie l'URL.
- **Webhook signé** : `POST /billing/webhook` vérifie la signature
  (`constructEvent`) sur le **body brut** (parseur buffer scopé), puis met à jour
  `subscriptionStatus`. Mapping : `checkout.session.completed`/`invoice.paid` →
  `ACTIVE`, `invoice.payment_failed` → `PAST_DUE`, `customer.subscription.deleted`
  → `CANCELED`.

| Méthode | Route | Effet | Accès |
|---|---|---|---|
| GET | `/billing/subscription` | plan, statut, limites du tenant | admin |
| POST | `/billing/checkout` | démarre l'abonnement Stripe | admin |
| POST | `/billing/webhook` | événements Stripe (signature vérifiée) | public (Stripe) |

Note : suspension après karenzzeit (`PAST_DUE` → `SUSPENDED`) laissée en TODO ;
le webhook passe à `PAST_DUE` à l'échec, la suspension dure restera un job planifié.

## Tests

Runner : **Vitest**. Deux niveaux.

### Tests unitaires (sans base de données)

Couvrent la logique pure : dates/semaines (`lib/week`), tokens (`lib/tokens`),
pagination, règles métier des visites (`visit.rules`), validation Zod des schémas,
RBAC (`requireRole`), hachage Argon2id.

```bash
pnpm install
pnpm --filter @len-len/database generate   # requis : les schemas utilisent les enums Prisma
pnpm --filter @len-len/backend test         # vitest run
```

Les secrets/env de test sont injectés par `vitest.config.ts` (pas de `.env` requis).

### Test d'intégration (base réelle, opt-in)

`test/integration/auth-flow.int.test.ts` exerce register → login → rotation →
détection de réutilisation contre une vraie DB. Skippé par défaut.

```bash
# Postgres démarré + DATABASE_URL vers une DB migrée :
pnpm --filter @len-len/database migrate:deploy
pnpm --filter @len-len/database rls
RUN_DB_TESTS=1 pnpm --filter @len-len/backend test
```

Les imports y sont dynamiques : sans DB ni client généré, le fichier ne casse
pas le run unitaire.

## Modèle multi-tenant / RLS

Deux chemins d'accès à la base (voir `packages/database/prisma/rls.sql`) :

1. **Système / Auth** (rôle propriétaire, contourne la RLS) : login, lookup
   refresh, bootstrap d'organisation, migrations.
2. **Métier / Tenant** (rôle `app_user`, soumis à la RLS) : via `withTenant(orgId, …)`
   qui pose `app.current_org` au niveau transaction. Exemple dans `/auth/me`.

## Notes de production (à durcir)

- Servir le refresh token en cookie `httpOnly` + `Secure` + `SameSite` plutôt
  qu'en JSON (le scaffold le renvoie en body pour rester sans dépendance cookie).
- MFA TOTP (champs `mfaEnabled` / `mfaSecret` déjà au schéma) non encore câblé.
- Rate-limit basé sur Redis partagé entre instances (déjà branché sur `REDIS_URL`).
