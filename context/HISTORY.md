# Workspace History

> Journal chronologique de toutes les sessions et décisions importantes.
> Le plus récent en haut. Mis à jour automatiquement par Claude.
>
> **Comment ça marche :** Quand je lance la commande `/update` après une session importante, ou quand je raconte un changement significatif, Claude ajoute une entrée ici automatiquement. Je n'ai pas à écrire ce fichier manuellement.

---

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
