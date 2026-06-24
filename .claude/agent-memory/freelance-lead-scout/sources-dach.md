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

## Session du 2026-06-22 (6e exécution) : Gmail vérifié vide, nouveaux listings freelance.de testés

**Gmail** : recherche `from:linkedin.com newer_than:3d` et alertes spécifiques (`jobalerts-noreply`, `jobs-noreply`, `messaging-digest-noreply` `newer_than:7d`) → 0 résultat. Joseph n'a pas (encore) d'alertes LinkedIn actives dans sa boîte Gmail. Tant que ce n'est pas configuré, la source "alertes email LinkedIn" prioritaire du protocole reste vide à chaque session — recommandation à réitérer à Joseph en synthèse de chaque rapport jusqu'à mise en place.

**Nouveaux listings freelance.de testés avec succès (timestamps exploitables confirmés)** : `/Scrum-Master-Projekte` et `/IT-Manager-Projekte`, en plus des listings déjà connus (Testmanager-Projekte, IT-Projektleiter-Projekte, Schweiz-Projekte). Tous affichent les timestamps "Projekt Insights" de façon fiable. À inclure systématiquement dans le balayage futur — bonne couverture complémentaire pour l'axe Scrum Master qui n'était pas balayé spécifiquement avant.

**Point de vigilance ajouté** : le client "Ephesus Softwaretest" (Nürnberg) publie en lot de 5-8 missions quasi-identiques (Testmanager, Quality-Testmanager, Senior-Tester x3, Scrum-Master x2, UX Designer) le même jour ou sur 2 jours consécutifs. Limiter à 1-2 leads par lot Ephesus par session pour éviter la sur-représentation d'un seul client, même si plusieurs rôles sont individuellement valides.

## Session du 2026-06-22 (7e exécution) : fenêtre stricte 3 jours, nouveau listing QA-Projekte testé

**Changement de règle important** : la fenêtre de fraîcheur est passée de ≤7 jours (5e/6e session) à ≤3 jours stricte (7e session), coupure 2026-06-19. Cela réduit fortement le nombre de candidats éligibles par session : sur les 5 listings habituels + 1 nouveau (Testmanager, IT-Projektleiter, Scrum-Master, IT-Manager, Schweiz, QA), seuls 8 projets au total étaient publiés ≥19.06, et tous se sont révélés doublons ou hors cible. **Avec une fenêtre de 3 jours, il faut s'attendre à des sessions à 0 lead plus fréquentes** sur freelance.de seul — la productivité de cette source dépend du volume de publications quotidiennes, qui ne couvre pas toujours le cœur de cible (Test Manager/Scrum Master/IT-PM hors PMO) chaque jour.

**Nouveau listing testé : `/QA-Projekte`** — fonctionne bien (timestamps exploitables, 20/50 projets visibles sur la première page). A inclure dans le balayage systématique futur. Cette session a donné un QA Manager Basel (1276617, publié 19.06 12:35) mais écarté car QA pharmaceutique/GMP (audits, déviances réglementaires), pas qualité logicielle IT — à filtrer systématiquement : le mot "QA" sur freelance.de couvre large (pharma, ingénierie, logiciel), vérifier le secteur avant de qualifier.

**Recommandation à formaliser avec Joseph** : vu la fenêtre stricte de 3 jours, envisager (a) d'élargir le nombre de listings balayés à chaque session (ajouter pagination sur QA-Projekte, tester d'autres catégories comme Projektmanager-Projekte ou Qualitätsmanagement-Projekte), ou (b) d'accepter des sessions à 0 lead comme normales plutôt que symptomatiques d'un problème de méthode, ou (c) prioriser la mise en place d'alertes email LinkedIn/freelance.de qui donneraient une couverture en temps réel meilleure qu'un balayage manuel ponctuel.

## CORRECTION Joseph (2026-06-22) : freelancermap EST productif, ne plus l'écarter

Joseph a vérifié manuellement freelancermap et y a trouvé plusieurs offres pertinentes. **Cela INVALIDE les conclusions des sessions précédentes** (« freelancermap n'expose aucune date exploitable », « écarter par défaut »). Ces conclusions venaient d'un fetch des pages de liste (rendu JS, contenu non rendu en fetch statique), PAS des fiches projet individuelles.

Règle qui prime désormais :
- **Ne jamais écarter freelancermap sans avoir ouvert des fiches projet individuelles.** La date de publication y est visible (« eingestellt: vor X Tagen / Stunden », « heute », « gestern »).
- Si le fetch direct d'une page de liste échoue (JS), passer par une recherche web `site:freelancermap.de` (et `.ch`) sur les mots-clés métier pour faire remonter les fiches indexées, puis les ouvrir une par une.
- Toujours combiner avec les mots-clés métier ajoutés au prompt : testing, ISTQB / ISTQB Advanced Level, Test Manager, Testmanager, Scrum / Scrum Master.

Si une future session ne trouve toujours rien sur freelancermap, documenter précisément ce qui a été tenté (URLs ouvertes, requêtes) avant de conclure, au lieu d'écarter la source en bloc.

## Session du 2026-06-22 (8e exécution) : test approfondi freelancermap — limite technique confirmée, pas une limite de méthode

Conformément à la consigne de Joseph, 12 fiches projet individuelles freelancermap.de/.ch ont été ouvertes par WebFetch cette session (liste complète dans [[leads-livres]]). **Aucune ne renvoie de date de publication dans le contenu récupéré.** Un test ciblé a été fait pour isoler la cause : WebFetch a été interrogé explicitement sur la présence de tout indice temporel (texte visible, meta tags, JSON-LD, commentaires HTML) sur la fiche `scrum-master-m-w-d-gesucht-2877310` — réponse : aucune mention trouvée nulle part dans le document récupéré, seule une mention promotionnelle ("Nur bis 28.06.") sans rapport avec la publication.

**Conclusion technique** : le bloc de date de publication que Joseph voit dans son navigateur (« eingestellt vor X Tagen/Stunden », « heute », « gestern ») est très probablement injecté côté client par JavaScript après chargement initial de la page, et n'est donc PAS présent dans le HTML statique que WebFetch convertit en markdown. Ce n'est pas un problème de mauvaises URLs ou de méthode de recherche : c'est une limite structurelle de l'outil WebFetch face à du contenu rendu dynamiquement. WebSearch (indexation Google) ne capture pas non plus ce texte (testé via requêtes `"vor 1 Tag" OR "vor 2 Tagen"` sur le domaine, 0 résultat pertinent).

**Implication pratique** : tant qu'aucun outil avec rendu JS (navigateur piloté, type Playwright/Puppeteer, ou accès API freelancermap) n'est disponible, la fraîcheur de publication sur freelancermap restera invérifiable par les moyens actuels, malgré le fait que l'info existe bel et bien sur la plateforme (vue confirmée par Joseph manuellement). Pistes pour lever ce blocage : (a) Joseph peut copier-coller le texte affiché sur une fiche repérée comme fraîche pour que l'agent l'intègre directement, (b) alertes email natives freelancermap (toujours recommandées), (c) si un outil de navigation avec rendu JS devient disponible dans l'environnement, le retester en priorité sur cette source.

## PERCÉE MAJEURE du 2026-06-23 (9e session) : freelancermap EST exploitable pour la fraîcheur via l'URL de RECHERCHE filtrée (`created=N`)

Joseph a fourni l'URL de recherche qu'il utilise lui-même sur freelancermap. Test direct : **cette URL de listing de recherche se rend parfaitement en WebFetch** (résultats présents dans le HTML statique), contrairement aux fiches individuelles (date JS, invisible) et au chemin de listing `/projekte/deutschland` testé avant. **La conclusion des sessions 2/8 ("freelancermap inexploitable pour la fraîcheur") est donc INVALIDÉE.** Le problème n'était pas la plateforme mais le mauvais point d'entrée.

**La clé : le paramètre `created=N` filtre côté serveur les annonces publiées dans les N derniers jours.** Plus besoin de lire la date de chaque fiche : tout ce que la page renvoie est garanti ≤ N jours par construction. Confirmé par le texte "seit 3 Tagen öffentlich" affiché sur la page de résultats avec `created=3`. C'est la solution au problème de preuve de fraîcheur qui bloquait depuis 8 sessions, sans même avoir besoin d'alertes email.

**Structure d'URL à utiliser systématiquement** (domaine `freelancermap.de`, endpoint `/projekte`) :
```
https://www.freelancermap.de/projekte?created=3&query=<mot-cle>&countries[]=<code>&sort=2&pagenr=1
```
- `created=3` → fenêtre de fraîcheur stricte de 3 jours (= règle actuelle de Joseph). Ajuster le chiffre si la règle change.
- `query=<mot-cle>` → un seul mot-clé par requête (espaces encodés `+`, ex: `scrum+master`). Faire une requête PAR mot-clé métier : `testmanager`, `test+manager`, `scrum+master`, `it-projektleiter`, `projektleiter`, `qa`, `istqb`.
- `countries[]=<code>` → **code pays vérifié : Allemagne = `1`, Suisse = `3`**. (Note : le `[]` doit être encodé `%5B%5D` dans l'URL passée à WebFetch.)
- `sort=2` → tri par date (plus récent d'abord).
- Paginer avec `pagenr=2`, `3`... si la première page est pleine (env. 20 résultats/page).

**Méthode de balayage recommandée par session** :
1. Pour chaque mot-clé métier × chaque pays (DE=1, CH=3), fetcher l'URL de recherche `created=3`. La liste renvoyée est déjà filtrée en fraîcheur.
2. Trier la pertinence métier : **la recherche par mot-clé est LARGE** (un scan `scrum+master` a remonté des Data Engineers, Product Owners, etc., car freelancermap matche sur tout le texte de l'annonce). Garder uniquement les vrais rôles cœur de cible.
3. Pour chaque lead retenu, l'URL de fiche est reconstructible/fournie dans le listing (format `/projekt/<slug>-<id>`) ; un WebFetch sur la fiche donne les détails complets (tâches, exigences, contact) — seule la date manque, mais elle n'est plus nécessaire puisque garantie par `created=3`.
4. Dédupliquer contre [[leads-livres]] par id de projet.

**À retenir** : ne plus jamais écarter freelancermap pour "fraîcheur invérifiable". Utiliser l'URL de recherche `created=3`, pas les fiches individuelles ni le listing générique. C'est désormais une source pleinement exploitable, probablement la plus productive avec freelance.de.

## CONFIRMATION du 2026-06-23 (session de vérification dédiée) : méthode `created=3` validée à 100%, technique fiable

Test de vérification complet effectué sur 9 requêtes (`testmanager`, `scrum+master`, `it-projektleiter`, `istqb`, `test+manager`, `qa` en DE ; `testmanager`, `scrum+master`, `agile+coach`, `projektleiter` en CH). **Le WebFetch sur l'URL de recherche se rend systématiquement en HTML statique avec les résultats et leurs dates visibles** ("seit 3 Tagen öffentlich", "vor 3 Tagen", ou date/heure explicite jj.mm.aaaa hh:mm). Le projet Wavestone #3014389 (connu et déjà livré la veille) réapparaît correctement dans les résultats `created=3`, ce qui confirme que le filtre fonctionne et que la fenêtre de 3 jours est cohérente.

**Constats complémentaires importants** :
- **Suisse (`countries[]=3`) donne souvent 0 ou très peu de résultats par mot-clé** (0 pour `testmanager`, 3 pour `scrum+master`, 1 pour `agile+coach`, 1 pour `projektleiter`). Le volume CH est structurellement faible sur 3 jours ; ne pas s'inquiéter de trouver peu de leads suisses par session, c'est la norme du marché, pas un défaut de méthode.
- **Le mot-clé `qa` est confirmé trop large** (matche du sales/vente B2B "QA-Dienstleistungen", de la construction MEP/CSA, de l'ingénierie agentic AI) : à garder en balayage mais filtrer encore plus sévèrement, voire le déprioriser au profit de `istqb`/`testmanager`/`test+manager` qui sont plus propres.
- **Vigilance ANÜ/salarié** : certaines fiches freelancermap dans les résultats `created=3` sont en réalité des postes Arbeitnehmerüberlassung (ANÜ) réservés aux salariés (ex: INTERIM Scrum Master Hamburg, Michael Page, "Seules les personnes ayant un statut de salarié sont acceptées"). Toujours vérifier le statut contractuel sur la fiche individuelle avant de qualifier, le mot "freelance"/"INTERIM" dans le titre ne suffit pas.
- **Doublon cross-plateforme confirmé** : la mission "IT Projektleiter ID 30435, Ravensburg/Immenstaad" apparaît à la fois sur freelancermap (créée le 22.06, ID 30435) et avait déjà été livrée la veille via freelance.de (projet 1276929, même ID 30435 dans le titre). Les ESN/recruteurs republient la même mission sur plusieurs plateformes avec le même ID client interne — toujours vérifier cet ID dans le titre/texte pour dédupliquer entre freelance.de et freelancermap, pas seulement entre sessions de la même plateforme.
- **Incohérence Projektstart vs fraîcheur** : PROSTAFF Schweiz republie parfois une fiche avec Projektstart passé (01.07.2025) mais date de publication fraîche confirmée (22.06.2026, "depuis 3 jours"). Conformément à la règle de Joseph (fraîcheur = date de PUBLICATION, indépendante du Projektstart), ce type de lead reste éligible mais doit être signalé avec la réserve explicite sur l'incohérence de date de début.

**Conclusion** : la méthode `created=3&query=<mot-clé>&countries[]=<code>&sort=2` est confirmée robuste et reproductible. À adopter comme méthode standard pour toutes les sessions futures sur freelancermap, en complément de freelance.de (listings "Projekt Insights").

## RÈGLE DE LIVRAISON (formalisée par Joseph, 2026-06-23) : toujours fournir le LIEN DIRECT de l'offre, avec ID quand il existe

Joseph a demandé que chaque lead livré contienne le **lien direct de la fiche de l'offre**, jamais l'URL de recherche `created=3` (qui n'est qu'un outil interne de découverte et ne doit pas apparaître dans les livrables ni dans les brouillons Gmail).

Règles à appliquer pour chaque lead :
- **Livrer l'URL de la fiche individuelle** au format `https://www.freelancermap.de/projekt/<slug>-<id>` (ou domaine `.ch`/`.com` selon la source).
- **Privilégier systématiquement le lien qui contient l'ID numérique du projet** (ex: `...-3014389`). C'est la forme la plus stable dans le temps. Les liens sans ID (slug seul, ex: `sap-testmanager-m-w-d-s-4-projekt-remote`) résolvent aujourd'hui mais reposent sur le titre, donc moins pérennes — ne les utiliser que si aucun lien avec ID n'est trouvable.
- **L'ID figure dans le listing de recherche** (à côté de chaque résultat) et/ou dans le slug de l'URL de la fiche. Le récupérer là pour construire le lien canonique.
- Si seule une forme sans ID est disponible, la livrer quand même (vérifié : elle fonctionne), mais signaler brièvement qu'elle est moins stable.
- Vérifier par WebFetch que le lien mène bien à une fiche individuelle (titre + client + description) et non à une redirection vers la recherche, avant de le livrer.
