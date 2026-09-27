# Décisions d'arbitrage

Ces décisions ont été tranchées par le commanditaire le 27/09/2026, à partir des questions de `docs/03-QUESTIONS.md`. Chaque hypothèse du code renvoie à l'une d'elles par une constante nommée (colonne « Constante / lieu »).

| # | Sujet | Décision | Constante / lieu |
|---|---|---|---|
| Q1 | Modifications des frontends | **Branchement complet** : `api.js` et `admin-api.js`, chaque méthode d'écriture appelle l'API. Design et textes restent inchangés. Chaque modification est justifiée dans `frontends/CHANGES.md`. | — |
| Q2 | Chantier des actions | Ajout de `Action.wsId`, **obligatoire**. À l'amorçage, il est dérivé de la source (risque, problème, jalon ou décision → son chantier), sinon C8. Un champ Chantier est ajouté au formulaire d'action. | `DEFAULT_TRANSVERSAL_WS_CODE = 'C8'` |
| Q3 | Profils des comptes | Habilitations fines par projet et par chantier, plus `AdminGrant`, synchronisés avec l'habilitation ADMIN. La console attribue ADMIN et PMO sur les projets choisis. RESPONSABLE et LECTEUR pour une personne du référentiel → `422` (attribués par le PMO). Lecteur externe → `PUT /accounts/{id}/reader-scopes`. La console affiche le profil le plus fort, calculé par le serveur. Profil utilisé dans l'audit = le profil qui accorde le droit ; ADMIN dans la console. | `domain/rights` |
| Q4 | Import Excel | Le serveur **refait tous les contrôles** et fait foi. Les cellules `⚠` / `◔` de la colonne CONTRÔLE sont ajoutées au rapport comme indications. La colonne Permission est ignorée. Valeurs par défaut : responsable de phase = directeur de programme, avancement 0, rôle de membre MEMBER, prénom et nom séparés au premier espace, devise EUR, « Bimensuelle » → BIWEEKLY. Codes C\* et J\* réattribués par le serveur. Les habilitations LECTEUR ne sont pas créées (le PMO les attribue ensuite). | `import/defaults.ts` |
| Q5 | Critères contredits par les données | **La règle fait foi** : nouvelle séance du COPIL = n°24 ; `late` calculé (4 actions en retard) ; `maker` = p04 pour D-005, D-009 et D-010 à l'amorçage. | `seed/fixes.ts` |
| Q6 | Affectations | Une affectation par rôle inscrit dans `PERSON.cells[4]`. Début = début du projet ; fin = fin de l'ancien `PROJECT_ASSIGNMENT` s'il existe. | `seed/assignments.ts` |
| Q7 | Transitions de séance | PLANNED → HELD si `dateIso ≤ today` (sinon `422`) ; PLANNED → CANCELLED ; CANCELLED → PLANNED. HELD → quoi que ce soit : `422`. | `domain/sessions` |
| Q8 | Saisies sans entité dans le brief | **Toutes persistées** : dates de phase par lot, avancement prévu forcé, historique du go-live, chronologie, niveau de rôle, surcharges des tâches calculées, suppression de template, composant `budget` et portée PHASE, type d'équipe. | `schema.prisma` (commentaires `Q8`) |
| Q8 bis | « Inviter » depuis le Référentiel | Crée une **demande d'invitation** (`InvitationRequest`), visible dans « À traiter » de la console. L'Admin la valide (le compte INVITED est créé et l'e-mail envoyé) ou la refuse. | `InvitationRequest` |
| Q9 | Signal `sig` d'avancement | Écart `valuePct − targetPct` : < −20 → RISK, < 0 → WATCH, sinon OK (règle du frontend). La fraîcheur à 7 et 14 j sert à « À revoir ». | `SIG_RISK_GAP = -20`, `SIG_WATCH_GAP = 0` |
| Q10 | Console | Module Budget inactif partout à l'amorçage. Planification des snapshots par projet. Fournisseur UNTESTED = indisponible. Snapshot manuel sans libellé → `400`. | `seed/admin.ts`, `domain/ai` |
| Q11 | Déploiement | docker-compose (API + PostgreSQL). Stockage sur disque et e-mails dans les logs, derrière des interfaces remplaçables. JWT avec connexion de développement ; pas de SSO pour l'instant. | `.env.example` |
| Q12 | Dépôt | Monorepo : `frontends/` (copie d'origine, puis branchement tracé), `backend/`, `docs/`. | — |

## Décisions techniques prises sans question

Ces choix découlent directement des briefs ou de la règle « le plus prudent ».

- **`refUsage` côté serveur** : il vérifie l'**union** des usages de `refUsage()` (frontend) et du brief § 7.7, en suivant les clés étrangères réelles.
- **Routes `/api/admin`** : le brief Console fait foi (§ 2 de ce brief). Les routes du Cockpit § 9.11 qui ne se recoupent pas avec lui (`global-profiles`, `reader-scopes`) sont livrées en plus.
- **Anomalies de l'écran Aujourd'hui** : risques **critiques** sans plan (brief), jalons non confirmés depuis plus de 14 j (alerte) et plus de 7 j (vigilance), budget non renseigné, modifications depuis la capture du dernier rapport, plus les actions échues (frontend).
- **D-002** passe au statut SUPERSEDED à l'amorçage, puisque D-007 la remplace.

## Décisions prises pendant le développement (écarts documentés, sans question bloquante)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| RG16 et § 13.7 | Deux règles du brief se contredisent pour la modification d'un objet existant hors périmètre de lecture (ex. risque de C3 modifié par le Responsable de C5). RG16 donnerait 404 ; § 13.7 exige explicitement 403. Retenu : **403** en écriture, **404** en lecture. | `WRITE_OUT_OF_SCOPE_STATUS` (`transactional.ts`) |
| Décision arbitrée | Toute modification (`PATCH`, fiche, suppression) d'une décision ARBITRATED → `409 READ_ONLY`. L'arbitrage d'une décision qui en remplace une autre fait passer l'ancienne à SUPERSEDED (tracé). Une décision ne passe à ARBITRATED qu'avec son texte `decL` (`422`). | `DECISIONS.guardPatch` |
| Clôture de décision | Règle du frontend reprise : passage à un statut clos sans `ddIso` → date du jour ; réouverture → `ddIso` effacée. | `transactional.ts` |
| Action : `closedAt` | Posée à la date du jour au passage à DONE, effacée à la réouverture. | `ACTIONS.prepare` |
| Signal `sig` (Q9) | Calculé : écart < −20 → RISK, < 0 → WATCH, sinon OK. Le jeu stockait `ok` pour « Recette Achats » (77 / 80) : le calcul donne WATCH. | `SIG_RISK_GAP`, `SIG_WATCH_GAP` |
| Séances : identifiant | `S-<instance>-<numéro>` quand il est libre (lisible, comme la démo). | `committees.controller.ts` |
| Rapport : fichier | `GET /reports/{id}/file` génère un PDF texte minimal (jalons, risques, décisions, actions selon les composants du template), stocké puis resservi. La mise en page réelle des supports est hors périmètre. | `core/pdf.ts` |
| Rapport publié | Un rapport PUBLISHED ne revient pas à un statut antérieur (`422`). | `patchReport` |
| Templates : pages | `pages = 1 + Σ poids des composants`, avec les poids du frontend (`PW`). | `PAGE_WEIGHT` |
| Écran Aujourd'hui | Le message compte les validations dont l'utilisateur est décideur (brief § 7.9) et **toutes ses tâches** (§ 7.12 : actions, décisions, jalons, tâches manuelles). Le frontend ne comptait que ses actions. Instance annoncée : nom court `COPIL`. | `WELCOME_BODY_SHORT_NAME` |
| Baromètre : droits | PMO ou Responsable du chantier de code `C8`. | `BAROMETER_WS_CODE` |
| Budget | Lecture toujours possible (avec `moduleActive`). Écriture : PMO et module actif sur le projet, sinon `409 MODULE_INACTIVE`. | `BUDGET_MODULE_ID` |
| Nom et dates du projet RISE | Nom pris dans `project.name` (plus récent que `model.PROJECT`). Début et fin du Référentiel : 01/03/2024 → 31/12/2030. La fin du planning (`projectEnd`) est calculée sur les phases (30/06/2028). | `seed/rise.ts` |
| Membres d'instance | Le jeu n'a pas de rôle. Le sponsor (p04) préside COPIL et Comité sponsors ; le directeur de programme (p03) préside COPROJ et Arbitrage ; pour les autres instances, le premier membre préside. | `memberRole()` |
| Problème P03 | Échéance « fin sept. » → 30/09/2026. | `seed/rise.ts` |
| Projets ATLAS, HORIZON, NOVA, ORBIT | Créés sans référentiel (brief Console § 12). Les compteurs de la bibliothèque viennent de `project.display.demoCounts`, marqués `demo: true` dans la réponse, tant que le projet n'a aucun référentiel réel. | `seed/admin.ts` |
| Consommation de démonstration | Série `genUsage()` reproduite à l'identique et chargée en `UsageRecord`. Elle est recalée sur 1 032,40 € au 26/09 en comptant **depuis le 1er du mois** (brief § 7.4), alors que la console comptait depuis le 2. | `domain/demo-usage.ts` |
| Clés API de démonstration | Clés fictives chiffrées (AES-256-GCM). La clé Google contient `revoked` : le test bouchon la déclare en erreur (401). | `seed/admin.ts` |
| Import Excel (Cockpit) | `POST /referential/import` n'initialise qu'un référentiel **vide** (`409 REFERENTIAL_NOT_EMPTY` sinon). Le code projet du fichier doit être celui du projet. Réponse : `?dryRun=true` → 200 avec le rapport ; mode réel avec erreurs → `422 IMPORT_REJECTED` (rien n'est créé) ; sinon 200. | `import.service.ts` |
| Import Excel : identifiants | Identifiants techniques `<CODE>-<type>-<n>` ; codes C\* et J\* réattribués dans l'ordre des lignes ; habilitations RESPONSABLE créées pour les responsables de chantier (brief § 10). Chantier sans dates : dates du projet. | `commitPlan()` |
| Import Excel : historique | Une entrée de création par objet (origine IMPORT), plus une entrée « Import du Référentiel ». | `commitPlan()` |
| Initialisation d'un projet (console) | L'Admin crée le projet (exception à sa lecture seule, brief Console § 8). Le compte de l'Admin est rattaché au projet ; une planification de snapshots par défaut est créée. | `data.controller.ts` |
| Désactivation d'un modèle | Refusée (`409 MODEL_IN_USE`) si le modèle est le principal d'une fonction (§ 7.3 : principal toujours actif). | `ai.controller.ts` |
| Fournisseur « non testé » | Indisponible (Q10), aussi bien pour l'état des fonctions que pour les appels. | `LlmService.modelAvailable` |
| Passerelle LLM | Bouchon déterministe : texte dérivé du prompt, jetons estimés à ~4 caractères par jeton, coût au tarif du moment, bascule principal → secours, `503 AI_UNAVAILABLE` si aucun n'est disponible. Test de clé : une clé contenant « revoked » ou de moins de 20 caractères est refusée (401). | `core/llm.service.ts` |
| Règles de notification : déclencheur | **Ajout au modèle** : champ `trigger` (SCHEDULE, MILESTONE_LATE, RISK_CRITICAL, DOCUMENT_ANALYZED, BUDGET_THRESHOLD, MANUAL), car une règle doit savoir quel événement la déclenche. Amorçage : n1 → MILESTONE_LATE, n2 → RISK_CRITICAL, n3 → BUDGET_THRESHOLD, n4 → SCHEDULE, n5 → DOCUMENT_ANALYZED. Une alerte créée dans la console est MANUAL par défaut (la console n'a pas de sélecteur de déclencheur). | `schema.prisma` |
| Envois : dédoublonnage | `Delivery.eventKey` garantit un seul envoi par événement (ex. « n2 · RISE · R07 ») et un seul envoi de l'alerte budgétaire par seuil et par mois. | `NotificationsService.deliver` |
| Jalon en retard | Jalon dont la date prévue est passée et qui n'a pas été confirmé depuis cette date. | `NotificationsService.tick` |
| Destinataires | Comptes actifs ayant l'un des profils ciblés sur le projet ; pour une règle de plateforme, sur n'importe quel projet ; ADMIN via `AdminGrant`. | `ProfilesService.recipients` |
| Projection de fin de mois | Dépense + moyenne journalière des 7 derniers jours civils × jours restants. Date de franchissement : premier jour où le cumul projeté atteint le plafond global. | `PROJECTION_WINDOW_DAYS` |
| Statut de plafond | Plafond désactivé ou absent → « Sans plafond » ; projection > plafond → Dépassement ; dépense ≥ seuil → Alerte ; sinon Sous le plafond. | `UsageService.status` |
| Snapshots | Capture JSON de toutes les tables du projet (stockage objet), exécutée par la file de tâches. Les snapshots de démonstration n'ont pas de contenu : leur comparaison cumule les écarts connus (`EV`). Purge au-delà de la conservation, snapshots manuels compris. | `snapshots.service.ts` |
| Journal d'audit | Purge quotidienne au-delà de 24 mois, seule suppression autorisée par le trigger (variable de session `rise.allow_audit_purge`). Dans le Cockpit, `GET /audit` ne renvoie que l'historique d'un objet lisible (le journal complet reste réservé à l'Admin, RG15). | `AUDIT_RETENTION_MONTHS` |
| Documents restreints | Documents RESTRICTED visibles des seuls profils globaux (PMO, Admin) : règle prudente, le brief ne la précise pas. | `RESTRICTED_VISIBLE_TO_GLOBAL_ONLY` |
| Demande d'activation de module | Depuis le Cockpit : PMO ou Responsable. Une demande en attente n'est pas dupliquée. | `collab.controller.ts` |
| Réactivation d'un compte | Retour à ACTIVE si le compte s'est déjà connecté, sinon INVITED. | `accounts.controller.ts` |
| Soi-même | Un Admin ne peut ni se suspendre, ni se supprimer, ni retirer ses propres droits d'administrateur (`409 SELF_ACTION`), ni révoquer sa session courante. | `accounts.controller.ts` |
