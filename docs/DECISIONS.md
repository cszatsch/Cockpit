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

## Authentification (spécification `docs/specs/AUTH - specification.md`, 28/09/2026)

Demande du commanditaire : deux écrans de connexion distincts (application, administration) avec leur propre adresse, sans inscription en libre-service, avec blocage temporaire, expiration de session, réinitialisation par lien à usage unique et compte initial. Elle remplace le « pas de SSO, connexion de développement » de Q11 : `dev-login` reste disponible, mais seulement avec `AUTH_DEV=true` (tests, `?as=`).

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Adresses | `/connexion` → `/` (Cockpit) ; `/console/connexion` → `/console` ; `/mot-de-passe/reinitialiser?token=…`, habillé selon la surface d'origine du lien. `/` et `/console/*` sans session de leur surface → écran de connexion correspondant (302). | `core/auth/pages.ts` (`PAGES`) |
| Hachage | Argon2id, paramètres OWASP (19 Mio, 2 itérations, 1 fil), via `@node-rs/argon2` (binaire précompilé, rien à compiler sous Windows). | `password.ts` (`ARGON2`) |
| Règles du mot de passe | 12 caractères minimum, majuscule et minuscule, chiffre, caractère spécial (écran et serveur) ; côté serveur, en plus : 128 caractères maximum, différent du précédent, absent d'une liste locale de mots de passe compromis courants. L'API k-anonyme Have I Been Pwned est interrogée en complément si `PWNED_CHECK=true` et hors `OFFLINE` ; si elle est injoignable, seule la liste locale s'applique. | `PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_LENGTH`, `COMPROMISED`, `PWNED_CHECK` |
| Message d'échec | Toujours « Identifiant ou mot de passe incorrect » (401 `INVALID_CREDENTIALS`, avec `remaining`). Adresse inconnue, mot de passe faux, compte suspendu ou invité : même réponse. Une adresse inconnue coûte le même hachage (empreinte factice). Durée minimale de réponse : 400 ms. | `INVALID_CREDENTIALS`, `dummyHash`, `LOGIN_MIN_MS` |
| Blocage | 5 échecs consécutifs par adresse e-mail (qu'un compte existe ou non) → 423 `ACCOUNT_LOCKED` `{ retryAfter }` pendant 15 min, même avec le bon mot de passe. Un compteur sans nouvel échec depuis 15 min repart de zéro. Le blocage d'un compte existant est journalisé (sensible). | `MAX_FAILURES`, `LOCK_MINUTES`, `FAILURE_WINDOW_MINUTES` |
| Blocage par IP | La spécification demande un compteur par compte **et** par IP. Un seuil de 5 par IP bloquerait tout un bureau derrière la même adresse : retenu **20 échecs** par IP (toutes adresses confondues), puis 15 min. `TRUST_PROXY` donne l'IP réelle derrière un mandataire inverse. | `IP_MAX_FAILURES` |
| Session | Cookie de session HttpOnly, `Secure`, `SameSite=Strict`, **un par surface** (`rise_session`, `rise_admin_session`) : une connexion à la console n'ouvre pas le Cockpit, et inversement. Le jeton est un JWT `{ sub, sid, rot }` ; la session en base fait foi (révocation, inactivité). `COOKIE_SECURE=false` n'est utile que pour un accès http hors `localhost`. | `SESSION_COOKIE`, `COOKIE_SECURE` |
| Rotation | `POST /keepalive` (« Rester connecté ») et le changement de mot de passe incrémentent `AuthSession.rotation` : le cookie précédent devient invalide. | `SessionService.rotate` |
| CSRF | Double soumission : le cookie lisible `rise_csrf` / `rise_admin_csrf` porte un HMAC de l'identifiant de session, que la page renvoie dans `X-CSRF-Token`. Obligatoire pour toute écriture authentifiée par cookie (403 `CSRF`), en plus de `SameSite=Strict`. Le jeton porteur (API, tests) n'est pas concerné. | `csrfFor`, `CSRF_HEADER` |
| Inactivité | 30 min (application), 15 min (console) ; « Toujours là ? » 60 s avant, Échap = rester connecté. Le navigateur suit l'activité (souris, clavier, toucher, défilement), la partage entre onglets et la signale au serveur au plus une fois par minute. Le serveur ferme la session après l'inactivité de la surface **+ 2 min** de marge, pour que ce soit toujours le navigateur qui expire le premier, avec son message. | `IDLE_MINUTES`, `IDLE_WARNING_SECONDS`, `SERVER_IDLE_GRACE_MINUTES` |
| Console et droits | `surface=admin` avec un compte sans `AdminGrant` → 403 `ADMIN_REQUIRED` après authentification, aucune session ouverte, tentative journalisée (sensible). L'API `/api/admin/*` n'accepte que le cookie de la console. | `auth.controller.ts` |
| Première connexion | `mustChangePassword` → session **limitée** : seules les routes `@AllowRestricted()` (changement de mot de passe, déconnexion) répondent, les autres renvoient 403 `PASSWORD_CHANGE_REQUIRED`. Le mot de passe provisoire vient d'être vérifié : l'écran ne le redemande pas. Hors première connexion, `POST /api/auth/password` exige le mot de passe actuel. | `AllowRestricted`, `AuthSession.restricted` |
| Mot de passe oublié | Toujours 202 et le message neutre ; le traitement est détaché de la réponse, dont la durée ne dépend donc pas de l'existence du compte. Jeton aléatoire de 256 bits, stocké haché (SHA-256), à usage unique, valable 30 min ; un nouveau lien annule les précédents. Au plus un envoi par minute et cinq par heure par compte (au-delà, rien n'est envoyé, sans le dire). Compte suspendu : rien n'est envoyé. | `RESET_TOKEN_MINUTES`, `RESET_RESEND_SECONDS`, `RESET_MAX_PER_HOUR`, `TOKEN_BYTES` |
| Réinitialisation | `POST /reset` consomme le lien, annule les autres liens du compte, lève le blocage de l'adresse et **ferme toutes les sessions** du compte ; journalisée (sensible). | `auth.controller.ts` |
| Invitation | Pas d'inscription en libre-service (aucune route publique de création de compte). L'invitation de la console (création et relance) envoie un lien du même type, `INVITE`, valable 14 jours : l'invité y choisit son mot de passe, et le compte passe de INVITED à ACTIVE. Surface du lien : console si le profil est ADMIN, sinon application. | `INVITE_VALIDITY_DAYS`, `PasswordToken.purpose` |
| Compte initial | Cédric Schmitz, `c.schmitz@groupeonepoint.com`, identifiant `u-initial` : `AdminGrant` + PMO sur chaque projet existant (et rattaché à chacun). Mot de passe provisoire lu dans `RISE_INITIAL_ADMIN_PASSWORD` (jamais écrit dans le code, les journaux ni `.env.example`), qui doit respecter les règles, puis haché ; `mustChangePassword=true`. Créé par `npm run init:admin` (refus si la variable est absente ou si le compte existe), au démarrage de l'API et à l'amorçage si la variable est définie. `demarrer-rise.ps1` demande le mot de passe en saisie masquée quand le compte n'existe pas (premier lancement, ou après `-Reinitialiser`, qui vide la base). | `core/auth/initial-admin.ts` (`INITIAL_ADMIN`, `INITIAL_PASSWORD_ENV`) |
| E-mails en développement | Sans SMTP et avec `AUTH_DEV=true`, le lien de réinitialisation est aussi écrit dans le journal du serveur, pour pouvoir tester sans messagerie. | `CredentialsService.forgot` |
| Liens et en-têtes | Les liens des e-mails utilisent `APP_URL`. Les pages servies portent `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: no-referrer` et `Cache-Control: no-store`. L'écran retire le jeton de l'adresse dès sa lecture. | `APP_URL`, `pages.ts` (`HEADERS`) |
| Double authentification | **Pas pour l'instant** (décision du commanditaire, 28/09/2026). Les écrans affichaient « Authentification à deux facteurs · Activée » (Cockpit, Console) et « Confirmation renforcée · Activée » (Console), et la fermeture de session d'un autre appareil annonçait une reconnexion « avec la double authentification » : ces mentions, fausses, sont retirées. De même, « renouvellement exigé tous les 6 mois pour les administrateurs », qui n'est pas appliqué. | `CHANGES-cockpit.md`, `CHANGES-console.md` |
| Changement de mot de passe depuis le profil | **Oui** (décision du 28/09/2026). « Mon profil › Sécurité › Modifier » (Cockpit et Console) ouvre une fenêtre commune : mot de passe actuel, nouveau mot de passe et confirmation, mêmes règles et même jauge que les écrans de connexion. `POST /api/auth/password` vérifie le mot de passe actuel, applique les règles du serveur, ferme les autres sessions du compte, renouvelle le jeton de la session courante et journalise le changement (sensible). La ligne affiche l'ancienneté réelle du mot de passe (`passwordChangedAt`). La demande simulée `POST /api/admin/me/password-reset` (e-mail sans lien) est supprimée. | `openPasswordDialog` (`auth-api.js`), `passwordAgeLabel` |

## Modèles d'IA : catégorie et réinitialisation (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Catégorie d'un modèle | Nouveau champ **Catégorie** du formulaire des modèles (dialogue et fiche) : **LLM**, **Embedding** ou **Reranking**. Colonne `AiModel.category` (énumération `ModelCategory`, défaut LLM : les modèles existants sont des LLM). Badge de catégorie dans la liste des modèles. Changement de catégorie tracé (sensible). | `MODEL_CATEGORIES` (`ai.controller.ts`), migration `20260930000000_categorie_modele` |
| LLM seulement là où l'on génère du texte | Les fonctions du Cockpit (affectation principal et secours) et les règles de notification n'acceptent qu'un LLM (`422` / `400`) ; la passerelle LLM considère un Embedding ou un Reranking comme indisponible. Un modèle affecté ou utilisé par une règle ne peut pas quitter la catégorie LLM (`409 MODEL_IN_USE`). Les listes de la console (affectation, règles) ne proposent que les LLM. | `GENERATIVE_CATEGORY`, `LlmService.modelAvailable` |
| Ajout d'un modèle | La console ne permettait que de modifier un modèle. Ajout, **sur choix du commanditaire** : bouton « Ajouter un modèle » (Fournisseurs et modèles), même formulaire avec le fournisseur en plus, `POST /api/admin/models` (tracé, sensible). Identifiant lisible tiré du nom (« Claude Sonnet 4.5 » → `claude-sonnet-4-5`, suffixé en cas de doublon) ; un fournisseur ne peut pas avoir deux modèles du même nom (`409`). | `modelSlug()` |
| Suppression d'un modèle | Bouton « Supprimer » du formulaire, `DELETE /api/admin/models/{id}` : refusée (`409 IN_USE`, avec les usages) si le modèle est affecté, choisi par une règle de notification ou présent dans l'historique de consommation, qui garde ainsi son nom. Il reste possible de le désactiver. | `AiController.modelUsages` |
| Réinitialisation des modèles | **Décision du commanditaire** : suppression des modèles, de leur affectation et du suivi des coûts (consommation et alertes budgétaires déjà envoyées), fournisseurs conservés. Plafonds budgétaires et règles de notification conservés ; le modèle de chaque règle est à choisir de nouveau (l'éditeur l'indique, et un envoi échoue et se trace tant qu'aucun LLM n'est choisi). Script `npm run ia:reinitialiser -- --confirmer` (sans l'option : simple décompte), tracé au journal d'audit (critique). Exécuté le 28/09/2026 sur la base locale `rise`, après sauvegarde `pg_dump` des tables concernées dans `%USERPROFILE%\rise-sauvegardes\`. | `resetAiModels()` (`src/admin/ai-reset.ts`), `scripts/reset-ai.ts` |
| Jeu de démonstration | `npm run db:seed` ne crée plus ni modèle, ni affectation, ni consommation. L'ancien jeu (9 LLM, affectation des 3 fonctions, consommation recalée sur 1 032,40 € au 26/09) devient `seedDemoAi()`, chargé seulement par les tests e2e comme jeu d'essai. | `prisma/seed/admin.ts`, `test/helpers.ts` |
| Nouvelle règle de notification | Modèle par défaut : le premier LLM actif, sinon aucun (`400 modelId: obligatoire`) ; il n'y a plus de défaut `haiku` en dur. | `rules.controller.ts` |
| Test réel des clés d'API | **Décision du commanditaire (28/09/2026)** : le test était un bouchon (toute clé de 20 caractères sans « revoked » passait pour valide). « Tester », « Tester toutes les clés », l'ajout d'un fournisseur, le remplacement d'une clé et le test planifié (toutes les 2 h) appellent maintenant l'API du fournisseur : lecture de la liste des modèles, authentifiée, sans génération ni coût. Fournisseurs reconnus par identifiant ou par nom : Anthropic (`x-api-key`), OpenAI, Mistral AI, Google Gemini (`x-goog-api-key`, jamais dans l'adresse), Cohere, Groq, DeepSeek, xAI. Réponse 2xx → clé valide ; 429 → clé valide, quota ou débit atteint ; autre statut → clé refusée, avec le code et le message du fournisseur (la clé en est retirée) ; réseau ou délai de 10 s → fournisseur injoignable ; fournisseur non reconnu → test impossible, jamais « valide ». Les tests automatisés remplacent l'appel par un double (`fakeProviderFetch`). Les fournisseurs de démonstration sont amorcés « Non testée » au lieu d'un état « Connecté » fictif. | `KEY_PROBES`, `KEY_TEST_TIMEOUT_MS` (`src/core/provider-key-tester.ts`) |

## Pipeline Documents et fiche modèle enrichie (spécification `docs/specs/IA - specification.md`, 28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Fonctions IA | « Analyse de documents » devient une chaîne de trois étapes : `doc_vec` Vectorisation (Embedding), `doc_rrk` Reclassement (Reranking), `doc_syn` Synthèse (LLM). Chaque fonction n'accepte qu'une catégorie (`422` sinon, principal comme secours). Insights et Gestion des données restent des LLM. | `AI_FUNCTIONS`, `AI_GROUPS` (`src/core/llm.service.ts`) |
| Migration de l'existant | L'affectation et l'historique de consommation de `docs` passent à `doc_syn` ; `doc_vec` et `doc_rrk` démarrent sans affectation (Indisponible). | migration `20261001000000_pipeline_documents` |
| Chaîne à l'exécution | L'analyse d'un document résout d'abord le modèle de chaque étape : si une étape n'a aucun modèle utilisable (principal ou secours de sa catégorie), la requête s'arrête à cette étape (`503 AI_UNAVAILABLE` « Étape n · … indisponible ») sans appeler les suivantes. Chaque étape trace sa consommation : tokens en entrée (Vectorisation), une requête (Reclassement), tokens entrée et sortie (Synthèse). Bouchon déterministe, comme la passerelle LLM. | `LlmService.analyzeDocument` |
| État d'une chaîne | Une étape Indisponible suspend les suivantes (`BLOCKED`, « Suspendue ») ; une étape sur secours ne bloque pas. Même règle côté serveur (`GET /assignments`) et à l'écran (`ia-data.js`). | `chainStates()` (`src/domain/ai-pricing.ts`) |
| Consommation et plafonds | Les trois étapes forment **une** ligne de consommation et de plafond « Documents » (`docs`), comme le demande la spécification (regroupement par groupe) : le plafond budgétaire `docs` existant est conservé et couvre la chaîne. `groupBy=step` détaille par étape. | `AI_BUDGET_LINES`, `budgetLineOf()` |
| Fiche modèle | Nouveaux champs : **date de sortie** (obligatoire à la création, pas dans le futur ; null accepté pour l'existant) et **max output tokens** (LLM seulement, entier > 0, obligatoire pour un LLM créé ; effacé pour un autre modèle). | `AiModel.releaseDate`, `AiModel.maxOutputTokens` |
| Tarification selon la catégorie | LLM : entrée et sortie en € / M tokens ; Embedding : entrée seule ; Reranking : à la requête (€ / 1 000 requêtes, `UsageRecord.requests`) ou au token (entrée seule). Le serveur normalise (champs sans objet à null) et refuse un tarif incomplet. Coût estimé = tokens × € / M, ou requêtes / 1 000 × € / 1 000 requêtes, sur le volume réel des 30 derniers jours. | `normalizePrice()`, `costOf()`, `PriceUnit` |
| Ancienneté | Mois depuis la sortie : < 12 récent, 12 à 24 à surveiller, > 24 ancien (seuils de la spécification, « à confirmer »). Badge « À surveiller » / « Ancien » dans la liste des modèles. | `MODEL_AGE_WATCH_MONTHS`, `MODEL_AGE_OLD_MONTHS` |
| Changement de catégorie | Refusé (`409 MODEL_IN_USE`) tant qu'une fonction d'une autre catégorie, ou une règle de notification (LLM), utilise le modèle. | `AiController.patchModel` |
| Écart : routes | La spécification propose `/api/ai/…` ; l'API reste sous `/api/admin/…` (console réservée à l'Admin) : `GET /functions` (nouveau), `GET|PUT /assignments`, `GET|POST|PATCH|DELETE /models`. Le corps de l'affectation garde la forme `{ fonction: { primary, fallback } }` et les catégories sont en majuscules ; `admin-api.js` convertit vers le format des écrans (`{ p, f }`, catégories en minuscules). | `ai.controller.ts`, `admin-api.js` |
| Écart : intégration | Les trois écrans livrés sont intégrés par `<dc-import>` dans la Console (et non recopiés) ; ils reçoivent les données réelles par propriétés. Retouches minimales, décrites dans `frontends/CHANGES-ia.md`. | `Console Admin.dc.html` |

## Catalogue des modèles d'IA et fournisseur OpenRouter (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Catalogue | Demande du commanditaire : alimenter la plateforme avec 11 modèles (Anthropic : Claude Opus 5.5, Sonnet 5, Haiku 4.5 ; Google : Gemini 3.8 Flash, 3.5 Flash-Lite ; OpenAI : GPT-6 Astra, Sol, Luna ; Mistral AI : Medium 3.5, Small 4, Ministral 3 14B). Données relevées sur les pages officielles des fournisseurs (sources modèle par modèle dans le fichier), versionnées et appliquées par `npm run ia:catalogue -- --confirmer` (simulation sans l'option ; ajout ou mise à jour par fournisseur et nom ; audit « Catalogue IA »). Appliqué le 28/09/2026 sur la base locale ; `demarrer-rise.ps1 -Reinitialiser` le recharge après l'amorçage. | `prisma/catalog/ia-modeles.ts`, `scripts/ia-catalogue.ts` |
| Tarifs | Tarif API standard de base publié en $ / M tokens (hors cache, hors batch, palier de contexte le plus bas), converti en euros au cours de référence BCE du 25/09/2026 (1 € = 1,1403 $), arrondi à 4 décimales. | `USD_PER_EUR`, `USD_PER_EUR_DATE` |
| Max output Mistral | Mistral ne publie pas de limite de sortie distincte : `max_tokens` est seulement borné par le contexte (docs.mistral.ai/api). Valeur retenue : 256 000 (contexte de 256k). | `CATALOG_MODELS` |
| Dates retenues | Date de disponibilité publique (annonce officielle). GPT-6 Astra : annoncé le 03/09/2026 en aperçu, diffusé le 04/09/2026 → 04/09. | `CATALOG_MODELS` |
| À surveiller | Gemini 3.8 Flash : tarif de lancement jusqu'au 31/12/2026, puis 1,50 $ / 7,50 $ (catalogue à mettre à jour). Claude Haiku 4.5 : retrait annoncé « pas avant le 15/10/2026 ». GPT-6 : tarif plus élevé au-delà de 272K tokens d'entrée (non représenté). | `note` de chaque modèle |
| OpenRouter | Nouveau fournisseur, créé **sans clé** (« Non testée ») : la clé se saisit dans la console (« Remplacer la clé »). Test réel de la clé : `GET https://openrouter.ai/api/v1/key` (Bearer), 401 si invalide. Logo fourni par le commanditaire : `frontends/assets/logos/lh-openrouter.webp`. | `KEY_PROBES`, `CATALOG_PROVIDERS` |

## Console : ergonomie (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Tri de la liste des modèles | Toutes les colonnes sont triables ; premier clic croissant, second décroissant ; valeurs absentes en dernier. | `sortModels()` (`Console Admin.dc.html`) |
| Barre latérale | Bouton réduire / déployer en haut à droite (interprétation de « réduire la sidebar et la fermer » : la fermeture laisse la barre réduite aux icônes, la navigation reste accessible) ; largeur réglable par une poignée de bordure, 200 à 420 px, 252 px par défaut ; préférences mémorisées dans le navigateur. | `NAV_W_DEF`, `NAV_W_MIN`, `NAV_W_MAX` |

## Modèles d'embedding et de reranking OpenRouter, dimensions (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Catalogue OpenRouter | Demande du commanditaire : Qwen3 Embedding 8B (`qwen/qwen3-embedding-8b`), BAAI bge-m3 (`baai/bge-m3`), Voyage rerank-2.5 (`voyageai/rerank-2.5`) et rerank-2.5-lite (`voyageai/rerank-2.5-lite`), fournisseur OpenRouter. Identifiants et tarifs relevés sur l'API publique OpenRouter, tarifs Voyage recoupés sur docs.voyageai.com ; tarif au token en entrée seule (0,01 $, 0,01 $, 0,05 $, 0,02 $ / M), converti au cours BCE du 25/09/2026. | `OPENROUTER_MODELS` (`prisma/catalog/ia-modeles.ts`) |
| Dates de sortie | Date d'annonce de l'éditeur, pas la date de mise en ligne sur OpenRouter (la date sert à signaler les modèles anciens) : Qwen3 Embedding 05/06/2025, bge-m3 30/01/2024, rerank-2.5 et lite 11/08/2025. | `OPENROUTER_MODELS` |
| Contexte | Qwen3 Embedding 32 768 ; bge-m3 8 192 (valeur officielle ; OpenRouter affiche 8 194) ; Voyage 32 000 (requête + document), requête limitée à 8 000 (noté sur le modèle). | `contextTokens` |
| Nouveaux champs | Tout modèle : identifiant chez le fournisseur et longueur de contexte (facultatifs). Embedding : liste des dimensions de sortie acceptées (au moins une, entiers 1 à 65 536, triée décroissante) et dimension par défaut, prise dans la liste (la première à défaut). Un modèle d'embedding saisi avant ce changement peut rester sans dimensions. | `normalizeDimensions`, `DIMENSION_MIN`, `DIMENSION_MAX` |
| Dimensions proposées | Seules les valeurs réellement acceptées : Qwen3 Embedding 4096, 2048, 1536, 1024, 512, 256 (sa plage MRL 32–4096 est plus large, on s'en tient aux tailles demandées) ; bge-m3 1024 seule (sélecteur verrouillé). | `OPENROUTER_MODELS` |
| Dimension par défaut | Qwen3 Embedding : 1 024 — sous la limite d'index HNSW de pgvector (2 000 dimensions pour le type `vector`), bon compromis qualité / stockage. bge-m3 : 1 024. | `defaultDimension` |
| Dimension de l'affectation | La vectorisation choisit une dimension parmi celles du modèle principal (422 sinon ; 400 pour une fonction qui n'est pas d'embedding) ; sans choix, celle par défaut du modèle, enregistrée telle quelle. Changer de principal revient au défaut du nouveau modèle. Retirer d'un modèle une dimension affectée est refusé (409 `DIMENSION_IN_USE`). | `effectiveDimension`, `ModelAssignment.primaryDimension` |
| Avertissement de réindexation | Texte du commanditaire, affiché dans la carte Vectorisation dès que le brouillon change de modèle d'embedding ou de dimension (pas pour une première affectation), et repris dans la confirmation d'enregistrement de la console. À l'enregistrement, une entrée d'audit critique « Réindexation des documents requise » est écrite. La réindexation elle-même n'est pas déclenchée (pas encore de moteur de vectorisation). | `REINDEX_WARNING`, `reindexRequired` (serveur) ; `RISE_IA.reindex` (écrans) |

## Génération de rapports et repli des groupes (livraison IA v2, 28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Intégration | Écrans `Affectation des modeles.dc.html` et `Vue reseau IA.dc.html`, `ia-data.js` et `docs/specs/IA - specification.md` de la livraison v2 fusionnés à trois voies avec les adaptations déjà faites (dimensions, avertissement de réindexation, branchement console) : aucune ligne de la livraison n'a été écartée. `Fiche modele.dc.html` et `support.js` sont inchangés dans la livraison. | `frontends/CHANGES-ia.md` |
| Nouvelle fonction | `rapports` « Génération de rapports », catégorie LLM, badge « Nouveau », ligne de consommation et de plafond propre (`rapports`, sans plafond créé). Aucune affectation n'est posée sur la base locale : l'administrateur choisit le principal et le secours. Jeu de démonstration des tests et de la console : Claude Sonnet 4.5 en principal, Mistral Large 2 (32k) en secours pour illustrer l'alerte. | `AI_FUNCTIONS`, `AI_BUDGET_LINES` |
| Sortie requise | Plus long rendu mesuré sur 30 jours (maximum des tokens de sortie d'un appel), sinon 38 000 tokens, valeur de la spécification, tant qu'aucun rapport n'a été produit. Exposée par `GET /functions` et `GET /assignments` (`needOut`), avec la couverture des modèles affectés (`fits`). | `REPORTS_NEED_OUT_DEFAULT`, `fitsOut` |
| Capacité | Un LLM couvre la fonction si son max output tokens ≥ sortie requise ; un modèle sans max output tokens connu n'est pas signalé. Un modèle trop court reste choisissable (alerte, pas de refus). | `fitsOut` (serveur), `RISE_IA.fitsOut` (écrans) |
| Repli des groupes | Documents replié par défaut dans les deux écrans ; état mémorisé par navigateur (`localStorage` `rise-ia-asg-open` et `rise-ia-net-open`), pas encore par administrateur. | livraison v2 |
| Console hors API | La ligne de consommation Rapports a un volume de démonstration nul (fonction pas encore en service) : le tirage de la consommation de démonstration est inchangé. | `CONSO` |

## Nouvelle barre latérale de la Console (livraison Sidebar, 28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Composant | `Sidebar Console.dc.html` copié à l'identique à côté de la Console (apparence, libellés et animations inchangés) ; il remplace tout l'ancien bloc `<aside>`. Spécification versionnée : `docs/specs/SIDEBAR - specification.md`. | `DOMS` (composant) |
| Raccourcis | Arbitrage du commanditaire, qui prime sur la spécification (§ 1 et § 3.5) : ⌘K et ⌘J ne sont plus gérés par la Console. La palette de recherche, qui ne pouvait plus s'ouvrir (plus de barre de recherche ni de ⌘K) et reposait sur `NAV`, est retirée, ainsi que la prop `on-open-palette`. ⇧⌘C n'a jamais été géré par la Console ; le composant garde son propre raccourci, conformément à la spécification (non modifié). | `Console Admin.dc.html` |
| Largeur | Colonnes 252 / 72 / 0 px, comme demandé : la poignée de largeur réglable (ajoutée le 28/09/2026) est retirée, le composant ayant des largeurs fixes. Le choix réduit / déployé reste mémorisé (`rise-console-nav`). | `shellSt`, `navMode()` |
| Signaux | Accès : compteur des invitations sans réponse depuis plus de 7 jours (objet `badge` existant ; 1 dans les données de démonstration) ; IA : point rouge si une clé est refusée, sinon point rouge / ambre si une fonction IA est à l'arrêt / sur secours. Les autres pastilles de l'ancienne barre (consommation, modules, habilitations) ne sont pas transmises (spécification § 3.3). | `sbSignals()` |
| Mobile | Le composant garde son rendu complet ; la Console le place dans un tiroir fixe (252 px) ouvert par le bouton menu de l'en-tête et fermé par la croix du composant ou le voile. | `sbWrap` |
| Fil d'Ariane | Groupe des pages = domaine : Accès, IA, Assistant, Projets, Plateforme ; la page « Droits et habilitations », hors barre latérale, suit Accès ; Vue d'ensemble (« Supervision ») et Mon profil (« Compte ») n'ont pas de domaine et gardent leur libellé. | `META` |
| Lien Cockpit | `cockpit-url="./RISE Cockpit.dc.html"`, valeur de la spécification (même cible que l'ancien lien). | dc-import |

## Skills de Jev (livraison Skills, 28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Sidebar | La livraison Skills contient la même sidebar et la même spécification que la livraison Sidebar, déjà intégrées (fichiers identiques) : l'étape 1 était faite. | `Sidebar Console.dc.html` |
| Modèle et API | `Skill { id, n, t, on, position, updated_at, updated_by }` ; `GET/POST /api/assistant/skills`, `PATCH/DELETE /api/assistant/skills/:id`, réservés à l'administrateur. Nom vide → « Sans nom » ; nom > 60 ou texte > 20 000 caractères → 422. Une création se place en fin de liste. Audit : « Skill créée / modifiée / activée / désactivée / supprimée ». | `SKILL_NAME_MAX`, `SKILL_TEXT_MAX`, `SKILL_UNNAMED` (`src/domain/jev-prompt.ts`), `SkillsController` |
| Données initiales | Les cinq skills de démonstration sont insérées par la migration `20261003000000_skills_jev` (base locale et toute nouvelle base) et par l'amorçage (qui vide la base). | `DEMO_SKILLS` |
| Prompt de Jev | Relu à chaque réponse : prompt de base, Persona, puis `## Skill : {n}` + texte brut de chaque skill active, dans l'ordre de `position` ; les skills désactivées ne sont pas envoyées. Appliqué aux deux Jev (Cockpit et Console). Le prompt système compte dans les tokens d'entrée. Persona : aucune (page à concevoir). | `assembleJevPrompt`, `JEV_SYSTEM_PROMPT`, `JEV_PERSONA`, `JevPromptService` |
| Identifiant provisoire | Le composant indexe sélection et brouillons par identifiant : la Console garde à l'écran l'identifiant `new-…` d'une skill créée et le relie à l'identifiant du serveur pour tous les appels (y compris ceux faits avant la réponse du `POST`). Après rechargement, l'identifiant du serveur est utilisé. | `skAlias`, `skPend` (`admin-api.js`) |
| En-tête | L'en-tête générique de la Console est masqué sur la page Skills (le composant a le sien) ; le fil d'Ariane du bandeau reste. Le composant apporte ses propres marges : la Console neutralise les siennes sur cette page. | `notOv`, `skWrap` |

## Persona de Jev (livraison Persona, 28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Modèle | `Persona` unique (id `jev`) : nom (requis, ≤ 30), créature (≤ 40), style (≤ 60), emoji parmi 🧭 ✨ 🦉 🛰️ 🐙 🌱, avatar parmi nuit / ambre / lagon / encre, photo (image importée ou rien), Soul (≤ 20 000) ; hors limites ou hors choix → 422. `GET/PUT /api/assistant/persona`, réservés à l'administrateur. | `PERSONA_*` (`src/domain/jev-prompt.ts`), `PersonaController` |
| Versions | Chaque enregistrement copie l'état remplacé dans `PersonaVersion` (version, données, date, auteur) et trace « Persona modifié » avec les champs changés. Lecture : `GET /api/assistant/persona/versions` ; revenir en arrière = renvoyer une version par `PUT` (pas d'écran dédié). | `PersonaVersion` |
| Données initiales | Persona de démonstration inséré par la migration `20261004000000_persona_jev` et par l'amorçage ; recréé à la lecture s'il manque. | `DEMO_PERSONA` |
| Image | `POST /api/assistant/persona/avatar` (multipart, champ `file`) : PNG, JPEG ou WebP reconnus par leur signature, 1 Mo au plus (422 sinon) ; stockée par `StorageService`, lue par `GET /api/assistant/persona/avatar/{jour}/{fichier}`, **publique** (clé aléatoire, image non sensible) pour s'afficher en fond CSS sans en-tête d'authentification. `identity.photo` n'accepte que ces URL. | `PERSONA_PHOTO_MAX_BYTES` |
| Envoi de l'image | Le composant garde l'image en aperçu (data URL) dans son brouillon et appelle `onUploadAvatar(file)` : la Console l'envoie aussitôt, puis, à l'enregistrement, remplace l'aperçu par l'URL renvoyée. Si l'envoi a échoué, le reste du Persona est enregistré sans l'image (message). Une image envoyée puis annulée reste stockée sans être référencée. | `psUp` (`admin-api.js`) |
| Prompt de Jev | Base, `## Identité` (« Tu t’appelles {name}. Tu es {creature}. Ton style : {style}. Ton emoji : {emoji}. », une phrase par champ renseigné), `## Personnalité` (Soul tel quel, omis s'il est vide), puis skills actives. Avatar et photo jamais envoyés. | `assembleJevPrompt`, `identityText` |
| Nom de Jev | `identity.name` affiché dans le bouton Jev de la sidebar, l'en-tête et le champ de saisie du panneau Jev ; l'avatar (image, sinon teinte prédéfinie avec l'emoji) et l'emoji dans l'en-tête du panneau. La sidebar livrée écrivait « Jev » en dur : prop `jevName` ajoutée (texte et libellés accessibles seulement, apparence inchangée). Le Jev du Cockpit garde « Jev » (le Persona est réservé à l'administrateur). | `jevName` (`Sidebar Console.dc.html`), `vals.jv` |

## Notifications de l'administrateur (livraison Notifications, 28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Composants | `Notifications.dc.html` copié tel quel ; `Sidebar Console.dc.html` remplacé par la version livrée (cloche), à laquelle seule la prop `jevName` (Persona, 28/09/2026) est réappliquée. | `frontends/CHANGES-console.md` |
| Modèle | `Notification` : une ligne par cause (`key` unique : `provider:<id>`, `import:<id>`, `snapshot:<projet>`, `budget:<ligne>`, `invite:<demande>`, `module:<demande>`, `tech:<route>`), type ERR / WARN / INVITE / MODULE, statut OPEN / DECIDED / DONE / RESOLVED, lecture (`readAt`) commune aux administrateurs. | `prisma/schema.prisma` |
| Création et fermeture automatiques | À chaque lecture (ouverture du tiroir, toutes les 60 s), le serveur réconcilie les notifications avec l'état réel : clé dont le dernier test a échoué, dernier import refusé (7 derniers jours), dernier snapshot d'un projet en échec, seuil de coût atteint ou dépassé, demandes d'invitation et de module en attente. Une cause disparue ferme la notification ; si elle réapparaît, la notification est rouverte non lue. Une alerte qui s'aggrave (seuil → dépassement) redevient non lue. « Clé désactivée » : il n'existe pas d'état désactivé des clés ; une clé refusée au test est l'incident couvert. | `InboxService.sync`, `IMPORT_INCIDENT_DAYS` |
| Erreurs techniques | Toute erreur 5xx non métier ouvre un incident « Erreur technique » par route (filtre d'erreurs global) ; la réussite suivante de la même route le ferme (intercepteur global). | `techErrors`, `TechRecoveryInterceptor` (`src/core/tech-errors.ts`) |
| Décisions | `accept` / `refuse` enregistrés tout de suite (audit, liste et compteurs mis à jour) mais exécutés après 10 s, annulables d'ici là (`undo`, 409 au-delà) : l'e-mail d'invitation ne part donc jamais pour une décision annulée. Exécution par le code des pages Utilisateurs (`approveInvitation` / `rejectInvitation`) et Modules (`approve` / `reject`) ; le demandeur reçoit un e-mail dans tous les cas. Déclencheurs : minuterie de 10 s, lecture de la liste, tâche planifiée chaque minute. Un échec d'exécution remet la demande à traiter avec la cause. | `DECISION_UNDO_MS`, `InboxService.finalizeDue` |
| Réutilisation | `AccountsController` et `DataController` sont aussi déclarés comme fournisseurs du module Admin pour être appelés par le service des notifications (même traitement, sans duplication). | `admin.module.ts` |
| Compteurs | Cloche : non lues et non traitées, corail s'il y a un incident non lu. « Accès » : demandes d'invitation encore à traiter (et non plus les invitations envoyées sans réponse depuis 7 jours) : il baisse dès qu'une demande est acceptée ou refusée et remonte si la décision est annulée. | `sbSignals`, `ntPendingInvites` |
| Page « Notifications et alertes » | Inchangée (elle règle les messages envoyés aux utilisateurs). Proposition de la spécification, à valider : la renommer « Alertes utilisateurs ». | `META.notifs` |

## Skill « Répondre sur la Console d’administration » (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Contenu | Skill de Jev rédigée sur le modèle des skills de Claude (objectif, quand l’appliquer, méthode, carte de la Console, règles chiffrées, diagnostic, garde-fous, format, exemples), en Markdown simple (`##`, `-`, `1.`) seul rendu par l’aperçu. Les règles chiffrées reprennent les constantes du code (invitation 14 j / 7 j, verrouillage 5 échecs / 15 min, sessions 15 / 30 min, test des clés toutes les 2 h, annulation 10 s, audit 24 mois). | `docs/skills/Repondre sur la Console d'administration.md` |
| Mise en place | Ajoutée à la base locale par l’API, **désactivée** (règle des nouvelles skills) : à relire puis activer dans Assistant › Skills. Recouvre et précise « Assister l’administration » (déjà désactivée). Non ajoutée aux données initiales. Toute évolution d’une règle chiffrée du code doit être répercutée dans ce texte. | Assistant › Skills |

## Skills du Cockpit (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Contenu | Quatre skills de Jev rédigées sur le même modèle que la skill Console : « Analyser le projet · méthode complète », « Générer un rapport PowerPoint », « Mettre à jour les données d’un projet », « Guider l’utilisateur dans les fonctionnalités ». Règles reprises du code : criticité p × i (20 / 12 / 6), livrables (écart temps − avancement > 6 / > 18), avancement (< 0 / < −20), fraîcheur (7 / 14 j), écart des jalons, statuts, droits RG5 à RG9, périmètre d’écriture de Jev (risques, problèmes, actions, décisions ; lecture seule sur Référentiel, Comités et rapports, Base de connaissance). | `docs/skills/*.md` |
| Santé du projet | Aucune formule de santé n’existe côté serveur (seule l’appréciation manuelle du PMO, avec raison) : la skill d’analyse interdit d’en inventer une. | `Project.healthOverride` |
| PowerPoint | La plateforme ne génère pas de fichier PowerPoint (rapports de comité exportés en PDF minimal) : la skill fait préparer par Jev le contenu slide par slide (titre-message, contenu, visuel, note de l’orateur) et l’interdit de promettre un fichier .pptx. | `GET reports/:id/file`, `src/core/pdf.ts` |
| Mise en place | Ajoutées désactivées à la base locale (positions 7 à 10), à relire puis activer ; elles précisent les skills de démonstration « Analyser le projet », « Mettre à jour les données » et « Guider l’utilisateur », à désactiver pour éviter des consignes en double. | Assistant › Skills |

## Registre des cartes API (livraison Registre API, 28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Tables | `api_cards` (clé chiffrée AES-256-GCM avec la clé maître `SECRETS_KEY`, 4 derniers caractères seuls exposés) et `api_card_calls` (horodatage, carte, code, durée, origine PROXY / HEALTH / TEST, widget). L'état n'est pas figé en base : `check_error` garde l'échec du dernier contrôle, et l'état affiché est recalculé à la lecture dans l'ordre de la spécification (désactivée → erreur → clé expirée → échéance ≤ 30 j → quota ≥ 85 % → ok). | `cardStatus`, `src/domain/api-cards.ts` |
| Emplacement de la clé | La spécification ne dit pas où placer la clé dans l'appel : marqueur `{key}` dans l'endpoint (ex. `…?appid={key}`), sinon en-tête `X-Api-Key`. Toute occurrence de la clé dans une réponse du fournisseur est masquée (`••••` + 4 derniers caractères) avant stockage ou renvoi. | `KEY_PLACEHOLDER`, `KEY_HEADER`, `redactKey` |
| SSRF | https seul, sans identifiants dans l'URL ; nom d'hôte et **adresses résolues** refusés s'ils sont privés, locaux ou réservés (localhost, `.local`, `.internal`, 10/8, 172.16/12, 192.168/16, 169.254/16, 127/8, 100.64/10, IPv6 locales, IPv4 mappées) ; contrôle refait à chaque appel (rebond DNS) ; redirections non suivies. | `endpointError`, `isPrivateAddress`, `assertPublicHost` |
| Paramètres par défaut | Les paramètres présents dans l'endpoint servent au contrôle de santé ; ceux d'un widget les remplacent. Constat de recette : un endpoint nu répondait 400 (géocodage Open-Meteo) et aurait été marqué en erreur à chaque contrôle. | migration `20261006100000_registre_api_parametres` |
| Quota | Appels réels du jour (depuis minuit, heure de Paris), contrôles de santé et tests compris ; les réponses servies par le cache ne comptent pas. 429 au-delà. | `ApiCardsService.quotaUsed` |
| Proxy | `GET /api/widgets/proxy/:cardId` réservé aux utilisateurs connectés ; 503 si la carte est désactivée, en erreur ou injoignable ; cache 5 min (2 min pour Météo et Trafic) des seules réponses réussies ; le widget se déclare par l'en-tête `X-RISE-Widget` (ajouté à la liste « Alimente »). | `PROXY_CACHE_MS`, `PROXY_CACHE_FAST_MS` |
| Widgets existants | Météo (Open-Meteo : géocodage puis prévisions) et Actualités (GDELT) passent par le proxy ; trois cartes initiales, sans clé ; l'ancien `/external/weather` et `/external/news` (qui contournait le registre) est retiré. | `frontends/api.js`, migration `20261006000000_registre_api` |
| Contrôle de santé | Tâche `api-cards.health` toutes les 15 min (`*/15 * * * *`), cartes actives seulement. | `API_HEALTH_CRON` |
| Notifications | Réconciliées avec le tiroir existant : erreur (ERR), clé expirée (ERR), échéance J-30 / J-7 / J-1 (WARN, un palier franchi la remet en non lue), quota ≥ 85 % (WARN) ; bouton « Voir la carte » / « Remplacer la clé » vers la page `apis`. | `InboxService.sync`, `KEY_EXPIRY_NOTICE_DAYS` |
| Audit | Création, modification, rotation (4 derniers caractères ancienne → nouvelle), activation / désactivation, suppression, test manuel ; l'adresse IP et la carte sont dans les détails de l'entrée (le journal n'a pas de colonne IP). | `ApiCardsController.trace` |
| Date de référence | Échéances calculées sur la date du jour du serveur (`DEMO_TODAY` compris), transmise au composant par la prop `now`. | `apiNow` |

## Livraison IA v3 : guidage console (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Fonction | `guidage` « Guider l’utilisateur sur la console » (« Guidage console »), LLM, badge Nouveau, `scope: 'console'`, estimation `{ in: 0,9, out: 0,25, req: 800 }`, ligne de consommation et de plafond propre. `AiFunctionDef` gagne `scope` (défaut `cockpit`) et `est`. | `AI_FUNCTIONS`, `GUIDAGE_ESTIMATE` |
| Volume réel | `GET /functions` et `GET /assignments` renvoient `vol` (M tokens, requêtes sur 30 jours), `null` pour une fonction estimée sans aucun appel : l'écran affiche alors l'estimation préfixée « ≈ ». | `volOf` |
| Fenêtre des 30 jours | Se termine à la plus tardive de la date du jour de la plateforme (`DEMO_TODAY`) et de la date réelle : sinon les appels réels, horodatés après une date de démonstration, n'étaient jamais comptés (constat de recette). | `volumes30d` |
| Affectation par défaut | Catalogue réel : Claude Haiku 4.5 (Anthropic) en principal, GPT-6 Luna (OpenAI, le moins cher du catalogue) en secours ; créée par la migration `20261007000000_guidage_console` sur la base locale et par `npm run ia:catalogue` si absente ; une affectation existante n'est jamais écrasée. Jeu d'essai des tests : Haiku 4.5 / GPT-5 mini, comme la spécification. | `CATALOG_ASSIGNMENTS` |
| Jev de la Console | Toute question qui parvient au serveur passe par `guidage` (principal puis secours), et non plus `insights`. Prompt : contexte système, persona, **une seule** skill de guidage si elle est active, page ouverte (identifiant et titre). La spécification nomme la skill « Guider l’utilisateur », supprimée le 28/09/2026 : est retenue « Répondre sur la Console d’administration » si elle est active, sinon la première skill active dont le nom commence par « Guider l’utilisateur ». Le Jev du Cockpit garde toutes les skills actives. | `CONSOLE_GUIDANCE_SKILLS`, `CONSOLE_PAGE_TITLES`, `assembleConsoleGuidancePrompt` |
| Moteur local de la Console | Inchangé : le moteur de mots-clés du navigateur répond encore d'abord (clés, coûts, comptes, audit…) ; seules les questions qu'il ne reconnaît pas atteignent `guidage`. Constat de recette : « quota journalier » est capté par le mot-clé « journal » (réponse d'audit). | `jevReply` (Console) |
| Fichiers v3 | `Affectation des modeles.dc.html` et `ia-data.js` de la v3 fusionnés à trois voies avec les adaptations existantes (dimensions, réindexation, capacité de sortie) ; `Vue reseau IA.dc.html`, `Fiche modele.dc.html`, `support.js` identiques à la v2 ; spécification v3 versionnée. | `frontends/CHANGES-ia.md` |

## Registre des cartes API : TomTom, GDELT, flux RSS ; noms des skills (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| TomTom Traffic | Carte ajoutée à la base locale par l'API : `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=48.8566,2.3522&unit=KMPH&key={key}` (flux de circulation, Paris par défaut), catégorie Trafic, quota de 2 500 appels / jour (offre gratuite de TomTom). Créée **désactivée et sans clé** : la clé se saisit dans le registre (« Remplacer la clé »), puis « Réactiver ». | carte `tomtom-traffic` |
| Saisie d'une clé manquante | Le composant n'offrait « Remplacer la clé » qu'à une carte ayant déjà une clé : une carte dont l'endpoint attend une clé (`{key}`) sans l'avoir affiche « Clé à saisir » (« À saisir » dans le tableau) et le bouton. Libellés seulement, aucun style modifié. | `needsKey` (`Registre API.dc.html`) |
| GDELT | Diagnostic : réponses en 16 à 29 s ; le client HTTP de Node coupait la **connexion** à 10 s (UND_ERR_CONNECT_TIMEOUT), avant même le délai de la carte ; 429 au-delà d'un appel toutes les 5 s. Correctifs : délai par carte (`timeout_ms`, 45 s pour GDELT, 8 s par défaut, 60 s au plus) appliqué aussi à la connexion (client `undici`, nouvelle dépendance) ; dernière réponse réussie servie (24 h au plus) si un appel échoue ou si la carte est en erreur ; un seul appel en cours par requête identique ; en-tête `X-RISE-Cache` (miss / hit / stale). Constat : GDELT répond encore 429 dès le premier appel depuis le réseau local (limite de débit de son côté) ; la tuile Actualités bascule alors sur les flux RSS. | `API_CALL_TIMEOUT_MAX_MS`, `PROXY_STALE_MS`, migration `20261008000000_registre_api_delai` |
| Redirections | Seul un code 2xx est un succès (test, contrôle de santé, proxy) ; une redirection, non suivie, signale une adresse déplacée (« Redirection 301 »). | `failureNote` |
| Flux RSS | Système de flux d'actualités dans le registre : une carte par flux (catégorie Actualités, sans clé, colonne `feed`), lecture RSS 2.0 / RSS 1.0 / Atom sans dépendance (texte clair, liens http(s) seulement), routes `GET /api/widgets/feeds` (agrégation des flux actifs, plus récents d'abord, doublons retirés, `limit` 10 par défaut, 50 au plus, état par source) et `GET /api/widgets/feeds/:cardId`, via le proxy (cache, réserve, quota, santé, alertes). Une carte dont la réponse est un flux est reconnue automatiquement. | `src/domain/rss.ts`, `WidgetFeedsController`, migration `20261008100000_flux_rss` |
| Flux retenus | Le Monde `https://www.lemonde.fr/rss/une.xml`, L'Équipe `https://dwh.lequipe.fr/api/edito/rss?path=/`, BBC News `https://feeds.bbci.co.uk/news/rss.xml` (vérifiés, 16 / 50 / 34 articles). Les Échos `https://syndication.lesechos.fr/rss/rss_une.xml` : le site refuse l'accès (403 « Access Denied » de son hébergeur, 301 vers une page refusée) ; carte créée **désactivée** ; pas de contournement de la protection. | cartes `rss-*` |
| Tuile Actualités | GDELT d'abord ; s'il ne répond pas ou ne renvoie rien, les 5 derniers articles des flux RSS actifs. | `frontends/api.js` |
| Noms des skills | Demande du commanditaire : « Insights », « Gestion des données », « Rapports », « Guidage console », « Guidage Cockpit » (base locale, par l'API ; fichiers de `docs/skills/` renommés). La skill de guidage de la Console est d'abord cherchée sous « Guidage console ». | `CONSOLE_GUIDANCE_SKILLS` |

## Registre : retrait de GDELT et Les Échos, NewsData.io, GNews, Finnhub (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Retraits | « GDELT · actualités » (429 du fournisseur) et « Les Échos » (403 du site) supprimés à la demande du commanditaire, par migration tracée au journal d'audit (cartes et appels) ; retirés de l'amorçage. | migration `20261009000000_retrait_gdelt_echos` |
| Nouveaux fournisseurs | Cartes créées **sans clé et désactivées** (base locale, par l'API) : NewsData.io `https://newsdata.io/api/1/latest?country=fr&language=fr&apikey={key}` (Actualités, 200 appels / jour), GNews `https://gnews.io/api/v4/top-headlines?category=general&lang=fr&country=fr&max=10&apikey={key}` (Actualités, 100 / jour), Finnhub `https://finnhub.io/api/v1/news?category=general&token={key}` (Finance, 60 / min, sans quota journalier). Joignabilité vérifiée sans clé : 401 / 400 « clé manquante » en moins de 0,6 s. | cartes `newsdata-io`, `gnews`, `finnhub` |
| Actualités agrégées | `GET /api/widgets/news?category=actualites|economie&limit=` : toutes les cartes actives de la catégorie (Actualités ou Finance), formats reconnus par leur structure (GNews, NewsData.io, Finnhub, RSS / Atom), plus récentes d'abord, doublons retirés ; la source affichée est le journal d'origine quand l'agrégateur le donne ; état par source. La tuile Actualités du Cockpit l'utilise (plus de GDELT). | `src/domain/news.ts`, `WidgetNewsController` |
| Quotas | Cache de 30 min pour les catégories Actualités et Finance ; contrôle de santé sauté pour une carte ayant réussi un vrai appel dans l'heure (sinon 96 contrôles / jour consommeraient l'essentiel des quotas gratuits). | `PROXY_CACHE_NEWS_MS`, `HEALTH_SKIP_IF_OK_MS` |
| TomTom | Clé saisie par l'administrateur le 28/09/2026 : test 200 en 206 ms (Paris : 16 / 16 km/h) ; proxy du widget 200 (Étoile), clé absente de la réponse. | carte `tomtom-traffic` |

## Tri des actualités agrégées (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Ordre des articles | Arbitrage du commanditaire : garder le tri par date (plus récents d'abord), toutes sources confondues. Les articles des offres gratuites de GNews (12 h de retard) et NewsData.io, plus anciens, n'apparaissent en tête que si les flux RSS n'ont rien de plus récent. | `mergeFeeds` (`src/domain/rss.ts`) |

## Skills « Rédiger les slides PowerPoint » et « Analyser un document » (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Format | Format Claude Skill : un dossier par skill, `SKILL.md` avec en-tête YAML (`name`, `description` : quoi et quand l'utiliser) puis les instructions en Markdown simple (`##`, `-`, `1.`), seul rendu par l'aperçu de la page Skills. Dans la plateforme, le nom est un champ à part : seul le corps (sans l'en-tête) est enregistré. | `docs/skills/rediger-slides-powerpoint/`, `docs/skills/analyser-un-document/` |
| Slides | Fondée sur l'application : sections et poids des templates de rapport, niveaux des instances (stratégique, pilotage, opérationnel), règles de calcul (criticité p × i ≥ 20 / ≥ 12, livrables > 6 / > 18 points, avancement < 0 / < −20), fiche d'arbitrage, module Budget facultatif ; pas de fichier .pptx (export PDF du rapport officiel dans Comités et rapports, en lecture seule pour Jev). Complète la skill « Rapports » (choix des données) par la façon d'écrire chaque slide. | skill « Rédiger les slides PowerPoint » |
| Documents | Fondée sur la Base de connaissance : formats (.pdf, .docx, .pptx, .xlsx, .msg, .eml, 25 Mo), états d'extraction, chaîne vectorisation → reclassement → synthèse, types, versions, liens aux objets, confidentialité (restreint : PMO et administrateur), lecture seule pour Jev ; extraction citée (page, slide, onglet et cellule) et rapprochement avec les objets du Cockpit ; créations proposées via « Gestion des données ». | skill « Analyser un document » |
| Mise en place | Ajoutées **désactivées** à la base locale (positions 11 et 12), à relire puis activer. Limite connue : le contenu d'un document n'est pas encore transmis au modèle (passerelle bouchon, pas de recherche documentaire ; voir l'analyse du routage de Jev). | Assistant › Skills |

## Jev de la Console : Identité, Soul, skill « Guidage console » et modèles de la fonction guidage (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Toutes les questions | Demande du commanditaire : chaque question posée à Jev dans la Console passe par la fonction `guidage` (principal, puis secours). Les branches à mots-clés du serveur (relance, suspension, coût, snapshot) ne répondent plus elles-mêmes : elles fournissent au modèle leurs **données** (« Données de la console ») et gardent leurs **actions** à confirmer. Seule exception : une demande de clé API est refusée sans modèle (§ 9.12). | `ConsoleController.jev`, `consoleUserPrompt()` |
| Prompt système | Prompt de base → `## Identité` → `## Personnalité` (Soul) → la seule skill de guidage active → `## Page de console ouverte`. Les autres skills (Insights, Rapports…) ne sont pas envoyées. | `assembleConsoleGuidancePrompt()` |
| Nom de la skill | Reconnu sans tenir compte de la casse, des espaces en trop ni de la forme de l'apostrophe (« Guidage Console » = « Guidage console ») ; « Guidage console » passe avant les anciens noms. | `skillKey()`, `CONSOLE_GUIDANCE_SKILLS` |
| Génération réelle | La fonction `guidage` génère réellement chez le fournisseur du modèle affecté (Anthropic ; API compatibles OpenAI : OpenAI, Mistral, OpenRouter, Groq, DeepSeek, xAI ; Google Gemini), avec l'identifiant du modèle chez le fournisseur s'il est renseigné. Échec à l'appel du principal (délai, erreur) → le secours prend la demande ; les deux échouent → motif affiché (clé masquée), sans consommation. Jetons comptés par le fournisseur. Les autres fonctions gardent le bouchon ; hors ligne (tests), toutes le gardent. | `LIVE_FUNCTIONS`, `LlmClient`, `LIVE_MAX_OUTPUT_TOKENS = 1024`, `LLM_CALL_TIMEOUT_MS = 30 000` |
| Moteur de la page | En mode API, le moteur à mots-clés de la Console ne répond plus seul : sa réponse part au serveur comme faits (« Réponse préparée par la page », 4 000 caractères au plus) et ses boutons, choix et confirmations restent affichés sous la réponse du modèle ; si le modèle ne répond pas, sa réponse s'affiche telle quelle. Règle la question ouverte 19. | `frontends/admin-api.js`, `CONSOLE_FACTS_MAX` |
| Skill « Guidage console » | Complétée : Registre des cartes API (le quota d'une carte se règle dans sa fiche), fonction Guidage console, règles des cartes, lecture des sections « Page de console ouverte » et « Données de la console ». Mise à jour en base locale (elle était identique au fichier). | `docs/skills/Guidage console.md` |

## Jev de la Console : suppression du moteur de mots-clés (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Moteur de mots-clés | Arbitrage du commanditaire : supprimé, dans la page (`jevReply`, environ 25 familles de mots-clés, et `nrm`) comme sur le serveur (branches relance, suspension, coût, snapshot). **Seuls les modèles d'IA répondent** : la question part telle quelle à la fonction `guidage` (principal, puis secours). Remplace la décision précédente « Moteur de la page » et les « Données de la console ». | `ConsoleController.jev`, `frontends/admin-api.js` |
| Refus des clés API | Le refus sans modèle est retiré aussi : aucune clé n'entre dans le prompt (seules l'Identité, la Soul, la skill et la page y figurent), le modèle ne peut donc pas en dévoiler ; la skill « Guidage console » lui interdit d'en demander ou d'en afficher. Test : aucune clé ni ses 4 derniers caractères dans ce qui part au modèle. | `guidage.spec.ts` |
| Actions | Jev n'agit plus : plus de relance, suspension, réactivation, test de clés ni snapshot déclenchés depuis Jev (certaines règles du moteur agissaient sans confirmation). La réponse ne porte plus d'action (`actions: []`). Les textes du panneau le disent (accueil, badge « Explication et guidage », pied du panneau, suggestions reformulées en questions « Comment… ? »). | `Console Admin.dc.html` |
| Sans serveur | La page seule (sans API) ne répond plus : message « la console doit être reliée au serveur ». | `jevReply()` |
| Limite | Le modèle ne reçoit aucune donnée de la plateforme (comptes, coûts, invitations) : il explique et guide, mais un chiffre qu'il avance n'est pas vérifié. Question ouverte 22. | — |

## Jev de la Console : interrogation des données en langage naturel, dictionnaire des données (28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Principe | Text-to-SQL en trois étapes (brief du commanditaire) : le modèle traduit la question en SQL d'après le dictionnaire, le serveur exécute la requête, le modèle rédige la réponse à partir des résultats. Étape 1 livrée ici : le dictionnaire et les vues ; le branchement de Jev vient après relecture. | — |
| Périmètre | Console seule. Données lisibles : tout ce que la Console affiche, e-mails compris ; jamais les secrets (empreintes de mot de passe, identifiants et rotation de session, clés API chiffrées des fournisseurs et des cartes, chemins de stockage, plan d'import complet, corps et destinataires des envois). | schéma `jev` |
| Vues | 31 vues en lecture seule dans le schéma `jev`, colonnes en français, heures converties en heure de Paris (fuseau de la plateforme), codes (`INVITED`…) conservés et traduits dans le dictionnaire. Une clé écrite en clair dans l'endpoint d'une carte API est masquée (`apikey=••••`). | `jevViewsSql()`, migration `20261010000000_jev_dictionnaire` |
| Dictionnaire en table | Demande du commanditaire : `dictionnaire_tables` (une fiche par vue : description, relations, usages, règles, actif) et `dictionnaire_colonnes` (nom, type, signification, exemples et unités). Pas de page dans la Console. Source unique : `src/domain/jev-dictionnaire.ts`, chargée par l'amorçage et par `npm run dictionnaire:charger` ; version lisible : `npm run dictionnaire:doc`. | `DICTIONNAIRE`, `seedDictionnaire()` |
| Règles | Chaque chiffre ou statut affiché par la Console a sa règle écrite dans la fiche de sa vue, d'après le code qui le calcule : invitations en attente, expirées et sans réponse depuis 7 jours, profil le plus fort, dépense du mois et projection, statut des plafonds, état des fonctions IA, état et appels du jour d'une carte API, session ouverte, phase en cours… Date du jour et « maintenant » seront fournis au modèle (jamais `CURRENT_DATE` : la plateforme a sa propre date du jour). | fiches `regles` |
| Contrôle | Questions de référence : une requête écrite d'après le dictionnaire doit trouver le même résultat que l'écran (Vue d'ensemble, Utilisateurs, Consommation et coûts, Affectation, Registre des cartes API, journal d'audit) ; fiches, vues et tables doivent concorder colonne par colonne. | `test/e2e/dictionnaire.spec.ts` |
| À faire à l'étape 2 | Compte PostgreSQL en lecture seule limité au schéma `jev` (les vues sur une seule table sont modifiables par défaut dans PostgreSQL : l'exécution ne doit pas se faire avec le compte de l'application), une seule instruction SELECT, délai et nombre de lignes limités, une nouvelle tentative en cas d'échec, vues consultées affichées sous la réponse. | — |

## Jev de la Console : interrogation des données, branchement (Text-to-SQL, étape 2, 28/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Déroulé | 1. Le modèle de la fonction `guidage` reçoit le prompt de la Console (Identité, Soul, skill « Guidage console », page), les consignes et le dictionnaire (fiches actives lues dans `dictionnaire_tables` / `dictionnaire_colonnes` à chaque question), la date du jour et « maintenant » (heure de Paris) ; il répond directement, ou par une requête dans un bloc ```sql```. 2. La requête est contrôlée puis exécutée. 3. Le modèle rédige la réponse à partir des résultats, avec les seules fiches des vues consultées. Question sans données : un seul appel. | `JevSqlService`, `sqlInstructions()`, `ANSWER_INSTRUCTIONS` |
| Contrôle applicatif | Une seule instruction SELECT (ou WITH … SELECT) ; mots d'écriture et fonctions dangereuses refusés (hors chaînes) ; tables système et schéma public refusés. | `sqlError()` |
| Garanties de la base | Exécution sous le rôle `jev_lecteur` (sans connexion, lecture des seules vues `jev`) par `SET LOCAL ROLE`, dans une transaction READ ONLY, `search_path = jev`, requête lue comme sous-requête (aucune écriture possible, même dans un WITH), 5 s et 200 lignes au plus. `set_config` (qui permettrait de revenir au compte de l'application), `query_to_xml` et apparentées (SQL écrit dans une chaîne) et `pg_sleep` sont retirées à PUBLIC. | migrations `20261011000000_jev_lecteur`, `20261011100000_jev_lecteur_fonctions` ; `JEV_SQL_ROLE`, `JEV_SQL_TIMEOUT_MS = 5000`, `JEV_SQL_MAX_ROWS = 200`, `JEV_SQL_MAX_RESULT_CHARS = 30 000` |
| Échec | Requête refusée ou en erreur : le modèle reçoit le motif (message de PostgreSQL) et la corrige une fois ; second échec : « Je n’ai pas pu lire les données de la plateforme pour répondre (motif) ». | `JEV_SQL_RETRIES = 1` |
| Sources | Les vues citées par la requête sont renvoyées (`sources`) et affichées sous la réponse (« Sources : modèles IA »). La requête n'est ni affichée ni tracée au journal (choix du commanditaire). | `viewsUsed()`, `admin-api.js` |
| Réponse | Consignes : rien d'inventé, résultats vides ou tronqués signalés, codes traduits, pas d'offre d'action (Jev n'agit pas), même registre (tu / vous) d'un bout à l'autre. | `ANSWER_INSTRUCTIONS` |
| Coût | Mesuré en réel (Claude Haiku 4.5) : environ 18 000 jetons pour écrire la requête (dictionnaire complet) et 7 000 pour répondre, soit environ 0,024 € par question avec données ; 0,017 € sans données. | — |

## Consommation et coûts : toutes les lignes budgétaires (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Lignes affichées | Le tableau « Fonction · Modèle », la courbe, la répartition et les plafonds couvrent les cinq lignes budgétaires du serveur : Insights, Rapports, Guidage console, Documents (trois étapes), Gestion des données. Rapports et Guidage console manquaient (liste figée à trois lignes dans l'écran). | `BUDGET_LINES`, `BUDGET_FN` (`ConsoCouts.dc.html`), `FN` (`bindConso`) |
| Plafonds | `GET /budget-thresholds` et `/usage/month` renvoient une ligne par ligne budgétaire, même sans plafond enregistré (sans plafond, seuil 80 %, version 0). La modification d'un plafond accepte les lignes budgétaires (« docs » compris, jusque-là refusé en 404) et refuse les étapes (`doc_syn`…). | `DEFAULT_WARN_PCT = 80`, `AI_BUDGET_LINES` |
| Part du mois | « 0 % du mois » quand rien n'est dépensé (et non « NaN % »). | `ConsoCouts.dc.html` |

## Journal des appels (spécification JOURNAL, 29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Modèle de données | `UsageRecord` complété : `priceIn`, `priceOut` (€ / M jetons) et `pricePer1k` (€ / 1 000 requêtes, Reranking) figés au moment de l'appel, `durationMs`. `fallback` = `fallbackUsed` existant. Nouveaux appels : identifiant `req_` + 12 caractères hexadécimaux. Le coût reste `costOf()` (= tokensIn × priceIn / 1e6 + tokensOut × priceOut / 1e6 pour un tarif au jeton). Coût en `Float` (double précision) et non `decimal(10,6)` : écart assumé, arrondi à 6 décimales dans les réponses. | migration `20261012000000_journal_appels`, `LlmService.record()` |
| Appels antérieurs | Pas de reprise des tarifs : les appels enregistrés avant le journal gardent `priceIn` / `priceOut` / `durationMs` à null ; leur coût enregistré est inchangé. La vue affiche « Tarif non enregistré (appel antérieur au journal) ». Pour le graphique, leur part entrée / sortie est estimée au tarif actuel du catalogue, bornée par le coût enregistré (entrée + sortie = coût enregistré, toujours). | `splitCost()` |
| Routes | `GET /api/admin/usage/daily` (un point par jour, jours vides inclus), `/usage/calls` (tri date décroissante puis identifiant, curseur opaque, `total` du filtre, 10 par page, 100 au plus), `/usage/calls.csv` (UTF-8 avec BOM, « ; », virgule décimale, CRLF, colonnes du journal plus les tarifs figés ; export tracé au journal d'audit). Période par défaut : le mois de la date du jour de la plateforme, comme « Consommation et coûts » ; 366 jours au plus. Filtre `fn` = ligne budgétaire (Documents = ses trois étapes), `provider`. Lecture réservée aux administrateurs. | `JOURNAL_FNS`, `JOURNAL_PAGE = 10`, `JOURNAL_PAGE_MAX = 100` |
| Vue | `Journal des appels.dc.html` ajoutée telle que livrée (gabarit inchangé) ; son script lit l'API (`journalApi`), `build()` ne sert plus qu'au mode démonstration (`?demo=1`), comme les autres écrans. Règles § 5 : coût par appel à 3 décimales, agrégats en euros à 2 décimales sous 100 € et entiers au-delà (la livraison affichait 1 décimale entre 10 et 100 €), jetons exacts dans le journal et abrégés (k, M) dans les agrégats, moyenne sur les jours ouvrés de la période. Mois affiché lu dans les données (la livraison écrivait « sept. » en dur). État vide : total 0, graphique à plat, « Aucun appel sur la période ». | — |
| Console | `META.journal` = « Intelligence artificielle › Journal des appels » (libellé de la spécification) ; la vue porte son propre en-tête (comme le Registre des cartes API). Sidebar : seule l'entrée `['journal', 'Journal des appels']` est reprise de la livraison, dont la sidebar était antérieure au nom de Jev tiré du Persona. | `Console Admin.dc.html`, `Sidebar Console.dc.html` |
| Jev | La vue `jev.consommation_ia` expose l'identifiant de requête, les tarifs figés et la durée ; la fiche du dictionnaire précise que le coût ne se recalcule pas depuis le catalogue. Skill « Guidage console » : page ajoutée à la carte de la Console (fichier et base locale). | `jev-dictionnaire.ts` |

## Écrans de coûts renommés ; journal sans données fictives (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Libellés | Demande du commanditaire : « Consommation et coûts » devient « Vue générale des coûts », « Journal des appels » devient « Journal consommation et coûts », dans la sidebar et dans les pages (titre de la Console, en-tête et carte de la vue journal), dans les titres de page transmis à Jev, dans le dictionnaire des données et dans la skill « Guidage console » (fichier et base locale). Identifiants inchangés (`conso`, `journal`), ainsi que le nom de fichier `Journal des appels.dc.html`. | `Sidebar Console.dc.html`, `META`, `CONSOLE_PAGE_TITLES` |
| Données fictives | Cause : la vue calculait les données de démonstration dès le premier affichage, avant de savoir si elle était reliée au serveur, et les gardait si le chargement réel échouait (API non relancée : `/usage/daily` en 404). Désormais : données réelles seulement, vides tant qu'elles ne sont pas chargées et après un échec (message d'erreur) ; `build()` uniquement en mode démonstration (`?demo=1`) ou fichier ouvert seul. La base locale ne contenait aucun appel fictif (23 appels réels) : rien n'y a été supprimé. | `Journal des appels.dc.html` (`data()`, `load()`) |

## Date réelle du jour partout (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Principe | Arbitrage du commanditaire : toutes les données, du Cockpit comme de la Console, s'affichent jusqu'à la date réelle du jour. Règle la question ouverte 23. `DEMO_TODAY` est vide par défaut (`.env.example`, `docker-compose.yml`, `.env` local) ; seuls les tests figent la date (`test/env.ts` : 26/09/2026). | `DEMO_TODAY`, `TodayService` |
| Console | L'horloge de la Console (bandeau, « il y a… », mois en cours, jours du graphe de consommation, prochaine capture de snapshot) est recalée sur l'heure du serveur au démarrage (`apiClock()`, appelé par `admin-api.js`) ; 26/09/2026 10:24 reste l'horloge de la démonstration. Année affichée si elle diffère de l'année en cours. Prochaine capture calculée d'après la planification (quotidienne, hebdomadaire le jour choisi, mensuelle le 1er). Registre des cartes API : heure de la Console, et non plus midi du jour. | `nowD()`, `nextCapture()` |
| Vue générale des coûts | Le mois affiché est celui du dernier jour écoulé des données (et non septembre en dur) : nombre de jours du mois, graduations, « Dépensé depuis le 1er … », mois précédent à même date, titre de la répartition. Alerte Google sans date inventée. | `ConsoCouts.dc.html`, `bindConso` |
| Bibliothèque des projets | Avancement des cartes à la date du serveur. | `bindBiblio` → `apiToday` |
| Cockpit | Date du jour du bootstrap (`fToday()`) partout : compte à rebours du Go-Live (prévision `forecast.goliveIso`, sinon jalon J08), prochain COPIL et échéances des 15 jours (séances planifiées), compte à rebours de la fiche d'arbitrage complète (prochaine séance), mini-Gantt du chemin critique (éléments critiques du planning et leurs dates), références de planning (v en vigueur et précédente, du bootstrap), raccourcis d'échéance du formulaire de tâche (veille du prochain COPIL, fin de semaine, semaine suivante), année en cours au lieu de 2026. | `nextSession()`, `sessionLabel()`, `thisYear()`, `frShortIso()` |
| Serveur | Dates des documents : année omise si c'est l'année en cours (et non 2026). | `bootstrap.service.ts` |
| Hors périmètre | Textes d'exemple du jeu de démonstration (contenu de la fiche D-007, profil de démonstration) : ce sont des données, pas la date du jour. | — |

## Sidebar Console v3 (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Composant | `Sidebar Console.dc.html` remplacé par la livraison v3 (accordéon aéré, 300 px dépliée, titres complets, pastille ambre sur filet sarcelle, plus de barre ambre). Seule adaptation : le nom de Jev tiré du Persona (`jevName`), absent de la livraison, est réintégré (bouton, libellé accessible, info-bulle). | `Sidebar Console.dc.html` |
| Mise en page | Largeur réservée à la sidebar dépliée : 300 px (grille de la Console, tiroir mobile borné à 86 % de l'écran, bord gauche du tiroir de notifications). Mode rail inchangé (72 px). | `SB_W = 300` (`Console Admin.dc.html`), `Notifications.dc.html` |
| Libellés | `META` déjà à jour : « Vue générale des coûts » (`conso`), « Journal consommation et coûts » (`journal`). | — |
| Signaux | Format conforme `{ pageId: { dot: 'err' \| 'warn' } \| { b: n } }`, calculé par la Console à partir des données du serveur : `users` (demandes d'invitation en attente, `/notifications`), `providers` (clé refusée, `/providers`), `assign` (fonction indisponible ou sur secours, `/assignments`), `apis` (carte en erreur, clé expirée ou proche de l'échéance, quota ≥ 85 %, `/api-cards`). Mêmes pages que la démonstration de la livraison. | `sbSignals()` |

## Dictionnaire des données du Cockpit (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Contenu | 33 vues en lecture seule dans le schéma `jev_cockpit` (projet, références de planning, lots, phases, sous-phases, chantiers et leurs liaisons, avancements, jalons, livrables, équipes, rôles, personnes, affectations, instances et membres, risques, problèmes, actions, décisions, séances, modèles de rapport, rapports, baromètre, mission, budget, documents et liens, commentaires, habilitations), sur le modèle du dictionnaire de la Console : colonnes en français, codes traduits dans les fiches, criticité d'un risque et total d'une période calculés dans les vues. | `src/domain/jev-dictionnaire-cockpit.ts`, migration `20261013000000_jev_dictionnaire_cockpit` |
| Exclusions | Chemins de stockage (`fileKey`, `fileId`), images, JSON de présentation (`ContentBlock`, `ProjectSection`, fiche d'arbitrage, composants de template, questions du baromètre), tâches privées (`Task`, `TaskOverride`), tables de la Console et de l'authentification. | — |
| Règles | Écrites d'après le code des écrans et des services : avancement prévu, élément en cours, écart d'un jalon à sa référence, état et étiquettes des jalons, statut et risque d'un livrable, criticité, action en retard, signal et fraîcheur d'un avancement, anomalies, prochain COPIL, affectation active, porteurs sans affectation. | fiches `regles` |
| Droits | Chaque vue porte `projet_id`, et `chantier_id` quand l'objet appartient à un chantier ; chaque fiche écrit sa règle de lecture (projet, ou chantier pour risques, problèmes, actions, décisions, avancements, jalons ; documents restreints). Les vues ne sont ouvertes à aucun rôle de lecture (`jev_lecteur` n'y a pas accès) tant que le filtrage par droits de l'utilisateur n'est pas en place. | — |
| Tables du dictionnaire | Colonne `espace` (`console`, `cockpit`) ajoutée à la clé de `dictionnaire_tables` et `dictionnaire_colonnes` : une même vue peut porter le même nom dans les deux espaces. Le Jev de la Console ne lit que l'espace `console`. Chargement : `npm run dictionnaire:charger` ; relecture : `docs/specs/JEV COCKPIT - dictionnaire des donnees.md` (`npm run dictionnaire:doc`). | `seedDictionnaire()`, `ESPACES` |

## Notifications : suppression des règles et date du jour ; déconnexion depuis l'avatar (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Suppression d'une règle | Bouton « Supprimer la règle » dans l'éditeur d'une notification ou d'une alerte, avec confirmation. `DELETE /api/admin/notification-rules/:id` (204 ; 404 si inconnue ; Admin seulement) ; l'historique de ses envois est conservé (messages envoyés, coûts) ; trace d'audit « sensible ». Une règle pas encore enregistrée est seulement retirée de la liste. | `RulesController.remove()`, `deleteRule()` |
| Variable {date} | La valeur d'exemple figée (« 15 mars 2027 », date du jalon J06 de la démonstration) est retirée. {date} vaut la date de l'événement quand il en a une (date prévue du jalon en retard), sinon la date du jour (« 29 sept. 2026 ») : aperçu de la page, aperçu et envoi de test du serveur, envois planifiés. | `NotificationsService.generate()` |
| Déconnexion | Icône « Déconnexion » dans le bloc avatar de la sidebar, visible au survol (et au focus clavier), invisible et non cliquable sinon ; en mode rail, posée sur l'avatar. Même action que Mon profil › Se déconnecter (`POST /api/auth/logout`, puis écran de connexion). Événement `onLogout` de la sidebar. | `Sidebar Console.dc.html`, `sbLogout` |

## Vue « Notifications et alertes » (proposition 1a) intégrée à la Console (29/09/2026)

Livraison `Notifications et alertes.dc.html` et `docs/specs/NOTIFICATIONS ET ALERTES - specification.md`. Le composant est repris à l'identique : design, textes et règles de gestion inchangés.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Route | La Console n'a pas de routage d'URL : ses pages sont des sections internes. La route `/plateforme/notifications` correspond à la page `notifs` du domaine Plateforme, libellée « Notifications et alertes », qui remplace l'ancien écran. L'en-tête générique est masqué, car le composant a le sien. | `Console Admin.dc.html`, `isNotifs` |
| API | Routes de la spécification § 4, sous `/api/admin` : `GET/POST /notifications/rules`, `PUT/PATCH/DELETE /notifications/rules/:id`, `POST /notifications/rules/:id/test`, `GET /notifications/history?rule=`, plus `GET /notifications/counts` pour la donnée `counts`. Elles échangent le modèle `Rule` du § 2. Les anciennes routes `/notification-rules` restent en place (API, tests), mais la Console ne les appelle plus. | `RulesController` |
| Adaptateur | La conversion entre la table et `Rule` se fait côté serveur, par des règles pures testées. « Tous » (`['*']`) correspond à une règle de plateforme (`platform`) ; les profils Admin, PMO, Responsable et Lecteur correspondent aux codes `admin`, `pmo`, `resp` et `lec` ; `at` se traduit en jour, heure et intervalle, avec des valeurs par défaut (hebdomadaire lundi 08:00, sinon 09:00, tous les 3 jours). `evt`, la phrase de l'événement, est déduite du déclencheur. Un modèle inactif ou supprimé est présenté comme « aucun modèle ». | `src/domain/notification-rules.ts` (`toUiRule`, `fromUiRule`, `TRIGGER_EVT`, `DEFAULT_*`) |
| Cas bloquants | Une règle sans modèle ou sans destinataire peut être enregistrée et activée, comme le permet la vue. Elle n'envoie rien pour autant : ni événement, ni planification, ni alerte budgétaire, et le test renvoie 422. Le serveur refuse à l'enregistrement : un nom vide, aucun canal, `{reponse_llm}` dans le prompt, un LLM inconnu ou inactif, un projet inconnu. | `blockingErrors()`, `validateUi()`, `NotificationsService` |
| Création | La vue crée la règle sous son propre identifiant (`r` + horodatage) et continue de l'utiliser : le serveur reprend cet identifiant, et répond 409 s'il existe déjà. Déclencheur par défaut : manuel pour une alerte, planifié pour une notification (question ouverte n° 1). | `uiCreate()` |
| Écritures | Le composant met sa liste à jour lui-même, avant la réponse du serveur. Les écritures partent donc l'une après l'autre, pour qu'une création soit enregistrée avant la modification qui la suit. Si le serveur refuse une écriture, la Console affiche l'erreur, relit les règles et remonte la vue sur l'état réel. | `admin-api.js` (`nrRun`, `nrResync`), `nrMounted` |
| Test | « M'envoyer un test » envoie le brouillon affiché, même s'il n'est pas enregistré, à l'administrateur connecté, sur les canaux choisis. | `uiTest()` |
| Données | `models` : les LLM actifs, sous la forme « fournisseur · nom ». `projects` : les codes des projets. `counts` : les comptes actifs ayant le profil sur au moins un projet (Admin : les administrateurs). `history` : les 200 derniers envois de toutes les règles, filtrés par le composant (« Cette règle » / « Toutes les règles ») ; « il y a … » est calculé à l'heure du serveur. | `uiCounts()`, `toUiHistory()` |
| Planification sur « Tous » | Une notification planifiée qui vise tous les projets part pour chaque projet ouvert. Auparavant, seuls les projets listés recevaient un envoi. | `NotificationsService.tick()` |

## Historique des envois sans données factices (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Amorçage | L'amorçage ne crée plus d'envois de notification. Les 10 envois de démonstration (15 au 26/09, dont un échec) ne servent plus qu'aux tests. Ils ont été supprimés de la base locale. Les 7 envois produits par le moteur le 27/09 (risques critiques R01 à R03 et seuil budgétaire) sont conservés. | `seedDemoDeliveries()` (`prisma/seed/admin.ts`, chargé par `test/helpers.ts`) |

## Registre des cartes API v3c intégré à la Console (29/09/2026)

Livraison `Registre des cartes API.dc.html` (version 3c) et `docs/specs/REGISTRE API - specification.md`. L'ancienne vue (`Registre API.dc.html`) est retirée. L'ancienne spécification reste la référence pour la sécurité, le proxy et le contrôle de santé, sous le nom `REGISTRE API - specification v1.md`.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Route | La Console n'a pas de routage d'URL. La route `/plateforme/cartes-api` correspond à la page `apis` du domaine Plateforme, libellée « Registre des cartes API ». L'en-tête générique est masqué. | `Console Admin.dc.html`, `isApis` |
| Composant | Le composant livré n'avait ni props ni rappels : ses 29 cartes et ses 22 widgets étaient codés en dur. Seul son script est complété, avec des données en entrée et des appels en sortie. Sans ces props, il garde sa démonstration. Le balisage, les styles et les textes sont inchangés, à deux exceptions près : les 4 derniers caractères de la clé viennent du serveur (au lieu de « 7f3a »), et « dernière vérification il y a … » est calculée. Détail dans `frontends/CHANGES-console.md`. | `Registre des cartes API.dc.html` (`syncCards`, `wl`, `sug`) |
| Adaptateur | La carte du serveur est convertie vers le modèle `Card` du § 5, côté Console. Endpoint sans `https://`. `lat` : latence médiane sur 24 h des appels réussis. `q` : appels du jour rapportés au quota. `key` : expiration au format jj/mm/aa. `resp` : dernier test. Un service injoignable (code 0) devient 504 si le délai est dépassé, 502 sinon, comme la réponse d'une passerelle. Le corps est limité à 40 lignes. La série horaire réelle alimente la mini-courbe. | `admin-api.js` (`toCard`, `toResp`, `toDdmmyy`, `lastCheck`) |
| Catalogue des widgets | `WIDGETS - catalogue et presets.md` n'existe ni dans le dépôt ni dans les livraisons. Le catalogue existant est celui du tableau de bord du Cockpit : 22 widgets. Il est repris côté serveur et servi par `GET /api/admin/widgets`. Un test vérifie qu'il reste identique à celui du Cockpit (identifiants, noms, catégories). Les suggestions par tag (`tags`) remplacent la table codée en dur. | `src/domain/widgets.ts` (`WIDGET_CATALOGUE`), `WidgetCatalogueController` |
| Identifiants de widgets | `api_cards.widgets` contient désormais les identifiants du catalogue. Le Cockpit envoie `meteo` et `news` dans l'en-tête `X-RISE-Widget`, au lieu de « Météo · ville » et « Actualités ». Les anciens libellés sont convertis par la migration, et à la volée pour un ancien Cockpit ; un widget inconnu est ignoré. | `widgetId()`, migration `20261014000000_registre_api_v3c` |
| API (§ 6) | `POST` crée une carte avec un tag libre (1 à 40 caractères). `PATCH` accepte `key` : la nouvelle clé est chiffrée et ses 4 derniers caractères conservés ; `null` retire la clé. Elle n'est envoyée que si elle a été saisie. Un changement d'endpoint efface la latence (seuls les appels ultérieurs comptent, `endpoint_since`), la dernière réponse et l'erreur du dernier contrôle. `PUT /api-cards/:id/widgets { ids }` associe ou dissocie des widgets (identifiants du catalogue). `DELETE` est permis même pour une carte liée à des widgets : la Console les liste et demande confirmation, et ils sont cités dans la trace d'audit. Activer ou désactiver passe par `PATCH { enabled }`, traduit depuis `off`. | `ApiCardsController`, `API_CARD_TAG_MAX` |
| Suppression et annulation | La suppression n'est envoyée au serveur qu'à la fin des 5 s pendant lesquelles le message propose « Annuler ». Annuler n'appelle donc pas le serveur. Limite : fermer la page pendant ces 5 s abandonne la suppression. | `admin-api.js` (`apDelete`, `apRestore`) |
| Seuils d'état | Le serveur (vue d'ensemble, notifications, signal de la sidebar) applique les seuils du § 2 : clé expirant dans moins de 60 jours et quota d'au moins 80 %, au lieu de 30 jours et 85 %. « Lente » (latence médiane d'au moins 300 ms) et « Non vérifiée » restent propres à l'écran. Les notifications d'échéance restent à J-30, J-7 et J-1. | `KEY_EXPIRY_SOON_DAYS`, `QUOTA_WARN_PCT`, `SLOW_LATENCY_MS` |
| Jev de la Console | Le dictionnaire est mis à jour : seuils, et widgets sous forme d'identifiants du catalogue. Il a été rechargé dans la base locale. | `src/domain/jev-dictionnaire.ts` |

## Serveur d'envoi SMTP (29/09/2026)

Livraison `Serveur SMTP.dc.html` et `docs/specs/SMTP - specification.md`.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Route et accès | Page `smtp` du domaine Plateforme, après « Notifications et alertes » ; libellé « Serveur d’envoi SMTP », avec l'apostrophe typographique du titre du composant. La Console n'a pas de routage d'URL. Réservée à l'Admin, comme toute la Console (`@AdminOnly`). | `Sidebar Console.dc.html`, `isSmtp` |
| Composant | Livré sans props, avec un test simulé. Seul le script est complété : prop `settings`, rappels `onSave`, `onTest` et `onTestEmail`. Balisage, styles et textes inchangés, sauf les valeurs mesurées : durée de connexion et version TLS au lieu de « 48 ms » et « TLS 1.3 », durée de remise de l'e-mail de test, date du dernier test. L'aide en français des échecs reprend les messages de la démonstration, choisis d'après le code réel. Détail dans `frontends/CHANGES-console.md`. | `Serveur SMTP.dc.html` |
| Aucun identifiant réel | L'adresse du compte d'envoi figurait dans la démonstration du composant et au § 2 de la spécification. Dans le dépôt, elle est remplacée par une adresse fictive et un renvoi vers le `.env`. Les valeurs initiales viennent des variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_ENC`, `SMTP_USER` et `SMTP_FROM` (sinon `SMTP_URL`), renseignées dans le `.env` local, qui n'est pas versionné. Le mot de passe se saisit dans la Console (ou `SMTP_PASSWORD`). | `smtpFromEnv()`, `backend/.env.example` |
| Stockage | Une ligne `smtp_settings`. Tant qu'elle n'existe pas, les réglages viennent de l'environnement (`source: environnement`) ; le premier enregistrement crée la ligne, qui fait foi ensuite. Mot de passe chiffré (AES-256-GCM, `SECRETS_KEY`), jamais renvoyé : `GET` donne `hasPassword`. Un mot de passe vide dans le `PUT` conserve l'existant. Toute modification enregistrée efface le dernier test ; un enregistrement à l'identique le conserve. | `SmtpService`, migration `20261015000000_serveur_smtp` |
| Routes | `GET` et `PUT /api/admin/settings/smtp`, `POST …/test` (brouillon dans le corps) → `{ ok, step, code, ms, connectMs, tls }`, `POST …/test-email { to, settings? }` → `{ ok, ms, to }` (422 avec la réponse du serveur en cas d'échec). `PUT` est tracé comme sensible (sans le mot de passe : « mot de passe remplacé ») ; tests et envois sont tracés en information. | `SmtpController` |
| Vrai dialogue SMTP | Client SMTP minimal côté serveur, plutôt que `verify()` de Nodemailer, qui ne va pas jusqu'à `MAIL FROM` ni ne dit quelle étape échoue. Il enchaîne : connexion (TLS implicite pour SSL/TLS), EHLO, STARTTLS et nouvel EHLO, AUTH PLAIN ou LOGIN, `MAIL FROM`, puis RSET et QUIT (aucun message envoyé). Il renvoie l'étape en échec (`connect`, `tls`, `auth`, `from`), la première ligne de la réponse réelle (sans le renvoi vers l'aide de Gmail), la durée totale, la durée de connexion et la version TLS. Classement : 530 avec STARTTLS → chiffrement ; 530 « Authentication Required », 534, 535 → authentification ; serveur muet après la connexion → chiffrement (« Greeting never received », il attend TLS dès l'ouverture). Délais : 10 s pour la connexion et chaque réponse, 5 s pour l'accueil. | `src/core/smtp-probe.ts`, `smtpFailStep()`, `SMTP_GREETING_TIMEOUT_MS` |
| Adresses privées | Un relais SMTP d'entreprise est souvent sur une adresse interne : les adresses privées sont permises (réservé à l'Admin). Contrairement aux cartes API, pas de protection SSRF. | `SmtpController` |
| Canal E-mail | Tous les e-mails de la plateforme passent par ce serveur : canal E-mail des règles de « Notifications et alertes », invitations, mots de passe, tiroir de l'administrateur. Expéditeur : « RISE Cockpit » <adresse d’expédition>. Sans serveur configuré, le message est seulement écrit dans le journal de l'application, comme avant. | `MailerService`, `SMTP_SENDER_NAME` |
| Jev de la Console | Nouvelle vue `jev.serveur_smtp` (sans le mot de passe : `mot_de_passe_enregistre` seulement) ; titre de page connu de Jev. | `jev-dictionnaire.ts`, `CONSOLE_PAGE_TITLES` |

## Registre des cartes API : carte API requise, « Exp. Clé » (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Carte API requise | Chaque widget du catalogue porte le champ `apiCard` (carte API requise : Oui / Non). Oui pour Actualité, Météo et Trafic, dont les données viennent de services externes ; Non pour les 19 autres, alimentés par les données du projet ou par Jev. « Associer un widget » ne propose que les widgets à Oui, et le serveur refuse les autres (422). Les suggestions par tag ne portent plus que sur ces widgets. | `WIDGET_CATALOGUE`, `API_WIDGET_IDS`, `needsCard` (`Registre des cartes API.dc.html`) |
| Colonne « Clé » | Renommée « Exp. Clé » (en capitales comme les autres en-têtes : « EXP. CLÉ »), à la demande du commanditaire. | `COLS` |

## Notifications et alertes : fréquences, calendrier d'envoi, variables (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Fréquence « Personnalisée » | Retirée de la vue et refusée par le serveur. La migration supprime les règles ainsi configurées (aucune dans la base locale), en conservant l'historique de leurs envois. La valeur `CUSTOM` reste dans le type SQL, inutilisée ; la colonne `everyDays` est vidée. | migration `20261016000000_notifications_frequences`, `UiFreq` |
| Heure d'envoi | Quotidienne et hebdomadaire : sélecteur d'heure HH:MM par pas de 30 minutes, 07:00 par défaut. Hebdomadaire : sélecteur du jour, lundi par défaut. Le serveur refuse une heure hors pas (400). Les heures existantes sont ramenées au créneau de 30 minutes inférieur. | `SEND_STEP_MINUTES`, `DEFAULT_HOUR`, `DEFAULT_WEEK_DAY`, `isSendTime()` |
| Fuseau | Celui de l'organisation, Europe/Paris. Il est affiché sous les sélecteurs (« Fuseau : Europe/Paris (heure de Paris) ») et utilisé par la planification. Le profil de chaque destinataire n'a pas de fuseau exploitable : l'envoi est unique pour tous. La tâche de planification passe toutes les 30 minutes (au lieu de toutes les heures) et compare le créneau exact. | `NOTIFICATION_TIMEZONE`, `GET /api/admin/notifications/schedule`, `sendSlot()` |
| Variables | `{jalon}`, `{risque}`, `{seuil}` et `{document}` sont retirées. Restent `{projet}` et `{date}`, plus `{reponse_llm}` dans le message ; `{semaine}` reste lue pour les synthèses existantes. Le serveur refuse une variable retirée dans l'objet, le message ou le prompt. Nettoyage : les 4 règles d'origine qui les utilisaient (Jalon en retard, Risque critique ouvert, Seuil budgétaire IA atteint, Nouveau document analysé) sont réécrites à la main dans la migration et dans l'amorçage. Tout autre texte perd la variable automatiquement. Conséquence : une alerte ne nomme plus le jalon, le risque ou le document en cause. | `REMOVED_VARIABLES`, `removedVariablesIn()`, migration |
| Composant | Script et balisage complétés : sélecteurs de jour et d'heure, sur le modèle du sélecteur de fournisseur et modèle existant, et mention du fuseau ; prop `schedule` ; fréquences et variables réduites ; textes de démonstration nettoyés. | `Notifications et alertes.dc.html` |

## Notifications internes du Cockpit ; alertes rédigées à partir des données (29/09/2026)

Arbitrages du commanditaire : cloche et tiroir dans la barre latérale du Cockpit ; un texte par profil destinataire.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Notifications du Cockpit | Le canal « Dans l'application » d'une règle crée une notification par destinataire (table `user_notifications` : titre = objet, texte = message, type, projet, lue ou non). Routes du Cockpit : `GET /api/me/notifications` (50 dernières, nombre de non lues ; `unreadOnly`), `POST /api/me/notifications/:id/read`, `POST /api/me/notifications/read-all`. Chaque utilisateur ne voit et ne marque que les siennes (404 sinon). | `MyNotificationsController`, `MY_NOTIFICATIONS_LIMIT` |
| Cloche et tiroir | Cloche dans le pied de la barre latérale, au-dessus de Jev, avec le nombre de non lues ; tiroir le long de la barre (nouveau composant, dans le style du tiroir de la Console) : onglets Toutes / Non lues / Alertes, « Tout lire », un clic déplie la notification et la marque comme lue, Échap ferme. La liste est chargée au démarrage, toutes les 60 s, au retour sur l'onglet et à l'ouverture du tiroir. | `Notifications Cockpit.dc.html`, `api.js` (`NT_POLL_MS`, `ntLoad`) |
| Un texte par profil | Les destinataires d'un envoi sont regroupés par profil : chacun rejoint le profil ciblé le plus large qu'il détient (Administrateur > PMO > Responsable > Lecteur). Un texte est rédigé par groupe, sur les données que tous ses membres peuvent lire : Administrateur et PMO, tout le projet ; Responsable, les chantiers communs à tous les Responsables destinataires ; Lecteur, les chantiers lisibles par tous. Sans chantier commun, seules les données du projet non rattachées à un chantier sont lisibles. Un envoi par canal et par profil est tracé, avec le profil. « M'envoyer un test » : texte du premier profil, remis au seul testeur. | `ProfilesService.audiences()`, `profileScope()`, `Delivery.profile` |
| Rédaction à partir des données | Le modèle de la règle suit les étapes du guide console : analyse de la consigne ; repérage, dans le dictionnaire des données du Cockpit, des vues et colonnes utiles ; écriture de la requête SQL ; exécution par le serveur ; rédaction du contenu (`{reponse_llm}`) à partir des résultats. Même contrôle de la requête et une correction au plus. Si la lecture échoue, le texte est rédigé sans chiffres et renvoie au Cockpit. Une règle de plateforme (sans projet) est rédigée sans données. | `NotificationWriterService`, `NOTIFICATION_ANSWER_INSTRUCTIONS` |
| Génération réelle | Le modèle choisi dans la règle génère réellement (et non plus par le bouchon) quand le serveur est en ligne ; la consommation est tracée (fonction Insights, source Notification). | `LlmService.completeWithModelLive()` |
| Droits sur les données | Nouveau rôle `jev_lecteur_cockpit`, seul à lire les vues `jev_cockpit`. Chaque vue filtre, pour ce rôle seulement : le projet posé par le serveur (`rise.projet`) ; les chantiers lisibles (`rise.chantiers`, « * » pour tous). Les lignes sans chantier sont réservées à « * », comme dans le Cockpit. Exceptions reprises des fiches : livrables visibles de tout le projet ; documents RESTRICTED, liens de ces documents et commentaires réservés à « * ». Paramètre absent : rien. Le serveur pose les paramètres avant de passer au rôle, en lecture seule ; la requête ne peut pas les modifier. Le Jev de la Console ne lit toujours pas ces vues. | `cockpitRightsFilter()`, `cockpitViewSql()`, `JevSqlService.executeCockpit()`, migration `20261017000000_notifications_cockpit` |

## Initialisation d'un projet : nouvel écran, routes de la spécification, modèle Excel (29/09/2026)

Livraison `ProjetInit.dc.html` (4 étapes) et `docs/specs/Initialisation projet - specification.md`. Arbitrages du commanditaire : les routes de la spécification remplacent les anciennes ; seuls les contrôles du serveur bloquent (décision Q4 maintenue) ; « Charger l'exemple » reste simulé ; le modèle Excel est vérifié et complété.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Routes | `POST /api/admin/projects/import/validate` (multipart, champ `file`) : `{ jobId, file, size, ok, checks[5], project, sheets, issues, missing }`, déjà au format de l'écran, dates AAAA-MM-JJ. `POST …/commit { jobId }` : 202, puis création suivie par `GET …/{jobId}` : `{ status, phase 1..5, percent, result?, error? }`. Ajout hors spécification : `DELETE …/{jobId}` pour « Réinitialiser la session » (fichier temporaire supprimé, import oublié). Les anciennes routes `/project-imports` sont retirées. Réservé à l'Admin (403). | `DataController` (`importValidate`, `importCommit`, `importJob`, `importForget`) |
| Commit | Le fichier gardé est relu et entièrement recontrôlé : 409 si le code existe déjà, 422 s'il n'est plus conforme, 409 si la création est déjà faite ou en cours. Création tout ou rien dans une transaction, projet au statut PREPARATION, trace « Initialisation d'un projet » (code · fichier, sensible, profil ADMIN). Le fichier temporaire est supprimé après la création. Une erreur pendant la transaction annule tout (`status: failed`). | `commitPlan()` |
| Les 5 contrôles | Dans l'ordre de l'écran : structure (13 onglets) ; fiche projet (code présent et libre) ; champs obligatoires ; cohérence (erreurs du serveur : références, doublons, dates) ; avertissements. Décision Q4 maintenue : les « ⚠ » et « ◔ » de la colonne CONTRÔLE du fichier restent des avertissements ; seuls les contrôles du serveur bloquent. | `screenChecks()`, `toScreen()` (`src/import/import-screen.ts`) |
| Phases de création | La création écrit dans l'ordre des 5 phases affichées : projet ; lots, phases, sous-phases ; chantiers, jalons, livrables ; équipes, rôles, personnes, affectations, habilitations ; instances et membres. Aucune clé étrangère ne vise les personnes ni les équipes, et les identifiants sont calculés d'avance. L'avancement est réel, 20 % par phase. L'écran le suit sans jamais le devancer, à 2 % toutes les 60 ms comme la simulation d'origine : chaque phase reste visible. | `CommitTarget.progress`, `creationPercent()`, `INIT_STEP` (`admin-api.js`) |
| « Charger l'exemple » | Reste la démonstration simulée du composant (ORION), même dans la Console reliée au serveur. Rien n'est créé côté serveur, mais la carte ORION apparaît dans la bibliothèque jusqu'au rechargement. | `demoData()` |
| Modèle Excel (point 6) | Le modèle livré est identique à celui en place ; la vérification montre qu'il couvre déjà la demande : 13 onglets et un glossaire ; toutes les colonnes « ▾ » ont leur liste, alimentée par les onglets précédents (plages nommées `L_Equipes`, `L_Personnes`, `L_Roles`, `L_Lots`, `L_Phases`, `L_SousPhases`, `L_Chantiers`, `L_Instances`) ou par les listes de valeurs ; chaque champ obligatoire vide passe en orange dès que la ligne est commencée ; colonnes CONTRÔLE (doublons, dates, cohérences) ; onglet « Complétude » (obligatoires remplis sur attendus, %, statut par onglet). Ajout : dans « 12 Jalons », la liste Sous-phase ne propose que les sous-phases de la phase choisie (sous-phases regroupées par phase dans l'onglet 08). | `frontends/Referentiel RISE - initialisation.xlsx` |

## Initialisation d'un projet : zone de dépôt « Feuillets » (29/09/2026)

Choix du commanditaire parmi trois propositions (C). La zone de dépôt n'a plus de trame de points : filet continu, et un éventail de trois feuilles de tableur qui s'ouvre au survol d'un fichier. Styles `zoneSt`, `zoneHov`, `stk` de `ProjetInit.dc.html` ; aucun texte modifié.

## Snapshots : vue livrée branchée sur le serveur, restauration (29/09/2026)

Livraison `Snapshots.dc.html` (« Intégration backend de la vue Snapshots »). Arbitrages du commanditaire : la vue remplace la page Snapshots de la Console (réservée à l'Admin) ; la restauration d'un snapshot de démonstration est refusée avec un message ; les onglets sont les projets de la plateforme.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Restauration | **Revient sur « aucune restauration »** (brief Console § 7.5, ancien test « aucune route de restauration n'existe »). `POST /api/admin/snapshots/:id/restore` : le serveur capture d'abord « Sécurité avant restauration » (auteur affiché « Système »), puis supprime et recrée les données du projet dans une transaction (tout ou rien), puis trace « Restauration d'un snapshot » (critique : administrateur, projet, état, sauvegarde). Périmètre : les 19 entités capturées et leurs tables de liaison (lots des phases, chantiers ↔ phases / lots, dépendances, membres des instances, liens des documents). La fiche du projet, les fichiers des documents, les commentaires et les notifications ne sont pas restaurés. Pour un snapshot antérieur à la capture des liaisons, les liaisons actuelles dont les deux bouts existent encore sont gardées. | `SnapshotsService.restore`, `SNAPSHOT_LINKS`, `SAFETY_LABEL`, `SAFETY_AUTHOR`, `RESTORE_TIMEOUT_MS` |
| Démonstration | Les snapshots de démonstration n'ont pas de contenu : leur restauration est refusée (409 `SNAPSHOT_SANS_CONTENU`, « Ce snapshot de démonstration ne contient pas de données : restauration impossible », affiché dans la notification). Même refus pour comparer un snapshot de démonstration à une vraie capture (sinon la vue afficherait à tort « Aucune différence »). Les compteurs de démonstration évoluent d'un snapshot à l'autre (effectifs du premier, plus les ajouts et moins les suppressions saisis), comme dans la maquette. | `SnapshotsService.diff`, amorçage `prisma/seed/admin.ts` |
| Routes | Remplacent les anciennes : `GET /projects/:id/snapshots` → `[{ id, date, type: auto\|man, libelle, auteur, compteurs: { taches, jalons, risques, livrables } }]` (terminés seulement) ; `POST /projects/:id/snapshots { libelle }` → 202 `{ jobId, statut, progression }` ; ajout hors brief : `GET /snapshot-jobs/:jobId` → `{ statut: en_cours\|termine\|echec, progression, snapshot?, erreur? }` (progression réelle, une étape par table capturée) ; `GET /snapshots/:a/diff/:b` (ordre indifférent, A est le plus ancien) ; planification `GET` / `PUT` avec `prochaineCapture` et `maintenant`. `GET /snapshots/compare` est retiré. | `DataController` |
| Diff | Consolidé : modifications successives d'un champ → première valeur → dernière valeur ; ajouté puis modifié = ajout ; ajouté puis supprimé = rien ; supprimé puis recréé = rien ; retour à la valeur de départ = aucune différence. Champs en clair (« Probabilité », « Date prévue »…), identifiants résolus en noms, dates en français, pourcentages, statuts traduits. Champs ignorés : identifiant, horodatages, version, ordre. | `consolidateChanges`, `fieldLabel`, `formatValue`, `DIFF_IGNORED_FIELDS` (`src/domain/snapshots.ts`) |
| Planification | Prochaine capture calculée par le serveur : première heure pleine à venir où la tâche horaire la déclencherait (heure de Paris). **Correction** : la tâche horaire comparait « 04 h » (format français de l'heure seule) à « 04:00 » ; aucune capture planifiée ne partait. Jour validé (lundi … dimanche, en minuscules). Chaque modification est tracée avec les valeurs avant et après. | `nextSnapshotRun`, `isSnapshotDue`, `SNAPSHOT_TIMEZONE` |
| Onglets | Projets de la plateforme, du plus ancien au plus récent, projets clos en dernier (en démonstration : RISE, ATLAS, HORIZON, NOVA, puis ORBIT). | `bindSnapshots` (`admin-api.js`) |
| États | Chargement, comparaison et restauration de plus de 500 ms : notification sombre « … en cours… » ; erreurs : notification sombre en français. Pendant une comparaison, ni « Aucune différence » ni liste. La progression de la capture avance au pas de la simulation d'origine sans devancer le serveur. | `SN_SLOW`, `SN_TICK`, `SN_POLL` |
| Propriété `volume` | Gardée dans le fichier (démonstration hors serveur), sans effet dans la Console. | — |

## Persona : écran en tuiles branché sur le serveur (29/09/2026)

Livraison « Persona tuiles » (`Persona.dc.html`) : deux tuiles de même taille (Identity, Soul) à la place des onglets. Les routes, les validations et l'injection dans le prompt de Jev existaient déjà (spécification PERSONA) ; elles sont gardées.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Routes | Inchangées : `GET` / `PUT /api/assistant/persona` (Persona complet), `POST /api/assistant/persona/avatar` → `{ url }`. Le brief les nomme `/persona` et `/persona/avatar` : ce sont les mêmes, sous le préfixe existant. | `PersonaController` |
| Validations | Déjà en place et vérifiées : Nom obligatoire, 30 caractères ; Créature 40 ; Style 60 ; Soul 20 000 ; image PNG, JPEG ou WebP (reconnue par sa signature), 1 Mo. | `PERSONA_NAME_MAX`, `PERSONA_CREATURE_MAX`, `PERSONA_STYLE_MAX`, `PERSONA_SOUL_MAX`, `PERSONA_PHOTO_MAX_BYTES` |
| Audit | « Persona modifié » porte désormais la partie modifiée (`Identity`, `Soul` ou `Identity et Soul`) et ses valeurs avant et après (l'image par son adresse), en plus de l'administrateur, de la date et de la version. | `PersonaController.put` (`details`) |
| Enregistrement | L'écran attend la réponse du serveur quand `onSave` renvoie une promesse. La tuile n'est marquée enregistrée qu'après la réponse ; en cas d'échec, la modification reste en attente (« Non enregistré ») et la notification sombre donne le motif. Un enregistrement lent (plus de 500 ms) affiche « Enregistrement en cours… ». Sans promesse (démonstration), comportement d'origine. | `commit()` de `Persona.dc.html`, `psSave` (`admin-api.js`) |
| Image | L'image est envoyée dès son choix ; l'aperçu (data URL) est remplacé par l'URL stockée dès la réponse. Refus du serveur : motif sous l'avatar, image précédente rétablie. | `upload()` de `Persona.dc.html`, `psUpload` |

## Skills : écran en tuiles branché sur le serveur (29/09/2026)

Livraison « Skills tuiles » (`Skills.dc.html`) : liste paginée (9 par page) et éditeur, deux tuiles de 680 px. Les skills, leur audit et leur injection dans le prompt de Jev existaient ; routes et règles alignées sur le brief.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Routes | `GET /api/assistant/skills` (liste complète) ; avec `q`, `filtre` (`toutes` / `actives` / `desactivees`), `page` (à partir de 1, bornée à la dernière) ou `par_page` (100 au plus) : `{ items, total, toutes, actives, page, par_page }`, recherche sans accents ni majuscules. `POST` ; `PUT /:id` (nom et texte) ; `PATCH /:id/active` ; `DELETE /:id`. **L'ancien `PATCH /:id` (nom, texte et activation mêlés) est retiré.** | `SkillsController`, `SKILL_PER_PAGE`, `SKILL_PER_PAGE_MAX`, `matchesSkillQuery` |
| Nom | Obligatoire (422 : un nom vide n'est plus remplacé par « Sans nom » côté serveur ; l'écran envoie « Sans nom » lui-même), 60 caractères, unique sans tenir compte des majuscules (409 `SKILL_NOM_PRIS` à l'enregistrement ; comparaison en JavaScript, `ILIKE` gérant mal les majuscules accentuées). À la création, un nom pris reçoit un numéro : l'écran crée toujours « Nouvelle skill », la suivante devient « Nouvelle skill 2 », et l'écran reprend le nom renvoyé. | `uniqueSkillName` |
| Audit | Création, modification, activation, désactivation, suppression : administrateur, date, skill, valeurs avant et après. | `SkillsController` (`details`) |
| Attente du serveur | Quand les props renvoient une promesse, l'écran l'attend. Échec d'un interrupteur : retour à la position précédente. Échec d'un enregistrement : brouillon rétabli (point ambre « Non enregistré »). Échec d'une création : skill retirée. Échec d'une suppression : skill remise à sa place. Le motif s'affiche dans la notification sombre. L'id du serveur remplace l'id provisoire `new-…` (liste, sélection, brouillon). La Console ne relit plus la liste après chaque action : une nouvelle liste remettrait la sélection et la page de l'écran à zéro. | `settle`, `adopt` (`Skills.dc.html`), `skCreate` / `skSave` / `skToggle` / `skDelete` (`admin-api.js`) |
| Mode serveur | Au-delà de 200 skills (totaux lus au chargement), la Console passe à l'écran une prop supplémentaire `onQuery`. L'écran demande alors chaque page (recherche avec 200 ms d'attente, filtre, page) et affiche les totaux du serveur ; le clavier change de page. En dessous, filtrage et pagination restent dans l'écran. | `SKILLS_REMOTE_THRESHOLD`, `skQuery` (`admin-api.js`), `query` / `remote` (`Skills.dc.html`) |
| Barres de défilement | La règle globale livrée (`*{scrollbar-width:none}`) restait dans la page après la visite de Skills et masquait les barres de toute la Console. Elle est limitée à l'écran (`[data-screen-label="Skills"]`) : même rendu dans Skills, barres rétablies ailleurs. | style du `<helmet>` de `Skills.dc.html` |
| Prompt de Jev | Inchangé : skills actives seulement, après le Persona (Identité, puis Personnalité), dans l'ordre. Le Jev de la Console ne reçoit que la skill « Guidage console » (décision du 28/09/2026). | `JevPromptService` |

## Écrans de connexion : photos du volet gauche (29/09/2026)

Photos fournies par le commanditaire, en WebP (1190 × 1322 px, 90 et 126 Ko) : `frontends/assets/connexion-console.webp` (Console) et `connexion-cockpit.webp` (Cockpit), dans `Authentification.dc.html`. Posées sous les dégradés existants (lisibilité du texte blanc), cadrées pour le volet (proche du carré) et pour le bandeau mobile. Leur résolution suffit jusqu'à un écran de 1920 px ; au-delà, sur écran haute densité, une version d'environ 1800 × 2000 px serait plus nette.

## Jev de la Console : mise en forme des réponses (29/09/2026)

Le panneau affichait le Markdown brut du modèle (`#`, `**`, tableaux en `|`). Deux leviers :

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Rendu | Le Markdown simple devient des blocs typés (titre, sections, paragraphes, listes, paires, fiches, citation, code). Un tableau n'est jamais affiché tel quel dans ~420 px : 2 colonnes → paires ; au-delà → fiches (code aligné, nom, statut en pastille, période fusionnée, méta). Statuts reconnus par emoji ou par mot, en cinq tons (ok, vigilance, risque, info, neutre). | `formatJev`, `statusOf`, `frDate`, `TONES` (`frontends/jev-format.js`) |
| Consignes au modèle | Le prompt du Jev de la Console décrit le format attendu : réponse d'abord, titre `##` seulement si utile, gras avec parcimonie, tableau (code, nom, trois colonnes au plus, dates JJ/MM/AAAA), synthèse en `**Libellé** : valeur (détail)`, pas de `#`, de séparateur ni d'emoji décoratif ou de statut, une seule relance. | `CONSOLE_FORMAT_RULES` (`src/domain/jev-prompt.ts`), après la page ouverte |
| Cockpit | Le panneau Jev du Cockpit n'est pas modifié (ses réponses passent encore par le bouchon) ; le même module pourra y être branché. | — |

## Vue d'ensemble de la Console : une seule source (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Dernier snapshot | Lu dans `GET /api/admin/overview` (tous projets) ; prochaine capture : `prochaineCapture` de la planification de son projet. | chargement `ov` (`admin-api.js`) |
| À traiter | Points de la Console, plus ceux du serveur qu'elle ne calculait pas : échecs d'envoi (7 jours, regroupés), demandes d'invitation du PMO. Libellés en clair côté serveur : nom de la règle, canal (« E-mail », « Dans l’application »), nom de la personne. | `ConsoleController.overview`, `S.ovExtra` |
| Montants et durées | Coût du mois en centimes sous 100 € ; « < 1 % » pour une dépense non nulle ; « il y a… » en durées complètes (arrondi inférieur). | `ago`, vue d'ensemble (`Console Admin.dc.html`) |

## Projets de démonstration : seul RISE est gardé (29/09/2026)

Demande du commanditaire : supprimer les données des projets de démonstration, sauf RISE (conservé intégralement).

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Base locale | ATLAS, HORIZON, NOVA et ORBIT supprimés en une transaction : fiches et affichage de bibliothèque (4), rattachements de comptes (9), habilitations (6), snapshots (5, sans fichier), planifications (4), mention dans les règles n1, n2 et n5. RISE vérifié identique avant / après (46 contrôles). Conservés : client AMC Corp (partagé avec RISE), comptes (tous rattachés aussi à RISE), journal d'audit (ajout seul). Sauvegarde préalable : `%USERPROFILE%\rise-sauvegardes\rise-avant-suppression-projets-demo-20260929-203401.dump` (restauration : `pg_restore -h localhost -p 5433 -U rise -d rise --clean`). | — |
| Amorçage | `npm run db:seed` et `demarrer-rise -Reinitialiser` ne créent plus que RISE (comptes, snapshots, planification, règles). Les quatre projets restent disponibles pour les tests seulement (`seedDemoLibrary`, chargé par `test/helpers.ts`, comme `seedDemoAi`). | `DEMO_LIBRARY`, `seedDemoLibrary` (`prisma/seed/admin.ts`) |
| Console | Avec le serveur, les listes de projets (rattachements, droits, modules, filtres, bibliothèque) viennent de la base (`apiProjects`) ; le chargement des snapshots lit les projets du serveur (un projet supprimé bloquait le démarrage de la Console : 404). En démonstration sans serveur, les données des écrans sont inchangées. | `apiProjects` (`Console Admin.dc.html`), chargements `projects` et `snaps` (`admin-api.js`) |
| Jev | Exemples de code projet des dictionnaires de données : « RISE » seulement (rechargés en base, documentation régénérée). | `jev-dictionnaire.ts`, `jev-dictionnaire-cockpit.ts` |

## Snapshots factices retirés ; colonne « WIDGETS ALIMENTÉS » ; Cockpit vierge corrigé (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Snapshots factices | Les 10 snapshots de démonstration de RISE (r1-r10 : sans contenu, écarts saisis à la main) sont supprimés de la base locale (sauvegarde : `rise-sauvegardes\rise-avant-suppression-snapshots-factices-20260929-212211.dump`) et de l'amorçage. La planification de RISE (réglage) est gardée. Pour les tests seulement : `seedDemoSnapshots` (avec la trace d'audit de création associée). La trace d'audit déjà en base reste (journal en ajout seul). | `seedDemoSnapshots` (`prisma/seed/admin.ts`) |
| Registre des cartes API | Colonne « ALIMENTE » renommée « WIDGETS ALIMENTÉS » (tableau et fiche). | `COLS` (`Registre des cartes API.dc.html`) |
| Cockpit vierge | **Cause** : le tiroir des notifications (`<dc-import name="Notifications Cockpit">`, ajouté le 29/09) était placé dans la grille du shell. Son enveloppe `sc-host` devenait une cellule de la grille, prenait la colonne du contenu, et `<main>` glissait dans la colonne suivante, large de 0 px (ou de 400 px quand Jev est ouvert). **Correction** : l'import est sorti de la grille (le tiroir est en position fixe), comme dans la Console. | `RISE Cockpit.dc.html` |

## Profils multiples : habilitations projet par projet depuis la Console (29/09/2026)

Constat : le modèle de données et le Cockpit cumulaient déjà les profils (Administrateur, PMO, Responsable de chantiers, Lecteur de chantiers, projet par projet), mais la Console ramenait chaque compte à un profil unique : choisir « Admin » effaçait les habilitations PMO, choisir « PMO » retirait le rôle d'administrateur, un même profil s'appliquait à tous les projets, et « Responsable » y était refusé.

Arbitrages du commanditaire : **tout s'attribue depuis la Console** (revient sur Q3 : l'Admin attribue aussi Responsable et Lecteur, y compris à une personne du référentiel) ; saisie **projet par projet** ; l'Administrateur est un rôle de **plateforme** qui se cumule avec PMO sur certains projets.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Lecture | Chaque compte expose `profiles` (tous les profils détenus, du plus large au plus restreint), `admin` et `habilitations` : `[{ code, pmo, responsable[], lecteur[] }]` par projet (droits du compte et de sa personne du référentiel). `profile` (le plus large) est gardé. Filtre et compteurs par profil : tout compte qui le détient (un compte peut compter dans plusieurs profils). | `view()`, `PROFILE_ORDER` (`accounts.controller.ts`) |
| Écriture | `PUT /api/admin/accounts/:id/habilitations` `{ admin, projects: [{ code, pmo, responsable, lecteur }] }` remplace le tout : rôle d'administrateur (il reste au moins un administrateur ; on ne se retire pas ses propres droits), projets rattachés (un projet retiré perd ses habilitations), et sur chaque projet PMO ou chantiers (un chantier Responsable n'est pas aussi Lecteur). Pour une personne du référentiel, les droits sont écrits sur la personne (les lignes que crée l'import Excel) ; sinon sur le compte. **Correction du 29/09/2026** : le Cockpit n'a aucune écriture d'habilitation ; la Console est le seul lieu de modification (voir « Répartition des habilitations »). Audit « Modification des habilitations » (sensible) avec l'avant et l'après. `POST /accounts` accepte aussi `habilitations` (l'ancien `profile` + `projectCodes` reste accepté). Chantiers d'un projet : `GET /api/admin/projects/:code/workstreams`. | `putHabilitations`, `writeHabilitations`, `workstreams` |
| Correction | La vue « après » des audits de comptes lisait les droits hors de la transaction, donc l'état d'avant : elle lit désormais dans la transaction (touchait aussi l'audit de la modification classique d'un utilisateur). | `view(accounts, db)` |
| Console | Fenêtre d'un utilisateur : interrupteur « Administrateur de la plateforme » (indépendant) à la place du choix unique « Profil » ; pour chaque projet rattaché, « PMO » ou « Chantiers », et chaque chantier se règle d'un clic (sans accès → Lecteur → Responsable). Liste : tous les profils du compte (« Admin · PMO »). | `uDlgVals`, `habOfUser`, `wsList`, `habErr`, `habProfs` (`Console Admin.dc.html`) ; `saveUser`, `toUser`, chargement `wsAll` (`admin-api.js`) |
| Cockpit | Inchangé : il lit déjà les habilitations du compte et de sa personne, et les cumule par projet et par chantier. | `buildAccess` (`src/domain/rights.ts`) |

## Cockpit : droits de l'utilisateur connecté lus sur le serveur (29/09/2026)

Un PMO attribué par la Console sur son compte (sans personne du référentiel) n'avait pas l'onglet « Référentiel » : l'écran ne lisait que les habilitations de la personne. Règle : pour l'utilisateur connecté, l'écran suit les droits effectifs du serveur (`effective` de `GET /api/me`, qui réunit les habilitations du compte et de la personne) ; le serveur continue de contrôler chaque accès. Constantes : `meAccess` (`api.js`), `prof()` (`RISE Cockpit.dc.html`).

## Répartition des habilitations entre la Console et le Cockpit (état vérifié le 29/09/2026)

| Qui | Où | Ce qu'il fait sur les habilitations |
|---|---|---|
| Administrateur | Console › Utilisateurs | Seul lieu de modification : rôle d'administrateur de la plateforme ; par projet, PMO ou chantiers en Responsable / Lecteur ; rattachements. Aussi : Administrateurs (ajout / retrait), approbation des demandes d'invitation du PMO (compte créé en Lecteur, profils à compléter ici). |
| Import Excel (Console › Initialisation) | Création d'un projet | Un Responsable par chantier (le responsable du chantier dans le fichier). |
| Compte initial (`npm run init:admin`) | Installation | Administrateur + PMO de tous les projets. |
| PMO | Cockpit | Aucune écriture d'habilitation. Il peut demander l'invitation d'une personne du référentiel (validée dans la Console). Changer le responsable d'un chantier dans le Référentiel ne modifie pas les habilitations. |
| Tous | Cockpit | Lecture seule : les droits effectifs réunissent les habilitations du compte et de la personne ; le serveur contrôle chaque accès. |

## Habilitations proposées par le référentiel : la Console propose, l'Administrateur décide (29/09/2026)

Option 1 retenue par le commanditaire. Le PMO renseigne le référentiel dans le Cockpit ; la Console en tire une proposition ; seul l'Administrateur modifie les droits.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Proposition | Pour un compte lié à une personne du référentiel (même e-mail ou `personId`), sur chaque projet : **Responsable** des chantiers dont la personne est responsable (fiche Chantier) ; **Lecteur** de ses autres chantiers de rattachement (fiche Personne). Pas de nouvel objet dans le référentiel. | `proposal` (`src/domain/habilitation-proposals.ts`), `ProfilesService.referential` |
| Écarts | Responsable manquant (chantier dont la personne est responsable, sans droit), Responsable en trop (droit sur un chantier dont elle n'est plus responsable), lecture manquante (chantier de rattachement sans accès). Un PMO du projet n'a pas d'écart ; un Lecteur au-delà du référentiel n'en est pas un (ouverture volontaire de l'Administrateur). Comptes actifs et invités seulement. | `gaps`, `gapText` |
| Console | Chaque compte expose `referentiel` (par projet : personne, chantiers dont elle est responsable, rattachements, proposition, écarts). Fenêtre d'un utilisateur : encart « Référentiel du projet » par projet rattaché, avec « Appliquer » (coche la proposition, ajustable avant d'enregistrer), « La saisie diffère du référentiel » ou « Conforme ». Vue d'ensemble : « À traiter » signale les comptes en écart (« Karim Benali (RISE : Responsable de C6 sans en être responsable) »). | `view()` (`accounts.controller.ts`), `REFERENTIAL_GAP` (`console.controller.ts`), `uDlgVals` (`Console Admin.dc.html`), `toUser`, chargement `ov` (`admin-api.js`) |
| Ce qui ne change pas | Rien n'est appliqué automatiquement : un changement du PMO dans le référentiel ne modifie aucun droit, il crée un écart signalé. Les « chantiers de rattachement » ne donnent toujours aucun droit par eux-mêmes. | — |

## « Inviter à activer son compte » (Référentiel du Cockpit) : état réel, droits du référentiel, retour au PMO (29/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| État réel | `GET /api/projects/:id/account-states` (PMO, Admin) : pour chaque personne, `active`, `invited` (date d'envoi), `suspended`, `pending` (demande transmise, date), `rejected` ou `none`. L'icône du Référentiel suit le serveur (liste d'exemple et date « 12/09 » écrites en dur retirées, gardées pour la démonstration sans serveur). Le bouton « Inviter » n'apparaît que sans compte ; un clic sur une demande en cours ou une invitation envoyée ne crée rien et le dit. Message au clic : « Demande d'invitation transmise à l'administrateur ». | `accountStates` (`collab.controller.ts`), `psAccSrv` (`api.js`, `RISE Cockpit.dc.html`) |
| Droits à l'acceptation | L'acceptation applique la proposition du référentiel (Responsable des chantiers dont la personne est responsable, Lecteur de ses autres chantiers de rattachement), au lieu d'un compte sans droit annoncé « profil Lecteur ». La demande côté Administrateur l'indique : « … · Responsable de C2 · Lecteur de C3 » (ou « aucun chantier au référentiel : droits à compléter »). | `approveInvitation` (`accounts.controller.ts`), `proposalText`, texte `INVITE` (`inbox.service.ts`) |
| Retour au PMO | Acceptation ou refus : notification dans la cloche du Cockpit du demandeur, en plus de l'e-mail. | `tellRequester` (`inbox.service.ts`) |
| E-mail indisponible | Un e-mail d'invitation qui ne part pas n'annule plus rien : le compte est créé (réponse `inviteSent: false`, `inviteError`), la Console le dit (« utilisez Relancer ») ; la notification au PMO le dit aussi ; l'e-mail au demandeur est facultatif. Avant, la Console affichait « Erreur interne », un nouvel essai tombait en doublon et le PMO n'était pas prévenu. | `createAccount`, `tellRequester` |

## Personne désactivée dans le référentiel : accès à retirer, signalé dans « À traiter » et la cloche, sans e-mail (29/09/2026)

Choix du commanditaire : le Cockpit ne coupe aucun droit ; la Console signale, l'Administrateur décide.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Règle | Personne inactive (`Person.active = false`) : aucune habilitation proposée ; tout accès encore ouvert sur le projet (PMO, Responsable, Lecteur) est un écart « accès à retirer ». Sans accès restant, rien n'est signalé. | `gaps(…, inactive)` → `accesARetirer`, `gapText` (`src/domain/habilitation-proposals.ts`), `ProfilesService.referential` |
| Vue d'ensemble | « À traiter », niveau erreur (rouge) : « N accès à retirer : personne(s) désactivée(s) dans le référentiel », détail « Karim Benali (RISE : désactivé dans le référentiel, accès encore ouvert (Responsable de C5, C6)) ». Séparé des écarts ordinaires (ambre). | `ACCESS_TO_REMOVE` (`console.controller.ts`), chargement `ov` (`admin-api.js`) |
| Cloche de la Console | Une notification ERR par compte et par projet (clé `access:{compte}:{projet}`), « Accès à retirer : Karim Benali », action « Voir les utilisateurs » ; aucun e-mail. Réconciliée à chaque lecture : elle se ferme d'elle-même quand l'accès est retiré, le compte suspendu, ou la personne réactivée. | `sync()` (`inbox.service.ts`) |
| Fenêtre de l'utilisateur | Encart du référentiel en rouge « Accès encore ouvert : à retirer. », bouton « Retirer l'accès » (détache le projet, effectif à l'enregistrement). Pour couper tout accès d'un compte sans autre projet : le suspendre depuis la liste (message d'erreur explicite). | `uDlgVals`, `habErr` (`Console Admin.dc.html`) |
| Comptes concernés | Actifs et invités ; un compte suspendu n'a plus d'accès, il n'est pas signalé. | filtre `status in ACTIVE, INVITED` |

## Personne réactivée dans le référentiel après la suspension de son compte : compte à réactiver (30/09/2026)

Correction signalée par le commanditaire : désactiver une personne (alerte), suspendre son compte, puis la réactiver dans le référentiel ne produisait aucune alerte.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Règle | Compte suspendu, personne du référentiel active, **et** réactivée (audit `PERSON`, champ `active` passé à vrai) après la dernière suspension du compte (audit « Suspension d'un utilisateur »). Un compte suspendu volontairement dont la personne est restée active, sans réactivation postérieure (ex. Marc Delorme dans la démonstration), n'est pas signalé : sans cette condition de date, toute suspension d'une personne encore au référentiel créerait une alerte permanente. | `ProfilesService.toReactivate`, `SUSPENSION_ACTION` |
| Signal | « À traiter », niveau avertissement (ambre) : « N compte(s) suspendu(s) : personne(s) réactivée(s) dans le référentiel ». Cloche de la Console : WARN « Compte à réactiver : Nathalie Roux » (clé `reactivate:{compte}:{projet}`), action « Voir les utilisateurs ». Sans e-mail, comme l'accès à retirer. | `ACCOUNT_TO_REACTIVATE` (`console.controller.ts`, chargement `ov` d'`admin-api.js`), `sync()` (`inbox.service.ts`) |
| Fin de l'alerte | Réactivation du compte par l'Administrateur, ou nouvelle désactivation de la personne par le PMO. | réconciliation de la cloche |

## E-mail corrigé au référentiel : signalé dans la Console, appliqué par l'Administrateur (30/09/2026)

Constat du commanditaire : une invitation partie à une adresse mal saisie au référentiel (`…@gmaail.com`) ; corriger la fiche Personne ne corrigeait pas le compte. Choix : pas de recopie automatique, un écart signalé et une application en un clic.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Pourquoi pas automatique | L'e-mail du compte est l'identifiant de connexion et reçoit les liens d'invitation et de réinitialisation. Le laisser suivre la fiche Personne permettrait à un PMO de rediriger un compte vers une adresse qu'il contrôle. Même principe que les habilitations : la Console propose, l'Administrateur décide. | — |
| Écart | Compte actif ou invité lié à une personne par `personId`, dont l'e-mail (sans casse ni espaces) diffère de celui du compte. Un compte lié par l'e-mail seul ne peut pas diverger. | `ReferentialEntry.email`, `emailEcart` (`ProfilesService.referential`), `emailReferentiel` (vue des comptes) |
| Signal | « À traiter » (ambre) « N compte(s) : e-mail différent du référentiel », détail « Robin (compte : … · référentiel : …) » ; cloche WARN « E-mail différent du référentiel : Robin » (clé `email:{compte}`), sans e-mail. Se ferme dès que les adresses concordent. | `EMAIL_MISMATCH` (`console.controller.ts`), `sync()` (`inbox.service.ts`) |
| Application | `POST /api/admin/accounts/:id/referential-email`, sans corps : l'adresse est lue sur la personne liée, jamais saisie. Refus : aucune personne liée (`NO_REFERENTIAL_PERSON`), adresse du référentiel invalide (`INVALID_EMAIL`), déjà alignée (`ALREADY_ALIGNED`), adresse d'un autre compte (`DUPLICATE`). Audit sensible « E-mail repris du référentiel ». | `applyReferentialEmail` (`accounts.controller.ts`) |
| Liens de l'ancienne adresse | Invalidés (invitation, réinitialisation) à l'application, et aussi à toute modification de l'e-mail par la fenêtre de l'utilisateur (`PATCH`), qui ne le faisait pas. Compte invité : nouvelle invitation (relance, 14 jours) à la nouvelle adresse. | `passwordToken.updateMany` |
| Console | Fenêtre de l'utilisateur, sous l'e-mail : encart « E-MAIL DU RÉFÉRENTIEL », « Le référentiel indique … (compte : …) », bouton « Appliquer » ou « Appliquer et renvoyer l'invitation ». | `uDlgVals().mail`, `applyRefMail` (`Console Admin.dc.html`, `admin-api.js`) |

## Objet « Info projet » du Référentiel (30/09/2026)

Demande du commanditaire : un objet « Info projet », juste après « Projet » dans « Objets du modèle », reprenant les informations de l'onglet Fiche projet ; ajouté au dictionnaire ; dans la Fiche projet, « Marques du groupe » passe avant « Le programme en une phrase ».

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Contenu | Huit rubriques, dans cet ordre : Le client (libellé + valeur), Marques du groupe, Programme en une phrase (texte unique), Enjeux stratégiques, Périmètre fonctionnel et Périmètre applicatif (libellé + valeur), Périmètre géographique, Périmètre juridique (listes). | `PROJECT_INFO_RUBRIQUES` (`src/domain/project-info.ts`) |
| Stockage | Le bloc de contenu `referential` du projet, qui portait déjà le client, les marques et les périmètres fonctionnel et applicatif. Programme, enjeux, pays et entités, jusque-là écrits en dur dans l'écran, y sont repris (migration `20261018000000_info_projet` pour RISE, `rise-data.js` pour l'amorçage et la démonstration). Les autres clés du bloc (réseau, lots, historique du Go-Live…) ne font pas partie de l'objet et sont conservées à chaque écriture. | `PROJECT_INFO_BLOCK` |
| API | `GET /api/projects/:id/project/info` (tout profil du projet) ; `PUT` (PMO, `canWriteReferential`) avec l'objet complet, validé (valeurs non vides, 2 000 caractères, 60 lignes par rubrique) ; audit `PROJECT_INFO`, une ligne par rubrique modifiée. | `ProjectInfoSchema`, `ProjectController.info` / `putInfo` |
| Écran Référentiel | Tableau « rubrique · libellé · valeur », une ligne par élément ; rubrique en liste de choix ; libellé verrouillé (« — ») pour les rubriques en liste ; « + » ajoute un enjeu à compléter ; suppression par ligne. L'écran reconstitue l'objet et l'envoie en une fois, seulement s'il diffère de celui du serveur (une ligne ajoutée encore vide n'est pas envoyée). | `ipRub`, `ipRows`, `projectInfo` (`RISE Cockpit.dc.html`), `onProjectInfo` (`api.js`) |
| Fiche projet | Lit l'objet (`projectInfo()`), y compris les compteurs « N pays » et « N entités » et le nom du client de l'en-tête ; même rendu qu'avant. « Marques du groupe » avant « Le programme en une phrase ». | `IPJ` (`renderVals`) |
| Dictionnaire | Vue `jev_cockpit.infos_projet` : une ligne par élément (rubrique, rangs, libellé, valeur), filtrée par projet. | `DICTIONNAIRE_COCKPIT`, migration `20261018000000_info_projet` |

## Registre des cartes API : clé « Bearer » et appels POST, carte JEV (TypeSafe) (30/09/2026)

Demande du commanditaire : une carte « JEV », tag « Stratégie », pour l'API TypeSafe (documentation https://docs.typesafe.ai/introduction). Cette API attend `POST https://api.typesafe.ai/v1/systemone`, un corps JSON (`state`, `model`, `questions`) et `Authorization: Bearer <clé>`, que le registre ne savait pas envoyer (GET seulement, clé dans l'URL ou `X-Api-Key`). Option retenue : étendre le registre.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Envoi de la clé | `HEADER` (en-tête `X-Api-Key`, défaut, comportement antérieur) ou `BEARER` (`Authorization: Bearer <clé>`) ; le marqueur `{key}` de l'endpoint reste prioritaire. | `API_AUTH_MODES`, `ApiCard.authMode` |
| Méthode | `GET` (défaut, widgets) ou `POST` avec un corps JSON (objet ou tableau, 4 Ko au plus, `Content-Type: application/json`), envoyé à chaque test, contrôle de santé et appel du proxy. Corps invalide ou absent en POST : 422 (`fields.body`). Repasser en GET efface le corps. | `API_METHODS`, `API_BODY_MAX`, `bodyError`, `ApiCard.method` / `body` |
| Contrôle de santé | Une carte en POST (appel facturé par le service) n'est re-testée automatiquement qu'une fois par 24 h, ou tant qu'elle est en erreur ; les cartes GET gardent la règle existante (toutes les 15 min, sauf appel réussi dans l'heure). | `HEALTH_POST_INTERVAL_MS` (`ApiCardsService.healthCheck`) |
| Écran | Formulaire de carte : « ENVOI DE LA CLÉ » (En-tête X-Api-Key / Authorization: Bearer) sous la clé ; bloc « REQUÊTE » (GET / POST · corps JSON) avec la zone du corps. | `Registre des cartes API.dc.html`, `toCard`, `apCreate`, `apSave` (`admin-api.js`) |
| Carte JEV | Créée depuis la Console : tag « Stratégie » (tag libre), endpoint `https://api.typesafe.ai/v1/systemone`, POST, corps de contrôle `jev-latest` avec une question Noul, envoi Bearer. **Désactivée et sans clé** : la clé fournie par le commanditaire n'est pas saisie par l'assistant (secret d'un service externe) ; il la colle lui-même (« Clé requise »), puis réactive et teste la carte. | carte `jev` |

## Mémoire conversationnelle du Jev de la Console : étape 1 (30/09/2026)

Analyse et comparaison : `docs/ANALYSE - memoire conversationnelle de Jev (Console).md`. Option retenue par le commanditaire : historique renvoyé (fenêtre glissante) + résumé des échanges anciens + cache du prompt, stockés chez nous ; mémoire long terme (étape 2) à évaluer ensuite.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Stockage | Une conversation par administrateur (`jev_conversations`, `jev_messages`) ; seuls la question, la réponse rédigée et les vues consultées sont gardées (ni requête SQL, ni lignes). Un échange sans réponse du modèle n'est pas gardé. Conversation d'un autre compte : 404. | `JevMemoryService` (`src/admin/jev-memory.service.ts`) |
| Fenêtre | Les 10 derniers échanges non résumés, 16 000 caractères au plus (≈ 4 000 jetons), une réponse longue tronquée à 2 000 caractères ; envoyés avec chaque appel (requête, correction, réponse). | `JEV_HISTORY_TURNS`, `JEV_HISTORY_MAX_CHARS`, `JEV_HISTORY_REPLY_MAX_CHARS` |
| Résumé | Les échanges sortis de la fenêtre rejoignent un résumé (180 mots au plus : sujets et objets en cours, faits établis, questions ouvertes), mis à jour après la réponse par lots de 3 échanges, par la fonction `guidage` (source `JEV`). | `JEV_SUMMARY_BATCH_TURNS`, `JEV_SUMMARY_MAX_WORDS` |
| Prompt | Partie stable (base, Identité, Soul, skill « Guidage console », mise en forme, dictionnaire) mise en cache (`cache_control` Anthropic ; cache automatique chez OpenAI et Gemini) ; partie variable après elle : page ouverte, date et heure, résumé, et pour l'étape « réponse » la fiche des vues consultées. Avant, l'heure dans le prompt empêchait toute mise en cache. | `consoleGuidanceParts`, `requestContext`, `sqlInstructions(…, null, null)`, `LlmClient` (`systemTail`, `history`, `cache`) |
| Coût | Jetons lus ou écrits dans le cache comptés en entrée, facturés 0,1 × (lecture) et 1,25 × (écriture) le prix d'entrée. Mesure réelle (Claude Haiku 4.5) : question de suite ≈ 0,005 € contre ≈ 0,026 € avant. | `CACHE_READ_FACTOR`, `CACHE_WRITE_FACTOR` (`llm-client.ts`) |
| Multi-fournisseur | Même historique chez le principal et chez le secours (Anthropic : `messages` ; OpenAI : système, historique, partie variable, question ; Gemini : `contents`). | `LlmClient.generate` |
| Conservation | Conversation supprimée 30 jours après le dernier échange (tâche `jev.purge`, 03:25). | `JEV_CONVERSATION_RETENTION_DAYS` |
| Console | Bouton « Nouvelle conversation » dans l'en-tête du panneau Jev ; conversation en cours reprise après un rechargement ; changer de page ne coupe pas le fil. | `jevNew`, `jevResume` (`admin-api.js`) |
| Données | Vue `jev.infos_projet` ajoutée au dictionnaire de la Console (même source que celle du Cockpit) : sans elle, « Quel est le périmètre fonctionnel du projet ? » restait sans réponse, même avec la mémoire. | `INFOS_PROJET_SOURCE` (`src/domain/project-info.ts`), migration `20261020000000_memoire_jev` |

## Planification des notifications : prochain envoi stocké, rattrapage, vérification quotidienne (30/09/2026)

Remplace la tâche `notifications.tick` (toutes les 30 minutes, comparaison de l'heure courante avec l'heure de chaque règle), qui perdait tout envoi prévu pendant un arrêt de la plateforme et revoyait tous les jalons et risques 48 fois par jour.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Prochain envoi | Stocké sur chaque règle planifiée (quotidienne, hebdomadaire ; « personnalisée » comme quotidienne), calculé en heure de Paris (changements d'heure compris) à l'enregistrement, à l'activation et après chaque envoi ; recalculé seulement si la fréquence, le jour, l'heure ou l'activation changent. Le calcul ne modifie ni la date de modification ni la version de la règle. | `nextRunAt`, `scheduleKey`, `nextSendAt`, `scheduleKey()` (`src/domain/notification-rules.ts`), `syncSchedules` |
| Vérification | Chaque minute, une requête sur l'index (`enabled`, `nextRunAt`) : les règles dont le prochain envoi est passé. Le prochain envoi est avancé avant l'envoi. Les heures restent choisies par pas de 30 minutes dans la vue. | `notifications.due` (`* * * * *`), `runDue` |
| Rattrapage | Remplacé le 30/09/2026 : voir « Notifications : mémoire et fenêtre de rattrapage élargie » ci-dessous. | — |
| Jalons et risques | Vérifiés une fois par jour à 7 h : un jalon ne devient en retard qu'au changement de date ; modifier sa date vaut confirmation (§ 7.2), une modification ne le met donc jamais en retard. Un risque critique est notifié à son enregistrement (événement) ; le passage de 7 h n'est qu'un filet de sécurité. Un événement déjà notifié ne l'est pas deux fois. | `notifications.daily` (`DAILY_CHECK_CRON`), `dailyCheck` |
| Tâches retirées | Les planifications pg-boss absentes du code sont supprimées au démarrage (ex. `notifications.tick`). | `JobsService.onApplicationBootstrap` |

## Notifications : mémoire et fenêtre de rattrapage élargie (30/09/2026)

Demande du commanditaire, trois points validés : un seul abandon par règle et projet (les plus anciennes « remplacées ») ; 10 rattrapages par minute ; mémoire de la rédaction limitée au dernier envoi.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Mémoire des envois | Chaque occurrence planifiée (règle × projet × heure prévue) est enregistrée une fois (contrainte d'unicité) et prise avant l'envoi (QUEUED → SENDING → SENT) : un envoi parti n'est jamais renvoyé, même après plusieurs redémarrages ou un arrêt en cours d'envoi. | `NotificationOccurrence` (`notification_occurrences`), `processQueue` |
| Mémoire de la rédaction | Le modèle reçoit le texte du dernier envoi réussi de la règle, pour le même projet et le même profil, s'il a moins de 35 jours, avec la consigne de dire ce qui a changé depuis sans répéter l'inchangé ni inventer d'évolution. Pas de mémoire pour « M'envoyer un test ». | `NOTIFICATION_MEMORY_DAYS`, `previousSend`, `Delivery.llmResponse`, `PREVIOUS_SEND_INSTRUCTIONS` |
| Prompt | Date, heure et envoi précédent dans la partie variable ; partie stable marquée pour le cache. Gain faible pour des envois espacés d'un jour (le cache dure 5 minutes) : il ne joue qu'entre les étapes et les profils d'un même envoi. | `NotificationWriterService.write` (`systemTail`, `cache`) |
| Limite de rattrapage | Lendemain du jour prévu, 23:59:59, dans le fuseau du projet (l'heure d'envoi reste celle de Paris, affichée dans la vue). Règle « tous les projets » : limite de chaque projet. | `CATCH_UP_EXTRA_DAYS`, `catchUpDeadline` |
| Occurrences multiples | Par règle et projet, seule la plus récente encore dans la limite part ; les autres sont « remplacées » (statut `SKIPPED`, hors « À traiter »). Si la plus récente a dépassé la limite, elle seule est « abandonnée » (échec, dans « À traiter ») ; les plus anciennes sont « remplacées ». | `occurrencesUntil`, `close()` |
| Ordre et débit | Envois à l'heure (moins de 5 minutes de retard) : tous, aussitôt ; rattrapages : du plus ancien au plus récent, 10 par minute au plus, la suite aux minutes suivantes. | `ON_TIME_TOLERANCE_MS`, `CATCH_UP_PER_MINUTE` |
| Traçabilité | Chaque envoi planifié porte son mode (`ON_TIME`, `CATCH_UP`, `REPLACED`, `MISSED`) et son heure prévue ; l'historique affiche « Rattrapé · prévu mar. 29/09 09:00, envoyé mer. 30/09 10:12 », « Remplacé… », « Abandonné… ». L'heure réelle d'un envoi suit l'horloge de la plateforme. | `Delivery.mode`, `Delivery.scheduledAt`, `toUiHistory` |
| Règle désactivée, supprimée ou incomplète avant l'envoi | Occurrences en attente annulées (`CANCELLED`), rien ne part. | `processQueue` |

## Guide utilisateur de la Console (30/09/2026)

Maquette validée « Guide utilisateur 1c » (Filigrane), intégrée dans la section Plateforme après « Serveur d’envoi SMTP ».

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Versions | Une ligne par dépôt (`v`, date, auteur, taille, nom du fichier) ; la plus récente (ordre de publication `seq`, indépendant de l'horloge) est en vigueur. Numéro calculé par le serveur : incrément mineur (3.2 → 3.3, 3.9 → 3.10), 1.0 pour le premier. Les versions remplacées restent dans l'historique ; leur fichier est conservé mais n'est plus servi. | `guide_versions`, `nextGuideVersion` (`src/domain/guide.ts`) |
| Dépôt | Réservé aux administrateurs (la Console l'est) ; PDF reconnu à sa signature `%PDF-` (et non au nom ou au type déclaré), 50 Mo au plus ; sinon 422 « Seuls les fichiers PDF sont acceptés. ». Publication tracée dans le journal d'audit (sensible). | `GUIDE_MAX_BYTES`, `isPdf`, `GUIDE_PDF_ONLY` |
| Téléchargement | Seule la version en vigueur est servie. Le serveur vérifie que le fichier existe, enregistre la trace (compte, nom, rôle « Administrateur », horodatage du serveur, version), puis envoie le PDF (« Guide utilisateur Console vX.Y.pdf »). Sans guide : 404, aucune trace. | `GET /api/admin/guide/file` |
| Traçabilité | Journal des téléchargements en ajout seul : une trace ne se modifie ni ne se supprime (trigger SQL ; le vidage de l'amorçage, par TRUNCATE, n'est pas concerné). | `guide_downloads`, migration `20261023000000_guide_utilisateur` |
| Écran | Composant repris de la maquette (styles de page limités à l'écran) ; versions et téléchargements toujours fournis par la Console, même vides dès le démarrage (jamais les données de démonstration) ; après chaque téléchargement ou remplacement, les deux listes sont relues. Messages de la maquette conservés pour un fichier refusé ou un échec. | `Guide utilisateur.dc.html`, `gdDownload`, `gdReplace` (`admin-api.js`) |

## Notifications et alertes : un échec d'enregistrement ne perd plus la saisie (30/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Cause | Enregistrement optimiste + remontage de la vue en cas d'échec (`nrResync`) : toute erreur (serveur injoignable, session expirée, refus) effaçait la saisie. Reproduit en simulant un serveur injoignable ; la règle de l'utilisateur (`r1790755658776`) était restée à sa version de création (aucune modification reçue par le serveur). | — |
| Correction | La vue garde le brouillon jusqu'à la réponse du serveur ; échec : saisie et liste rétablies, message « Enregistrement impossible : vos modifications sont conservées. Réessayez. », motif du serveur en toast ; pas de remontage. Les autres actions (création, activation, suppression) gardent leur comportement. | `save` (`Notifications et alertes.dc.html`), `nrSave` (`admin-api.js`) |

## Notifications sans alertes (30/09/2026)

Demande du commanditaire : « l’utilisateur ne peut plus avoir que des notifications » ; la fonction alerte est retirée du formulaire, du design et du code. Arbitrages : envois sur événement supprimés, règles de type alerte supprimées (historique conservé), fréquence « Immédiate » retirée.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Règles | Plus de type (`kind`) ni de déclencheur (`trigger`) : toute règle est une notification envoyée à heure fixe, quotidienne ou hebdomadaire. Les quatre règles de type alerte (Jalon en retard, Risque critique ouvert, Seuil budgétaire IA atteint, Synthèse quotidienne du projet) sont supprimées par la migration ; leurs envois restent dans l'historique (« Règle supprimée » dans la vue). Une notification « Immédiate » restante devient quotidienne (heure gardée, sinon 07:00) ; une règle qui partait sur un événement part désormais à son heure. | migration `20261024000000_notifications_sans_alertes`, `RuleFrequency` (DAILY, WEEKLY ; CUSTOM gardé pour la compatibilité) |
| Moteur d'événements | Supprimé : bus `EventBus` (`src/core/events.ts`) et ses émetteurs (risque devenu critique, document analysé, consommation IA), vérification quotidienne des jalons en retard et des risques critiques (`notifications.daily`, `DAILY_CHECK_CRON`), contrôle budgétaire horaire (`budget.check`) et table des seuils déjà signalés (`BudgetAlertFired`). Les tâches retirées sont désinscrites au démarrage par `JobsService`. Les plafonds budgétaires et leur statut « ALERTE » de la Console (Consommation et coûts, cloche de l'administrateur) ne sont pas concernés. | `NotificationsService`, `JobsService` |
| API | `/api/admin/notifications/rules` : le modèle `Rule` perd `type` et `evt`, `freq` vaut `day` ou `week` (400 sinon) ; `/api/admin/notification-rules` perd `kind` et `trigger` ; `/api/me/notifications` perd `kind`. Rédaction : le prompt système parle toujours « d’une notification ». | `rules.controller.ts`, `notification-rules.ts`, `my-notifications.controller.ts`, `notification-writer.service.ts` |
| Écrans | Console : entrée de menu, titre et sous-titre « Notifications » (le fichier garde son nom `Notifications et alertes.dc.html`) ; plus de section ALERTES ni de ligne TYPE ; phrase de synthèse « Informer … » ; nouvelle règle quotidienne à l'heure par défaut. Cockpit : plus d'onglet « Alertes » ni de style d'alerte dans le tiroir. | `CHANGES-console.md`, `CHANGES-cockpit.md` |
| Dictionnaire | Vue `jev.regles_notification` recréée sans `type` ni `declencheur`. | `jev-dictionnaire.ts` |

## Notifications : jamais de requête SQL dans le message envoyé (correction du 30/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Constat | Une notification « Analyse des risques » a reçu une requête SQL au lieu d'un texte rédigé. Cause : le modèle a précédé sa requête d'un « Bonjour… » et l'a écrite trop longue ; la réponse a été coupée à la limite de sortie (1 024 jetons, atteinte exactement). Le bloc sql n'étant pas refermé, il n'était pas reconnu comme requête et la réponse brute partait comme contenu. | `LIVE_MAX_OUTPUT_TOKENS` |
| Correction | Une réponse avec un bloc sql non refermé est reconnue comme coupée : le modèle est relancé une fois avec le motif « requête coupée car trop longue : écris une requête nettement plus courte ». Une réponse qui contient ou commence une requête n'est jamais envoyée : à défaut de résultats, texte de repli sans SQL. La consigne demande une requête courte, sans salutation ni explication. Même garde pour le Jev de la Console. | `sqlCut`, `looksLikeSql`, `SQL_CUT_REASON` (`src/domain/jev-sql.ts`), `NO_DATA_TEXT` (`notification-writer.service.ts`), `JevSqlService` |

## Notifications : mise en forme du contenu (30/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Rédaction | Markdown léger demandé au modèle : phrase d'essentiel, 2 ou 3 rubriques « ## », puces commençant par le chiffre clé, étapes « 1. », gras rare ; ni titre « # », ni tableau, ni formule de politesse (la formule éventuelle vient du message de la règle). Remplace « texte brut, sans Markdown ». | `NOTIFICATION_ANSWER_INSTRUCTIONS` (`notification-writer.service.ts`) |
| Cockpit | Le tiroir lit ce Markdown en blocs (rubriques, chiffres clés, puces, étapes) ; aucun HTML n'est interprété (texte seulement). | `parseBody`, `summaryOf` (`Notifications Cockpit.dc.html`) |
| E-mail | Texte propre : rubriques en majuscules, puces « • », gras retiré, titres « # » omis. | `mailText` (`src/domain/notification-rules.ts`) |

## Cockpit : effacer toutes ses notifications (30/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Portée | Supprime définitivement les seules notifications du compte connecté ; l'historique des envois de la Console (`Delivery`) et les notifications des autres comptes restent. Pas d'entrée d'audit (données personnelles de lecture). | `DELETE /api/me/notifications` (`MyNotificationsController.clearAll`) |
| Filet de sécurité | Annulation possible pendant 5 s avant l'appel au serveur. | `CLEAR_UNDO_MS` (`Notifications Cockpit.dc.html`) |
