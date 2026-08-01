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
| Super-Admin | Tous les tenants, billing, audit-logs |
| Struktur-Admin | Son organisation complète |
| Koordinator | Planung, Zuweisung, Echtzeit-Tracking, KI-Vorschläge genehmigen |
| HR | Vertragsmodul, Auslastungsberichte (pas de données patients) |
| Fachkraft | App mobile uniquement : sa route du jour, pointage GPS, chat |

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
