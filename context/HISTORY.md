# Workspace History

> Journal chronologique de toutes les sessions et décisions importantes.
> Le plus récent en haut. Mis à jour automatiquement par Claude.
>
> **Comment ça marche :** Quand je lance la commande `/update` après une session importante, ou quand je raconte un changement significatif, Claude ajoute une entrée ici automatiquement. Je n'ai pas à écrire ce fichier manuellement.

---

## 2026-06-27

### Backend Phase 1 (MVP) de « Len Len » terminé et validé localement
Suite du démarrage de la veille, le backend Fastify multi-tenant a été développé module par module (chaque module commité puis poussé sur le dépôt dédié `lenlen`), avec un découpage régulier schemas / service / routes :
- **Auth multi-tenant + RBAC** : Argon2id, JWT access 15 min, refresh tokens opaques poivrés avec rotation et détection de réutilisation, 5 rôles (`requireRole`)
- **CRUD tenant-scoped** : patients, fachkräfte, contrats (module Vertrag), via `withTenant` + audit logs DSGVO
- **Planification des visites** : 1 visite/semaine/patient, urgences (motif obligatoire), remplacement (même qualification), pointage GPS, alerte hebdomadaire, route du jour
- **Geocodage** : abstraction provider (Google Maps + stub déterministe), traitement async BullMQ, enqueue auto à la création/changement d'adresse
- **Stripe Basic** : plans + limites serveur (HTTP 402), checkout, webhook signé (body brut), mapping d'événements → statut d'abonnement

### Outillage et validation
- **Tests Vitest** : ~40 tests unitaires sur la logique pure (dates, tokens, pagination, règles métier, validation Zod, RBAC, geocodage, billing) + template d'intégration auth (opt-in DB)
- **Mode opératoire de validation** documenté dans `saas-pflege/VALIDATION.md` (bac à sable hors OneDrive : `pnpm install` + `db:generate` + typecheck + tests)
- **Boucle de validation activée** : premier passage typecheck/tests dans un clone hors OneDrive (`C:\dev\lenlen`). 3 corrections trouvées et appliquées (cast du gestionnaire d'erreurs, import nommé `ioredis`, conflit de types double-paquet BullMQ). Résultat : typecheck vert, 38 tests passants

### Organisation des dépôts
- Le code Len Len est poussé sur un dépôt GitHub dédié : `Bigseph71/jarvis-workspace-Lenlen-saas` (remote `lenlen`)
- La branche `main` reste suivie sur `origin` (`jarvis-workspace`) ; les pushes Len Len ciblent explicitement `lenlen`

### Reste à faire (Phase 1)
- Frontend Next.js (à peine ébauché), app mobile Fachkraft
- Suspension dure d'abonnement (`PAST_DUE` → `SUSPENDED` après karenzzeit) en job planifié
- Brancher la règle 7 (VRPTW bloqué si patient `INVALID`) dans le vrai worker VRPTW

## 2026-06-26

### Démarrage du projet SaaS « Len Len » (ambulante Pflege)
- Mise en place d'une structure multi-projets dans le workspace : ajout des dossiers `saas-pflege/` (le SaaS Len Len) et `autre-projet/` (placeholder), à côté du `CLAUDE.md` racine resté intact
- Création du `saas-pflege/CLAUDE.md` : spec produit et technique complète (multi-tenant, stack Next.js / Node / Prisma / PostgreSQL / Redis-BullMQ, microservice VRPTW, microservice KI Python, RBAC 5 rôles, plans Stripe, sécurité DSGVO, plan de dev en 3 phases). Ce fichier est chargé automatiquement quand on travaille dans le dossier
- **Contexte produit** : SaaS multi-tenant pour PME de soins ambulatoires (20-200 fachkräfte), langue UI allemande, i18n DE/EN/FR

### Scaffolding initial généré (46 fichiers)
- **Monorepo** pnpm + Turborepo : `apps/` (backend Fastify, web Next.js App Router + next-intl, vrptw-worker BullMQ, ki-service FastAPI) et `packages/` (database Prisma partagé, types partagés). TypeScript strict partout
- **Schéma Prisma complet** validé par la CLI Prisma : toutes les entités du CLAUDE.md (organizations, users, caregivers, patients, visits, vehicles, routes, translations) + refresh_tokens (rotation JWT) et audit_logs (DSGVO). `organizationId` sur chaque table métier
- **Row-Level Security PostgreSQL** (`rls.sql`) + helper `withTenant()` pour l'isolation tenant au niveau base
- **Config Docker** : `docker-compose.yml` (postgres, redis, backend, web, worker, ki) avec réseau interne isolé d'Internet, un Dockerfile multi-stage par service, healthchecks

### Points d'attention
- **Docker n'est pas installé sur le poste** : le `docker-compose.yml` n'a pas pu être validé en exécution (syntaxe standard). Docker Desktop requis pour lancer la stack
- **Pas de `pnpm install` lancé** : aucune dépendance installée, pas de lockfile. Versions des packages à figer au premier install
- Prochaine étape identifiée : module auth multi-tenant + middleware tenant + branchement RLS, puis CRUD patients/fachkräfte/contrats (Phase 1 MVP)

## 2026-06-20

### Connexion à l'instance n8n établie et vérifiée
- Instance n8n distante de Gambi Consulting connectée : `https://n8n-automation.gambi-consulting.de`
- Création du fichier `.env` réel (cloné depuis `.env.example`, ignoré par git) avec `N8N_BASE_URL` et `N8N_API_KEY`
- Tests de connectivité réussis : instance joignable (HTTP 200), `/healthz` OK, API REST activée, authentification par clé API validée (HTTP 200)
- 8 workflows récupérés via l'API (4 actifs) :
  - Actifs : Klaus WF8 (Formulaire → Réponse IA + Booking), Klaus 5 (Confirmation RDV & Calendrier), Klaus 4 (Génération créneaux & lien RDV), Physical Therapy Clinic
  - Inactifs : Klaus 1 (Qualification leads), Klaus 2 (Réactivation devis dormants), Klaus 3 (Chat IA), Klaus WF6 (VAPI Receiver)

### Mise à jour de Node.js et configuration du CLI n8nac
- **Node.js mis à jour de v18.20.8 vers v24.17.0** (via `winget install OpenJS.NodeJS.LTS`, élévation UAC), npm v11.13.0. Le CLI `n8nac` exigeait Node ≥ 20
- Cause réelle du crash initial identifiée : cache npx corrompu (paquet `rxjs` manquant, installation partielle faite sous Node 18). Purge du cache `_npx` + réinstall propre sur Node 24
- **Environnement n8nac `Remote` configuré et activé** : `env add` (base-url + workflows-path `workflows/remote`), `env auth set` (clé via stdin), `env use`
- Validation : `n8nac env status` OK, `n8nac list` récupère les 8 workflows distants (marqués `EXIST_ONLY_REMOTELY`, pas encore tirés en local)
- Workflow « as code » désormais possible : `npx n8nac pull <id>` pour télécharger les `.workflow.ts` dans `workflows/remote/` et les versionner dans Git
- Note : l'API Projects de l'instance n'est pas exposée (fallback projet « Personal »), sans impact

### Points d'attention
- **Sécurité** : la clé API a transité par le chat lors de la configuration. À régénérer côté n8n si besoin de rigueur. Elle est isolée dans `.env` (non versionné) et dans la config locale n8nac

## 2026-06-16

### Mise en place de l'organisation des livrables
- Création du dossier `livrables/` avec 4 sous-dossiers thématiques : `site-web/`, `application/`, `youtube/`, `cabinet-conseil/`
- Un `README.md` dans chaque dossier (et un README racine) décrivant le contenu et le lien avec les objectifs

### Gestion des secrets et clés d'API
- Ajout d'un template public `.env.example` à la racine pour documenter les variables d'environnement (VAPI, Retell, Make, n8n, Anthropic, DeepSeek, cloud SSH, base de données, SMTP)
- Ajout d'un `.gitignore` protégeant les secrets (ignore tous les `.env` sauf le template, plus clés/certificats, fichiers système, dépendances, logs)

### Initialisation git et connexion GitHub
- Workspace transformé en dépôt git (branche `main`), premier commit créé
- Compte GitHub `Bigseph71` reconnecté (jeton CLI précédent expiré, ré-authentification via Git Credential Manager)
- Création du dépôt distant privé `Bigseph71/jarvis-workspace` et push initial réussi
- Vérification : aucun secret poussé, seul `.env.example` est versionné

### Point d'attention identifié
- Le workspace est situé dans OneDrive (Bureau redirigé par Windows). OneDrive synchronise tout, y compris un futur `.env`. Décision : laisser tel quel pour l'instant, mais ne jamais stocker de secrets en clair dans ce dossier

## 2026-06-13

### Installation initiale du Jarvis
- Workspace personnalisé pour Joseph Hugues, basé à Heidelberg (Allemagne)
- Profil principal : Indépendant / Freelance avec une casquette entrepreneur
- Activité : Consultant IT et qualité logicielle (ingénieur télécom, PRINCE2 et Scrum) ; Software Test Manager / IT Project Manager pour grands groupes ; repositionnement IA (AI Voice Agents, optimisation des coûts) pour PME ; développement de produits SaaS
- Objectifs court terme identifiés : signer 3 premiers clients IA sous 45 jours, décrocher une mission freelance (Software Test Manager / IT Project Manager), construire un tunnel de prospection
- Vision long terme : activité de conseil et de réalisation IA récurrente, revenu confortable et liberté, portefeuille de PME fidèles + quelques grands comptes
- Projets actifs au démarrage : tunnel de prospection, développement d'un logiciel SaaS, mise en place d'une plateforme d'agents (SaaS)
- Domaine d'aide prioritaire : accompagnement à 360 degrés, priorité prospection / acquisition client, stratégie business, création et mise en exploitation de logiciels
- Style de communication choisi : mélange adapté au contexte

### Ajout d'un objectif transversal
- Nouvel objectif continu : identifier et implémenter des idées de business rentables
- Ajouté aux objectifs long terme et au domaine d'aide prioritaire dans CONTEXT.md, ainsi qu'à la section "Who I Am" de CLAUDE.md
