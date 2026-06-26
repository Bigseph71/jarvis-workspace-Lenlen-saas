# Mode opératoire — Validation locale (hors OneDrive)

> But : compiler et tester le code dans un **bac à sable hors OneDrive**, sans
> alourdir la synchro cloud. On clone depuis le dépôt Len Len, on valide là-bas ;
> les corrections se font dans la copie de travail puis sont récupérées via
> `git pull`. Ne pas committer depuis le bac à sable (éviter la divergence).

Toutes les commandes sont en **PowerShell**. Aucune de ces étapes ne nécessite
une base de données qui tourne (la DB n'est utile que pour le test d'intégration
et pour lancer l'app).

---

## 0. Prérequis

```powershell
node --version   # v20+ requis (v24 sur ce poste)
git --version
```

## 1. Cloner hors OneDrive

```powershell
mkdir C:\dev -Force
git clone https://github.com/Bigseph71/jarvis-workspace-Lenlen-saas.git C:\dev\lenlen
cd C:\dev\lenlen\saas-pflege
```

Le code vit dans le sous-dossier `saas-pflege` (c'est là qu'est `pnpm-workspace.yaml`).

## 2. Activer pnpm

```powershell
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm --version   # 9.12.0
```

`corepack` est livré avec Node, rien à installer.

## 3. Installer les dépendances

```powershell
pnpm install
```

Crée `node_modules/` (lourd mais ici hors OneDrive). Argon2 compile un module
natif ; en cas d'échec, des « Visual Studio Build Tools » peuvent être requis.

## 4. Générer le client Prisma

```powershell
$env:DATABASE_URL = "postgresql://lenlen:lenlen@localhost:5432/lenlen?schema=public"
pnpm db:generate
```

`DATABASE_URL` factice pour la session : **aucune base n'est contactée**, Prisma
ne fait que générer le code TypeScript (types + enums `VisitStatus`, `UserRole`…).

## 5. Vérifier les types

Backend seul (tout le code métier) :

```powershell
pnpm --filter @len-len/backend typecheck
```

Passe complète (le frontend Next.js est à peine ébauché, il peut râler) :

```powershell
pnpm -r typecheck
```

## 6. Tests unitaires du backend

```powershell
pnpm --filter @len-len/backend test
```

Suites : week, tokens, pagination, visit-rules, schemas, rbac, password.
Pas de base de données requise.

---

## Lire les résultats

| Résultat | Signification | Action |
|---|---|---|
| Étape 5 OK | Le code compile, types cohérents | 👍 |
| Étape 5 erreurs `tsc` | Erreurs de type laissées (code relu mais jamais compilé) | copier la sortie, corriger dans la copie de travail, push |
| Étape 6 vert | Logique pure et validations bonnes | 👍 |
| Étape 6 échecs | Bug révélé (ou test à ajuster) | copier la sortie, analyser |

## Boucle de correction

1. Corriger dans la copie de travail (OneDrive), committer, `git push lenlen main`
2. Dans le bac à sable :
   ```powershell
   cd C:\dev\lenlen
   git pull
   cd saas-pflege
   pnpm install      # seulement si un package.json a changé
   ```
3. Relancer l'étape qui échouait

Garder `C:\dev\lenlen` en lecture seule (ne pas y committer).

---

## Aller plus loin : test d'intégration + app (nécessite Docker)

```powershell
# Infra locale
cp .env.example .env
docker compose up -d postgres redis

# Schéma + RLS + données de démo
pnpm --filter @len-len/database migrate
pnpm --filter @len-len/database rls
pnpm --filter @len-len/database seed

# Test d'intégration auth (sinon skippé)
$env:RUN_DB_TESTS = "1"
pnpm --filter @len-len/backend test

# Lancer le backend en dev
pnpm --filter @len-len/backend dev
```
