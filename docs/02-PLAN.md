# Plan de développement du backend RISE (Cockpit + Console Admin)

Pré-requis : lire `docs/01-ANALYSE.md`. Les questions du § 6 doivent être tranchées avant l'étape 2.

---

## 1. Architecture technique

Stack par défaut des briefs, sans écart :

| Couche | Choix | Raison |
|---|---|---|
| Runtime | Node.js 20+ (22 disponible), TypeScript strict | Brief § 4 |
| Framework | **NestJS** (adaptateur Express) | Modules, gardes et intercepteurs adaptés aux droits et à l'audit ; OpenAPI natif |
| Base | **PostgreSQL 16** | Brief : 15+ |
| ORM | **Prisma**, migrations versionnées | Brief § 4 |
| Validation | **zod** (`nestjs-zod`) : un schéma par DTO, réutilisé par l'import Excel | Le même schéma sert à l'API et à l'import (« mêmes validations que l'API ») |
| OpenAPI | `@nestjs/swagger` → `/api/docs` + `openapi.json` exporté | Brief § 4 |
| Auth | JWT porteur (`@nestjs/jwt`) ; `POST /api/auth/dev-login {personId|accountId}` activé seulement si `AUTH_DEV=true` | Le fournisseur d'identité est hors périmètre ; utilisateur de développement p01 |
| File de tâches | **pg-boss** (sur PostgreSQL, sans Redis) | Brief Console § 4 : tests de clés, snapshots, notifications, alertes |
| Excel | **exceljs** | Lecture de l'onglet, des types de ligne 7 et des formules CONTRÔLE |
| Stockage de fichiers | Interface `ObjectStorage`, implémentation disque local (`STORAGE_DIR`) | Documents, snapshots, imports ; remplaçable par S3 |
| E-mail | Interface `Mailer` ; implémentations console/journal (dev) et SMTP (nodemailer) | Brief Console § 4 |
| LLM | Interface `LlmGateway`, bouchon déterministe (tokens simulés et tarifs réels) | Moteur hors périmètre ; alimente `UsageRecord` |
| Chiffrement des clés | AES-256-GCM, clé `SECRETS_KEY` en variable d'environnement | Brief Console § 4 |
| Tests | Jest + Supertest, base `rise_test` recréée par migration | Brief § 4 |

### Organisation (un seul dépôt, un seul service)

```
backend/
  prisma/schema.prisma, migrations/, seed/
  src/
    core/        config, prisma, auth (JWT, dev-login), errors (format unique),
                 audit (intercepteur + service), etag/If-Match, today (DEMO_TODAY),
                 storage, mailer, llm, jobs (pg-boss), crypto
    domain/      règles pures, testées unitairement : milestones, risks, actions,
                 deliverables, sessions, freshness, today, tasks, usages (refUsage),
                 rights (RG5), usage/budget (projection), snapshot diff
    cockpit/     /api et /api/projects/:projectId/... : me, bootstrap, referential/*,
                 pilotage/*, sessions, reports, documents, comments, audit,
                 assistant, external, module-requests, import
    admin/       /api/admin/... : overview, accounts, admins, audit, providers,
                 models, assignments, usage, budget-thresholds, snapshots,
                 notification-rules, deliveries, modules, projects, project-imports,
                 me, assistant
    import/      moteur Excel commun (lecture, résolution des libellés, validation)
  test/          e2e par étape (critères § 13 des deux briefs)
frontends/       copie d'origine + branchement (api.js, admin-api.js)
docs/            specs, analyse, plan, DECISIONS.md
```

**Un seul service NestJS** sert les deux API (`/api/...` et `/api/admin/...`). Les deux espaces partagent la même base, la même authentification, le même journal d'audit et le même format d'erreur, comme l'exige le brief Console § 1. La séparation se fait par modules et par gardes.

### Mécanismes transverses

- **Garde de droits** : `@Requires('transactional.write', { ws: from body/entity })`.
  - Elle calcule les droits effectifs (RG5) à partir de `Habilitation` et retient le **profil utilisé**.
  - Elle renvoie `403`, ou `404` pour une ressource hors périmètre.
- **Filtrage RG8** : un helper Prisma `scopeWhere(user, projectId)` est appliqué à toutes les listes transactionnelles, y compris `/bootstrap`, `/today` et `/me/tasks`.
- **Audit** : un service `audit.recordChanges(entity, before, after, ctx)` crée une ligne par champ modifié.
  - Il enregistre `origin` (MANUAL, JEV ou IMPORT), le profil utilisé, `severity`, `action` et `target` (console).
  - Il est appelé dans la **même transaction** que l'écriture.
- **Concurrence** : colonne `version` (entier), `ETag: W/"<version>"`, `If-Match` → `412`.
- **Erreurs** : un filtre global produit `{code, message, fields?, usages?}` avec les statuts 400/401/403/404/409/412/422.
- **Date du jour** : `TodayService.today(projectId)` utilise le fuseau `Project.timezone` et la variable `DEMO_TODAY=2026-09-26`.

---

## 2. Modèle de données (Prisma)

Toutes les tables ont `id` (cuid, ou code lisible conservé pour la démonstration), `projectId` quand la donnée dépend d'un projet, `createdAt`, `updatedAt` et `version`.

**Référentiel**
- `Client`, `Project` (+ `ProjectSection`, `BaselineVersion`, `healthOverride` en JSON), `Wave`, `Phase`, `PhaseWave` (N-N), `Subphase`, `Workstream`, `WorkstreamPhase`, `WorkstreamWave`, `WorkstreamDependency` (+ `dependsOnAll`), `WorkstreamProgress`.
- `Milestone` (`code` unique par projet), `Deliverable`, `Team`, `ProjectRole`, `Person`, `Assignment`, `GovernanceBody`, `BodyMember`.

**Transactionnel**
- `Risk`, `Issue`, `Action`, `Decision`, `DecisionArbitration` (1-1, JSON typé : question, options, critères, recommandation, textes).
- `Session`, `ReportTemplate`, `ReportInstance`, `BarometerSurvey`, `BarometerDomain`, `MissionPeriod`, `ProgramBudget`.
- `Document`, `DocumentLink`, `Task`, `CellComment`, `UserPreferences`.
- `AssistantConversation` et `AssistantProposedChange`.
- `ContentBlock` (`projectId`, `key`, `json`) pour les données de présentation sans règle : `referential.*`, `raci`, `volets`, `weekWins`, `committee`… (brief § 12).

**Accès, commun aux deux espaces**
- `Account` (+ `AccountProject`).
- `Habilitation` (`projectId`, `personId` ou `accountId`, `profile`, `wsId?`).
- `AdminGrant`, `AuthSession`.
- `AuditEntry` : champ par champ, plus `profileUsed`, `severity`, `action`, `target`, `projectId`, `wsId`. Table en ajout seul : aucune route de modification ou de suppression, et un trigger SQL qui refuse UPDATE et DELETE.

**Console**
- `Provider` (`keyCipher`, `keyPrefix`, `keyLast4`), `Model`, `AiFunction`, `ModelAssignment`, `UsageRecord`, `BudgetThreshold`, `BudgetAlertFired` (une ligne par seuil et par mois).
- `Snapshot`, `SnapshotSchedule`, `NotificationRule`, `Delivery`, `Module`, `ModuleProject`, `ModuleRequest`, `ProjectImport`.

**Calculé, jamais stocké** (module `domain/`) : écart et état de jalon, `confirmedDays`, `late`, `sig`, `cur`, criticité, statut et risque de livrable, compteurs, `total`, `initials`, « à confirmer », anomalies, Aujourd'hui, tâches calculées, état des fonctions IA, dépense et projection.

---

## 3. Endpoints

Les listes complètes figurent dans les briefs : Cockpit § 9, Console § 9. Elles sont reprises **telles quelles**, avec les arbitrages du § 3.5 de l'analyse. Ajouts, sous réserve des réponses aux questions :

- `POST /api/auth/dev-login` (développement uniquement).
- Routes pour les données du frontend sans endpoint, selon Q8 :
  - `PUT /phases/{id}/waves/{waveId}/dates` ;
  - `PATCH /planning/{type}/{id}` avec `plannedPctOverride` ;
  - `PATCH /project/golive-history/{id}` ;
  - `PATCH /project/chronology/{id}` ;
  - `DELETE /report-templates/{id}` ;
  - `PATCH /roles/{id}` avec `tier`.
- `DELETE /tasks/{id}` existe déjà. Les surcharges de tâches calculées (archiver, renommer) : selon Q8.

---

## 4. Étapes, dans l'ordre

Chaque étape se termine par des tests verts, un commit et un court rapport (fait, tests, écarts, questions).

| # | Étape | Contenu | Critère de sortie |
|---|---|---|---|
| 0 | Arbitrages | Réponses aux questions du § 6 → `DECISIONS.md` | Questions tranchées |
| 1 | Socle | Nest, config, Prisma et première migration (tables d'accès et d'audit), JWT, dev-login, format d'erreur, audit générique, ETag, OpenAPI, `TodayService`, docker-compose Postgres | Tests : 401, format d'erreur, 412, entrée d'audit |
| 2 | Habilitations et droits | Table `Habilitation`, calcul RG5, gardes, `GET /api/me`, `GET /api/projects` | Tests unitaires des combinaisons du § 8.4 |
| 3 | Référentiel | 12 entités, validations, `refUsage` serveur (union), relations N-N, `/project`, sections, signaux | Supprimer une phase utilisée → 409 + usages ; un Lecteur reçoit 403 |
| 4 | Amorçage | Chargement de `rise-data.js` et `planning-data.js` (import dynamique ES), conversions du § 12, corrections des données (§ 3.3 de l'analyse), `GET /bootstrap` | Mêmes clés et mêmes cardinalités que les modules |
| 5 | Jalons | Création et modification, code serveur, avertissements, confirmation | Tests § 13.4 |
| 6 | Pilotage | Risques, problèmes, actions, décisions et fiche d'arbitrage, planning, livrables, avancement, baromètre, budget, anomalies | D-007 → 409 ; `late` |
| 7 | Comités | Séances, templates, rapports | Nouvelle séance du COPIL (n° selon Q5) ; HELD → 422 ; lieu → audit |
| 8 | Droits de bout en bout | Tests du § 13.7 sur toutes les routes, filtrage RG8 | Tests § 13.7 |
| 9 | Aujourd'hui et Mes tâches | `/today`, `/me/tasks`, `/tasks` | Compteurs (selon Q5) |
| 10 | Import Excel (moteur commun) | Lecture, résolution des libellés, validation zod, mode simulation, transaction ; `POST /referential/import` | Tests § 13.9 |
| 11 | Documents, commentaires, Jev (bouchon), proxy météo et actualités (cache 30 min) | Stockage local, extraction simulée par pg-boss | Tests d'API |
| 12 | Console : accès, comptes, administrateurs, audit, sessions | Tests Console § 13.1-3 | |
| 13 | Console : IA | Fournisseurs (chiffrement, test, bascule), modèles, affectation, consommation (`UsageRecord`, projection), plafonds, alerte n3 | Tests Console § 13.4-5 |
| 14 | Console : snapshots, notifications, modules | Capture, planification, purge, comparaison, export ; règles, aperçu, test, envois, relance ; modules et demandes | Tests Console § 13.6-8 |
| 15 | Console : projets et initialisation | Bibliothèque ; `project-imports` → preview → commit (moteur de l'étape 10) | Tests Console § 13.9 |
| 16 | Tâches de fond | Planification pg-boss : clés toutes les 2 h, alertes budgétaires, snapshots, notifications | Tests des traitements (horloge simulée) |
| 17 | Branchement du Cockpit | `api.js` + modifications selon Q1 | Écrans identiques ; une modification survit au rechargement (Playwright) |
| 18 | Branchement de la console | `admin-api.js` + modifications selon Q1 | Idem |
| 19 | Livraison | `README.md`, `DECISIONS.md`, `openapi.json`, rapport final des écarts | — |

---

## 5. Dépendances entre les deux backends

- **Tables partagées** : `Account`, `Person`, `Habilitation`, `AuditEntry`, `Project` (et tout le référentiel créé par l'import de la console), `Module` et `ModuleRequest`, `UsageRecord`.
- **Services partagés** : authentification et droits, audit, format d'erreur, `TodayService`, `LlmGateway` (Jev du Cockpit et notifications de la console → `UsageRecord`), moteur d'import Excel, stockage et e-mail.
- **Flux de la console vers le Cockpit** :
  - comptes et profils ADMIN / PMO → droits dans le Cockpit ;
  - modules → verrouillage de Budget et Bénéfices dans le Cockpit ;
  - projets importés → `GET /api/projects` ;
  - lien « Ouvrir » → projet ciblé.
- **Flux du Cockpit vers la console** :
  - demandes d'activation de module ;
  - consommation IA de Jev ;
  - événements qui déclenchent les notifications (jalon en retard, risque critique, document analysé) ;
  - données capturées par les snapshots ;
  - entrées d'audit (le journal est consulté dans la console).
- **Ordre imposé** : socle, droits et référentiel → Cockpit → console, car la console consomme les tables du Cockpit (snapshots, bibliothèque, import).

---

## 6. Questions à trancher

Voir `docs/03-QUESTIONS.md`. Les réponses seront reportées dans `docs/DECISIONS.md` (étape 0).
