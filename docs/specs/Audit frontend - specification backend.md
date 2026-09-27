# RISE Cockpit — Audit du frontend avant spécification backend

Périmètre : `RISE Cockpit.dc.html` (template + classe logique), `rise-data.js`, `planning-data.js`.
Les fichiers `* - variantes`, `* - mockups`, `RISE Cockpit - export/standalone` et `RISE Cockpit.html` sont des artefacts d'itération : **à exclure du paquet transmis au LLM**.

Constat général : le frontend n'a **aucune couche API**. Toutes les données viennent de deux modules JS statiques, toutes les écritures vont dans `this.state` (perdues au rechargement), sauf trois clés `localStorage`. Le frontend décrit donc des écrans et des interactions, pas un contrat. Le data model de `rise-data.js` est en partie un modèle de *présentation* (tableaux `cells[]` positionnels) retravaillé par des scripts de transformation en fin de fichier.


## 0. État après corrections

Les points **bloquants (B1 à B8)**, **majeurs (M1 à M12)** et **mineurs** ont été traités dans `RISE Cockpit.dc.html`, `rise-data.js` et `planning-data.js`. Les sections 1 à 7 ci-dessous décrivent l'état d'origine ; cette section fait foi.

### Décisions arrêtées
- **Référentiel ≠ data model.** Référentiel (master data, créé à l'initialisation, géré par le PMO) : Lots, Phases, Sous-phases, Chantiers, Jalons, Équipes, Rôles, Personnes, Instances de pilotage, Livrables. Données transactionnelles : Risques, Problèmes, Actions, Décisions, Séances, Rapports, Baromètre, Budget, Templates, Documents, Commentaires, Historique.
- **Droits.** Rôles : ADMIN, PMO, PM, CONTRIBUTOR, READER. Le PMO crée, modifie et supprime le référentiel. L'Admin fait tout ce que fait le PMO, et en plus : modules, comptes et permissions, initialisation du référentiel, paramètres du projet. L'onglet Référentiel est **masqué** pour les autres rôles. Les dates des phases, sous-phases, chantiers et jalons sont modifiables dans Pilotage par le **responsable de l'objet** ou le PMO. Règle codée dans `can()`.
- **Utilisateur connecté.** `me` = p01 Robin Lefèvre, PMO (`rise-data.js › me`). Toutes les écritures sont tracées à son nom.
- **Planning.** Le Référentiel fait foi. Deploy : 01/02/2026 → 01/11/2026. Run : 01/11/2026 → 30/06/2027. Hypercare (5.5) est ramené au 01/11/2026. `planning-data.js` est aligné, avec les mêmes identifiants.
- **Chantiers.** C1 à C8, dont C8 « Pilotage et transverse » (responsable p03). Les risques, problèmes, jalons, décisions et livrables pointent vers un chantier par `wsId` / `workstreamId`. Le bloc d'avancement à 8 lignes est conservé, chaque ligne étant rattachée à un chantier (`wsId`).
- **Décisions.** Une seule entité `Decision`, dont la fiche d'arbitrage est le contenu détaillé. Identifiants D-001 à D-010 dans l'ordre de création. Statuts : DRAFT, IN_REVIEW, TO_ARBITRATE, ARBITRATED, CANCELLED, SUPERSEDED (libellés Brouillon, En instruction, À arbitrer, Arbitrée, Annulée, Remplacée).
- **Actions.** Statuts : OPEN, IN_PROGRESS, BLOCKED, DONE (« Bloquée » conservé).
- **Risques.** Les références orphelines (R06, R08, R09) sont supprimées. Les compteurs sont calculés sur les risques existants.
- **Suppression.** Interdite si l'objet est utilisé ailleurs, avec un message listant les usages ; sinon définitive. Règles dans `refUsage()`.
- **Date de référence.** Le jeu de données est recalé au 26 sept. 2026 : les données transactionnelles sont décalées d'un mois, le référentiel reste inchangé. Les dates prévues des jalons sont décalées, pas leur baseline. Prochain COPIL : n°20 le 26 sept. 2026. Prévision Go-Live : 1er avr. 2027.
- **Instances = comités.** Une 6e instance « Comité sponsors » est ajoutée. Chaque réunion datée est une **séance** (donnée transactionnelle) : numérotation automatique par instance, participants = membres de l'instance par défaut. Les templates de rapport sont rattachés à une instance (`bodyId`).
- **Nouvel onglet Pilotage › Comités** (après Baromètre) : liste chronologique groupée par instance, prochaine séance mise en avant, filtres À venir / Passées / Toutes. Le PMO planifie, marque tenue ou annule. « Générer un rapport » part d'une séance.
- **Jalons** : nouvel objet du Référentiel ; l'onglet Pilotage › Jalons reste l'écran de suivi.
- **Écran Aujourd'hui** calculé : message d'accueil (prochain COPIL, validations = décisions « À arbitrer », tâches = actions ouvertes de `me`), échéances et écarts.
- **Noms** : personnes fictives distinctes, emails `prenom.nom@example.com`.

### Corrections sans impact visible
- **B1** : livrables avec `start`, `due`, `prog` et `riskOverride` réels ; le calcul par hash est supprimé.
- **B2** : clés étrangères explicites (`phaseId`, `waveIds`, `subphaseId`, `workstreamId`, `ownerId`, `teamId`, `bodyId`, `wsId`).
- **B7** : personnes et affectations figées en données sources ; scripts de dérivation supprimés.
- **M6** : champs `*Iso` en ISO 8601 ; les champs texte (`planned`, `due`) ne sont que des libellés.
- **M7** : l'écart d'un jalon est calculé (`iso − baselineIso`) ; le `gap` stocké est supprimé.
- **Mineurs** : code mort retiré. Parties simulées marquées `// SIMULÉ` dans le code, avec l'opération backend cible : Jev, dépôt et téléchargement de documents, météo et actualités.

### Ajouts au data model (§ 2)
- **Me** — `personId`, `firstName`, `lastName`, `permission`
- **Session (Séance)** — `id`, `bodyId →GovernanceBody`, `number` (auto par instance), `dateIso`, `time`, `place`, `status` (PLANNED|HELD|CANCELLED), `participants[] →Person`, `reportId? →ReportInstance`
- **ReportInstance** — ajoute `sessionId →Session`, `validator →Person`
- **Milestone** — `baselineIso`, `iso`, `waveId`, `wsId`, `owner`, `confirmedDays`
- **Decision** — `id`, `t`, `p`, `status`, `crIso`, `ddIso`, `wsId`, `bodyId`, `decL`, `maker`, `impact`, `supersedes`, `full`, `opt`, `expectedSessionId`
- **GovernanceBody** — ajoute `frequency` (WEEKLY|BIWEEKLY|MONTHLY|ON_DEMAND)
- **ReportTemplate** — ajoute `bodyId`

### Opérations ajoutées (§ 3)
- `GET /sessions?bodyId=&from=&to=` · `POST /sessions` ← `{ bodyId, dateIso, time, place }` → numéro attribué par le serveur · `PATCH /sessions/{id}` ← `{ status | dateIso | time | place | participants }` (PMO/Admin)
- `POST /sessions/{id}/reports` ← `{ templateId }` → ReportInstance rattachée à la séance
- `GET|POST|PATCH|DELETE /milestones` : création et suppression PMO/Admin ; `PATCH iso` autorisé au responsable du jalon
- `DELETE /{entity}/{id}` → `409` avec la liste des usages (même règle que `refUsage()`)
- `GET /today` → `{ message, nextCommittee, validations, tasks, timeline[], stale[] }` (règles de `todayMsg`, `todayTimeline`, `todayStale`)

### Reste ouvert
- **Mes tâches** (Pilotage) et les textes de la fiche d'arbitrage D-007 sont encore rédigés en dur : dates recalées à la main, mais non calculés.
- **Q4** : affectations datées (`PROJECT_ASSIGNMENT`, non affichées). Les garder ou les supprimer ?
- **Q8** : seuils des signaux. « Non confirmé » est fixé à 7 jours dans Écarts et à 14 jours pour « À revoir » dans Échéances. Valeurs à confirmer.
- **Q12** : périmètre réel de Jev.

## 0 bis. Audit complémentaire — itération du 26/09/2026

Périmètre : ce qui a changé depuis la section 0 (Jalons au Référentiel, écran Comités en calendrier, formulaire « Saisir sans Jev » des séances, infobulles). Les numéros **N1…** complètent ceux des sections 1 à 7.

### Incohérences, par gravité

**Bloquant**

| # | Constat | Emplacement | Correction proposée |
|---|---|---|---|
| N1 | **Deux formulaires de création de jalon aux règles différentes.** Au Référentiel, la phase est obligatoire, la sous-phase et le chantier facultatifs, et le numéro vaut max+1. Dans Pilotage › Jalons (`openTaskForm('jalon')`), il n'y a ni phase ni sous-phase, le chantier est enregistré par son **nom** (`ws`) et non par `wsId`, et l'id vaut `'J' + (nb + 1)`, ce qui peut entrer en collision. | `addVals` (FD.MILESTONE) · `tfSubmit` branche `K === 'jalon'` | Une seule règle serveur : `POST /milestones` exige `phaseId` ; `subphaseId`, `wsId` et `waveId` sont facultatifs ; le numéro est attribué par le serveur. Ajouter Phase et Sous-phase au formulaire de Pilotage et y enregistrer `wsId`. |
| N2 | **Données de jalons contradictoires.** J08 « Go-Live Lot 1 » est prévu le 01/04/2027 alors que la sous-phase 5.4 Cutover / Go-live et la phase Deploy finissent au 01/11/2026. J09 « Démarrage Hypercare » (01/01/2027) tombe avant le Go-Live, et la décision D-007 (report ou non) n'est pas tranchée. | `rise-data.js` › `milestones` J08, J09 | Choisir un scénario : J08 le 01/11/2026 et J09 juste après si le Go-Live est maintenu, ou recaler 5.4, 5.5 et Run si le report est acté. |
| N3 | **Deux stockages pour la modification d'un jalon.** Le Référentiel écrit dans `state.ed['ms:<id>']`, le magasin des modifications de Pilotage. `mergedData` lit aussi `refValues['MILESTONE/<id>']`, héritage de la grille générique, qui n'est plus alimenté. | `msVals.put` · `mergedData` (RV MILESTONE) | Une seule opération : `PATCH /milestones/{id}`. Supprimer la lecture de `refValues['MILESTONE/…']`. |

**Majeur**

| # | Constat | Emplacement | Correction proposée |
|---|---|---|---|
| N4 | **Numéro de jalon modifiable par l'utilisateur**, et utilisé comme `id` (« J10 »). Le numéro de séance, lui, est attribué par le serveur. | `addVals` (`addCode` modifiable) | Séparer `id` (technique) et `code` (affiché, unique par projet). Décider si `code` reste modifiable (Q-N1). |
| N5 | **Cohérence phase ↔ sous-phase non contrôlée à l'enregistrement.** Le formulaire filtre les sous-phases de la phase choisie, mais rien ne vérifie la paire ensuite. La correspondance passe par le **nom** de phase (`subphase.cells[1] === phase.cells[1]`) et non par `phaseId`. | FD.MILESTONE (`sp`) | Validation serveur : `subphase.phaseId = milestone.phaseId`. Faire la correspondance par `phaseId`. |
| N6 | **Audit incomplet sur les séances.** Déplacement, date, statut et « Confirmer » passent par `set()`, qui écrit une entrée d'audit. L'heure et le lieu écrivent directement dans `sesEd`, sans audit (seul un toast s'affiche). | `sesVals` › `selList.setTime / setPlace` | Tout passe par `PATCH /sessions/{id}`, avec audit côté serveur. En front, envoyer la valeur à la perte de focus via `set()`. |
| N7 | **Déplacement d'une séance sans règle de statut.** Une séance Tenue peut être glissée vers une date future, une séance Annulée peut être déplacée, et le numéro reste le même : n°21 peut se retrouver avant n°20. | `sesVals` › `cells.drop` | Règle à trancher (Q-N2) : déplacement réservé aux séances PLANNED, ou renumérotation. Le serveur refuse HELD + date future (`422`). |
| N8 | **« À confirmer » est un état calculé, pas un statut.** Il vaut `status = PLANNED` et `dateIso ≤ aujourd'hui`. L'écran l'affiche comme un statut (contour orange, bouton Confirmer). | `sesVals` (`toConf`) · `Comites - mockups` | Le documenter en règle de calcul (voir plus bas). Ne pas créer de valeur d'enum. |
| N9 | **Droit d'édition des séances = droit Référentiel.** Seuls PMO et Admin peuvent déplacer, modifier ou confirmer (`can('referentiel')`). Or les séances sont des données transactionnelles. | `sesVals` (`canEdit`) | Créer un droit distinct `sessions.edit` (Q-N3). |
| N10 | **Aucun contrôle de droits sur l'écran Jalons du Référentiel.** Nom, date, suppression et ajout sont possibles sans appeler `can()`. La règle `editDates` (responsable ou PMO) n'y est pas appliquée. | `msVals` | Appliquer `can('referentiel')` à l'ajout, la suppression et le nom, et `can('editDates', jalon)` à la date. |
| N11 | **Attributs d'instance codés en dur.** Couleurs et noms courts (COPIL, COPROJ…) dépendent des ids `g1…g6`. Une nouvelle instance s'affiche en gris, sans nom court. | `sesVals` (`COL`, `SH`), `short()` | Ajouter `GovernanceBody.shortName` et `GovernanceBody.color` au Référentiel. |

**Mineur**

| # | Constat | Emplacement | Correction |
|---|---|---|---|
| N12 | Deux champs pour la date de référence d'un jalon : `baselineIso` (stocké) et `refIso` (calculé ou modifié). | `rise-data.js`, `mergedData` | Garder `baselineIso` seul. |
| N13 | Légende Jalons (vert / noir / gris) écrite en dur dans le template. | Référentiel › Jalons | Aucun impact backend : c'est l'état calculé `past / next / upcoming` (voir plus bas). |
| N14 | Le formulaire de séance intégré à la carte Comités est supprimé ; le bouton qui l'ouvrait (`sesAddOpen`, `addTog`, `bodyOpts`…) subsiste dans `sesVals` sans être utilisé. | `sesVals` | Retirer ce code mort. |
| N15 | Les infobulles convertissent `title` en `data-tip` à l'exécution. Ce n'est qu'un comportement d'interface, mais certains textes énoncent des règles (« Numéro proposé automatiquement · modifiable »). | `tipInit`, attributs `title` | Aucun endpoint. Aligner ces textes sur les règles arrêtées (N4). |
| N16 | Fichiers de maquette dans le projet, avec des données périmées (« M. XYZ », D-021) : `Referentiel Jalons - mockups`, `Comites - mockups`, `Tooltips - mockups`, `Planning - variantes`, `RISE Cockpit - export`. `RISE Cockpit.html` (standalone) n'est pas à jour. | racine du projet | Ne transmettre que `RISE Cockpit.dc.html`, `rise-data.js`, `planning-data.js` et cet audit. Régénérer le standalone. |
| N17 | « Aujourd'hui » vient de l'horloge du navigateur (`fToday`, `tdIso`, `new Date()`) alors que le jeu de données est daté du 26/09/2026. | calculs de dates | Le serveur fournit la date de référence du projet (fuseau du projet). |

### Data model — changements

- **Milestone** : `id` (technique), `code` (J01…, attribué par le serveur, figé, unique), `n` (libellé, obligatoire), `phaseId → Phase` (**obligatoire**), `subphaseId? → Subphase` (dont `phaseId` doit être identique), `wsId? → Workstream`, `waveId? → Wave`, `owner? → Person`, `iso` (date prévue, obligatoire), `baselineIso` (date de référence ; par défaut = `iso`), `confirmedAt?`. Relations : Phase 1-N Milestone, Subphase 0..1-N Milestone, Workstream 0..1-N Milestone.
- **GovernanceBody** : `shortName` (ex. COPIL) et `color` (hex), gérés au Référentiel (N11).
- **Droits** : `sessions.edit` = ADMIN, PMO, PM ; `referentiel.edit` = ADMIN, PMO (jalons compris).
- **Session** : inchangée. `participants` = copie des membres de l'instance à la création.

### Règles de calcul ajoutées

| Donnée | Règle |
|---|---|
| Écart de jalon | `iso − baselineIso` en jours ; « conforme » si 0 |
| État d'un jalon (couleur du numéro) | `past` si `iso < aujourd'hui` · `next` = premier jalon avec `iso ≥ aujourd'hui` · `upcoming` sinon |
| Regroupement mensuel des jalons | clé = `iso[0..7]`, mois triés, jalons triés par `iso` puis `code` |
| Séance « à confirmer » | `status = PLANNED` et `dateIso ≤ aujourd'hui` |
| Numéro de séance | `max(number)` de l'instance + 1, attribué à la création, conservé si la date change |

### Opérations — changements

- `POST /milestones` ← `{ n, phaseId, subphaseId?, wsId?, waveId?, owner?, iso, baselineIso? }` → Milestone avec `code`. `400` si phase absente ou date invalide ; `422` si la sous-phase n'appartient pas à la phase ; `409` si le libellé existe déjà.
- `PATCH /milestones/{id}` ← `{ n? | iso? | baselineIso? | phaseId? | subphaseId? | wsId? | waveId? | owner? }`. Droit : `editDates` pour `iso`, Référentiel pour le reste.
- `DELETE /milestones/{id}` → `409` avec la liste des usages (livrables, actions, documents liés), comme `refUsage`.
- `POST /sessions` ← `{ bodyId, dateIso, time?, place? }` → `number` et `participants` attribués par le serveur.
- `PATCH /sessions/{id}` ← `{ dateIso? | time? | place? | status? }` : déplacement par glisser-déposer, modification dans le panneau, Confirmer (`status = HELD`), Annuler. `422` si la règle Q-N2 n'est pas respectée.
- `GET /sessions?from=&to=` : calendrier du mois (les bornes sont celles de la grille affichée).

### Questions ouvertes

- **Q-N1** : le numéro de jalon (`code`) est-il attribué par le serveur et figé, ou modifiable comme aujourd'hui ?
- **Q-N2** : peut-on déplacer une séance Tenue ou Annulée ? Si une séance change de date, les numéros de l'instance sont-ils recalculés dans l'ordre chronologique ?
- **Q-N3** : qui peut planifier, déplacer et confirmer une séance : PMO/Admin seulement, ou aussi le PM et le secrétaire de l'instance ?
- **Q-N4** : quel scénario Go-Live retenir pour recaler J08 et J09 (N2) ?
- **Q-N5** : la phase obligatoire d'un jalon doit-elle contenir la date prévue du jalon (`iso` dans la période de la phase) ?


### Décisions du 26/09/2026 et corrections appliquées

| Point | Décision | Correction dans le code |
|---|---|---|
| N1 | Création de jalon alignée sur le Référentiel | Formulaire Pilotage › Jalons : Phase * (obligatoire), Sous-phase (filtrée par `phaseId`), Chantier stocké par `wsId`. Enregistrement refusé sans phase. |
| N2 / Q-N4 | Report acté au 01/04/2027 | D-007 = ARBITRATED le 26/09 (option B), COPIL n°20 = HELD. J06 Go/No-Go 15/03/2027, J07 Dry Run 05/03/2027, J08 Go-Live 01/04/2027, J09 Hypercare 02/04/2027. 5.2 et 5.3 jusqu'à 03/2027, 5.4 le 01/04/2027, 5.5 du 01/04 au 30/06/2027, Deploy jusqu'au 30/06/2027, Run du 01/07/2027 au 30/06/2028 (sous-phases 6.x et livrables décalés), Lot 1 jusqu'au 30/06/2027, `projectEnd` = 2028-06-30. Textes Jev, tuile IA, compte à rebours et fiche D-007 mis à jour. La référence reste la v4 (01/11/2026) : écart J08 = +151 j. |
| N3 | Un seul stockage | La lecture de `refValues['MILESTONE/…']` est supprimée ; toute modification passe par `ed['ms:<id>']` (= `PATCH /milestones/{id}`). |
| N4 / Q-N1 | `id` technique distinct du `code` ; code attribué par le serveur et figé | Champ `code` ajouté aux jalons (J01…J09). Nouveaux jalons : `id = ms-<…>`, `code = max + 1`. Le N° est en lecture seule dans le formulaire. Les ids des données de démonstration valent encore leur code, uniquement pour la lisibilité. |
| N5 | La sous-phase doit appartenir à la phase | Filtre et contrôle par `subphase.phaseId` dans les deux formulaires ; erreur sinon. |
| Q-N5 | Avertissement non bloquant | Message orange si la date prévue sort de la période de la phase ; l'enregistrement reste possible. |
| N6 | Tous les champs sont tracés | L'heure et le lieu d'une séance créent une entrée d'audit à la perte de focus, comme la date et le statut. |
| N7 / Q-N2 | Seules les séances Planifiées se déplacent ; le numéro est conservé | Glisser-déposer et champ Date désactivés pour les statuts HELD et CANCELLED ; refus avec message au dépôt. |
| N8 | Décidé par défaut : état calculé | « À confirmer » = `PLANNED` et `dateIso ≤ aujourd'hui` ; pas de valeur d'enum. |
| N9 / Q-N3 | PMO, Admin et PM | Nouveau droit `can('sessions')` = ADMIN, PMO, PM : planifier, déplacer, modifier, confirmer. |
| N10 | Tout réservé à PMO/Admin | Référentiel › Jalons : ajout, libellé, date et suppression soumis à `can('referentiel')`. La règle `editDates` (responsable du jalon) ne s'applique pas au Référentiel. |
| N11 | Champs du Référentiel | `GovernanceBody.shortName` et `GovernanceBody.color` ajoutés aux données, modifiables sur la carte de l'instance (pastille de couleur, nom court). Calendrier, infobulles et libellés « COPIL n°20 » les utilisent. |

**Restent ouverts** : N12 à N17 (mineurs) ; rebaseline v5 après le report (la référence reste la v4 tant qu'elle n'est pas décidée) ; la fiche d'arbitrage D-007 conserve ses textes d'instruction (options, critères) ; le standalone `RISE Cockpit.html` est à régénérer.


### Arbitrages finaux (26/09/2026)

| Sujet | Décision | Appliqué |
|---|---|---|
| Référence après report | **v5 au 01/04/2027**, approuvée au COPIL n°20 ; périmètre : jalons, phases, sous-phases et chantiers recalés | `project.baseline` = v5 (`previous` = v4) ; `baselineIso = iso` pour tous les jalons (écarts à 0) ; historique Go-Live : v5 « Officielle ». |
| Fiche D-007 arbitrée | Lecture seule, avec la décision et la date | Modification refusée (« Fiche arbitrée : lecture seule »). Règle serveur : `PATCH` refusé (`409`) sur une fiche ARBITRATED. |
| Affectations (ex-Q4) | Plusieurs affectations datées par personne, **simultanées autorisées**, visibles dans Équipe | Section « Historique des rôles » (Info projet › Dispositif › Ressources). Fin d'affectation : aucun effet sur les objets portés ; signal « Porteur sans affectation active ». Organigramme et RACI : les rôles s'additionnent. Données : exemples ajoutés pour p06 et p12. |
| Signaux de fraîcheur | 7 j = vigilance, 14 j = alerte, **fixes côté serveur** | Aucun paramètre à exposer. |
| Jev | Propose ; l'utilisateur valide le récapitulatif avant enregistrement ; jamais sur le Référentiel | Récapitulatif « À valider » avec **Valider et enregistrer** / **Refuser** ; rien n'est annoncé comme enregistré avant validation. Opérations : `POST /assistant/changes/{id}/confirm` et `/reject`. |
| Mes tâches | **Calculées + manuelles**, tâches manuelles **privées** | Calculées : actions dont je suis porteur (non terminées), décisions dont je suis décideur (IN_REVIEW, TO_ARBITRATE), jalons dont je suis porteur à moins de 45 j. Manuelles : entité **Task** `{ id, authorId → Person, title, dueIso?, detail?, status: TODO | DONE, link?: { entityType, entityId } }`, visible par son auteur seulement. La liste rédigée en dur est supprimée. |
| N12 | `baselineIso` seul champ stocké | `refIso` n'est plus qu'un alias d'affichage calculé ; les modifications écrivent `baselineIso`. |
| N14 | Code mort retiré | Ancien formulaire de séance supprimé de `sesVals` / `SES0`. |
| N16 | Maquettes supprimées ; standalone plus tard | Fichiers d'essai supprimés. **`RISE Cockpit.html` reste à régénérer.** |
| N17 | Date du jour fournie par le serveur | `rise-data.js › today = "2026-09-26"` ; `fToday()` / `tdIso()` l'utilisent partout (repli horloge locale). Opération : `GET /project` → `today` (fuseau du projet). |

**Opérations ajoutées** : `GET|POST|PATCH|DELETE /tasks` (filtrées sur l'auteur) · `GET /me/tasks` → tâches calculées + manuelles · `GET|POST|PATCH /assignments` ← `{ personId, teamId, projectRole, startDate, endDate? }` (chevauchement autorisé) · `GET /signals/owners-without-assignment`.

**Fichiers à transmettre** : `RISE Cockpit.dc.html`, `rise-data.js`, `planning-data.js`, ce document.


---

## 1. Incohérences et ambiguïtés, par gravité

### Bloquant (le LLM construira un backend faux)

| # | Constat | Emplacement | Correction proposée |
|---|---|---|---|
| B1 | **Avancement des livrables inventé** : `prog`, dates début/fin et statut de chaque livrable sont générés par un hash de l'id et une répartition arbitraire dans la sous-phase. Aucune donnée réelle. | `lvItems()` (~l. 2567-2590), fonction `hash()` | Ajouter à DELIVERABLE : `start_date`, `due_date`, `progress_pct`, `status`, `risk_override`. Supprimer le calcul par hash. |
| B2 | **Objets du Référentiel stockés en `cells[]` positionnels** (ex. PHASE `cells[5]` = statut, DELIVERABLE `cells[4]` = « 3.1 Ateliers… »). Les clés étrangères sont des libellés : phase par nom (`'Discover'`), lot par `'Lot 1'`, sous-phase par préfixe de chaîne `split(' ')[0]`, chantier par nom. | `rise-data.js` `model.*`, `lvItems`, WBS (~l. 3326-3332), Livrables (~l. 3548) | Remplacer par des objets nommés avec ids : `phase_id`, `wave_id`, `subphase_id`, `workstream_id`. |
| B3 | **Deux sources concurrentes pour Phases / Sous-phases / Chantiers** avec des valeurs divergentes : `model.PHASE` (Deploy fin 01/11/2026, Run début 01/11/2026) vs `planning-data.js` (Deploy fin 2027-01-31, Run 2027-01-01). Chantiers : ids `s1…s7` vs `C1…C7`, responsable Ventes/CRM `M. XYZ (p08)` vs `p14`, phases différentes (Finance `P1…P6` vs `P3 P4 P5`). | `rise-data.js` vs `planning-data.js` | Une seule table par entité. Le Planning lit le Référentiel. |
| B4 | **Trois notions de « chantier » non réconciliées** : `workstreams` (8 lignes d'avancement, libellés « 1 · Design… »), `model.WORKSTREAM` (7 chantiers), et le champ texte libre `ws` des risques/actions/jalons (`'Migration'`, `'Change'`, `'Technique'`, `'Direction'`, `'Supply chain'`…) qui ne correspond à aucun des deux. | `workstreams`, `model.WORKSTREAM`, `MSW`/`ISW` (l. 2333), liste `WS` (l. 2424) | `ws` → `workstream_id` (FK). Décider si « Pilotage » / « Direction » sont des chantiers ou une valeur « transverse ». `workstreams` devient une mesure d'avancement rattachée au chantier. |
| B5 | **Utilisateur connecté codé en dur** : `p01` (« Mes actions », propriétaire par défaut), `'M. XYZ'` dans tous les enregistrements d'audit, prénom `'Robin'` dans le bandeau et les commentaires. p01 ≠ Robin. | `edit()`, `editBm()`, `phSet()`, `openTaskForm()` (`owner: 'p01'`), `SPACES.today`, `cmVals` | Endpoint `GET /me` ; toutes les écritures prennent l'auteur côté serveur. |
| B6 | **Aucun contrôle de rôle** : le Référentiel est décrit « admin uniquement », mais aucun code ne masque l'onglet ni ne bloque l'édition. `people.perm` (PM, PMO, CONTRIBUTOR, READER) n'est lu que pour un libellé de tri. | `SPACES.projet.tabs` (l. 2823), `resKey.perm` (l. 3199) | Définir la matrice de droits (§ 4) et la faire appliquer par le backend ; le frontend masque selon `me.permissions`. |
| B7 | **Personnes générées par script** : `model.PERSON` est construit à partir de `people` + 7 listes de `referential` (governance, sponsors, pilots…) avec un rapprochement par regex et alias ; emails fabriqués (`contact.r07@example.com`) ; équipe remappée (`amoa → Onepoint`, `intégrateur → Codilog`, `client → ECF`). | fin de `rise-data.js` (blocs `{ … }`) | Fournir PERSON comme table source, avec `team_id`, `email`, `active` réels. Supprimer les scripts de dérivation. |
| B8 | **Tous les noms sont « M. XYZ »** (anonymisation) : impossible de distinguer deux personnes à l'écran, et le rapprochement nom → personne (`pn[name]`, `people.find(x => x.name…)`) est ambigu. | partout | Jeu de données avec noms fictifs distincts, ou ids uniquement. |

### Majeur (incohérence de règles ou de données)

| # | Constat | Emplacement | Correction proposée |
|---|---|---|---|
| M1 | **Enums de statut mélangés FR/EN, variables selon l'écran** : actions `OPEN/IN_PROGRESS/DONE` en donnée mais `À faire/En cours/Terminée/Bloquée` en saisie (stockés à part dans `actStatus`), plus `'Ouverte'` dans le filtre ; décisions `DRAFT/APPROVED/SUPERSEDED/WITHDRAWN` vs fiches d'arbitrage `Brouillon/À arbitrer/En instruction/Arbitrée/Annulée` ; risques `OPEN/MITIGATING` ; problèmes `OPEN/RESOLVING` ; phases `Terminée/En cours/Prévue`, lots `En cours/Prévu`. | `rise-data.js`, `mergedData` l. 2336, `acFilter` l. 2542, `STS` l. 2881 | Enums en codes anglais côté API, libellés FR côté front (tableau § 2.3). |
| M2 | **Décision vs fiche d'arbitrage** : deux entités (`decisions` D-xxx, `arbitrations` PD-xx) liées par `dec`. Le formulaire « décision » édite en réalité une fiche PD, et crée des `PD-` ; `faLitDec` transforme `D-021` en `FA-021` (3e préfixe). | `decVals`, `openTaskForm`, création l. 3017 | Trancher : une entité `Decision` avec un statut de cycle de vie, ou deux entités avec FK explicite. Un seul préfixe d'id. |
| M3 | **Références orphelines** : `issues.P02.origin = 'R08'`, `actions.A-49.source = 'R06'`, document « RISK R07 · R09 » : R06, R08, R09 n'existent pas. `riskStats.total = 14` alors que 6 risques sont listés. | `rise-data.js` | Soit compléter les risques, soit calculer les stats. Le backend doit refuser une FK inexistante. |
| M4 | **`source` / `origin` polymorphes** en chaîne libre (`'R01'`, `'P02'`, `'J07'`, `'D-021'`, `null`) : le type est déduit du préfixe. | actions, issues | `source_type` (RISK/ISSUE/MILESTONE/DECISION) + `source_id`. |
| M5 | **Instance d'arbitrage stockée par libellé** (`inst: 'Comité de pilotage'`) alors que le commentaire dit « instance = objet GOVERNANCE_BODY ». | `arbitrations` | `governance_body_id`. |
| M6 | **Formats de date hétérogènes** : ISO, `'19 août'` (année implicite 2026), `'DD/MM/YYYY'`, `'MM/YYYY'`, `'YYYY'`, `'COPIL 26 août'`, `'à planifier'`, `'fin août'`. `toIso()` suppose 2026 par défaut ; `fr()` masque l'année si 2026. | `mergedData` l. 2326-2330, `pd()` l. 2572, `phKey` | API en ISO 8601 uniquement. Échéance « non planifiée » = `null`. Échéance liée à un comité = `committee_id`. |
| M7 | **Données dérivées stockées comme saisies** : `milestones.gap`, `confirmedDays`, `ref` (texte), `actions.late`, `ROLE.personnes`, `TEAM.personnes`, `workstreams.sig`, `volets.s`, `mission.total`. Le front recalcule certaines (gap, late) mais garde la valeur stockée en repli. | `rise-data.js`, `mergedData` | Stocker les sources (dates prévue/référence/confirmation), calculer côté backend (§ 2.4). |
| M8 | **Ids générés côté client** avec risque de collision et de format : `'R' + (15+cnt)`, `'P0' + (4+cnt)` (→ `P010` au 7e), `'A-' + (50+cnt)`, `'PD-' + (17+cnt)`, `'f' + Date.now() + Math.random()`. | création l. 3014-3017, `jevOnFile` l. 2312 | Ids attribués par le serveur ; le front envoie sans id. |
| M9 | **Suppression = masquage local** (`refDeleted['WAVE/w1'] = true`) sans contrôle d'intégrité : supprimer une phase laisse ses sous-phases, livrables et affectations. Pas de notion d'archivage (`active`). | `refDeleted`, `phW()`, `lvItems` | Définir par entité : suppression interdite si référencée, ou `active=false` (soft delete). |
| M10 | **Contradictions de contenu** qui se liront comme des règles : COPIL n°19 du 26 août (`committee`) vs « COPIL n°20 du 26 sept. » (`TXD.dcTitle`) vs baromètre « COPIL n°22 (23/06/2026) » ; D-020 « décalée du 19 sept. » datée 16 sept. alors que J01 = 19 août ; Lot 4 « Hors Europe » (WAVE) vs « Filiales APAC » (`referential.lots`) ; fin de projet 31/12/2030 vs `projectEnd = 2027-06-30` ; Go/No-Go « 4 oct. » vs « COPIL du 31 oct. ». | `rise-data.js`, l. 2287 | Relire le jeu de données ; une seule date par fait. |
| M11 | **Écran Aujourd'hui figé** : `timelineSrc` (échéances), texte « 2 validations, 4 tâches », « COPIL de demain », `copilDays('2026-08-26')` sont écrits en dur au lieu d'être calculés. | l. 2817-2819, l. 3099-3110 | Endpoint `GET /today` qui calcule échéances, compteurs et prochain comité. |
| M12 | **Formulaire unique multi-entités** (`taskForm.kind` ∈ tache, jalon, risque, probleme, action, decision, arbitrage, livrable, avancement, bm*) avec valeurs par défaut implicites (`p:3, i:3, sev:3, ws:'Pilotage', owner:'p01'`). | `openTaskForm` l. 1937, `saveTask` l. 2960-3020 | Un schéma de création par entité (§ 3). |

### Mineur (bruit pour le LLM)

| # | Constat | Emplacement | Correction |
|---|---|---|---|
| m1 | `model.PROJECT_ASSIGNMENT` et `modelGaps` définis, jamais affichés comme objet du Référentiel ; `endDates` n'alimente qu'eux. | `rise-data.js` | Supprimer ou intégrer à PERSON (§ 2.2). |
| m2 | Champs jamais lus : `project.integrator = 'AMC Corp'` (= client), `people.initials` ('XYZ' partout), `model.*.widths/scope/constraints`, `referential.brands` (6 × « Brand X »), `referential.barometer` (doublon de `barometre`). | `rise-data.js` | Supprimer. |
| m3 | Code mort : `componentDidMount2() {}`, `S.cmarks0` dans `(S.cmarks0, S.cmMarks)`, clé `origin: 'saisie'` constante. | l. 1850, l. 2827 | Supprimer. |
| m4 | Appels réseau externes depuis le navigateur (Open-Meteo, GDELT) pour les widgets météo/actualités. | `dbExtLoad` l. 1842-1846 | Proxy backend ou service tiers assumé ; à documenter. |
| m5 | Réponses de Jev simulées par regex (`jevExplain`, `jevReply`), dépôt de fichiers simulé (toast + barre de progression factice), téléchargement qui produit un `.txt`. | l. 2178-2248, `pickFile`, `downloadDoc` | Marquer explicitement comme **mock** ; spécifier les endpoints réels (§ 3.9-3.10). |
| m6 | Libellés techniques résiduels dans les données : `linked: 'RISK R01 → R07'`, `'REPORT_INSTANCE · publié'`, `ext: 'SUCCEEDED/PARTIAL/UNSUPPORTED'`. | `documents` | Remplacer `linked` par une table de liens typés. |
| m7 | Nommage : « Lots » = `WAVE`, « Chantiers » = `WORKSTREAM`, « Instances » = `GOVERNANCE_BODY`, « Vague » dans les templates (`kind: 'Vague'`). | partout | Garder un glossaire FR ↔ nom technique (§ 2.1). |
| m8 | États de chargement / erreur / liste vide : seul `data: null` bloque le rendu ; quelques listes ont un état vide (filtres actions) ; aucun état d'erreur réseau, aucune pagination. | global | Spécifier ces états par écran une fois l'API définie. |

---

## 2. Data model consolidé

### 2.1 Glossaire

| Libellé écran | Entité | Préfixe d'id actuel |
|---|---|---|
| Client | `Client` | c |
| Projet | `Project` | — |
| Lots | `Wave` | w |
| Phases | `Phase` | p / P |
| Sous-phases | `Subphase` | sp / SP |
| Chantiers | `Workstream` | s / C |
| Livrables | `Deliverable` | l |
| Rôles | `ProjectRole` | ro |
| Équipes | `Team` | t |
| Personnes | `Person` | p / r |
| Instances de pilotage | `GovernanceBody` | g |
| Jalons | `Milestone` | J |
| Risques | `Risk` | R |
| Problèmes | `Issue` | P |
| Actions / Mes tâches | `Action` | A- |
| Décisions / Fiches d'arbitrage | `Decision` (+ `Arbitration`?) | D- / PD- |
| Baromètre | `BarometerSurvey`, `BarometerDomain` | — |
| Budget | `MissionPeriod` | — |
| Comité | `Committee` | — |
| Template / Rapport | `ReportTemplate`, `ReportInstance` | T / H |
| Documents | `Document` | — |
| Commentaire de cellule | `CellComment` | — |
| Historique | `AuditEntry` | — |

### 2.2 Entités (champs = ce que le frontend affiche ou saisit)

Conventions : `id` string attribué par le serveur ; dates `date` ISO `YYYY-MM-DD` ; `?` = nullable ; `→` = clé étrangère.

**Client** — `id`, `code`, `name`, `description?`, `status` (ACTIVE|INACTIVE)

**Project** — `id`, `client_id →Client`, `code` (verrouillé après création), `name`, `objectives`, `start_date`, `target_end_date`, `owner_id →Person`, `currency` (ISO 4217), `timezone` (IANA), `city`, `country`, `status`, `baseline_version`, `baseline_date`, `baseline_approved_at`, `baseline_approved_by →Person`, `health_override?` {`value`, `reason` obligatoire, `by →Person`, `at`}
Fiche projet (texte libre éditable) : `identity[]`, `network[]`, `scope[]`, `systems[]`, `contract[]`, `amoa_role[]` → à modéliser en `ProjectSection {key, label, value, order}` ou en champs typés (question ouverte Q6).

**Wave (Lot)** — `id`, `project_id`, `seq` int unique, `name`, `start_date`, `end_date`, `status` (PLANNED|IN_PROGRESS|DONE), `owner_id? →Person`

**Phase** — `id`, `project_id`, `seq`, `code`, `name`, `description`, `start_date`, `end_date?`, `status` (PLANNED|IN_PROGRESS|DONE), `progress_pct` 0-100, `owner_id →Person`, `critical` bool
Relation Phase ↔ Wave : **N-N** (`phase_waves`, éditée par `phSet` avec cases à cocher) — alors que `model.PHASE.cells[2]` porte un seul lot. À trancher (Q3).

**Subphase** — `id`, `phase_id →Phase`, `code` (« 3.1 »), `name`, `description`, `start_date`, `end_date`, `status`, `progress_pct`, `owner_id →Person`, `critical` bool

**Workstream (Chantier)** — `id`, `seq`, `code` (C1…), `name`, `owner_id →Person`, `status`, `start_date`, `end_date`, `progress_pct`, `critical`
Relations : `workstream_phases` N-N, `workstream_waves` N-N, `workstream_dependencies` N-N (auto-référence ; « Tous » = toutes).

**WorkstreamProgress** (bloc Avancement) — `workstream_id`, `label`, `value_pct`, `target_pct`, `detail`, `signal` (calculé, § 2.4)

**Deliverable** — `id`, `name`, `subphase_id →Subphase`, `workstream_id? →Workstream`, `owner_id →Person`, `team_id →Team`, `start_date`, `due_date`, `progress_pct`, `status` (FUTURE|ACTIVE|LATE|VALIDATED — calculable), `risk_override?` (OK|TENSION|CRITICAL)
Phase = dérivée de la sous-phase (ne pas stocker).

**ProjectRole** — `id`, `label`, `order`. Compteur « personnes » calculé.

**Team** — `id`, `company`, `name`, `description?`. Compteur calculé.

**Person** — `id`, `first_name`, `last_name`, `email` unique, `team_id →Team`, `position` (titre), `active` bool, `permission` (ADMIN?|PM|PMO|CONTRIBUTOR|READER), `photo_url?`
Relations : `person_roles` (N-N vers ProjectRole — l'écran affiche plusieurs rôles), `person_workstreams` (N-N).
Affectations datées (`PROJECT_ASSIGNMENT` : début, fin, obligatoire pour les externes) : garder ou supprimer (Q4).

**GovernanceBody (Instance)** — `id`, `label`, `description`, `frequency` (WEEKLY|BIWEEKLY|MONTHLY|ON_DEMAND), `members` N-N →Person

**Milestone (Jalon)** — `id`, `name`, `wave_id →Wave`, `workstream_id?`, `owner_id →Person`, `planned_date`, `baseline_date`, `confirmed_at`

**Risk** — `id`, `title`, `probability` 1-5, `impact` 1-5, `mitigation_plan?`, `owner_id`, `workstream_id`, `due_date?`, `status` (OPEN|MITIGATING|CLOSED)

**Issue (Problème)** — `id`, `title`, `severity` 1-5, `origin_risk_id? →Risk`, `opened_at`, `owner_id`, `workstream_id`, `target_date?`, `target_committee_id?`, `detail`, `status` (OPEN|RESOLVING|RESOLVED)

**Action** — `id`, `title`, `detail?`, `owner_id`, `due_date?`, `status` (TODO|IN_PROGRESS|BLOCKED|DONE), `priority` (HIGH|MEDIUM|LOW), `source_type?`, `source_id?`, `closed_at?`, `cta_label?` (Mes tâches)

**Decision** — `id`, `title`, `priority` 1-4, `status` (enum unique à définir, Q2), `workstream_id`, `governance_body_id`, `created_at`, `decision_date?`, `decision_text?`, `decided_by →Person`, `impact`, `supersedes_id? →Decision`, `recommended_option?`
Fiche d'arbitrage détaillée : `question`, `options[]` {`code`, `label`, `body`}, `criteria[]` {`name`, `weight_pct`, `score_a`, `comment_a`, `score_b`, `comment_b`}, textes éditables (`txtEd`).

**BarometerSurvey** — `month` (YYYY-MM), `overall_score` 0-10, `respondents`, `sentiment` {negative, neutral, positive} (somme normalisée à 100), `questions[]` {`label`, `score`, `delta`}, `themes[]` {`label`, `tone` OK|WATCH|RISK}
**BarometerDomain** — `id`, `name`, `size`, `respondents`, `scores` par mois, `range`

**MissionPeriod (Budget)** — `period_label`, `amoa_keur`, `subcontracting_keur`, `status` (INVOICED|IN_PROGRESS|NEGOTIATION). `total` calculé. `ProgramBudget.known` bool + `reason`.

**Committee** — `id`, `name`, `number`, `date`, `governance_body_id`, `template_id`, `reporting_date`, `capture_at`, `reviewer_id`, `validator_id`

**ReportTemplate** — `id`, `name`, `author_id`, `version`, `description`, `committee_type`, `components[]` {`id` (synthese|planning|jalons|risques|decisions|actions|barometre|dashboard), `scope` (PROJECT|WAVE|WORKSTREAM), `target_id?`}, `pages`, `published_at`, `active`
**ReportInstance** — `id`, `template_id`, `committee_id`, `version`, `status` (DRAFT|IN_REVIEW|PUBLISHED), `generated_at`, `validator_id`, `audience`, `saved` bool

**Document** — `id`, `title`, `type`, `date`, `version`, `confidentiality` (INTERNAL|RESTRICTED), `origin` (UPLOADED|GENERATED), `extraction_status` (PENDING|SUCCEEDED|PARTIAL|UNSUPPORTED), `mime`, `pages?`, `links[]` {`entity_type`, `entity_id`}

**CellComment** — `id`, `cell_key` (actuellement `onglet|libellé ligne|colonne` : **instable**, Q7), `entity_type`, `entity_id`, `field`, `text`, `author_id`, `created_at`

**AuditEntry** — `id`, `entity_type`, `entity_id`, `field`, `old_value`, `new_value`, `author_id`, `at`, `origin` (MANUAL|JEV|IMPORT)

**Anomaly** (Écarts) — calculée, pas stockée (§ 2.4).

**UserPreferences** — `dashboard_layout` (localStorage `rise-db-layout`), `photo` (`rise-prof-photo`), `first_name`, notifications.

### 2.3 Enums à figer

| Enum | Codes | Libellés FR affichés |
|---|---|---|
| ActionStatus | TODO, IN_PROGRESS, BLOCKED, DONE | À faire, En cours, Bloquée, Terminée |
| RiskStatus | OPEN, MITIGATING, CLOSED | Ouvert, En mitigation, Clos |
| IssueStatus | OPEN, RESOLVING, RESOLVED | Ouvert, En résolution, Résolu |
| DecisionStatus | à définir (Q2) | Brouillon, À arbitrer, En instruction, Arbitrée, Annulée / Approuvée, Retirée, Remplacée |
| PhaseStatus / WaveStatus | PLANNED, IN_PROGRESS, DONE | Prévue/Prévu, En cours, Terminée |
| Priority (décision) | 4, 3, 2, 1 | Critique, Haute, Moyenne, Basse |
| Signal | OK, WATCH, RISK, NA | vert, orange, rouge, n/a |
| Permission | ADMIN, PM, PMO, CONTRIBUTOR, READER | Admin, Chef de projet, PMO, Contributeur, Lecteur |

### 2.4 Règles de calcul (à implémenter côté backend)

| Donnée | Règle (telle que codée) |
|---|---|
| Criticité risque | `p × i` ; critique ≥ 20, élevé 12-19, modéré 6-11, faible < 6 |
| Écart jalon (`gap`) | `planned_date − baseline_date` en jours |
| Non confirmé depuis | `today − confirmed_at` en jours ; modifier la date prévue remet `confirmed_at = today` |
| Action échue | `status ≠ DONE` et `due_date < today` |
| Compte à rebours | `J-n` / `J+n` depuis `today` |
| Signal chantier | `value_pct` vs `target_pct` — **seuils non codés**, valeur stockée (Q8) |
| Statut livrable | DONE si `progress = 100` ; LATE si `today > due` ; ACTIVE si `today ≥ start` ou `progress > 0` ; sinon FUTURE |
| Risque livrable auto | LATE → CRITICAL ; ACTIVE : écart = `% temps écoulé − progress` > 18 → CRITICAL, > 6 → TENSION, sinon OK |
| Sentiment baromètre | normalisation à 100 par plus grand reste |
| Compteurs Rôles / Équipes | nombre de personnes actives rattachées |
| Total mission | `amoa + sub` |
| Écarts (anomalies) | règles implicites : risque critique sans plan ; jalon non confirmé > N jours (N ?) ; budget non renseigné ; modifications depuis la capture du comité |

---

## 3. Opérations backend

Préfixe `/api/projects/{projectId}`. Toutes les écritures : auteur = utilisateur authentifié, entrée d'audit créée, réponse = objet complet mis à jour. Erreurs : `400` validation (détail par champ), `403` droit, `404`, `409` conflit (FK, doublon, version).

### 3.1 Session
- `GET /me` → `{ person, permissions[], preferences }`
- `PATCH /me/preferences` ← `{ dashboard_layout?, first_name?, photo? }`

### 3.2 Référentiel (même patron pour Client, Wave, Phase, Subphase, Workstream, Deliverable, ProjectRole, Team, Person, GovernanceBody)
- `GET /{entity}` → liste (tri et filtre côté front aujourd'hui ; pas de pagination)
- `POST /{entity}` ← champs sans `id` → objet créé
- `PATCH /{entity}/{id}` ← champs modifiés (saisie cellule par cellule)
- `DELETE /{entity}/{id}` → `409` si référencé (règle Q5)
- Spécifiques : `PUT /phases/{id}/waves` ← `wave_ids[]` ; `PUT /governance-bodies/{id}/members` ← `person_ids[]` ; `PUT /persons/{id}/roles`, `/workstreams`
- `GET /project`, `PATCH /project` (code refusé en modification), `PATCH /project/sections/{key}`

### 3.3 Pilotage
- `GET|POST|PATCH|DELETE /milestones`, `/risks`, `/issues`, `/actions`, `/decisions`
- `PATCH /actions/{id}/status` ← `{ status }`
- `POST /milestones/{id}/confirm` → met `confirmed_at`
- `PATCH /decisions/{id}/arbitration` ← `{ question, options, criteria, texts }`
- `GET /planning` → phases, sous-phases, chantiers avec dates et avancement ; `PATCH /planning/{type}/{id}` ← `{ start_date, end_date, progress_pct }`
- `GET /deliverables/tracking`, `PATCH /deliverables/{id}/tracking` ← `{ progress_pct, risk_override }`
- `GET /barometer` ; `POST /barometer/surveys` ← mois complet ; `PATCH /barometer/...` ; `POST /barometer/domains|questions|themes`
- `GET /budget`, `PATCH /budget/periods/{id}`

### 3.4 Aujourd'hui
- `GET /today` → `{ next_committee, countdown, pending_validations, tasks_count, deadlines[], anomalies[], kpis }`
- `GET /external/weather?city=` et `/external/news?country=` (si proxy retenu)

### 3.5 Comités et rapports
- `GET|POST|PATCH /report-templates`, `PATCH /report-templates/{id}/active`
- `POST /committees/{id}/reports` ← `{ template_id }` → instance (génération)
- `GET /reports` (historique), `PATCH /reports/{id}` ← `{ status }`, `GET /reports/{id}/file`

### 3.6 Base de connaissance
- `GET /documents?type=&q=`
- `POST /documents` (multipart ; formats .pdf .docx .pptx .xlsx .msg .eml) → `extraction_status = PENDING`
- `GET /documents/{id}/file`

### 3.7 Commentaires et historique de cellule
- `GET /comments?entity_type=&entity_id=` · `POST /comments` ← `{ entity_type, entity_id, field, text }`
- `GET /audit?entity_type=&entity_id=&field=`

### 3.8 Fiche projet / Dispositif (lecture)
- `GET /dispositif` → ressources, équipes, organigramme, gouvernance, RACI (calculés depuis Person, Team, GovernanceBody, ProjectRole)

### 3.9 Jev (assistant)
- `POST /assistant/messages` ← `{ context: { space, tab, block?, row_id? }, text, file_ids[] }` → `{ reply, sources[], proposed_changes[] }`
- `POST /assistant/changes/{id}/confirm` | `/cancel`
- `POST /assistant/files` (multipart) → `{ id, status }`
Règle affichée : Jev modifie seulement dans Pilotage et dans Info projet hors Référentiel, et ne fait qu'expliquer ailleurs.

---

## 4. Règles de validation relevées côté frontend (à dupliquer côté backend)

- Titre obligatoire à la création (toutes entités du formulaire).
- Avancement planning : début et fin obligatoires, fin ≥ début.
- Baromètre : mois obligatoire, notes bornées 0-10 (`cl()`), sentiment normalisé à 100.
- Probabilité, impact, sévérité : 1-5 ; priorité décision : 1-4.
- Projet : `code` non modifiable.
- Commentaire de cellule : seulement sur les cellules éditables de Pilotage.
- Non codé mais attendu : email unique et valide, unicité `seq` par parent, dates de sous-phase incluses dans la phase, `health_override.reason` obligatoire, fin d'affectation obligatoire pour les externes (contrainte écrite dans `PROJECT_ASSIGNMENT.constraints`, jamais appliquée).

## 5. Matrice des droits (à valider — rien n'est appliqué aujourd'hui)

| Action | Admin | PM / PMO | Contributeur | Lecteur |
|---|---|---|---|---|
| Voir Référentiel | ✓ | ? | ✗ | ✗ |
| Modifier Référentiel | ✓ | ? | ✗ | ✗ |
| Modifier Fiche projet | ✓ | ✓ ? | ✗ | ✗ |
| Saisir dans Pilotage | ✓ | ✓ | ses objets ? | ✗ |
| Commenter une cellule | ✓ | ✓ | ✓ | ? |
| Templates, génération de rapports | ✓ | ✓ | ✗ | ✗ |
| Déposer un document | ✓ | ✓ | ✓ ? | ✗ |
| Activer un module (« demande à l'administrateur ») | ✓ | demande | demande | ✗ |

---

## 6. Questions ouvertes à trancher

1. **Source de vérité du planning** : le Référentiel (Phases, Sous-phases, Chantiers) ou `planning-data.js` ? Quelles dates font foi (B3) ?
2. **Décision / fiche d'arbitrage** : une entité ou deux ? Quel cycle de statuts unique ? Quel préfixe d'id (D-, PD-, FA-) ?
3. **Phase ↔ Lot** : une phase appartient-elle à un seul lot ou à plusieurs ?
4. **Affectations datées** (`PROJECT_ASSIGNMENT`) : on garde (début/fin par personne) ou on supprime ?
5. **Suppression** : interdite si référencée, en cascade, ou désactivation (`active=false`) — par entité ?
6. **Fiche projet** : champs typés ou sections de texte libre éditables ?
7. **Clé des commentaires de cellule** : ils sont rattachés à `onglet|libellé|colonne` ; renommer une ligne les perd. Passer à `entity_id + field` ?
8. **Seuils des signaux** (chantiers, volets, écarts « non confirmé depuis N jours ») : quelles valeurs ?
9. **Rôles applicatifs** : faut-il un rôle Admin distinct de PMO ? Compléter la matrice § 5.
10. **« Chantier » transverse** : « Pilotage », « Direction », « Technique », « Change » sont-ils des chantiers à créer ou une valeur spéciale ?
11. **Multi-projets** : l'application gère-t-elle un seul projet ou plusieurs (le menu s'appelait « Mes projets ») ? Cela conditionne le préfixe `/projects/{id}` et les droits.
12. **Jev** : quel périmètre réel (LLM, sources citées, modifications proposées puis confirmées) ? Le comportement actuel est simulé.
13. **Widgets externes** (météo, actualités) : appel direct ou via le backend ?
14. **Jeu de données** : remplacer « M. XYZ » par des noms distincts et corriger les contradictions (M10) avant transmission ?

## 7. Recommandation avant transmission

1. Trancher les questions 1, 2, 5, 9 et 11 : elles changent la structure du modèle.
2. Remplacer `rise-data.js` + `planning-data.js` par un unique jeu de données normalisé (objets nommés, ids, ISO), conforme au § 2.
3. Introduire une couche `api.js` (fonctions mockées) appelée par le composant, pour que le contrat soit lisible dans le code.
4. Transmettre au LLM : `RISE Cockpit.dc.html`, le jeu de données normalisé, `api.js` et ce document. Exclure les fichiers de variantes et de mockups.
