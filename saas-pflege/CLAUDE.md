# SaaS-Plattform – Ambulante Pflegedienste

## Produkt-Kontext

Multi-Tenant SaaS für KMU im Bereich ambulante Pflege (20–200 Fachkräfte pro Struktur).  
**Anwendungssprache: Deutsch.** Mehrsprachig: DE (Standard) / EN / FR via next-intl.

---

## Stack

| Schicht | Technologie |
|---|---|
| Frontend | Next.js (App Router) + TypeScript strict + Tailwind CSS |
| i18n | next-intl, URL-Routing /de /en /fr, Lazy Loading, keine hardcodierten Strings |
| Mobile | React Native oder Flutter (iOS + Android) |
| Backend | Node.js + TypeScript strict + Prisma + PostgreSQL |
| Queue / Cache | Redis + BullMQ (async Jobs) |
| Optimierung | VRPTW-Microservice (Node.js + BullMQ + WebSocket für Echtzeit-Status) |
| KI | Python + FastAPI + scikit-learn + XGBoost + Prophet |
| Logging | Pino (strukturiertes JSON) |
| Monitoring | Prometheus + Grafana |
| Hosting | EU-Rechenzentrum (AWS Frankfurt oder OVH) |
| Payment | Stripe (Checkout + Webhooks) |

---

## Architektur-Regeln (immer einhalten)

- **Multi-Tenant:** Alle Tabellen enthalten `organization_id`. PostgreSQL Row-Level Security (RLS) erzwingt Tenant-Isolation automatisch. Kein Datenleck zwischen Tenants.
- **TypeScript strict:** Kein `any`, keine impliziten Types.
- **Zod** für Input-Validierung auf allen API-Endpoints.
- **Argon2id** für Passwort-Hashing.
- **Verschlüsselung im Ruhezustand:** über den Hoster (Supabase / AWS verschlüsselt
  die Volumes), nicht auf Feldebene. Es gibt **keine** anwendungsseitige
  Verschlüsselung einzelner Spalten – Patientendaten stehen im Klartext in
  PostgreSQL. Die Trennung zwischen Tenants leistet die RLS, nicht Kryptografie.
  Wer feldweise Verschlüsselung einführt, muss zuerst klären, wie damit noch
  gesucht und sortiert werden soll (Adressen, Namen).
- **JWT** (15 min) + Refresh Token mit Rotation.
- Alle internen Microservices sind netzwerkisoliert (kein direkter Internetzugang).
- **Keine hardcodierten Strings** im Frontend (next-intl erzwingen).

---

## Datenmodell (Kern-Entitäten)

```
organizations        id, name, country, subscription_plan, subscription_status,
                     plan_limits (JSON), stripe_customer_id, stripe_subscription_id

users                id, organization_id, role, email, password_hash, mfa_enabled, language

patients             id, organization_id, assigned_caregiver_id,
                     raw_address, normalized_address, latitude, longitude,
                     geocoding_score, geocoding_status (valid|invalid|pending)

caregivers           id, organization_id, user_id, qualification,
                     contract_type, weekly_hours, work_days (JSON), max_patients

visits               id, organization_id, patient_id, caregiver_id (effectif),
                     assigned_caregiver_id (attitré), scheduled_at, status,
                     is_emergency (bool), gps_arrival_at, gps_departure_at

vehicles             id, organization_id, leasing_km_limit, leasing_km_used,
                     leasing_end_date

routes               id, organization_id, caregiver_id, date, visits (JSON),
                     optimized (bool), vrptw_score, total_km

translations         id, locale, key, value
```

---

## Règles métier (critiques)

1. **1 visite par semaine par patient** via le soignant attitré. Blocage système si doublon détecté.
2. **Visites d'urgence** : hors cycle, motif obligatoire, tracées séparément dans les rapports.
3. **Alerte automatique** si un patient n'a pas de visite planifiée pour la semaine en cours.
4. **Remplacement** : la fachkraft remplaçante doit avoir la même qualification que l'attitrée. Traçabilité complète (qui a effectué vs qui est l'attitré).
5. **Contrats** : chaque structure définit ses propres types (100%, 80%, 50%...). La planification respecte strictement les heures contractuelles et les jours travaillés.
6. **Règle leasing** : les véhicules avec le moins de km utilisés prennent les trajets les plus longs.
7. **Geocodage** : l'optimisation VRPTW est bloquée si `geocoding_status = invalid` pour un patient.
8. **Billing** : suspension automatique du tenant si paiement Stripe échoue (après karenzzeit configurable).

---

## Module : Clustering géographique quotidien

Regroupe les patients à visiter un jour donné en **secteurs** cohérents. Précède
le VRPTW et ne le remplace pas : le clustering dit **qui va ensemble**, le VRPTW
dit **dans quel ordre**. Sans découpage préalable, optimiser une journée entière
reviendrait à produire une tournée unique de quarante patients.

- Endpoint : `POST /clustering/daily`. L'`organization_id` vient **du JWT et de
  lui seul**, jamais du corps de la requête.
- Rôles : Koordinator et Struktur-Admin (mêmes gardes que le VRPTW).
- Exécution : **synchrone jusqu'à 200 patients**, au-delà **BullMQ + WebSocket**
  (`GET /clustering/status/ws`). L'API n'est jamais bloquante.
- Algorithmes, en **Node**, sans dépendance Python : le découpage se fait par
  jour, donc sur quelques dizaines de points.
  - **DBSCAN** (défaut) : déduit le nombre de secteurs de la densité et a le
    droit de **ne pas classer** un patient isolé. Paramètres `epsilonKm` (2 km)
    et `minPoints` (2).
  - **k-means** : quand la contrainte est l'effectif (« j'ai 4 fachkräfte
    jeudi »). Exige `k`. Classe tout, donc rattache aussi les isolés.
  - Les deux sont **déterministes** : même entrée, même découpage. Sans cela une
    coordination ne pourrait pas comparer deux propositions.
- **Fachkraft suggérée** : celle dont le secteur est le plus proche du centre du
  cluster. Le secteur d'une fachkraft est le **centroïde de sa patientèle
  attitrée** — elle n'a pas de zone déclarée, sa patientèle EST sa zone.
  L'attribution est exclusive : une fachkraft n'est proposée que pour un secteur.
- **Règle 7** : bloqué (409) si un patient du jour n'est pas `geocoding_status =
  VALID`. Un secteur calculé sur une coordonnée absente deviendrait une tournée
  fausse, sans que rien ne le signale.
- **Plan** : refusé (**402** `PlanFeatureUnavailable`) si la capacité `ki` des
  plan-limits est fausse, c'est-à-dire en Basic. Une capacité négociée par tenant
  rouvre l'accès sans toucher au code. Le statut 402 est celui de **tous** les
  blocages de plan du produit, et le frontend s'y accroche pour proposer la
  montée en gamme : un 403 serait lu comme une erreur de droits et passerait
  sous silence.
- **Sans effet de bord** : rien n'est persisté. La validation appartient à la
  coordination (accepter / ajuster / rejeter), et un découpage écrit avant
  validation serait un découpage imposé. Conséquence assumée : le lien
  secteur → tournée n'existe pas encore en base. La réponse expose donc, par
  cluster, la `routeId` **déjà existante** de la fachkraft suggérée, seule cible
  possible du VRPTW à ce stade.

### Dette technique assumée : `clustering_sessions` (Phase 2)

Ne rien persister est le bon choix pour la mise en place, pas une position
tenable à terme. Une table `clustering_sessions` sera nécessaire en **Phase 2**
pour deux besoins que l'état client ne peut pas couvrir :

- **Historique** : savoir quel découpage a été validé un jour donné, par qui, et
  le comparer au réalisé. Aujourd'hui la décision du coordinateur disparaît au
  rafraîchissement de la page.
- **Ré-optimisation intra-journalière** : quand un arrêt maladie tombe à 10 h, il
  faut repartir du découpage validé le matin, pas en recalculer un nouveau qui
  redistribuerait des tournées déjà commencées.

Elle portera au minimum `organization_id`, la date, l'algorithme et ses
paramètres, la composition validée de chaque secteur, la fachkraft retenue et
l'auteur de la validation. C'est elle qui donnera au VRPTW une cible propre, à la
place du contournement actuel par la `routeId` préexistante.

---

## Optimisation VRPTW

- Algorithme : **Vehicle Routing Problem with Time Windows**
- Contraintes : distance minimale + fenêtres de temps + heures de travail + règle leasing + équilibrage charge
- Exécution : asynchrone via **BullMQ + Redis**
- Statut en temps réel : **WebSocket** vers le frontend
- Timeout de sécurité : 30 secondes (configurable), retourne une solution partielle si dépassé

---

## Module KI (Python Microservice)

Trois modèles indépendants, isolés réseau, accessibles via REST interne :

| Modèle | Input | Output |
|---|---|---|
| Prognose Leasing | Historique km, saisonnalité, croissance patients | Probabilité dépassement, date estimée, recommandation |
| Ermüdungsscore | Visites/semaine, durées, trajets, historique surcharge | Score fatigue 0–100, risque surcharge, redistribution suggérée |
| Amélioration continue | Touren passées, écarts prévu/réel | VRPTW-Score 0–100, ajustement des paramètres, propositions |

**Gouvernance modèles** : versionnés, auditables, ré-entraînables. Modèle activé après 6 mois de données minimum. Toujours proposer à la validation du coordinateur, jamais d'action autonome.

---

## Intégrations HR tierces (Phase 3)

Les structures utilisent déjà un outil RH (Personio, DATEV, ou un export Excel du
cabinet comptable). La plateforme ne les remplace pas, elle s'y branche. Trois
canaux prévus, tous rattachés au module HR et soumis au rôle `HR` (jamais d'accès
aux données patients).

### 1. Import CSV universel

- Périmètre : **contrats** (type, heures hebdo, jours travaillés), **horaires**
  (plannings prévisionnels), **absences** (congés, maladie, formation).
- Pas de format imposé au client : un **profil de mapping** par organisation
  (colonne source → champ cible) est stocké en base et réutilisé à chaque import.
- Pipeline : upload → parsing → validation Zod ligne par ligne → **table de
  staging** → rapport (lignes OK / rejetées avec motif) → commit explicite.
  Aucun import n'écrit directement dans les tables métier.
- **Dry-run obligatoire** avant le commit. L'utilisateur voit le diff avant d'appliquer.
- Idempotence via une clé externe (`external_id` fourni par le client) : ré-importer
  le même fichier ne duplique rien, il met à jour.
- Exécution asynchrone (**BullMQ**), les gros fichiers ne bloquent jamais l'API.

### 2. Connecteur API Personio

- Sens : **lecture** depuis Personio (employés, contrats, absences) vers la plateforme.
- Auth : credentials OAuth/API par tenant, stockés chiffrés, jamais dans le code.
- Synchronisation incrémentale planifiée (job récurrent) + déclenchement manuel.
- Réconciliation par `external_id` Personio, même table de mapping que l'import CSV.
  Le connecteur alimente le **même pipeline de staging**, il ne court-circuite rien.
- Conflit de données : la source de vérité est configurable par organisation
  (Personio maître, ou plateforme maître). Jamais d'écrasement silencieux.

### 3. Webhook sortant vers DATEV

- Sens : **écriture** depuis la plateforme vers la comptabilité (heures effectuées,
  absences validées, km parcourus pour les notes de frais).
- Signature **HMAC-SHA256** sur le payload, secret par tenant, header dédié.
- Livraison at-least-once : file BullMQ, **retry avec backoff exponentiel**, dead
  letter queue après N échecs, statut consultable par le Struktur-Admin.
- Chaque envoi est tracé dans l'audit log (payload, code retour, tentatives).

### Contrainte de conception (à appliquer dès la Phase 1)

**Les endpoints du module HR doivent être écrits maintenant pour accueillir ces
intégrations sans refactoring.** Concrètement :

- Toute entité HR (contrat, horaire, absence) porte dès le départ un champ
  `external_id` + `external_source` nullable, et un `updated_at` fiable pour
  les synchronisations incrémentales.
- La **logique métier vit dans une couche service**, pas dans les handlers HTTP.
  Un import CSV, un connecteur API et un appel REST doivent atteindre le même
  service, avec les mêmes validations et les mêmes règles contractuelles.
- Les services HR acceptent le **traitement par lot** (batch), pas seulement
  l'unitaire. Un import de 500 contrats ne doit pas être 500 appels.
- Chaque mutation HR émet un **événement de domaine** (`contract.updated`,
  `absence.approved`, ...). Le webhook DATEV s'abonne à ces événements, il
  n'est pas appelé en dur depuis le code métier.
- `organization_id` et la RLS s'appliquent à l'identique aux flux d'intégration.
  Un connecteur n'est pas une exception au multi-tenant.

---

## Rôles RBAC

| Rôle | Périmètre |
|---|---|
| Super-Admin | Exploitation de la plateforme : organisations, facturation, audit-logs. **Aucune donnée d'un tenant** |
| Struktur-Admin | Son organisation complète |
| Koordinator | Planung, Zuweisung, Echtzeit-Tracking, KI-Vorschläge genehmigen |
| HR | Vertragsmodul, Auslastungsberichte (pas de données patients) |
| Fachkraft | App mobile uniquement : sa route du jour, pointage GPS, chat |

### Le Super-Admin ne voit aucune donnée d'un tenant

Règle structurante, à respecter pour toute route ajoutée. `SUPER_ADMIN`
n'apparaît dans **aucun** `requireRole` d'un module tenant : patients, visites,
fachkräfte, HR, geocodage, clustering, VRPTW, tracking, chat, comptes,
export/effacement des personnes concernées. Ces endpoints lui répondent 403.

Ce qui lui reste : `/admin/*` (son bureau), la facturation et les véhicules
(exploitation, sans donnée personnelle), et `/auth/me` (son propre compte).

**Pourquoi** : minimisation des données. Celui qui exploite le logiciel n'a
besoin ni des noms de patients, ni des adresses, ni des positions GPS des
soignantes pour faire son travail — il gère des abonnements et des
organisations. C'est aussi ce qui se défend devant un Pflegedienst qui demande
qui, chez l'éditeur, peut voir ses dossiers : personne.

**Conséquence à assumer** : il n'y a pas d'accès de dépannage. Pour regarder
dans les données d'un client, il faut un compte de ce client, créé par lui.

Côté interface, la navigation du Super-Admin ne contient que « Plattform », et
`SuperAdminScope` le ramène sur `/admin` s'il ouvre une adresse tenant
(signet, lien). Ce n'est que du confort : la barrière est le 403 du backend.

---

## Panel Super-Admin

Exploitation de la plateforme, **au-dessus** des tenants. Backend sous
`/admin/*`, frontend sous `/[locale]/admin`.

### Ce qui distingue ce module de tous les autres

Partout ailleurs, deux barrières se superposent : le contrôle de rôle, et la
RLS qui filtre par `organization_id`. Une erreur de rôle y est rattrapée par la
base. **Ici, la seconde barrière n'existe pas** : les requêtes passent par le
chemin système (`prisma` direct, rôle propriétaire), sans filtre tenant, parce
que voir toutes les organisations est précisément la fonction du module.

Conséquences, à respecter pour toute évolution :

- Garde dédié `requireSuperAdmin` (`plugins/require-super-admin.ts`), **et non**
  `requireRole(SUPER_ADMIN)`. Il vérifie lui-même signature, liste de
  révocation, mot de passe forcé et rôle, sans dépendre d'un hook enregistré
  ailleurs dont l'ordre pourrait changer.
- Le garde est posé en `addHook` sur l'ensemble du plugin : une route ajoutée
  sous `/admin` est protégée sans que personne ait à y penser.
- `STRUKTUR_ADMIN` n'a **aucun** accès. Il est tout-puissant dans son
  organisation, ce qui en fait le rôle le plus dangereux à laisser entrer ici.
- Toute écriture est tracée dans l'audit log **de l'organisation visée**, avec
  `metadata.bySuperAdmin = true` et l'`userId` de l'opérateur — qui appartient
  à une autre organisation, ce qui rend l'intervention externe identifiable en
  relisant l'historique d'un client.

### Endpoints

| Méthode | Route | Effet |
|---|---|---|
| GET | `/admin/dashboard` | orgs par statut, MRR Stripe, nouveaux tenants 7/30 j, alertes |
| GET | `/admin/organizations` | liste paginée, filtres statut/plan/recherche |
| GET | `/admin/organizations/:id` | fiche + 5 dernières factures + 50 derniers audit logs |
| PATCH | `/admin/organizations/:id` | plan, prolongation d'essai, suspension, réactivation |
| DELETE | `/admin/organizations/:id` | suppression douce, motif obligatoire (≥ 10 caractères) |
| GET | `/admin/audit-logs` | audit log global filtrable |
| GET | `/admin/audit-logs/export` | même filtre en CSV |

### Règles

1. **Suppression douce uniquement.** `deleted_at`, `deletion_reason`,
   `deleted_by_user_id`. Un vrai `DELETE` emporterait par cascade patients,
   visites et facturation d'un client entier, contre les obligations de
   conservation (§ 630f BGB). La suppression passe le statut à `CANCELED`, ce
   qui fait refuser toute écriture par la vérification de plan (402).

   La connexion est également refusée (`auth.service: organizationIsDeleted`),
   sans quoi la suppression ne serait qu'un changement d'affichage.

   **Comment cette vérification est écrite, et pourquoi.** Elle est une requête
   séparée, exécutée après la validation du mot de passe, et **jamais** une
   jointure dans la recherche des comptes. Écrite en jointure, elle a mis la
   production à terre : le pooler Supabase conserve des connexions serveur qui
   survivent au redémarrage de l'application, l'une d'elles servait un plan
   antérieur à la migration, la requête échouait — et avec elle *toute*
   connexion, web et mobile.

   Trois conséquences à préserver :
   - la recherche des comptes reste la requête éprouvée, sans `organization` ;
   - l'échec de la vérification laisse entrer (`fail open`) avec un
     avertissement, même arbitrage que la liste de révocation des jetons : une
     couche supplémentaire ne doit pas fermer le produit. Le statut `CANCELED`
     reste la seconde barrière, qui refuse les écritures en 402 ;
   - une tentative avec un mauvais mot de passe ne consulte pas la table, donc
     ne coûte rien de plus qu'avant.

   La règle générale : **ne jamais faire dépendre le chemin d'authentification
   d'une colonne fraîchement ajoutée.** Une fonctionnalité qui ne charge pas est
   un incident local ; un login cassé est une panne totale.
2. **`plan_limits` n'est jamais réécrit** lors d'un changement de plan. La
   colonne porte des dérogations négociées par ressource, que
   `resolvePlanLimits` superpose au défaut du plan ; l'écraser supprimerait un
   accord commercial en silence.
3. **`ACTIVE` et `PAST_DUE` ne se posent pas à la main.** Ces états
   appartiennent à Stripe ; les forcer découplerait l'affichage du paiement
   réel. Seuls `SUSPENDED` et `TRIAL` sont attribuables, plus une réactivation
   explicite (qui remet `past_due_since` à null, sinon le worker resuspend).
4. **MRR : les montants viennent de Stripe, l'éligibilité de la base.** Stripe
   seul connaît les prix, remises et tarifs négociés — mais il ignore nos
   statuts et nos suppressions. Le calcul croise donc les deux : côté Stripe,
   uniquement les abonnements `active` (ni `trialing`, ni `past_due`) ; côté
   base, uniquement les organisations `ACTIVE` non supprimées avec un
   abonnement (`payingSubscriptionIds`).

   Sans ce croisement, deux erreurs se produisaient : une organisation en
   période d'essai apparaissait dans le revenu alors qu'elle ne paie rien, et
   une organisation supprimée y restait — car **la suppression douce ne résilie
   pas l'abonnement Stripe**.

   Si Stripe est injoignable, le panel affiche « indisponible » et **jamais
   0 €** : la distinction décide si quelqu'un doit aller voir.
5. **Export CSV : neutraliser les formules.** Les cellules commençant par
   `=`, `+`, `-` ou `@` sont préfixées d'une apostrophe. L'audit log contient
   du texte saisi par des utilisateurs, et un fichier venant du panel n'éveille
   aucune méfiance à l'ouverture dans un tableur.
6. **L'export passe par l'API authentifiée**, pas par un lien de
   téléchargement : un `<a href>` ne porte pas d'en-tête, le jeton finirait
   dans l'URL et donc dans les journaux d'accès.

---

## Abonnements (Stripe)

| Plan | Patients | Fachkräfte | Fahrzeuge | KI |
|---|---|---|---|---|
| Basic | 100 | 10 | 5 | Non |
| Pro | 1 000 | 100 | 30 | Oui |
| Enterprise | 5 000 | 500 | Illimité | Oui (étendu) |

- Plan-Limits serverseitig erzwungen (HTTP 402 bei Überschreitung)
- Stripe Webhooks: `payment_succeeded`, `payment_failed`, `subscription_canceled`
- Signaturverifikation: `stripe.webhooks.constructEvent` obligatoire

---

## Sécurité (checklist)

- [ ] Argon2id (hachage mots de passe)
- [ ] Chiffrement au repos délégué à l'hébergeur (Supabase/AWS). Pas de
      chiffrement applicatif champ par champ : décision assumée, pas un oubli
- [ ] TLS 1.3 + HSTS
- [ ] CSP strict (pas d'inline script)
- [ ] Rate limiting Redis sur tous les endpoints
- [ ] CSRF (double-submit cookie)
- [ ] XSS : output encoding + CSP + Helmet.js
- [ ] JWT 15 min + refresh rotation
- [ ] MFA optionnel (TOTP)
- [ ] Zod validation sur tous les endpoints
- [ ] Audit log : lecture/écriture/suppression données patients
- [ ] DSGVO : export données, droit à l'oubli, consentement GPS tracé

---

## DevOps

- Docker pour tous les services (Backend, Frontend, VRPTW-Worker, KI, PostgreSQL, Redis)
- `docker-compose` pour le dev local
- CI/CD : Lint → TypeCheck → Tests → Build → Deploy staging → Deploy prod
- Logs : Pino → agrégateur centralisé (Loki + Grafana ou Datadog)
- Health-check sur `/health` pour chaque service

---

## Scalabilité cible

- 1 000 organisations actives simultanément
- 500 Fachkräfte par organisation
- 5 000 patients par organisation
- VRPTW et KI 100% asynchrones (jamais bloquants pour l'API)

---

## Plan de développement

**Phase 1 – MVP (M1–M4)** : Auth multi-tenant, gestion patients/fachkräfte/contrats, planification manuelle, Google Maps, geocodage, app mobile, i18n DE/EN/FR, Stripe Basic.
Le module HR respecte dès maintenant la contrainte de conception décrite dans
[Intégrations HR tierces (Phase 3)](#intégrations-hr-tierces-phase-3) : `external_id`,
couche service, batch, événements de domaine.

**Phase 2 – V1 (M5–M9)** : VRPTW async, echtzeit-tracking, geofencing, module leasing, Stripe Pro/Enterprise, CI/CD, monitoring.

**Phase 3 – V2 (M10–M15)** : KI-Microservice complet, modell-governance, connecteurs API tiers
(détail : [Intégrations HR tierces (Phase 3)](#intégrations-hr-tierces-phase-3)),
self-service onboarding, Kubernetes.
