# Livrables

> Dossier racine de tous les livrables produits par Claude (ton Jarvis) en lien avec ton contexte.

Chaque sous-dossier correspond à un domaine d'activité. Les fichiers produits (documents, code, scripts, contenus, supports) y sont rangés au fil des sessions.

## Organisation

| Dossier | Contenu |
|---------|---------|
| [site-web/](site-web/) | Tout ce qui concerne ton site web (pages, copy, structure, SEO, maquettes) |
| [application/](application/) | Tes produits SaaS : logiciel et plateforme d'agents (specs, code, architecture, docs techniques) |
| [youtube/](youtube/) | Ta chaîne YouTube (scripts, idées de vidéos, titres, descriptions, miniatures, calendrier éditorial) |
| [cabinet-conseil/](cabinet-conseil/) | Ton activité de conseil et de prospection (offres, propositions commerciales, tunnel de prospection, supports clients) |

## Règles

- Chaque dossier a son propre `README.md` qui décrit plus précisément ce qu'il contient.
- Les secrets (clés d'API, tokens, mots de passe) ne vont **jamais** dans ces dossiers ni dans le dépôt. Voir [.env.example](../.env.example) à la racine et le [.gitignore](../.gitignore).
