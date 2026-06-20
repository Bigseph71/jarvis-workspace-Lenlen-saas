---
name: sources-dach
description: Bilan de productivité des plateformes et sources DACH testées pour le scouting freelance, à jour au 2026-06-20
metadata:
  type: reference
---

## Sources productives (donnent des missions concrètes avec URL vérifiable)

- **freelancermap.de / .ch / .com** : LA source la plus productive. Les recherches web indexent bien les pages "/projekt/..." individuelles. Fonctionne pour Testmanager, Scrum Master, IT-Projektleiter. Couvre aussi la Suisse via freelancermap.ch. Le fetch direct (WebFetch) fonctionne bien sur ces pages, pas de blocage observé.
- **freelance.de** : Bon en complément, mêmes types de résultats que freelancermap. Les pages de catégorie (ex: /Testmanager-Projekte, /Schweiz-Projekte) remontent bien en recherche web.
- **SOLCOM** (solcom.de) : Missions concrètes trouvées via WebSearch (résultats avec détails dans le snippet), MAIS le fetch direct de la page projet renvoie une erreur 403 Forbidden (protection anti-bot probable). Se contenter des infos du snippet de recherche, ou indiquer à Joseph qu'il doit ouvrir le lien lui-même pour les détails complets.

## Sources improductives ou inaccessibles

- **GULP.de** : Les recherches web ne remontent que des PROFILS DE FREELANCES (l'offre, pas la demande), pas des missions à pourvoir. Probablement parce que les pages "projet" GULP sont derrière login. Éviter de chercher "GULP Testmanager gesucht", chercher plutôt directement les noms de clients/ESN qui postent sur GULP si connus.
- **Malt.de / Malt.fr** : Aucune mission concrète indexée trouvée. Les résultats sont des profils de freelances ou des pages marketing génériques de la plateforme. Probablement parce que les missions Malt nécessitent un compte pour être visibles. Source à considérer comme quasi inexploitable en recherche web pure.
- **Etengo.de** : Aucune mission concrète, seulement des pages de présentation institutionnelle. Idem Hays.de en partie (une mission trouvée via freelancermap était en fait une annonce Hays republiée, mais obsolète).
- **Hays.de directement** : Pas de mission directement indexée par recherche web ; les annonces Hays trouvées venaient de republications sur freelancermap, parfois obsolètes (vérifier la date systématiquement).

## Point de vigilance majeur

Les pages freelancermap n'affichent pas toujours de date de publication claire. Des annonces avec dates de "Projektstart" passées (ex: 2023) remontent encore dans les résultats de recherche web en 2026 : probable cache obsolète ou republication. TOUJOURS vérifier la cohérence temporelle (date de début vs date actuelle) avant de qualifier un lead comme "Haute pertinence". Date du jour de référence : 2026-06-20.

## Constat du 2026-06-20 (2e session) : exigence de fraîcheur ≤3 jours quasi impossible à satisfaire avec WebSearch/WebFetch seuls

Joseph a posé une exigence ferme : n'accepter que des leads publiés dans les 3 derniers jours. Test réalisé sur freelancermap.de, freelancermap.ch, freelance.de, SOLCOM, GULP, projektwerk, ictjob.ch, jobs.ch, Xing, LinkedIn (site:linkedin.com/posts) : **aucune page consultée (recherche ou fetch direct) n'affiche de date de publication explicite et fiable**. Les pages montrent des dates de "Projektstart" (début de mission, pas publication) ou rien du tout. WebFetch sur les pages de listing (ex: freelancermap.de/projekte/deutschland) ne retourne que la structure de navigation, pas le contenu dynamique des annonces (probable rendu JS côté client, invisible au fetch statique).

**Implication pratique** : avec les seuls outils WebSearch/WebFetch (sans accès API ou compte connecté), il est structurellement impossible de garantir la fraîcheur ≤3 jours d'un lead freelancermap/freelance.de/SOLCOM. Possible de garantir au mieux que la date de "Projektstart" est cohérente avec aujourd'hui (pas dans le passé), mais pas la date de mise en ligne.

**Pistes pour la prochaine session** : proposer à Joseph soit (a) un assouplissement du critère fraîcheur vers "Projektstart futur proche" comme proxy, soit (b) la configuration d'alertes email natives sur freelancermap/freelance.de (recherche sauvegardée + notif quotidienne) qui donneraient une vraie date de réception exploitable pour la déduplication temporelle, soit (c) un accès compte/API à ces plateformes.

## Décision de Joseph (2026-06-20, 3e session) : règle assouplie adoptée

Joseph a tranché en faveur de l'option (a) : proxy "Projektstart futur/proche cohérent" accepté comme critère de fraîcheur quand aucune date de publication n'est disponible, à condition de le marquer explicitement "date de publication non confirmée" dans chaque lead livré. Règle stricte ≤3 jours maintenue uniquement quand une date de publication réelle existe (cas encore jamais rencontré sur freelancermap/freelance.de/SOLCOM à ce jour).

**Point technique confirmé** : freelance.de bloque désormais le WebFetch direct sur ses pages projet individuelles (redirige vers la page catégorie générique, contenu dynamique JS non rendu). Se contenter du titre/date présents dans le snippet WebSearch pour freelance.de, ne plus tenter de WebFetch sur ces URLs.

## Décision de Joseph (2026-06-20, 4e session) : durcissement des règles après défauts constatés

Joseph a annulé partiellement l'assouplissement de la 3e session : retour à une exigence stricte sur le Projektstart (doit être >= date du jour, pas seulement "futur proche cohérent" vague) ET exigence de lien vérifié par fetch direct (pas de simple snippet WebSearch comme preuve suffisante). Cette règle est plus stricte que la fraîcheur de publication (toujours indisponible) mais porte sur le Projektstart, donnée généralement bien présente sur les pages fetchées.

**Bilan 4e session** : sur ~13 candidats examinés, 6 retenus (Projektstart futur confirmé + lien direct fetché), 4 écartés pour Projektstart passé, 1 écarté pour lien non direct (freelance.de, confirme pattern récurrent), 1 suisse (Hays AG Zürich) non retenu par absence de lien individuel trouvable malgré recherche.

**Point méthode qui marche bien** : systématiquement faire un WebFetch direct sur chaque URL candidate avant de la retenir, même si le snippet WebSearch semble déjà donner la date. Le fetch confirme à la fois (a) la date exacte de Projektstart et (b) que la page est bien la fiche individuelle et pas une redirection. C'est la méthode qui a permis de fiabiliser la 4e session vs les précédentes.

**freelancermap.at** : peut afficher des missions localisées en Suisse (ex: KIDSTON people GmbH, Bern) sous domaine autrichien. Toujours vérifier la localisation réelle dans le contenu fetché, pas seulement le TLD de l'URL.

## PERCÉE du 2026-06-20 (5e session) : freelance.de expose une vraie date de publication via "Projekt Insights"

Joseph a imposé une règle de fraîcheur stricte basée sur la date de PUBLICATION (≤7 jours), interdisant explicitement le proxy Projektstart. Découverte clé en fetchant les pages de listing freelance.de (ex: `/Testmanager-Projekte`, `/IT-Projektleiter-Projekte`, `/Schweiz-Projekte`) : chaque ligne de projet affiche un **timestamp jj.mm.aaaa hh:mm** (ex: "19.06.2026 12:25") qui correspond au champ **"seit wann aktiv?"** ("depuis quand actif") visible dans la section **"Projekt Insights"** de la fiche individuelle. Confirmé par fetch direct sur plusieurs fiches (projets 1276650, 1276606) : ce champ est bien distinct du Projektstart et constitue la preuve de date de publication/mise en ligne exigée par Joseph.

**Méthode qui fonctionne** :
1. Fetcher la page de listing par catégorie sur freelance.de (ex: `freelance.de/Testmanager-Projekte`, `freelance.de/IT-Projektleiter-Projekte`, `freelance.de/Schweiz-Projekte`) en demandant explicitement la liste exhaustive avec titre + URL + timestamp + Projektstart.
2. Filtrer les timestamps dans la fenêtre de fraîcheur voulue (J-7 à aujourd'hui).
3. Fetcher individuellement chaque fiche retenue pour confirmer ville, mode de travail, client, et reconfirmer le timestamp via la section "Projekt Insights".

**Limite persistante** : freelancermap.de et SOLCOM n'exposent toujours AUCUNE date de publication exploitable (ni en listing ni en fiche individuelle, vérifié à nouveau le 2026-06-20). Le gain de fraîcheur ne s'applique donc qu'à freelance.de pour l'instant. Pour freelancermap/SOLCOM, soit écarter systématiquement par manque de preuve de fraîcheur, soit recommander les alertes email natives à Joseph (déjà suggéré, toujours pas mis en place à cette date).

**Résultat 5e session** : sur 23 candidats avec date de publication établie sur freelance.de (Testmanager + IT-Projektleiter + Schweiz), 9 dans la fenêtre ≤7j, 4 retenus après dédoublonnage (lot Ephesus Softwaretest = 5 missions quasi-identiques publiées le même jour, 1 seule retenue) et filtrage géo (Suisse : aucun résultat Test/PM dans la fenêtre, que des rôles dev/ingénieur hors cible).
