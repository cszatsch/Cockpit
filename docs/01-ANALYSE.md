# RISE Cockpit & Console Admin — Analyse avant développement du backend

Date : 27/09/2026 · Sources : `frontends/` (copie **non modifiée** du ZIP livré) et `docs/specs/` (briefs et audit).

Méthode : chaque fichier du ZIP a été lu intégralement :

- la classe logique du Cockpit, en trois tranches (l. 1870-2727, 2727-3396, 3396-4088), plus le template pour les écrans ;
- la console et ses trois sous-écrans ;
- `rise-data.js` et `planning-data.js`, exécutés et comptés ;
- le classeur Excel, analysé avec openpyxl.

Les numéros de ligne renvoient aux fichiers de `frontends/`.

---

## 1. Constat général

| | Cockpit (`RISE Cockpit.dc.html`) | Console (`Console Admin.dc.html` + `ConsoCouts`, `ProjetInit`, `ProjetsBiblio`) |
|---|---|---|
| Couche API | Aucune. `import('./rise-data.js')` et `import('./planning-data.js')` au montage (l. 1920-1921). | Aucune. Constantes `USERS`, `AUDIT0`, `PROV0`… en tête de classe (l. 952-1166). La console importe aussi `rise-data.js` pour relier comptes et habilitations (l. 1169). |
| Écritures | Environ 40 magasins d'état : `ed`, `sesEd`, `refValues`, `refDeleted`, `actStatus`, `bmEd`, `phLots`, `txtEd`, `critEd`, `arbData`, `lvTrack`, `mine*`, `goliveEd`, `chronoEd`, `gbExtra`, `gbMem`, `templates`… | Environ 30 méthodes (`saveUser`, `suspend`, `saveKey`, `saveRule`…) qui écrivent dans l'état et appellent `this.log()`. |
| Identifiants | Générés par le client (`R15`, `A-50`, `D-011` **et** `D-022`, `ms-…`, `lx…`, `'C'+n`…). | Générés par le client. |
| Enums écrits | Souvent en **libellés français** (« Brouillon », « À faire », « Haute », « Interne »…). | Codes français minuscules (`actif`, `invité`, `ok`, `err`, `imm`, `quot`…). |
| Utilisateur | `me` = p01 (PMO). Le frontend ne connaît pas de `projectId`. | Utilisateur `u1` / « Julien Morel » écrit en dur. |
| Droits | `can()` / `prof()` (l. 2086-2097), appliqués **partiellement** (voir § 4). | Aucun contrôle : la console suppose un Admin. |

**Conséquence** : le brief prévoit de « brancher » le frontend (Cockpit § 11, Console § 11). Pour que les données survivent au rechargement, il faut toucher **toutes** les méthodes d'écriture. Chaque écriture doit en outre convertir un libellé en code et un nom en identifiant, et accepter l'identifiant renvoyé par le serveur. Ce n'est pas une modification « minimale et localisée » : c'est la **question Q1** (§ 6).

---

## 2. Relevé des appels API implicites

### 2.1 Cockpit : lectures (forme de `GET /bootstrap`)

| Clé | Cardinalité | Remarques |
|---|---|---|
| `today`, `me`, `project` | 1 | Dates de `baseline` et de `healthOverride` en libellé. |
| `people` | 15 | Sous-ensemble de `model.PERSON` (38). Divergences de `role` et de `team` (§ 3.3). |
| `milestones` | 9 | `confirmedDays` stocké, pas de `confirmedAt`. |
| `risks` | 6 | `due` en libellé, pas de `dueIso`. |
| `issues` | 3 | `opened` et `target` en libellé. |
| `actions` | 9 | **Ni `wsId` ni `detail`.** `prio` en libellé, `late` stocké. |
| `decisions` | 10 | Aucune fiche d'arbitrage n'est fournie, même pour D-007 (`full:true`). |
| `sessions` | 47 | g1 : 7, g2 : 14, g3 : 13, g4 : 7, g5 : 1, g6 : 5. |
| `workstreams` | 8 | Bloc Avancement, **sans `id`**. |
| `reports` | 4 | Statuts en libellé. |
| `documents` | 8 | Pas d'`id`, `linked` en texte libre. |
| `mission`, `programBudget`, `barometre`, `volets`, `riskStats`, `anomalies`, `weekWins`, `committee`, `referential.*`, `raci` | — | Données de présentation. |
| `model.*` | WAVE 4, PHASE 6, SUBPHASE 27, WORKSTREAM 8, TEAM 5, ROLE 13, PERSON 38, GOVERNANCE_BODY 6, PROJECT_ASSIGNMENT 18, DELIVERABLE 107 | Tableaux positionnels `cells[]` accompagnés de clés étrangères explicites. |
| `habilitations` | 41 | `{id, personId, profile, wsId}`, **sans `projectId`**. |
| `planning-data` : `phases` 6, `subphases` 27, `chantiers` 8, `projectEnd` | — | `start`, `end`, `reel`, `owner`, `crit`, `phases[]`. Aucune baseline. |

**Templates de rapport** : ils ne sont pas dans `rise-data.js`. Ils sont écrits en dur dans l'état initial du composant (l. 1871-1877).

### 2.2 Cockpit : écritures (→ endpoints)

| Écran / méthode | Magasin | Endpoint cible |
|---|---|---|
| Cellules jalon, risque, problème, action (`edit`, l. 2755) | `ed['ms:'/'rk:'/'is:'/'ac:'+id]` | `PATCH /milestones|risks|issues|actions/{id}` |
| Statut d'action | `actStatus` (libellé FR) | `PATCH /actions/{id}` `{status}` |
| Planning (`edit('pl')`, formulaire avancement) | `ed['pl:'+id]` : `start`, `end`, `reel`, `owner`, **`prevuSet`** | `PATCH /planning/{type}/{id}` |
| Dates de phase par lot (`phSet`, l. 2291) | `phLots[phaseId][waveId] = {start, end}` (MM/AAAA) | **Aucun endpoint dans le brief** |
| Fiche décision | `ed['fa:'+id]` : `st`, `ch`, `inst` en libellés | `PATCH /decisions/{id}` |
| Fiche d'arbitrage (textes, critères) | `txtEd`, `critEd`, `arbData` | `PATCH /decisions/{id}/arbitration` |
| Baromètre | `bmEd` par chemin pointé (`domains.2.series.4`…) | `PATCH /barometer/...` : correspondance à définir |
| Suivi des livrables | `lvTrack` `{prog, risk: ok|tens|crit}` | `PATCH /deliverables/{id}` |
| Séances (`sesVals`, l. 2797-2855) | `sesEd` | `PATCH /sessions/{id}` |
| Création (`tfSubmit`, l. 3228-3299) | `added.*`, `newTasks` | `POST /…` par entité |
| Référentiel générique (l. 3541-3559) | `refValues['OBJ/id'] = cells[]` | `PATCH /{entité}/{id}` après conversion des cellules en champs |
| Instances (couleur, nom court, membres) | `gbExtra`, `gbMem` | `PATCH /governance-bodies/{id}`, `PUT …/members` |
| Suppression | `refDeleted` après `refUsage()` | `DELETE /{entité}/{id}` |
| Templates | `templates`, `tplHistory`, `kbDocs` | `/report-templates`, `/sessions/{id}/reports` |
| Fiche projet | `projEd` (clé = chemin DOM) | `PATCH /project/sections/{key}` |
| Mes tâches | `mineArch`, `mineTitles`, `mineDue`, `mineCta` (clé = **index**) | `/tasks` (manuelles seulement) |
| Go-live et chronologie | `goliveEd`, `goliveDate`, `chronoEd` (clé = index) | **Aucun endpoint** |
| Commentaires | `localStorage rise-cell-comments` | `/comments` |
| Préférences | `rise-db-layout`, `rise-db-theme`, `rise-prof-*` | `PATCH /api/me/preferences` |
| Parties simulées | Météo, actualités, dépôt et téléchargement de documents, Jev, demande d'activation de module | `/external/*`, `/documents`, `/assistant/*`, `/module-requests` |

### 2.3 Console : lectures et écritures

- **Lectures** :
  - comptes `USERS` (38) : `{id, n, e, p, s, ll, inv, pr[], lt}` ;
  - audit (10) ; fournisseurs `PROV0` (4) ; modèles `MODELS0` (9) ; fonctions `FNS` (3) et affectation `asg` ;
  - snapshots `SNAPS0` (RISE 10, ATLAS 3, HORIZON 2) ; écarts `EV` (24) ;
  - règles `RULES0` (5) ; historique d'envois `HIST0` (10) ;
  - modules `mods` et demandes `reqs` ; seuils `th` ; administrateurs `admins` ; sessions `sess` ; profil `prof` ; planification `sched`.
- **Écritures** : `saveUser`, `suspend`, `reactivate`, `resend`, `removeUser`, `saveAdmin`, `removeAdmin`, `saveKey`, `saveProv`, `testKey`, `testAll`, `toggleModel`, `saveModel`, `saveFiche`, `saveAsg`, `capture`, `sched`, `saveRule`, `newRule`, `toggleRule`, `setScope`, `togProj`, `approve`, `reject`, `setTh`, `saveMe`, `revoke`, `revokeAll`, `pwd`, `onPhoto`, préférences `pn`.
- **Sous-écrans** : `<dc-import>` (pas d'iframe).
  - `ConsoCouts` génère sa propre série de consommation (`data()`).
  - `ProjetInit` lit le fichier Excel dans le navigateur avec SheetJS, chargé depuis un CDN.
  - `ProjetsBiblio` affiche 5 projets écrits en dur.

---

## 3. Règles de gestion relevées dans le code, et écarts avec les briefs

### 3.1 Règles conformes, à reproduire telles quelles

- **Livrables** : statut et risque automatique conformes au § 7.5 (l. 2777-2782). Sans dates, le livrable prend celles de sa sous-phase ; une sous-phase sans fin reçoit début + 120 j.
- **Séances** : numéro = max + 1 par instance ; participants copiés des membres ; « à confirmer » = PLANNED et date ≤ today ; seules les séances PLANNED se déplacent.
- **Jalons** : `phaseId` obligatoire ; sous-phase de la même phase ; avertissement non bloquant si la date sort de la phase ; code = max + 1 au format J00.
- **Mes tâches** (l. 3412-3416) : conforme au § 7.12.
- **Consommation IA** : statuts de plafond de `ConsoCouts` conformes au § 7.4 (Dépassement / Alerte / Sous le plafond / Sans plafond).
- **Import** : contrôles `⚠` / `◔` de `ProjetInit` conformes au § 10.6.4 du brief Console.

### 3.2 Écarts entre le code et les briefs

Le serveur appliquera la règle du brief. Les points marqués **Q** sont soumis à arbitrage (§ 6).

**Droits (brief § 8)**

1. `edit()` ne vérifie **aucun droit** pour le planning (`k='pl'`, l. 2757). N'importe quel profil peut modifier le porteur, les dates et l'avancement des phases et sous-phases. Aucun contrôle non plus sur :
   - le statut d'action (l. 2460), le baromètre (l. 2598), la Fiche projet (l. 2021) ;
   - `lvSetTrack`, les templates, les critères d'arbitrage (l. 3401) ;
   - toutes les créations de `tfSubmit` ;
   - toutes les écritures du Référentiel sauf les jalons (l. 3543-4003). L'**Admin peut donc modifier le Référentiel dans l'interface**, contrairement à RG6.
2. Les jalons passent par `can('edit')` : **un Responsable peut modifier un jalon de son chantier**, contrairement au § 8.7 et au test § 13.7.
3. `can('edit')` sans `wsId` renvoie `resp.length > 0`. Comme aucune action n'a de `wsId`, **tout Responsable peut modifier toutes les actions** (Q2).
4. `prof()` ne gère ni `projectId` ni `accountId`.
5. `todayMsg` et `decVals` comptent **toutes** les décisions TO_ARBITRATE. Le § 7.9 dit « dont je suis décideur » (Q5).

**Suppression (`refUsage`, l. 2099-2114, et § 7.7)**

6. `refUsage` est **moins complet** que le brief :
   - PHASE ne compte ni les jalons ni les livrables. Le brief les cite et c'est le test § 13.2.
   - SUBPHASE ne compte pas les jalons.
   - PERSON ignore :
     - les responsables de lot, phase, sous-phase et chantier ;
     - les participants de séance, les affectations et les habilitations ;
     - le directeur de programme et le sponsor ;
     - les auteurs, relecteurs et valideurs de rapports.
   - WORKSTREAM ignore les actions, l'avancement, les dépendances et les habilitations.
   - WAVE ignore les chantiers.
   - ROLE s'appuie sur `PERSON.cells[4]` au lieu des affectations.
   - Aucune règle pour CLIENT et DELIVERABLE.
   - Le format de retour est une chaîne française, pas `{entityType, id, label}[]`.
   - *Proposition* : le serveur applique l'**union** de `refUsage` et du brief, en suivant les clés étrangères réelles (principe du « plus prudent »).

**Fiche arbitrée**

7. La lecture seule d'une fiche ARBITRATED n'est vérifiée que sur les textes en ligne (l. 2476). Les critères (l. 3401) et le formulaire (l. 3263-3265) modifient D-007 sans contrôle. Le serveur renverra `409`.

**Audit**

8. Plusieurs écritures ne créent pas d'entrée d'historique : `lvSetTrack`, `actStatus`, les tâches, `setTime` / `setPlace` hors perte de focus. L'auteur est enregistré par son nom et `origin` vaut `'saisie'`. Le serveur tracera tout, conformément au § 7.10.

**Autres règles non couvertes par le brief**

9. Transitions de séance : « Rétablir » (CANCELLED → PLANNED) et `setSt` acceptent HELD → PLANNED. « Confirmer » est proposé même sur une séance future. Le brief est muet (Q7).
10. Règles présentes dans le code mais absentes du brief :
    - clôture d'une décision sans `ddIso` → `ddIso = today`, et réouverture → `ddIso` vide (l. 2643) ;
    - `prevuSet` (avancement prévu forcé) ;
    - date de phase **par lot** (`phLots`) ;
    - niveau d'un rôle (`roTier`) ;
    - historique du go-live et chronologie ;
    - surcharges des tâches calculées (archiver, renommer) ;
    - suppression de template ;
    - composant de template `budget` et portée `Phase` ;
    - type d'équipe client / AMOA / intégrateur ;
    - « chantiers » d'une personne (`cells[5]`) ;
    - invitation de compte depuis le Référentiel (`psAcc`) ;
    - module Bénéfices.
    - Voir Q8.
11. Écarts sur l'écran Aujourd'hui :
    - anomalies : le frontend remonte **tout** risque sans plan (le brief : critique seulement) et ajoute les actions échues ;
    - pas de niveau d'alerte à 14 j ;
    - pas de détection « modifications depuis la capture du dernier rapport ».
    - Le brief exige aussi que les compteurs « correspondent au frontend actuel » (§ 13.8) : ces deux exigences se contredisent (Q5).
12. Criticité de risque : 3 niveaux dans le filtre, 4 dans le brief. Deux définitions de « sans plan » coexistent (l. 2141 et 2713).
13. Signal `sig` d'avancement de chantier : dans le code, c'est l'écart `v − ref` (seuils −20 et 0, l. 3373). Le brief (§ 6.1 → § 7.6) le renvoie aux seuils de **fraîcheur** 7 et 14 j, qui ne s'appliquent pas à cette donnée (Q9).
14. Date du jour : plusieurs calculs utilisent l'horloge du navigateur au lieu de `today` (l. 2466, 2767, 2969, 3078, 3619). S'y ajoutent des valeurs écrites en dur :
    - `GL = 2026-11-01` (l. 2969) ;
    - « COPIL n°20 · 26 sept. » ;
    - `'23 sept.'` ;
    - `g1` pour le COPIL et `p03` pour le porteur du budget.
15. Jev : il propose « archiver, restaurable » (l. 2406) alors que la suppression est définitive. Il peut créer dans l'espace projet hors Référentiel, et un bouton « annuler » existe sans route dans le brief.

**Console (brief Console)**

16. **Profil unique et global par compte** (`u.p`), et `pr[]` = projets. Il est impossible d'exprimer « PMO sur RISE, Lecteur sur ATLAS ». La console laisse l'Admin choisir `resp` / `lec`, alors que ces profils relèvent du PMO. Le cas « Lecteur externe sur des chantiers choisis » n'a **aucune interface** (Q3).
17. Deux sources d'administrateur non synchronisées : `u.p === 'admin'` et `admins[]` (Q3).
18. `removeUser` n'applique pas RG12. La garde contre « soi-même » et « dernier administrateur » ne vit que dans la vue. Le serveur l'appliquera.
19. Snapshot manuel : le libellé vide est remplacé par « Capture manuelle ». Le brief exige `400` : le serveur renverra `400` et le frontend affichera l'erreur.
20. La planification des snapshots est **globale** dans la console, **par projet** dans le brief (Q10).
21. Deux calculs d'état de fonction IA divergents :
    - `fnState` : un fournisseur `new` compte comme OK ;
    - `wireVals` : exige `ok` et ignore `act`.
    - Le serveur appliquera le § 7.3 : UNTESTED = non disponible ? (Q10)
22. La projection de fin de mois ne suit le § 7.4 ni dans la console (extrapolation linéaire) ni dans `ConsoCouts` (jours simulés). Le serveur fera foi.
23. `attention()` n'affiche pas les échecs d'envoi de notification exigés au § 7.9. Le serveur les renverra ; le frontend les affichera s'il les reçoit.
24. Seuils :
    - options d'alerte 50 / 70 / 80 / 90 dans la console, contre 50-100 par pas de 5 dans le brief ;
    - `crud` sans plafond ;
    - `setTh` n'est pas relié à l'écran.
25. Module Budget :
    - il est **actif sur RISE et ATLAS** dans la console, alors que le brief le dit inactif ;
    - `pj` est un dictionnaire code → date ;
    - les demandes ne gardent pas de statut.
    - Voir Q10.
26. Notifications :
    - `reach()` ignore les projets de la règle ;
    - `newRule` crée une règle sans rien enregistrer ;
    - l'exception de plateforme est codée par l'id `n3` ;
    - `n3` cible `pmo` alors que son prompt s'adresse à l'administrateur.
27. Jev de la console : la réactivation, la relance et la capture se font sans confirmation, contre le § 9.12.
28. Endpoints du brief sans interface (ils seront livrés quand même) :
    - sessions d'un autre compte ;
    - `retry` d'un envoi ;
    - `preview` d'une règle ;
    - export de snapshot.

### 3.3 Écarts dans les données de démonstration

**Cardinalités § 13** : jalons 9, risques 6, séances 47, livrables 107 et habilitations 41 sont conformes. Les 38 personnes correspondent à `model.PERSON`, pas à `people` (15).

**Numéro de séance** : le COPIL a déjà les séances n°21, 22 et 23 (PLANNED). La règle § 7.8 donne donc **n°24**, alors que le test § 13.6 attend **n°21** (Q5).

**Écarts listés au § 12**

- `project.integrator` vaut **déjà** « Codilog » : ce point du § 12 est périmé.
- `editor = "Brand X"` ne correspond à aucune équipe.
- La colonne « société » vaut « AMC Corp » pour les 38 personnes.

**Écarts non listés au § 12**

- **D-002** est encore ARBITRATED alors que D-007 la remplace (`supersedes`). Elle devrait être SUPERSEDED.
- **A-43 et A-44** sont échues mais portent `late:false`. Le calcul serveur donnera `true`, et le compteur passera de 2 à 4.
- D-005, D-009 et D-010 n'ont **aucun `maker`**. Les compteurs « validations » et « décisions à traiter » valent donc toujours 0 (Q5).
- Jalons hors de leur phase :
  - J01, J02, J04 et J05 sont rattachés à P4 Realize, terminée le 28/02/2026 ;
  - J06 est hors de SP5.4.
  - L'import déclenchera un avertissement ; l'amorçage ne bloque pas.
- Le planning n'a **pas été recalé sur le récit** : l'UAT (SP4.5) est terminée en février 2026, alors que le projet est « en UAT ».
- `referential.timeline` et `referential.cutover` et les livrables de SP5.3 (l83-l85) sont restés en v4.
- `planning-data` n'a **aucune baseline** pour les phases, sous-phases et chantiers, alors que le § 7.9 en suppose une.
- `model.PROJECT` diverge de `project` et du planning : nom, début 01/03/2024 contre P1 en 2023, fin 2030 contre 2028.
- Lot w1 : il ne couvre ni P1 ni P6. Les dates de w3 et w4 sont des années seules.
- **`PROJECT_ASSIGNMENT` n'est pas résoluble** : aucun des 18 libellés de rôle n'existe dans `model.ROLE`, et la colonne d'équipe vaut « AMC Corp ». Les 23 personnes r01…r23 n'ont aucune affectation (Q6).
- `people` et `model.PERSON` divergent sur le rôle et l'équipe des 15 personnes communes.
- L'équipe client s'appelle « ECF » dans les données et « AMC Corp » dans l'Excel.
- La colonne « équipe » des livrables contient AMOA, intégrateur ou client, ce qui contredit l'équipe du porteur.
- Références orphelines en texte :
  - « Remplacée par D-017 » (D-017 n'existe pas) ;
  - « RISK R01 → R07 » inclut R06, absent ;
  - issue P03 : `target: "fin sept."`.
- Baromètre :
  - la somme du sentiment ≠ 100 pour 3 mois ;
  - « Transverse » a 5 répondants pour une taille de 3 ;
  - les mois n'ont pas d'année ;
  - `referential.barometer` contredit `barometre`.
- COPIL n°20 : le 26/09/2026 est un **samedi**.

### 3.4 Fichier Excel `Referentiel RISE - initialisation.xlsx`

Le fichier compte 16 onglets : les 13 de saisie, Complétude, Glossaire et « Listes » (masqué). **Aucune donnée exemple** : les lignes 9 et suivantes sont vides.

**Structure**

- **05 Projet** : c'est un formulaire (valeurs en D8-D22), pas le schéma « ligne 9, colonne B ».
- 06, 07, 08, 09 et 12 : la colonne B est CALCULÉ.
- 09 Chantiers n'a pas de colonne CONTRÔLE.

**Contradictions**

- **Colonne « Permission » (03 Personnes)** : elle est OBLIGATOIRE, comptée dans la complétude, et propose des valeurs obsolètes (Chef de projet, Contributeur). Le brief Cockpit dit de l'ignorer ; le parseur de la console la déclare obligatoire (Q4).
- **Colonnes CONTRÔLE** : le brief Cockpit § 10 dit de les ignorer ; le brief Console § 10.6.4 en fait la source des erreurs (`⚠`) et des avertissements (`◔`) (Q4).
- **Habilitations LECTEUR** : elles ne peuvent pas se déduire des responsables de chantier (le jeu en compte 30), et aucun onglet ne les porte (Q4).
- **Codes C\* et J\*** : ils sont calculés à partir du **numéro de ligne**. Le serveur les réattribuera.

**Champs du modèle absents de l'Excel** (valeur par défaut à définir, Q4)

- Phase : responsable (obligatoire), avancement, plusieurs lots.
- Sous-phase : responsable, avancement, `critical`.
- Chantier : phases, lots, dépendances, dates, avancement.
- Projet : ville, devise.
- Personne : prénom et nom séparés (seulement « Nom complet »).
- Rôle : ordre.
- Livrable : avancement.
- Membres : le rôle est facultatif dans l'Excel mais obligatoire dans `BodyMember`.

**Libellé ambigu** : « Bimensuelle » veut dire deux fois par mois, mais le code cible est BIWEEKLY (toutes les deux semaines).

### 3.5 Contradictions entre les deux briefs

| Sujet | Brief Cockpit § 9.11 / § 10 | Brief Console |
|---|---|---|
| Routes IA | `/api/admin/ai/providers`, `/ai/models`, `/ai/assignments`, `/ai/usage?by=`, `/ai/budgets` | `/providers`, `/models`, `/assignments`, `/usage`, `/budget-thresholds` |
| Statut de compte | `PATCH /accounts/{id} {status}` | `POST /accounts/{id}/suspend`, `/reactivate` |
| Profils | `PUT /accounts/{id}/global-profiles`, `/reader-scopes` | `profile` + `projectCodes[]` dans `POST` / `PATCH /accounts` |
| Administrateurs | Niveaux super-administrateur / administrateur | **Un seul niveau** |
| Import Excel | `POST /referential/import?dryRun=` sur un projet existant, rapport `{created, errors, warnings}`, colonnes CONTRÔLE ignorées | `POST /project-imports` → `/preview` → `/commit` (création d'un projet), colonnes CONTRÔLE utilisées |

*Proposition* : le brief Console fait foi pour `/api/admin`, ce qui est cohérent avec son § 2. Les deux imports partagent un **même moteur de lecture et de validation**. Les routes du Cockpit § 9.11 absentes de la console (`global-profiles`, `reader-scopes`) sont livrées en plus si Q3 le confirme.

---

## 4. Authentification et rôles

**Frontend du Cockpit**

- `me` vient des données, et le calcul de droits se fait côté client.
- Profils : ADMIN, PMO, RESPONSABLE (par chantier) et LECTEUR (par chantier).
- Droits : `referentiel` = admin ou pmo ; `referentielEdit` = pmo ; `admin` ; `sessions` = pmo ou directeur de programme ; `editDates` = pmo ou responsable du chantier (`kind === 'ch'`) ; `edit` = pmo ou responsable du chantier de l'objet.

**Frontend de la console** : il ne fait aucun contrôle et suppose un Admin connecté.

**Serveur** (brief § 8, qui prime sur tout le reste)

- JWT porteur, avec `p01` comme utilisateur de développement.
- Droits effectifs = maximum sur l'ensemble des habilitations (RG5).
- Filtrage des listes par chantier (RG8).
- Réponses `403` / `404` (RG16).
- Audit avec le **profil utilisé** (RG13). Règle proposée : le profil le plus faible suffisant pour l'action ; à défaut, le profil qui accorde le droit (Q3).

---

## 5. Synthèse

- **Bloquant** : le périmètre des modifications du frontend (Q1) et les points de modèle Q2 à Q4. Ils changent le schéma ou le contrat.
- **Majeur** : les contradictions entre critères d'acceptation et données (Q5), les affectations (Q6), les séances (Q7) et le devenir des données sans entité (Q8).
- Le reste est traité par la règle du brief et consigné dans `DECISIONS.md`, avec une constante nommée pour chaque hypothèse.

Questions : voir `docs/03-QUESTIONS.md`.
