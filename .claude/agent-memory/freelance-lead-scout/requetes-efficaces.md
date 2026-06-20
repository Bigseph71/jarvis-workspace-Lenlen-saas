---
name: requetes-efficaces
description: Formulations de requêtes WebSearch qui ont donné de bons résultats par axe, pour réutilisation future
metadata:
  type: reference
---

## Axe Qualité-Projet (très productif)

- `site:freelancermap.de Testmanager freelance Projekt` — excellent, remonte plusieurs missions directes
- `freelance.de Testmanager m/w/d Projekt remote` — bon complément, évite les doublons avec freelancermap
- `freelancermap.de "Scrum Master" OR "IT Projektleiter" gesucht remote 2026` — bon, penser à inclure l'année courante dans la requête
- `freelance.de Schweiz Testmanager Projekt remote` — fonctionne pour cibler la Suisse spécifiquement
- `freelancermap.ch "Senior IT Projektleiter" [mot-clé secteur] Bern` — utile pour creuser un lead suisse trouvé en amont
- `freelancermap Tester Testmanager [techno] Bern Schweiz` — bon pour retrouver l'URL exacte d'un lead mentionné dans un snippet précédent

## Axe IA (peu productif, à retravailler)

Constat : la plupart des requêtes IA ramènent des FOURNISSEURS de solutions/agences IA (l'offre), pas des PME qui EXPRIMENT un besoin (la demande). Voir [[constat-axe-ia]].

- `freelancermap.de "KI" OR "Künstliche Intelligenz" Berater Automatisierung Projekt freelance` — a fini par donner 1 mission concrète (Berater KI, secteur public). A republier régulièrement, c'est le seul angle qui a fonctionné jusqu'ici pour l'IA.
- Requêtes infructueuses à ne plus reformuler à l'identique : `"AI Voice Agent" Freiberufler gesucht Deutschland KMU Automatisierung`, `"freelance consultant" "AI voice agent" OR "AI automation" needed Germany Switzerland SME`, `"suche KI-Berater" OR "KI Consultant gesucht" KMU Mittelstand Deutschland freelance`, `"fractional AI" OR "AI consultant" "looking for" SME Mittelstand DACH freelance hire`.

## Méthode de fraîcheur fiable (depuis le 2026-06-20, 5e session)

Pour prouver une date de publication ≤7j (exigence ferme de Joseph, Projektstart proscrit comme proxy) : fetcher directement les pages de listing par catégorie sur freelance.de (PAS de simple WebSearch, le fetch direct est nécessaire pour voir les timestamps) :
- `https://www.freelance.de/Testmanager-Projekte`
- `https://www.freelance.de/IT-Projektleiter-Projekte`
- `https://www.freelance.de/Schweiz-Projekte` (filtrer ensuite par rôle, beaucoup de résultats hors cible)

Demander explicitement au fetch : "liste tous les projets avec titre, URL, timestamp jj.mm.aaaa hh:mm, et Projektstart". Le timestamp correspond au champ "seit wann aktiv?" (section "Projekt Insights" de la fiche), confirmé = date de publication. Filtrer ensuite sur la fenêtre voulue, puis fetcher individuellement chaque fiche retenue pour confirmer ville/mode de travail/client et reconfirmer le timestamp. Détail complet dans [[sources-dach]].

## Requêtes à éviter / peu utiles

- Chercher directement "GULP Testmanager [année]" remonte des profils de freelances concurrents, pas des missions.
- Chercher "malt.fr/malt.de [rôle] mission" ne remonte que des profils ou pages marketing, jamais de mission concrète.
