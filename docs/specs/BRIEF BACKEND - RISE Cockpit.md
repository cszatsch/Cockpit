# RISE Cockpit — Brief de développement du backend

Ce document s'adresse au LLM chargé de développer le backend. Lisez-le en entier avant d'écrire du code.

---

## 1. Votre mission

Construire le backend de **RISE Cockpit**, application de pilotage de projet (PMO) dont le frontend existe déjà. Le frontend sert de spécification : le backend doit fournir exactement les données qu'il affiche et accepter exactement les écritures qu'il produit.

Livrables attendus, dans l'ordre :

1. Un schéma de base de données conforme au § 6.
2. Une API REST conforme au § 9, avec les règles métier (§ 7) et les droits (§ 8) appliqués côté serveur.
3. Un script d'amorçage qui charge le jeu de démonstration (`rise-data.js`, `planning-data.js`).
4. Un import du fichier Excel d'initialisation du Référentiel (§ 10).
5. Le branchement du frontend sur l'API (§ 11).
6. Des tests automatisés couvrant les critères d'acceptation (§ 13).

---

## 2. Contenu du paquet et ordre de lecture

| Fichier | Rôle | À lire |
|---|---|---|
| `Console Admin.dc.html` | Plateforme d'administration (voir § 8 et § 9.11). | Pour la console |
| `BRIEF BACKEND - RISE Cockpit.md` | Ce document. **Fait foi.** | En premier |
| `Audit frontend - specification backend.md` | Historique de l'audit et des arbitrages. Les sections **0, 0 bis et « Arbitrages finaux »** font foi. Les sections 1 à 7 décrivent l'état **d'origine**, déjà corrigé : ne les appliquez pas telles quelles. | En deuxième, pour le contexte |
| `RISE Cockpit.dc.html` | Le frontend : template HTML puis classe logique `Component` (JavaScript). | Pour vérifier un comportement |
| `rise-data.js` | Jeu de données de démonstration (modules ES `export const …`). | Pour la forme des données |
| `planning-data.js` | Phases, sous-phases et chantiers datés (vue Planning). | Idem |
| `Referentiel RISE - initialisation.xlsx` | Fichier que le PMO remplit pour initialiser le Référentiel. | Pour l'import (§ 10) |
| `support.js`, `assets/` | Moteur d'affichage du frontend et images. **Ne pas modifier.** | Non |

**Ordre de priorité en cas de contradiction** : ce brief › sections 0 / 0 bis / Arbitrages finaux de l'audit › code du frontend › jeu de données › sections 1 à 7 de l'audit.

Tout fichier du projet qui n'est pas dans ce tableau (maquettes, variantes, `RISE Cockpit.html`) est hors périmètre.

---

## 3. Comment lire le frontend

- Le frontend **n'a aucune couche API**. Il charge ses données par `import('./rise-data.js')` et `import('./planning-data.js')` (méthode `componentDidMount`), puis garde toutes les modifications dans `this.state`. Elles sont perdues au rechargement.
- Les modifications de cellule passent par des magasins d'état (`state.ed`, `state.sesEd`, `refValues`…) et créent une entrée d'historique locale. Chaque écriture de ce type correspond à un `PATCH` de l'API.
- La fonction `can(droit, objet?)` de la classe porte la matrice de droits (§ 8). `refUsage()` porte les règles d'interdiction de suppression.
- Les parties simulées sont marquées `// SIMULÉ` avec l'opération backend cible : assistant Jev, dépôt et téléchargement de documents, météo et actualités.
- Préférences locales à migrer vers le serveur : `localStorage` `rise-db-layout`, `rise-db-theme`, `rise-cell-comments`, `rise-prof-first`, `rise-prof-city`, `rise-prof-photo`.
- Une partie du Référentiel est encore stockée en tableaux positionnels `model.<ENTITÉ>.rows[].cells[]` (héritage d'une grille générique). Les colonnes sont nommées dans `model.<ENTITÉ>.cols`. Les clés étrangères explicites (`phaseId`, `waveIds`, `ownerId`, `teamId`, `subphaseId`, `workstreamId`, `bodyId`, `wsId`) font foi. Les libellés dans `cells` ne sont que de l'affichage.

---

## 4. Choix techniques

Stack par défaut, sauf consigne contraire du commanditaire :

- **TypeScript**, **Node.js 20+**, **NestJS** (ou Fastify) ;
- **PostgreSQL 15+**, ORM **Prisma**, migrations versionnées ;
- validation des entrées par schéma (zod ou class-validator) ;
- **OpenAPI 3** généré à partir du code, publié sur `/api/docs` ;
- tests : Jest + Supertest, base de test dédiée ;
- authentification : JWT porteur (le fournisseur d'identité réel est hors périmètre ; prévoir un utilisateur de développement = `p01`).

Contraintes non négociables, quelle que soit la stack :

- dates en **ISO 8601** (`YYYY-MM-DD`, horodatages en UTC avec fuseau) ; jamais de libellé de date stocké ;
- **identifiants attribués par le serveur** ; le client n'envoie jamais d'`id` à la création ;
- codes d'enum en anglais majuscules dans l'API, libellés français côté frontend ;
- toute écriture est tracée (§ 7.10) ;
- toute règle de validation du frontend est **dupliquée côté serveur** ; le serveur a le dernier mot.

---

## 5. Domaine en bref

Un **projet** (RISE, client AMC Corp) est découpé en **lots** (vagues de déploiement), **phases** et **sous-phases**, traversé par des **chantiers** (domaines : Finance, Migration…). Des **jalons** marquent les dates clés. Le pilotage suit **risques**, **problèmes**, **actions**, **décisions**, **livrables**, **baromètre** et **budget**. La gouvernance repose sur des **instances** (COPIL, COPROJ…) qui tiennent des **séances** numérotées, pour lesquelles on génère des **rapports** à partir de **templates**. Une **base de connaissance** regroupe les documents. **Jev** est un assistant qui explique et propose des modifications.

Deux familles de données :

- **Référentiel** (données de base, créées à l'initialisation, gérées par le PMO) : Client, Projet, Lots, Phases, Sous-phases, Chantiers, Jalons, Livrables, Équipes, Rôles, Personnes, Affectations, Habilitations par chantier, Instances.
- **Données transactionnelles** : Risques, Problèmes, Actions, Décisions, Séances, Rapports, Templates, Baromètre, Budget, Documents, Tâches manuelles, Commentaires, Historique.

Glossaire écran → entité : Lot = `Wave` · Chantier = `Workstream` · Instance = `GovernanceBody` · Séance = `Session` · Problème = `Issue` · Fiche d'arbitrage = contenu détaillé d'une `Decision` · Équipe = `Team` (une société ou entité).

**Multi-projets** (décidé) : l'application gère plusieurs projets (RISE, ATLAS, HORIZON, NOVA dans la console). Profils, chantiers et habilitations sont définis **par projet**. Toutes les routes sont préfixées par `/api/projects/{projectId}` ; `GET /api/projects` renvoie les projets accessibles. Le frontend actuel ne montre qu'un projet : un sélecteur de projet est à ajouter.

---

## 6. Modèle de données

Conventions : `id` string (UUID ou code lisible, au choix, mais stable) ; `?` = facultatif ; `→` = clé étrangère ; toutes les entités portent `projectId`, `createdAt`, `updatedAt`. Les noms de champs sont ceux du **frontend** (camelCase) pour limiter l'adaptation.

### 6.1 Référentiel

**Client** — `id`, `code`, `name`, `description?`, `status` (ACTIVE | INACTIVE)

**Project** — `id`, `clientId →Client`, `code` (unique, **non modifiable après création**), `name`, `objective?`, `startDate`, `targetEndDate`, `timezone` (IANA, ex. `Europe/Paris`), `city?`, `country`, `status` (PREPARATION | ACTIVE | CLOSED), `editorTeamId? →Team`, `integratorTeamId? →Team`, `programDirectorId →Person`, `sponsorId? →Person`, `currency` (ISO 4217, EUR par défaut)
Référence de planning : `baseline { version, date, approvedAt, approvedBy →Person, reason, previous? }` (historique des versions en table `BaselineVersion`). Prévision : `forecast.goliveIso`. Forçage de santé : `healthOverride? { value, reason (obligatoire), by →Person, at }`.
Sections libres de la fiche projet (identité, réseau, périmètre, systèmes, contrat, rôle AMOA) : table `ProjectSection { key, label, value, order }`.

**Wave (Lot)** — `id`, `seq` (entier, unique par projet), `name` (périmètre), `startDate`, `endDate`, `status` (PLANNED | IN_PROGRESS | DONE), `ownerId? →Person`. `cur` (lot courant) = calculé.

**Phase** — `id`, `seq` (unique), `code` (« 5 »), `name`, `description?`, `startDate`, `endDate`, `status` (PLANNED | IN_PROGRESS | DONE), `progressPct` (0-100, champ `reel` du planning), `ownerId →Person`. Relation **N-N** avec Wave (`waveIds[]`).

**Subphase** — `id`, `phaseId →Phase`, `code` (« 5.3 », doit commencer par le code de la phase suivi d'un point), `name`, `description?`, `startDate?`, `endDate?`, `status`, `progressPct`, `critical` (bool), `ownerId? →Person`.

**Workstream (Chantier)** — `id`, `code` (C1…, attribué par le serveur), `seq`, `name`, `ownerId →Person` (obligatoire), `status` (ACTIVE | CLOSED), `startDate`, `endDate`, `progressPct`, `description?`. Relations N-N : `phaseIds[]`, `waveIds[]`, `dependsOn` (liste d'ids ou `ALL`). C8 « Pilotage et transverse » est un chantier normal qui porte les sujets transverses.

**WorkstreamProgress** (bloc Avancement, 8 lignes) — `id`, `wsId →Workstream`, `label`, `valuePct`, `targetPct` (champ `ref`), `detail`, `ownerId`. `sig` = calculé (§ 7.6).

**Milestone (Jalon)** — `id` (technique), `code` (J01…, **attribué par le serveur = max + 1, figé, unique**), `n` (libellé, obligatoire), `phaseId →Phase` (**obligatoire**), `subphaseId? →Subphase` (sa phase doit être `phaseId`), `wsId? →Workstream`, `waveId? →Wave`, `owner? →Person`, `iso` (date prévue, obligatoire), `baselineIso` (date de référence ; vaut `iso` si absente), `confirmedAt?`. `planned` et `ws` dans le jeu de données sont des libellés d'affichage, `confirmedDays` est calculé : ne pas les stocker.

**Deliverable (Livrable)** — `id`, `name`, `subphaseId →Subphase` (obligatoire), `workstreamId? →Workstream`, `ownerId →Person` (obligatoire), `start?`, `due` (obligatoire), `prog` (0-100), `riskOverride?` (OK | TENSION | CRITICAL). Phase et équipe sont dérivées, pas stockées. Statut et risque calculés (§ 7.5).

**Team (Équipe)** — `id`, `name` (unique : c'est la société ou l'entité, ex. « Onepoint »), `description?`. **Il n'y a pas de champ « société » distinct** : la société d'une personne est le nom de son équipe. Le compteur de personnes est calculé.

**ProjectRole (Rôle)** — `id`, `label` (unique), `description?`, `order`. Compteur calculé.

**Person** (utilisateur du référentiel, acteur du projet) — `id`, `firstName`, `lastName` (le frontend affiche `name` = prénom + nom), `email` (unique, valide), `teamId →Team`, `title?` (fonction), `active` (bool), `photoUrl?`. Plus de champ `permission` : les droits viennent de `Habilitation` (§ 8.3).

**Account** (compte d'accès, géré dans la console) — `id`, `email` (unique), `personId? →Person`, `status` (INVITED | ACTIVE | SUSPENDED), `lastLoginAt?`, `invitedAt?`. **Deux entités liées** : une personne peut ne pas avoir de compte ; un compte peut ne pas être une personne du référentiel (partenaire, actionnaire), avec un profil LECTEUR sur les chantiers choisis par l'Admin. Le PMO édite `Person`, l'Admin édite `Account` et les profils globaux. `initials` et `org` sont calculés. La liste `people` du jeu de données est une vue des personnes utilisées en Pilotage ; `model.PERSON` est la table complète. Fusionnez les deux en une seule table.

**Assignment (Affectation)** — `id`, `personId →Person`, `roleId →ProjectRole`, `startDate`, `endDate?` (vide = en cours). **Plusieurs affectations simultanées autorisées** pour une même personne. Historique conservé. `active` = calculé.

**GovernanceBody (Instance)** — `id`, `name`, `shortName` (unique, ex. COPIL), `color` (hex), `frequency` (DAILY | WEEKLY | BIWEEKLY | MONTHLY | QUARTERLY | SEMIANNUAL | ON_DEMAND), `level?` (STRATEGIC | STEERING | OPERATIONAL | OFF_CYCLE), `description?`. Membres : table `BodyMember { bodyId, personId, role (CHAIR | MEMBER | SECRETARY | GUEST) }`, unique par couple.

### 6.2 Données transactionnelles

**Risk** — `id` (R01…), `n` (titre), `p` (probabilité 1-5), `i` (impact 1-5), `plan?` (plan de mitigation), `owner →Person`, `wsId →Workstream`, `dueIso?`, `status` (OPEN | MITIGATING | CLOSED).

**Issue (Problème)** — `id` (P01…), `n`, `sev` (1-5), `originRiskId? →Risk`, `openedIso`, `owner`, `wsId`, `targetIso?`, `targetSessionId? →Session`, `detail`, `status` (OPEN | RESOLVING | RESOLVED).

**Action** — `id` (A-41…), `n`, `detail?`, `owner`, `dueIso?`, `status` (OPEN | IN_PROGRESS | BLOCKED | DONE), `prio` (HIGH | MEDIUM | LOW), `sourceType?` (RISK | ISSUE | MILESTONE | DECISION) + `sourceId?`, `closedAt?`. `late` = calculé. Dans le jeu de données, `source` est une chaîne (« R01 ») : dérivez le type du préfixe à l'amorçage.

**Decision** — `id` (D-001…, ordre de création), `t` (titre), `p` (priorité 1-4 : 4 = Critique), `status` (DRAFT | IN_REVIEW | TO_ARBITRATE | ARBITRATED | CANCELLED | SUPERSEDED), `crIso` (création), `ddIso?` (date de décision), `wsId`, `bodyId →GovernanceBody`, `decL?` (texte de la décision), `maker →Person` (décideur), `impact?`, `supersedes? →Decision`, `expectedSessionId? →Session`, `full` (bool : a une fiche d'arbitrage), `opt?` (option retenue).
Fiche d'arbitrage (si `full`) : `question`, `options[] { code, label, body }`, `criteria[] { name, weightPct, scoreA, commentA, scoreB, commentB }`, `recommendation`, textes libres. **Une fiche ARBITRATED est en lecture seule** (`409` sur toute modification).

**Session (Séance)** — `id`, `bodyId →GovernanceBody`, `number` (attribué par le serveur, § 7.8), `dateIso`, `time?` (HH:MM), `place?`, `status` (PLANNED | HELD | CANCELLED), `participants[] →Person` (copie des membres de l'instance à la création, modifiable), `reportId? →ReportInstance`.

**ReportTemplate** — `id`, `name`, `bodyId →GovernanceBody`, `authorId`, `version`, `description`, `components[] { id (synthese | planning | jalons | risques | decisions | actions | barometre | dashboard), scope (PROJECT | WAVE | WORKSTREAM), targetId? }`, `pages`, `publishedAt`, `active` (bool).

**ReportInstance (Rapport)** — `id` (RP-20…), `templateId`, `sessionId →Session`, `v` (version), `status` (DRAFT | IN_REVIEW | PUBLISHED), `generatedAt`, `reportingDate`, `captureAt`, `reviewer →Person`, `validator →Person`, `audience?`, `fileId?`.

**BarometerSurvey** (mensuel) — `month` (YYYY-MM), `overallScore` (0-10), `respondents`, `sentiment { negative, neutral, positive }` (somme = 100), `questions[] { label, score, delta }`, `themes[] { label, tone (OK | WATCH | RISK) }`. **BarometerDomain** — `id`, `n`, `size`, `resp`, `series[]` par mois, `range`.

**MissionPeriod (Budget AMOA)** — `id`, `period`, `amoa` (k€), `sub` (k€, sous-traitance), `status` (INVOICED | IN_PROGRESS | NEGOTIATION). `total` calculé. `ProgramBudget { known (bool), reason? }`.

**Document** — `id`, `n` (titre), `type`, `dateIso`, `v`, `conf` (INTERNAL | RESTRICTED), `src` (UPLOADED | GENERATED), `ext` (extraction : PENDING | SUCCEEDED | PARTIAL | UNSUPPORTED), `mime`, `pages?`, `fileKey` (stockage objet). Liens typés : table `DocumentLink { documentId, entityType, entityId }` (remplace la chaîne `linked`).

**Task (tâche manuelle)** — `id`, `authorId →Person`, `title`, `dueIso?`, `detail?`, `status` (TODO | DONE), `link? { entityType, entityId }`. **Visible par son auteur uniquement.**

**CellComment** — `id`, `entityType`, `entityId`, `field`, `text`, `authorId`, `createdAt`, `resolved` (bool). Clé stable = objet + champ (pas le libellé de ligne).

**AuditEntry** — `id`, `entityType`, `entityId`, `field`, `oldValue`, `newValue`, `authorId`, `at`, `origin` (MANUAL | JEV | IMPORT).

**UserPreferences** — `personId`, `dashboardLayout` (JSON), `theme`, `firstName`, `city`, `photoUrl`, notifications.

### 6.3 Données calculées, jamais stockées

`confirmedDays`, écart de jalon, état de jalon, `late`, `sig`, `cur`, criticité de risque, statut et risque de livrable, compteurs (personnes par équipe et par rôle, membres, affectations actives), `total` budget, `initials`, séance « à confirmer », anomalies (écarts), écran Aujourd'hui, tâches calculées. Règles au § 7.

---

## 7. Règles métier

### 7.1 Date du jour
Le serveur fournit la date du jour du projet (fuseau `Project.timezone`) dans `GET /project` → `today`. Toutes les règles l'utilisent. En démonstration, elle vaut **2026-09-26** (paramètre de configuration `DEMO_TODAY`, désactivable).

### 7.2 Jalons
- Création : `phaseId` obligatoire (`400` sinon) ; si `subphaseId`, sa phase doit être `phaseId` (`422`) ; `code` = max + 1 au format `J00`, figé.
- Date prévue hors de la période de la phase : **avertissement non bloquant** (réponse `200` avec `warnings[]`).
- Écart = `iso − baselineIso` en jours ; « conforme » si 0.
- État : `past` si `iso < today` ; `next` = premier jalon avec `iso ≥ today` ; `upcoming` sinon.
- Regroupement mensuel : clé `iso[0..7]`, jalons triés par `iso` puis `code`.
- `confirmedDays` = `today − confirmedAt` ; modifier `iso` remet `confirmedAt = now`.

### 7.3 Risques
Criticité = `p × i` : critique ≥ 20, élevé 12-19, modéré 6-11, faible < 6.

### 7.4 Actions
`late` = `status ≠ DONE` et `dueIso < today`.

### 7.5 Livrables
Statut : DONE si `prog = 100` ; LATE si `today > due` ; ACTIVE si `today ≥ start` ou `prog > 0` ; FUTURE sinon.
Risque automatique (si pas de `riskOverride`) : LATE → CRITICAL ; ACTIVE : écart = % de temps écoulé − `prog` ; > 18 → CRITICAL, > 6 → TENSION, sinon OK.

### 7.6 Signaux de fraîcheur
Donnée non confirmée depuis **7 jours = vigilance**, **14 jours = alerte**. Seuils fixes côté serveur, non paramétrables.

### 7.7 Suppression
Interdite si l'objet est utilisé ailleurs : `409` avec la liste des usages `{ entityType, id, label }[]`. Sinon suppression définitive. Reproduire exactement `refUsage()` du frontend, par exemple : une phase utilisée par une sous-phase, un jalon, un livrable ou un chantier ; une personne responsable d'un objet ou membre d'une instance ; une équipe qui a des personnes.

### 7.8 Séances
- `number` = max(number) de l'instance + 1 à la création ; **conservé** si la date change.
- `participants` = copie des membres de l'instance à la création.
- Seules les séances **PLANNED** peuvent changer de date (glisser-déposer compris) : `422` pour HELD et CANCELLED.
- « À confirmer » = état calculé : `status = PLANNED` et `dateIso ≤ today`. Ce n'est pas une valeur d'enum.
- « Confirmer » = passer à HELD.

### 7.9 Décisions et référence de planning
- Validations en attente = décisions `TO_ARBITRATE` dont je suis décideur.
- Référence courante : **v5 au 01/04/2027**, approuvée au COPIL n°20 (D-007). Les `baselineIso` des jalons, phases, sous-phases et chantiers recalés correspondent à la v5 ; la v4 (01/11/2026) reste dans l'historique.

### 7.10 Historique
Chaque modification crée une `AuditEntry` par champ modifié (ancienne et nouvelle valeur, auteur = utilisateur authentifié, horodatage, origine). Cela vaut pour **tous** les champs, y compris l'heure et le lieu des séances.

### 7.11 Affectations
- Chevauchement autorisé ; `endDate ≥ startDate` ; pas de doublon exact (personne, rôle, début).
- La fin d'une affectation ne modifie aucun objet porté par la personne. Le serveur signale « porteur sans affectation active » : personne sans affectation active et responsable d'au moins un objet ouvert.
- Organigramme et RACI : une personne apparaît sous **chacun** de ses rôles actifs.

### 7.12 Mes tâches
`GET /me/tasks` renvoie :
- les actions dont je suis porteur et qui ne sont pas DONE ;
- les décisions dont je suis décideur, en IN_REVIEW ou TO_ARBITRATE ;
- les jalons dont je suis porteur, à moins de 45 jours ;
- mes tâches manuelles.

### 7.13 Écran Aujourd'hui
`GET /today` calcule : message d'accueil (prochaine séance du COPIL, nombre de validations, nombre de tâches), compte à rebours `J-n / J+n`, échéances à venir, écarts (anomalies) et données « à revoir » (§ 7.6). Reproduire les règles de `todayMsg`, `todayTimeline`, `todayStale` du frontend. Anomalies : risque critique sans plan, jalon non confirmé depuis plus de 14 jours, budget non renseigné, modifications depuis la capture du dernier rapport.

### 7.14 Assistant Jev
- Jev **propose** ; rien n'est enregistré avant que l'utilisateur valide le récapitulatif (« Valider et enregistrer » / « Refuser »).
- Jev ne modifie **jamais** le Référentiel, les Comités et rapports ni la Base de connaissance.
- Une modification validée suit les mêmes droits et validations qu'une saisie manuelle, avec `origin = JEV` dans l'historique.
- Le moteur (LLM, recherche documentaire) est hors périmètre de cette itération : fournissez l'API et un service bouchon qui renvoie une réponse et des propositions structurées.

---

## 8. Habilitations (fait foi)

Source : texte « Gestion des habilitations » du commanditaire, complété par ses arbitrages. **En cas de doute, cette section l'emporte sur tout le reste.**

### 8.1 Deux espaces
- **Application métier (Cockpit)** : données du référentiel et données transactionnelles.
- **Plateforme d'administration (Console Admin)** : comptes d'accès, journal d'audit, et les sections techniques du § 8.9. **Réservée à l'Admin.**

### 8.2 Profils
| Profil | Portée | Rôle |
|---|---|---|
| ADMIN | Toute l'application | Gère les comptes et consulte le journal d'audit. **Lecture seule** sur toutes les données métier. |
| PMO | Toute l'application | Tous les droits sur le référentiel (utilisateurs du référentiel compris) et sur le transactionnel. |
| RESPONSABLE | Un chantier | Tous les droits sur le transactionnel de son chantier. |
| LECTEUR | Un chantier | Lecture du transactionnel de son chantier. |

L'ancien « Contributeur » s'appelle désormais **Lecteur** partout. Les anciennes permissions PM, CONTRIBUTOR et READER n'existent plus.

### 8.3 Table des habilitations
`Habilitation { id, projectId, personId | accountId, profile (ADMIN | PMO | RESPONSABLE | LECTEUR), wsId? }` — `wsId` vide pour ADMIN et PMO, obligatoire pour RESPONSABLE et LECTEUR. Un utilisateur peut avoir plusieurs lignes (RG3). Jeu de démonstration : `rise-data.js › habilitations` (41 lignes). Elle est **distincte** des affectations métier (`Assignment`, rôles datés du § 6.1).

- ADMIN et PMO : attribués par l'Admin dans la console.
- RESPONSABLE et LECTEUR : attribués par le PMO dans le Référentiel ; pour un compte externe, par l'Admin (§ 8.7).

### 8.4 Droits effectifs (RG5)
Pour chaque espace, catégorie de données et chantier : **le droit le plus fort** parmi tous les profils de l'utilisateur. Ordre : Aucun < Lecture < Lecture + Création + Modification + Suppression. L'accès à la console n'est donné que par ADMIN. Calcul **côté serveur uniquement** ; `GET /api/me` renvoie le résultat (`global[]`, `responsable[]`, `lecteur[]`, `rights`) pour que le frontend masque les actions (RG10).

Exemples : PMO + Responsable A = PMO partout · PMO + Admin = tout le métier + console · Admin + Responsable A = tout sur le transactionnel de A, lecture ailleurs, console · Responsable A + Lecteur B = tout sur A, lecture sur B.

### 8.5 Matrice par profil
| Profil | Référentiel | Transactionnel | Console (comptes) | Journal d'audit |
|---|---|---|---|---|
| ADMIN | Lecture | Lecture, tous chantiers | Tout | Lecture |
| PMO | Tout | Tout, tous chantiers | Aucun | Aucun |
| RESPONSABLE | Lecture des valeurs utiles* | Tout, ses chantiers | Aucun | Aucun |
| LECTEUR | Lecture des valeurs utiles* | Lecture, ses chantiers | Aucun | Aucun |

\* L'onglet **Référentiel** est masqué et ses routes d'écriture bloquées (RG7). Les écrans transactionnels affichent les valeurs du référentiel dont ils ont besoin (phases, jalons, personnes, planning, Dispositif, Fiche projet) : exposez-les en lecture via les routes de lecture, jamais via les routes `/referential/*` d'administration.

### 8.6 Rattachement des données
| Donnée | Rattachement | Qui écrit |
|---|---|---|
| Risques, problèmes, actions, décisions, avancement de chantier | `wsId` obligatoire | PMO ; Responsable de ce chantier |
| Baromètre | chantier **C8 « Pilotage et transverse »** | PMO ; Responsable de C8 |
| Séances | instance (pas de chantier) | **PMO et Directeur de programme** (`Project.programDirectorId`, p03 en démo) ; tous consultent |
| Documents, templates, rapports | **aucun** (ce sont des outils) | tout profil **non Lecteur** (PMO, Responsable) ; l'Admin reste en lecture ; tous consultent |
| Budget | module **inactif** | — |
| Tâches manuelles | auteur | l'auteur seul |
| Commentaires | objet commenté | toute personne qui peut lire l'objet |

### 8.7 Dates du planning
- **PMO** : toutes les dates (phases, sous-phases, jalons, livrables, chantiers).
- **Responsable** : les dates et l'avancement **de son chantier** uniquement. Il ne modifie ni les phases, ni les sous-phases, ni les jalons, ni les livrables, même rattachés à son chantier.

### 8.8 Autres règles
- **RG8** : sans profil global, l'utilisateur ne voit que les données de ses chantiers ; listes, recherches, exports et compteurs filtrés. Les outils sans chantier (documents, templates, rapports, séances) sont visibles de tous.
- **RG9** : un Responsable ne crée, modifie ou supprime que sur ses chantiers ; toute donnée qu'il crée est rattachée à l'un d'eux (`422` sinon).
- **RG11-12** : suppression définitive, refusée (`409` + usages) si une donnée y est liée, référentiel compris.
- **RG13-15** : journal d'audit de toutes les créations, modifications et suppressions, **console comprise** : utilisateur, **profil utilisé**, date et heure, action, entité, id, chantier, valeurs avant et après. Ni modifiable ni supprimable. Consultable par l'Admin seul.
- **RG16** : `403` si non autorisé ; `404` pour une ressource hors périmètre dont on ne veut pas révéler l'existence.
- **Jev** agit avec les droits effectifs de l'utilisateur (§ 7.14).

### 8.9 Frontend
`can()`, `prof()`, `topProf()` et `profLabel()` de `RISE Cockpit.dc.html` implémentent ces règles à partir de `habilitations`. Droits : `referentiel` (voir l'onglet : ADMIN, PMO), `referentielEdit` (PMO), `admin`, `sessions`, `editDates`, `edit` (transactionnel). Le frontend ne filtre pas encore les listes par chantier (RG8) : c'est au serveur de le faire.

## 9. API

Base : `/api/projects/{projectId}`. JSON. Toutes les écritures renvoient l'objet complet à jour.

### 9.1 Conventions

- Création : `POST` sans `id` → `201` + objet.
- Modification : `PATCH` partiel, **champ par champ** (le frontend modifie cellule par cellule) → `200` + objet + `warnings[]` éventuels.
- Concurrence : en-tête `If-Match` avec la version de l'objet (`ETag`) → `412` si l'objet a changé.
- Listes : pas de pagination aujourd'hui (le frontend filtre et trie en mémoire). Prévoyez `?limit&cursor` sans l'exiger.
- Format d'erreur unique :
  `{ "code": "VALIDATION_ERROR", "message": "…", "fields": { "phaseId": "obligatoire" }, "usages": [ … ] }`
  `400` validation · `401` non authentifié · `403` droit · `404` absent · `409` conflit (usages, doublon, fiche arbitrée) · `412` version · `422` règle métier (sous-phase hors phase, séance tenue déplacée).

### 9.2 Session et utilisateur
- `GET /api/me` → `{ account, person?, habilitations[], effective: { admin, pmo, responsable[], lecteur[] }, preferences }`
- `GET /api/projects` → projets accessibles
- `PATCH /api/me/preferences` ← `{ dashboardLayout?, theme?, firstName?, city?, photoUrl? }`
- `GET /me/tasks` → tâches calculées + manuelles (§ 7.12)
- `GET | POST | PATCH | DELETE /tasks` (filtrées sur l'auteur)

### 9.3 Chargement initial (compatibilité)
- `GET /bootstrap` → **un objet qui reproduit la forme des exports de `rise-data.js` et `planning-data.js`** (mêmes clés : `today`, `me`, `project`, `people`, `milestones`, `risks`, `issues`, `actions`, `decisions`, `sessions`, `workstreams`, `model`, `phases`, `subphases`, `chantiers`…), construit depuis la base. Il permet de brancher le frontend sans le réécrire (§ 11). Les champs calculés (`confirmedDays`, `late`, `sig`…) y sont renseignés par le serveur.

### 9.4 Référentiel
Même patron pour `clients`, `waves`, `phases`, `subphases`, `workstreams`, `deliverables`, `teams`, `roles`, `persons`, `assignments`, `governance-bodies`, `milestones` :
- `GET /{entité}` · `GET /{entité}/{id}` · `POST /{entité}` · `PATCH /{entité}/{id}` · `DELETE /{entité}/{id}` (`409` + usages)
- `PUT /phases/{id}/waves` ← `{ waveIds[] }`
- `PUT /governance-bodies/{id}/members` ← `{ members: [{ personId, role }] }`
- `PUT /workstreams/{id}/phases` · `/waves` · `/dependencies`
- `GET /project` (avec `today`) · `PATCH /project` (`code` refusé) · `PATCH /project/sections/{key}`
- `GET /signals/owners-without-assignment`
- `POST /referential/import` (multipart, fichier Excel) → rapport d'import (§ 10)
- `POST /milestones` ← `{ n, phaseId, subphaseId?, wsId?, waveId?, owner?, iso, baselineIso? }` → objet avec `code`
- `POST /milestones/{id}/confirm` → `confirmedAt = now`

### 9.5 Pilotage
- `GET | POST | PATCH | DELETE /risks`, `/issues`, `/actions`, `/decisions`
- `PATCH /decisions/{id}/arbitration` ← `{ question?, options?, criteria?, recommendation?, texts? }` (`409` si ARBITRATED)
- `GET /planning` → phases, sous-phases, chantiers avec dates et avancement · `PATCH /planning/{type}/{id}` ← `{ startDate?, endDate?, progressPct? }` (fin ≥ début)
- `GET /deliverables/tracking` · `PATCH /deliverables/{id}` ← `{ prog?, riskOverride?, start?, due? }`
- `GET /workstream-progress` · `PATCH /workstream-progress/{id}`
- `GET /barometer` · `POST /barometer/surveys` · `PATCH /barometer/surveys/{month}` · `POST | PATCH /barometer/domains`
- `GET /budget` · `PATCH /budget/periods/{id}` · `PATCH /budget/program`
- `GET /anomalies` (écarts calculés)

### 9.6 Comités
- `GET /sessions?bodyId=&from=&to=` (bornes de la grille du mois affiché)
- `POST /sessions` ← `{ bodyId, dateIso, time?, place? }` → `number` et `participants` attribués
- `PATCH /sessions/{id}` ← `{ dateIso? | time? | place? | status? | participants? }`
- `POST /sessions/{id}/reports` ← `{ templateId }` → ReportInstance
- `GET | POST | PATCH /report-templates` · `PATCH /report-templates/{id}/active`
- `GET /reports` · `PATCH /reports/{id}` ← `{ status }` · `GET /reports/{id}/file`

### 9.7 Aujourd'hui
- `GET /today` → `{ today, message, nextCommittee, countdown, validations, tasksCount, timeline[], stale[], anomalies[] }`
- `GET /external/weather?city=` · `GET /external/news?country=` : proxy vers Open-Meteo et GDELT, avec cache de 30 minutes.

### 9.8 Base de connaissance
- `GET /documents?type=&q=`
- `POST /documents` (multipart ; .pdf .docx .pptx .xlsx .msg .eml) → `ext = PENDING`, extraction asynchrone (file de traitement bouchon)
- `GET /documents/{id}/file` · `PUT /documents/{id}/links`

### 9.9 Commentaires et historique
- `GET /comments?entityType=&entityId=` · `POST /comments` ← `{ entityType, entityId, field, text }` · `PATCH /comments/{id}` ← `{ resolved }`
- `GET /audit?entityType=&entityId=&field=`

### 9.10 Jev
- `POST /assistant/messages` ← `{ context: { space, tab, block?, rowId? }, text, fileIds[] }` → `{ reply, sources[], proposedChanges[] }`
- `POST /assistant/changes/{id}/confirm` · `POST /assistant/changes/{id}/reject`
- `POST /assistant/files` (multipart) → `{ id, status }`

---

### 9.11 Console Admin (ADMIN uniquement, préfixe `/api/admin`)
- Comptes : `GET | POST /accounts` (invitation) · `PATCH /accounts/{id}` ← `{ status }` (activer, suspendre) · `DELETE /accounts/{id}` (RG12)
- Profils globaux : `PUT /accounts/{id}/global-profiles` ← `{ projectId, profiles: [ADMIN | PMO] }` · Lecteurs externes : `PUT /accounts/{id}/reader-scopes` ← `{ projectId, wsIds[] }`
- Administrateurs : niveaux super-administrateur / administrateur (gestion des admins et des clés API réservée au super-administrateur)
- Journal d'audit : `GET /audit?projectId=&entityType=&actor=&from=&to=` (lecture seule, conservé 24 mois)
- IA : `GET | POST | PATCH /ai/providers` (clé chiffrée, jamais renvoyée en clair ; `POST /ai/providers/{id}/test`) · `GET | PATCH /ai/models` · `GET | PUT /ai/assignments` (modèle principal et de secours par fonction : insights, gestion des données, documents) · `GET /ai/usage?from=&to=&by=` · `GET | PUT /ai/budgets`
- Snapshots : `GET /projects/{id}/snapshots` · `POST` (manuel) · planification · `GET /snapshots/compare?a=&b=` · export. **Pas de restauration.**
- Notifications et alertes : `GET | POST | PATCH /notification-rules` ; règles d'alerte alignées sur le § 7 (risque critique = p × i ≥ 20 ; jalon dont `iso < today` non confirmé ; seuils 7 / 14 j) · historique des envois
- Modules : `GET | PATCH /modules` (activation globale ou par projet) · demandes d'activation : `GET /module-requests`, `POST` depuis le Cockpit

La matrice « Droits et habilitations » à 5 niveaux de la console est **supprimée** : elle est remplacée par le § 8.

## 10. Import du fichier Excel d'initialisation

`Referentiel RISE - initialisation.xlsx` contient 13 onglets de saisie, à importer **dans l'ordre** : 01 Équipes, 02 Rôles, 03 Personnes, 04 Affectations, 05 Projet (formulaire, colonne D), 06 Lots, 07 Phases, 08 Sous-phases, 09 Chantiers, 10 Instances, 11 Membres, 12 Jalons, 13 Livrables. Les données commencent **ligne 9**, colonne B ; la ligne 8 porte les en-têtes, la ligne 7 le type (OBLIGATOIRE, FACULTATIF, CALCULÉ, CONTRÔLE).

Règles :
- ignorer les colonnes CALCULÉ et CONTRÔLE (le serveur recalcule) ;
- une ligne est lue dès qu'une de ses cellules de saisie est remplie ;
- les références entre onglets se font par **libellé** : nom de l'équipe, nom complet de la personne, clé « 5 · Deploy » pour une phase, « 5.3 · Répétition générale » pour une sous-phase, « Lot 1 », nom du chantier, nom de l'instance. Les résoudre en ids ;
- libellés français des listes → codes d'enum (Prévue → PLANNED, Mensuelle → MONTHLY, Président → CHAIR…) ;
- couleurs d'instance nommées → hex : Marine #10233A, Sarcelle #1D8F86, Bleu #3B7DD8, Ambre #E39A2D, Rouge #C2473B, Violet #B25FC4, Olive #6B8E23, Gris #8A9AA6 ;
- la colonne « Permission » de l'onglet 03 Personnes est **obsolète** : l'ignorer. Les habilitations RESPONSABLE et LECTEUR se déduisent des responsables de chantier (09 Chantiers) ; ADMIN et PMO sont attribués dans la console. Le fichier Excel sera mis à jour en conséquence ;
- mode **simulation** (`?dryRun=true`) puis mode réel, **transactionnel** (tout ou rien) ;
- réponse : `{ created: {entité: n}, errors: [{ sheet, row, column, message }], warnings: [...] }` ;
- appliquer les mêmes validations que l'API ; `origin = IMPORT` dans l'historique.

---

## 11. Branchement du frontend

Modifications minimales et localisées de `RISE Cockpit.dc.html` :

1. Créer `api.js` (module ES) qui centralise les appels (`get`, `post`, `patch`, `del`), l'en-tête d'authentification et la gestion d'erreur.
2. Dans `componentDidMount`, remplacer `import('./rise-data.js')` et `import('./planning-data.js')` par `GET /bootstrap`, en gardant la même forme de données.
3. À chaque endroit où une modification est écrite dans l'état (`ed`, `sesEd`, `refValues`, formulaires `tfSubmit`, `addVals`, `msVals`, `sesVals`…), appeler l'endpoint correspondant, puis mettre à jour l'état avec la réponse du serveur.
4. Afficher les erreurs de l'API dans les toasts existants et les `warnings[]` en orange, comme aujourd'hui.
5. Remplacer les blocs `// SIMULÉ` par les appels réels.
6. Remplacer les clés `localStorage` par `PATCH /api/me/preferences` et `/comments`.

Ne modifiez ni le design, ni les textes, ni `support.js`.

---

## 12. Écarts connus dans le jeu de démonstration

À corriger à l'amorçage, sans modifier le frontend :

- `project.healthOverride.value` indique « Go-Live 1er décembre maintenu », contredit par le report acté au 01/04/2027 (D-007). Supprimer ce forçage ou le mettre à jour.
- `project.integrator = "AMC Corp"` (le client) : l'intégrateur est l'équipe Codilog.
- `model.PERSON.cells` et `model.TEAM.cells` ont encore une colonne « société » : l'ignorer (société = équipe, § 6.1).
- Dates en libellé (`due: "27 août"`, `opened`, `target: "COPIL 26 sept."`, `documents.date`) : l'année est 2026 ; « COPIL <date> » désigne la séance du COPIL à cette date → `targetSessionId`.
- `actions.prio` (Haute, Moyenne, Basse), `actions.source`, `issues.origin`, `risks.ws` (libellé) : convertir en codes et en clés étrangères.
- `riskStats`, `volets`, `weekWins`, `referential.*`, `raci` : données de présentation. Les recalculer quand une règle existe, sinon les servir telles quelles depuis une table de contenu.

Toute autre contradiction trouvée : **ne pas choisir en silence**, la lister dans le rapport final (§ 14).

---

## 13. Plan de travail et critères d'acceptation

Procédez par étapes. Chaque étape se termine par des tests verts.

1. **Socle** : projet, configuration, base, migrations, authentification, format d'erreur, historique générique, OpenAPI.
2. **Référentiel** : entités, validations, suppression avec usages, droits. *Test : supprimer une phase utilisée → `409` avec la liste des usages.*
3. **Amorçage** : chargement de `rise-data.js` et `planning-data.js`. *Test : `GET /bootstrap` renvoie les mêmes clés et les mêmes cardinalités que les modules (9 jalons, 6 risques, 47 séances, 107 livrables, 38 personnes…).*
4. **Jalons** : *création sans phase → `400` ; sous-phase d'une autre phase → `422` ; code attribué J10 ; date hors phase → `200` avec avertissement.*
5. **Pilotage** : risques, problèmes, actions, décisions, planning, livrables, baromètre, budget. *Fiche D-007 (ARBITRATED) modifiée → `409` ; action échue → `late = true`.*
6. **Comités** : *nouvelle séance du COPIL → n°21 ; déplacer une séance HELD → `422` ; modifier le lieu → entrée d'historique.*
7. **Habilitations** : *un Lecteur ne voit pas le Référentiel (`403`) ; un Admin qui modifie un risque → `403` (RG6) ; le Responsable de C5 modifie un risque de C5 (`200`) mais pas de C3 (`403`) ; il modifie les dates de C5 (`200`) mais pas celles d'un jalon de C5 (`403`) ; le Directeur de programme crée une séance (`200`), un Responsable non (`403`) ; un Lecteur de C3 ne reçoit pas les risques de C1 dans `GET /risks` (RG8) ; un Admin + Responsable A modifie A et lit le reste (RG5) ; toute écriture de la console apparaît dans le journal avec le profil utilisé.*
8. **Aujourd'hui et Mes tâches** : *avec `today = 2026-09-26`, les compteurs correspondent à ceux affichés par le frontend actuel.*
9. **Import Excel** : *fichier vide → erreurs sur les champs obligatoires ; `dryRun` n'écrit rien ; une erreur annule tout l'import.*
10. **Documents, commentaires, Jev** (bouchon), proxy météo et actualités.
11. **Branchement du frontend** : *tous les écrans s'affichent comme avant ; une modification survit au rechargement.*

Test de non-régression visuelle : comparer chaque écran du frontend avant et après branchement, avec les mêmes données.

---

## 14. Règles de conduite

- **Ne devinez pas.** Si une règle manque ou se contredit, choisissez l'option la plus prudente, isolez-la derrière une constante nommée et listez-la dans `DECISIONS.md` avec la question à poser.
- Ne créez pas de fonctionnalité absente du frontend.
- Ne renommez pas les champs attendus par le frontend.
- Gardez les règles de calcul dans un module de domaine unique, testé unitairement, et non dans les contrôleurs.
- Fin de chaque étape : court rapport (fait, tests, écarts trouvés, questions ouvertes).

Livrables finaux : code source, migrations, script d'amorçage, `openapi.json`, `README.md` (installation, variables d'environnement, lancement, tests), `DECISIONS.md`, `api.js` et le frontend branché.
