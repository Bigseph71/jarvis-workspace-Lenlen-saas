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
