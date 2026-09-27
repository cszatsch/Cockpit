# Console d’administration RISE — Brief de développement du backend

Ce document s’adresse au LLM chargé de développer le backend de la **plateforme d’administration** (Console Admin). Il complète le brief du Cockpit (`BRIEF BACKEND - RISE Cockpit.md`). Lisez les deux avant d’écrire du code.

---

## 1. Votre mission

Construire le backend de la Console d’administration, en réutilisant le socle déjà prévu pour le Cockpit : même base, même authentification, même journal d’audit, même format d’erreur, même stack. Le frontend de la console sert de spécification : le backend fournit exactement les données qu’elle affiche et accepte exactement les écritures qu’elle produit.

Livrables, dans l’ordre :

1. Les tables propres à la console (§ 6), ajoutées au schéma du Cockpit.
2. Une API REST sous `/api/admin` (§ 9), réservée au profil ADMIN.
3. Les traitements de fond : tests de clés, relevés de consommation, alertes budgétaires, snapshots planifiés, envoi des notifications, import Excel (§ 10).
4. Le branchement de la console sur l’API (§ 11).
5. Des tests automatisés couvrant les critères d’acceptation (§ 13).

---

## 2. Contenu du paquet et ordre de lecture

| Fichier | Rôle | À lire |
|---|---|---|
| `BRIEF BACKEND - Console Admin.md` | Ce document. **Fait foi pour la console.** | En premier |
| `BRIEF BACKEND - RISE Cockpit.md` | Socle commun : stack, modèle métier, **habilitations (§ 8)**, format d’erreur. | En deuxième |
| `Console Admin.dc.html` | Frontend de la console : template, puis classe logique `Component`. | Pour vérifier un comportement |
| `ConsoCouts.dc.html` | Écran « Consommation et coûts », chargé par la console. | Idem |
| `ProjetInit.dc.html` | Écran « Initialisation d’un projet » (import Excel). | Idem |
| `ProjetsBiblio.dc.html` | Écran « Bibliothèque des projets ». | Idem |
| `Referentiel RISE - initialisation.xlsx` | Fichier que le PMO remplit pour initialiser un projet. | Pour l’import (§ 10.6) |
| `rise-data.js` | Données du Cockpit, dont `habilitations` et les personnes. | Pour relier comptes et personnes |
| `support.js`, `assets/` | Moteur d’affichage et images. **Ne pas modifier.** | Non |

**Ordre de priorité en cas de contradiction** : section Habilitations du brief Cockpit (§ 8) › ce brief › code de la console › données de démonstration.

---

## 3. Comment lire le frontend de la console

- La console **n’a aucune couche API**. Toutes ses données sont des constantes en tête de la classe logique (`USERS`, `PROFS`, `AUDIT0`, `PROV0`, `MODELS0`, `FNS`, `SNAPS0`, `EV`, `RULES0`, `HIST0`, `NAV`, `META`). Elles sont copiées dans `this.state` au démarrage, et toutes les modifications restent dans l’état : elles sont perdues au rechargement.
- Chaque action sensible appelle `this.log(action, cible, niveau)`. Cet appel correspond à une écriture dans le journal d’audit côté serveur.
- Les confirmations passent par `this.ask({...})`. Les actions critiques exigent de retaper un mot (`req`), par exemple le code du projet.
- La consommation IA est **générée** par `genUsage()`, un calcul pseudo-aléatoire recalé sur 1 032 € au 26/09. Elle doit être remplacée par de vraies mesures (§ 7.4).
- Les tests de clé API, l’envoi d’une notification de test, la capture d’un snapshot et l’import Excel sont **simulés** par des temporisations. Chacun correspond à une opération réelle décrite au § 9.
- Jev (l’assistant) répond par des règles (`jevReply`). Il ne lit ni ne saisit jamais de clé API. Le moteur réel est hors périmètre ; fournissez l’API et un service bouchon.
- Date du jour de démonstration : **26/09/2026 10:24** (`TODAY`). Le serveur fournit la date réelle.

---

## 4. Choix techniques

Identiques à ceux du Cockpit (§ 4 du brief Cockpit). En plus :

- les **clés API** des fournisseurs sont chiffrées au repos (KMS ou chiffrement applicatif AES-256-GCM, clé hors base). Elles ne sont **jamais** renvoyées en clair : l’API ne renvoie que le préfixe et les 4 derniers caractères ;
- les traitements planifiés passent par une file de tâches (BullMQ, pg-boss ou équivalent), avec reprise sur erreur ;
- l’envoi des e-mails passe par un fournisseur SMTP ou transactionnel, derrière une interface remplaçable.

---

## 5. Périmètre fonctionnel

Menus de la console (`NAV`), par groupe :

| Groupe | Menu | Objet |
|---|---|---|
| Supervision | Vue d’ensemble | État de la plateforme et points « À traiter » |
| Accès et sécurité | Utilisateurs | Comptes d’accès, statuts, profils, projets rattachés |
| | Administrateurs | Liste des administrateurs et journal d’audit |
| Intelligence artificielle | Fournisseurs et modèles | Clés API, tests, catalogue et tarifs des modèles |
| | Affectation des modèles | Modèle principal et de secours par fonction IA |
| | Consommation et coûts | Dépense, projection, plafonds et seuils d’alerte |
| Données et diffusion | Snapshots | Captures des données d’un projet, planification, comparaison, export |
| | Notifications et alertes | Règles de diffusion générées par un LLM |
| | Modules | Activation des modules optionnels, globale ou par projet |
| | Initialisation d’un projet | Import du fichier Excel, contrôle, prévisualisation, création |
| | Bibliothèque des projets | Liste des projets de la plateforme |
| Compte | Mon profil | Profil, sessions, préférences de l’administrateur connecté |

**Réservé à l’Admin** (RG1, RG7) : toute route `/api/admin/*` renvoie `403` à un utilisateur sans profil ADMIN. Un PMO n’y a pas accès, sauf s’il est aussi Admin.

**Un seul niveau d’administrateur.** L’ancien niveau « super-administrateur » est supprimé. Le champ `lv` subsiste dans le code, mais vaut toujours `admin`.

**Supprimé, à ne pas développer** :
- la matrice « Droits et habilitations » à 5 niveaux ;
- la **restauration** de snapshot ;
- les profils Sponsor, Chef de projet et Contributeur.

---

## 6. Modèle de données propre à la console

Conventions du brief Cockpit : `id` attribué par le serveur, dates ISO 8601, `projectId` quand la donnée est propre à un projet.

### 6.1 Comptes et profils

**Account (compte d’accès)** — `id`, `email` (unique), `fullName`, `personId? → Person`, `status` (INVITED | ACTIVE | SUSPENDED), `invitedAt?`, `inviteExpiresAt?` (invitation valable 14 jours), `lastLoginAt?`, `photoUrl?`.
- Frontend : `USERS[]` → `{ id, n, e, p, s, ll, inv, pr[], lt }`. `s` : `actif | invité | suspendu`. `ll` = jours depuis la dernière connexion. `inv` = jours depuis l’invitation. `pr` = codes des projets rattachés. `lt` = heure de la dernière connexion.
- Un compte peut ne pas être une personne du référentiel : partenaire ou actionnaire, en Lecteur sur les chantiers choisis par l’Admin.
- Une personne peut ne pas avoir de compte.

**AccountProject** — `accountId`, `projectId` : projets auxquels le compte est rattaché.

**Habilitation** — table du brief Cockpit (§ 8.3) : `personId | accountId`, `profile` (ADMIN | PMO | RESPONSABLE | LECTEUR), `projectId`, `wsId?`.
- La console attribue **ADMIN et PMO** (profils globaux).
- Elle attribue aussi **LECTEUR** pour un compte externe.
- **RESPONSABLE** et LECTEUR d’une personne du référentiel sont attribués par le PMO dans le Référentiel du Cockpit.
- La console **affiche** les chantiers par projet mais ne les modifie pas : lien « Modifier dans le Référentiel ↗ ».

**Profil affiché** (`PROFS`) : `admin`, `pmo`, `resp`, `lec`. Le frontend montre **le profil le plus fort** du compte (RG5).

**Admin** — table `AdminGrant { accountId, since, grantedBy }`. Frontend : `admins[]` → `{ u, lv:'admin', since }`. Il doit toujours rester **au moins un administrateur**.

**Session** — `id`, `accountId`, `device`, `location`, `createdAt`, `lastSeenAt`, `current`. Frontend : `sess[]`, révocation unitaire ou globale.

### 6.2 Journal d’audit (RG13–RG15)

**AuditEntry** — celle du brief Cockpit, complétée par :
- `profileUsed` : le profil sous lequel l’action a été faite ;
- `severity` : INFO | SENSITIVE | CRITICAL, codes `info | sensible | critique` dans le frontend ;
- `action` : libellé, par exemple « Rotation de clé API » ;
- `target` : texte lisible de la cible ;
- `projectId?`.

Frontend : `audit[]` → `{ who, a, tg, sev, t }`. Écran : filtre par niveau, recherche, export CSV. Règles :
- conservation **24 mois** ;
- **ni modification, ni suppression**, y compris quand la donnée tracée a été supprimée ;
- chaque écriture de la console y figure, **console comprise**.

### 6.3 Intelligence artificielle

**Provider** — `id` (anthropic | openai | mistral | google | …), `name`, `keyPrefix`, `keyLast4`, `keyCipher` (jamais exposé), `status` (OK | ERROR | UNTESTED, codes `ok | err | new` dans le frontend), `latencyMs?`, `lastTestedAt?`, `lastError?`, par exemple « 401 · API key revoked ». Frontend : `PROV0[]`.

**Model** — `id`, `providerId`, `name`, `description`, `priceInPerMTok`, `priceOutPerMTok` (en €), `active`. Frontend : `MODELS0[]` → `{ id, pv, n, d, pin, pout, act }`.

**AiFunction** — liste fixe `FNS` : `insights` (Analyse des données et insights), `crud` (Gestion des données, via Jev), `docs` (Analyse de documents).

**ModelAssignment** — `functionId`, `primaryModelId`, `fallbackModelId?`. Frontend : `asg = { insights:{p,f}, crud:{p,f}, docs:{p,f} }`. Le brouillon (`draft`) n’est appliqué qu’à « Enregistrer ».

**UsageRecord** — une ligne par appel au LLM :
- `at`, `projectId?`, `functionId`, `modelId`, `providerId` ;
- `tokensIn`, `tokensOut`, `costEur` (calculé au tarif en vigueur au moment de l’appel) ;
- `fallbackUsed` (bool) ;
- `source` (COCKPIT | JEV | NOTIFICATION | IMPORT).

**BudgetThreshold** — `id` (`all` ou `functionId`), `limitEur?`, `warnPct` (50–100, pas de 5), `enabled`. Frontend : `th[]` et, dans `ConsoCouts`, `th = { all, insights, docs, crud }`. `crud` n’a pas de plafond par défaut : on peut en définir un.

### 6.4 Snapshots

**Snapshot** — `id`, `projectId`, `takenAt`, `kind` (AUTO | MANUAL), `label?`, `takenBy?`, `storageKey`, `stats` (nombre d’objets par entité). Frontend : `snaps[projet][]` → `{ id, t, k, lab, by }`.

**SnapshotSchedule** — par projet : `enabled`, `frequency` (Hebdomadaire…), `day`, `hour`, `retention` (« 12 mois »). Frontend : `sched`.

**Comparaison** : différences entre deux snapshots, par entité et par champ (`EV` : `[n°, 'add'|'mod'|'del', entité, objet, champ?, avant?, après?]`).

**Pas de restauration** (RG14).

### 6.5 Notifications et alertes

**NotificationRule** — champs :
- `id`, `kind` (NOTIFICATION | ALERT), `name` ;
- `targetProfiles[]` (admin | pmo | resp | lec) ;
- `projectIds[]`, vide pour une règle de plateforme (ex. `n3` « Seuil budgétaire IA ») ;
- `modelId → Model` ;
- `prompt` (texte envoyé au LLM, obligatoire) ;
- `subject`, `body` (le message, avec variables) ;
- `frequency` (IMMEDIATE | DAILY | WEEKLY | CUSTOM, codes `imm | quot | hebdo | perso` dans le frontend), `day?`, `hour?`, `everyDays?` ;
- `channels[]` (APP | EMAIL) ;
- `enabled`.

Frontend : `RULES0[]` → `{ id, k, n, tg, pj, model, prompt, sub, body, fq, day, hour, every, ch, on }`.

**Variables** du prompt et du message : `{projet}` `{jalon}` `{date}` `{risque}` `{seuil}` `{semaine}` `{document}`, plus `{reponse_llm}` (réponse du modèle, **utilisable dans le message seulement**, pas dans le prompt).

**Delivery (historique des envois)** — `ruleId`, `at`, `channel`, `recipientsCount`, `status` (OK | ERROR), `error?`, `costEur`, `tokens`. Frontend : `hist[]` → `{ r, t, ch, n, st }`.

### 6.6 Modules

**Module** — `id` (bud = Budget, ben = Suivi des bénéfices), `name`, `description`, `scope` (OFF | ALL | PROJECTS), `projectIds[]`. Frontend : `mods[]` → `{ id, n, d, sc, pj, g }`. Le module Budget est **inactif** pour l’instant (décision du brief Cockpit).

**ModuleRequest** — `id`, `moduleId`, `requestedBy`, `projectId`, `at`, `status` (PENDING | APPROVED | REJECTED). Frontend : `reqs[]`. Créée depuis le Cockpit (« Demander l’activation »), traitée ici.

### 6.7 Projets

**Project** — celui du brief Cockpit. La bibliothèque affiche pour chaque projet :
- `code`, `name`, `client` ;
- `status` (PREPARATION | ACTIVE | CLOSED) ;
- la phase en cours, `startDate`, `endDate` ;
- le nombre de lots, phases, chantiers et personnes ;
- le dernier snapshot et un indicateur de santé.

**ProjectImport** — `id`, `fileName`, `fileKey`, `uploadedBy`, `uploadedAt`, `status` (CHECKED | REJECTED | IMPORTED), `report` (JSON : contrôles, erreurs, avertissements), `projectId?`.

---

## 7. Règles métier

### 7.1 Comptes
- Invitation : e-mail valable **14 jours** ; « Relancer » renvoie un nouveau lien et remet le compteur à zéro. Une invitation de plus de 7 jours sans réponse apparaît dans « À traiter ».
- Suspendre : ferme **immédiatement** toutes les sessions ; profils et données conservés. Réactiver : rend l’accès.
- Supprimer : définitif, **refusé si le compte est lié** (RG12) : auteur d’entrées d’audit, responsable d’objets, membre d’une instance. `409` avec la liste des usages.
- L’administrateur connecté ne peut ni se suspendre, ni se supprimer, ni retirer ses propres droits d’administrateur.
- E-mail unique et valide ; nom de 2 caractères au moins ; au moins un projet rattaché.

### 7.2 Fournisseurs et clés
- Tester une clé = un appel minimal au fournisseur. Résultat enregistré : statut, latence, erreur, horodatage.
- « Tester toutes les clés » les teste en parallèle.
- Une clé en erreur **bascule** chaque fonction qui l’utilise en principal sur son modèle de secours. La console affiche : « X tourne sur son modèle de secours ».
- Remplacer une clé = ne stocker que la version chiffrée, tester immédiatement, tracer « Rotation de clé API » (critique).

### 7.3 Affectation des modèles
- Chaque fonction a un modèle principal actif et, en option, un modèle de secours différent du principal.
- État d’une fonction :
  - **Nominal** : le fournisseur du principal est OK ;
  - **Sur secours** : le principal est indisponible et le secours est OK ;
  - **Indisponible** : ni le principal ni le secours ne sont disponibles.
- Coût mensuel estimé = volume de tokens des 30 derniers jours × tarif du modèle, séparément pour l’entrée et la sortie.

### 7.4 Consommation et coûts
- **Dépense du mois** = somme de `UsageRecord.costEur` depuis le 1er du mois (fuseau du projet ou de la plateforme).
- **Projection fin de mois** = dépense + (moyenne journalière des 7 derniers jours ouvrés et week-ends, pondérée comme les données réelles) × jours restants. La console affiche la date de franchissement du plafond au rythme actuel.
- **Plafonds** : global (`all`) et par fonction. Statuts :
  - **Dépassement** : projection > plafond ;
  - **Alerte** : dépense ≥ `warnPct` du plafond ;
  - **Sous le plafond** : sinon ;
  - **Sans plafond** : aucun plafond défini.
- Franchir `warnPct` déclenche la règle « Seuil budgétaire IA atteint » (`n3`), une fois par seuil et par mois.
- Vues : 7 jours, mois en cours, 90 jours. Répartition par fonction, par modèle et par fournisseur.
- **Leviers** affichés : le surcoût du secours (ex. Documents sur Claude Sonnet au lieu de Gemini, ≈ 2,1 fois plus cher) et l’économie obtenue en remplaçant la clé.

### 7.5 Snapshots
- Planifiés : exécutés selon `SnapshotSchedule`, par exemple chaque vendredi à 04:00.
- Manuels : libellé obligatoire.
- Durée de conservation appliquée par une tâche de purge. Les snapshots manuels ne sont purgés qu’au-delà de la durée de conservation.
- Comparer deux snapshots A et B : ajouts, modifications (champ, avant, après) et suppressions, par entité.
- Export d’un snapshot : JSON ou ZIP.

### 7.6 Notifications
- **Génération** : pour chaque déclenchement, le serveur construit le prompt (variables remplacées par les données du projet ciblé) et l’envoie au modèle de la règle. Il insère ensuite la réponse à la place de `{reponse_llm}` dans le message.
- Si le modèle de la règle est **inactif** ou si la clé de son fournisseur est invalide : l’envoi échoue, l’échec est tracé dans l’historique et visible dans « À traiter ».
- Une règle de projet ne s’exécute que pour ses `projectIds`. La règle de plateforme `n3` n’a pas de projet.
- Destinataires = comptes **actifs** ayant l’un des profils ciblés sur le projet concerné (RG5, RG8).
- **Alerte** : jamais regroupée, envoi immédiat. **Notification** : selon la fréquence.
- Enregistrement refusé (`400`) si : nom vide, aucun profil ciblé, aucun canal, aucun projet (hors règle de plateforme), prompt vide, modèle inactif.
- « M’envoyer un test » : génère réellement le message et l’envoie à l’administrateur connecté, avec `source = NOTIFICATION` dans la consommation.
- Chaque génération consomme des tokens et apparaît dans « Consommation et coûts ».

### 7.7 Modules
- `scope = ALL` : le module est actif sur tous les projets, et les nouveaux projets en bénéficient automatiquement.
- `scope = PROJECTS` : actif sur les seuls projets choisis.
- `scope = OFF` : invisible dans le Cockpit, où l’utilisateur voit le module verrouillé et peut demander son activation.
- Approuver une demande active le module sur le projet de la demande. Refuser la clôt. Les deux sont tracés.

### 7.8 Initialisation d’un projet (import Excel)
Voir § 10.6. Le projet créé a le statut **PREPARATION** et apparaît en tête de la bibliothèque avec le badge « Nouveau ».

### 7.9 Vue d’ensemble — « À traiter »
Liste triée erreur › avertissement › info, calculée par le serveur (`attention()` du frontend) :
- clé API invalide, avec les fonctions qui tournent sur leur secours ;
- plafond budgétaire atteint ou dépassé ;
- invitations sans réponse depuis plus de 7 jours ;
- demandes d’activation de module en attente ;
- échecs d’envoi de notifications.

S’y ajoutent les **actions sensibles récentes** : les dernières entrées d’audit de niveau sensible ou critique.

---

## 8. Droits

- Toute la console est réservée au profil **ADMIN** (RG1, RG7, RG16). `403` sinon, et masquage complet côté frontend.
- L’Admin est en **lecture seule sur les données métier** (RG6) : il voit la bibliothèque et les prévisualisations, mais ne modifie aucune donnée du référentiel ni du transactionnel.
- **Exception** : l’initialisation d’un projet par import Excel est une action d’Admin (paramétrage de la plateforme). Le référentiel créé devient ensuite la propriété du PMO du projet.
- Chaque écriture enregistre `profileUsed = ADMIN` dans l’audit.

---

## 9. API — `/api/admin`

Format d’erreur, pagination et verrouillage optimiste (`If-Match`) : ceux du brief Cockpit (§ 9.1).

### 9.1 Vue d’ensemble
- `GET /overview` → `{ date, health, vitals[], attention[], recentSensitive[] }`

### 9.2 Comptes
- `GET /accounts?status=&profile=&project=&q=&staleDays=` → liste + compteurs par statut et par profil, **calculés sur le filtre courant** (la console synchronise les deux compteurs)
- `GET /accounts/{id}` → compte + projets + chantiers par projet (lecture seule, depuis `Habilitation`)
- `POST /accounts` (invitation) ← `{ fullName, email, profile, projectCodes[] }` → `201`, e-mail envoyé
- `PATCH /accounts/{id}` ← `{ fullName?, email?, profile?, projectCodes[]? }`
- `POST /accounts/{id}/suspend` · `/reactivate` · `/resend-invite`
- `DELETE /accounts/{id}` → `409` + usages si le compte est lié
- `GET /accounts/{id}/sessions` · `DELETE /accounts/{id}/sessions/{sid}` · `DELETE /accounts/{id}/sessions`

### 9.3 Administrateurs et audit
- `GET /admins` · `POST /admins` ← `{ accountId }` · `DELETE /admins/{accountId}` (`409` s’il ne reste qu’un administrateur ou si c’est soi-même)
- `GET /audit?severity=&q=&from=&to=&projectId=&actor=` (lecture seule) · `GET /audit/export.csv`

### 9.4 Fournisseurs et modèles
- `GET /providers` · `POST /providers` ← `{ name, apiKey }` · `PUT /providers/{id}/key` ← `{ apiKey }` · `POST /providers/{id}/test` · `POST /providers/test-all`
- `GET /models?provider=` · `PATCH /models/{id}` ← `{ name?, description?, priceIn?, priceOut?, active? }` (un changement de tarif est tracé comme action sensible)

### 9.5 Affectation
- `GET /assignments` → par fonction : `{ primary, fallback, state, volume30d, costByModel[] }`
- `PUT /assignments` ← `{ insights:{primary,fallback}, crud:{…}, docs:{…} }`

### 9.6 Consommation et coûts
- `GET /usage?from=&to=&groupBy=day|function|model|provider&projectId=` → séries et agrégats (€, tokens in/out)
- `GET /usage/month` → `{ spent, projection, crossDate?, rate7d, sameDateLastMonth, byFunction[], fallbackDays[] }`
- `GET /budget-thresholds` · `PUT /budget-thresholds/{id}` ← `{ limitEur?, warnPct, enabled }`
- `GET /usage/export.csv?from=&to=`

### 9.7 Snapshots
- `GET /projects/{id}/snapshots` · `POST /projects/{id}/snapshots` ← `{ label }` (asynchrone, progression consultable)
- `GET | PUT /projects/{id}/snapshot-schedule`
- `GET /snapshots/compare?a=&b=` → `{ summary, changes[] }`
- `GET /snapshots/{id}/export`
- **Aucune route de restauration.**

### 9.8 Notifications
- `GET /notification-rules` · `POST` · `PATCH /{id}` · `POST /{id}/enable|disable`
- `POST /notification-rules/{id}/preview` ← `{ sampleContext }` → `{ subject, body, llmResponse, tokens, costEur, ms }`
- `POST /notification-rules/{id}/test` → envoi réel à l’administrateur connecté
- `GET /deliveries?ruleId=` · `POST /deliveries/{id}/retry`

### 9.9 Modules
- `GET /modules` · `PATCH /modules/{id}` ← `{ scope, projectIds[] }`
- `GET /module-requests` · `POST /module-requests/{id}/approve|reject`
- Côté Cockpit : `POST /api/projects/{projectId}/module-requests` ← `{ moduleId }`

### 9.10 Projets
- `GET /projects?status=&q=` → cartes de la bibliothèque (§ 6.7)
- `POST /project-imports` (multipart, `.xlsx`) → `{ importId, report }` : contrôle seul, rien n’est créé
- `GET /project-imports/{id}/preview?tab=` → données du référentiel lues, onglet par onglet, et planning (phases, sous-phases)
- `POST /project-imports/{id}/commit` → création **transactionnelle** du projet et de tout son référentiel → `{ projectId, code }`
- `GET /project-imports/{id}/report`

### 9.11 Profil de l’administrateur
- `GET | PATCH /me/profile` · `GET /me/sessions` · `DELETE /me/sessions/{id}` · `POST /me/password-reset` · `PATCH /me/notifications`

### 9.12 Jev (console)
- `POST /assistant/messages` ← `{ context:{ section }, text }` → `{ reply, sources[], actions[] }`
- Les actions proposées (suspendre des comptes, ouvrir un écran…) exigent une confirmation explicite. Jev ne lit, n’affiche ni ne saisit **jamais** de clé API, et ne déclenche aucune action irréversible depuis la conversation.

---

## 10. Traitements de fond

| # | Tâche | Déclenchement | Effet |
|---|---|---|---|
| 10.1 | Test des clés | Toutes les 2 h + à la demande | Met à jour `Provider.status` ; bascule sur le secours ; alerte critique si erreur |
| 10.2 | Collecte de consommation | À chaque appel LLM (Cockpit, Jev, notifications, import) | Crée un `UsageRecord` au tarif du moment |
| 10.3 | Alertes budgétaires | Après chaque `UsageRecord` + une fois par heure | Déclenche `n3` au franchissement de `warnPct`, une fois par seuil et par mois |
| 10.4 | Snapshots planifiés | Selon `SnapshotSchedule` | Capture, puis purge au-delà de la conservation |
| 10.5 | Notifications | Événements du Cockpit (jalon en retard, risque critique, document analysé) et planning (quotidien, hebdomadaire) | Génère via le LLM, puis envoie par canal ; écrit `Delivery` |
| 10.6 | Import Excel | `POST /project-imports` | Voir ci-dessous |

### 10.6 Import du fichier d’initialisation
Le format et les règles de lecture sont ceux du brief Cockpit (§ 10). En plus, pour la console :

1. **Structure** : les 13 onglets sont présents (`01 Équipes` … `13 Livrables`). Sinon, erreur par onglet manquant.
2. **Fiche projet** (`05 Projet`, colonne D) : les champs obligatoires sont renseignés. Le **code projet** est obligatoire et **unique dans la bibliothèque** (sinon erreur « Le code X existe déjà »).
3. **Champs obligatoires** de chaque onglet, pour chaque ligne commencée.
4. **Contrôles du fichier** : une cellule de la colonne Contrôle qui commence par `⚠` est une **erreur**, et une cellule qui commence par `◔` est un **avertissement**.
5. **Doublons** de clé et références entre onglets (§ 10 du brief Cockpit).

Chaque erreur et avertissement porte `{ level, sheet, row, column?, message }`.
- **Au moins une erreur** : import bloqué, rien n’est créé.
- **Avertissements seuls** : l’import est autorisé après prévisualisation.
- Validation (`commit`) : **tout ou rien**, dans une transaction.
- Le projet est créé au statut PREPARATION.
- L’import est tracé dans l’audit : « Initialisation d’un projet », code et nom du fichier, niveau sensible.

---

## 11. Branchement du frontend

Modifications localisées, sans toucher au design, aux textes ni à `support.js` :

1. Créer `admin-api.js` (module ES) : appels, jeton, gestion d’erreur. Le partager avec le `api.js` du Cockpit si possible.
2. Remplacer l’initialisation de l’état (constantes `USERS`, `AUDIT0`, `PROV0`, `MODELS0`, `SNAPS0`, `RULES0`, `HIST0`, `mods`, `reqs`) par des `GET` au montage, puis à l’ouverture de chaque menu.
3. Chaque méthode qui modifie l’état (`saveUser`, `suspend`, `reactivate`, `resend`, `removeUser`, `saveAdmin`, `removeAdmin`, `saveKey`, `testKey`, `testAll`, `toggleModel`, `saveModel`, `saveFiche`, `saveAsg`, `capture`, `saveRule`, `toggleRule`, `setScope`, `togProj`, `approve`, `reject`, `revoke`, `revokeAll`, `saveMe`) appelle l’endpoint correspondant, puis met à jour l’état avec la réponse.
4. Supprimer `this.log(...)` côté client : le serveur écrit l’audit.
5. `ConsoCouts` : remplacer `data()` (données générées) par `GET /usage/month` et `GET /usage` ; les plafonds par `/budget-thresholds`.
6. `ProjetInit` : remplacer la lecture du fichier dans le navigateur (SheetJS) et `demoData()` par `POST /project-imports`, `/preview`, `/commit`. Garder « Charger l’exemple » en mode démonstration uniquement.
7. `ProjetsBiblio` : liste depuis `GET /projects`. Le bouton « Ouvrir » ouvre le Cockpit sur le projet choisi (`/projects/{id}`).
8. Remplacer les temporisations simulées par l’état réel des tâches (progression de la capture, du test, de l’import).

---

## 12. Écarts connus dans le frontend de la console

À corriger côté serveur ou à signaler, sans choisir en silence :

- **Données de démonstration** :
  - `genUsage()` produit des consommations fictives ;
  - les projets ATLAS, HORIZON, NOVA et ORBIT n’ont ni chantiers ni habilitations réelles ;
  - seul RISE a des chantiers.
- **Profil unique affiché** : la console montre le profil le plus fort d’un compte. Le serveur doit renvoyer la liste complète des habilitations par projet et par chantier.
- **Plafonds de `ConsoCouts`** : ils sont propres à l’écran et ne sont pas synchronisés avec les seuils `th` de la Vue d’ensemble. Une seule source côté serveur : `BudgetThreshold`.
- **Coûts affichés** : ce sont des estimations construites à partir des tarifs. Le serveur fait foi.
- **Lien « Ouvrir »** de la bibliothèque et lien « Ouvrir le Cockpit » : ils pointent vers `RISE Cockpit.dc.html`, quel que soit le projet.
- **Code mort** : `setAdminLv`, `lvSeg`, `restore()` et les méthodes de la matrice (`cell`, `setLv`, `reviewRights`, `profLv`, `modLv`, `fnLv`, `saveProf`) restent dans le code sans être accessibles. À ne pas implémenter.

---

## 13. Plan de travail et critères d’acceptation

1. **Accès** : *un PMO sans profil Admin reçoit `403` sur `/api/admin/overview`* ; *un Admin reçoit `200`* ; *toute écriture crée une entrée d’audit avec `profileUsed = ADMIN`*.
2. **Comptes** :
   - *inviter un e-mail déjà utilisé → `409`* ;
   - *suspendre ferme les sessions actives* ;
   - *supprimer un compte lié → `409` + usages* ;
   - *filtrer par profil Responsable renvoie des compteurs de statut cohérents avec ce filtre*.
3. **Administrateurs** : *retirer le dernier administrateur → `409`* ; *un administrateur ne peut pas se retirer lui-même*.
4. **Clés** :
   - *une clé révoquée passe en ERROR, et Documents passe « Sur secours »* ;
   - *aucune réponse ne contient la clé en clair* ;
   - *remplacer la clé la reteste et trace une action critique*.
5. **Consommation** :
   - *la dépense du mois est la somme des `UsageRecord`* ;
   - *la projection et la date de franchissement sont cohérentes avec le rythme des 7 derniers jours* ;
   - *franchir 80 % déclenche `n3` une seule fois*.
6. **Snapshots** : *un snapshot manuel sans libellé → `400`* ; *la comparaison renvoie ajouts, modifications et suppressions* ; *aucune route de restauration n’existe*.
7. **Notifications** :
   - *enregistrer sans prompt → `400`* ;
   - *un modèle inactif → `400`* ;
   - *`preview` renvoie un message où `{reponse_llm}` est remplacé* ;
   - *un envoi consomme des tokens visibles dans la consommation*.
8. **Modules** : *approuver une demande active le module sur le seul projet demandé*.
9. **Import** :
   - *un fichier avec un onglet manquant → rapport en erreur, rien créé* ;
   - *un code existant → erreur* ;
   - *un fichier conforme → `commit` crée le projet au statut PREPARATION, visible dans `GET /projects`* ;
   - *une erreur pendant `commit` annule tout*.
10. **Branchement** : *tous les écrans de la console s’affichent comme avant, et une modification survit au rechargement*.

---

## 14. Règles de conduite

Celles du brief Cockpit (§ 14) s’appliquent : ne pas deviner, isoler toute hypothèse derrière une constante nommée et la lister dans `DECISIONS.md`, ne pas créer de fonctionnalité absente de la console, ne pas renommer les champs attendus par le frontend, rapport court à la fin de chaque étape.

Livrables finaux : code source (dans le même dépôt que le backend du Cockpit), migrations, script d’amorçage (données de démonstration de la console), `openapi.json` complété, `README.md`, `DECISIONS.md`, `admin-api.js` et la console branchée.
