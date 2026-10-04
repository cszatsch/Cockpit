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

## Console : effacer toutes les notifications du tiroir (30/09/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Portée | Incidents et alertes seulement ; les demandes en attente (invitation, module) restent, car elles attendent une décision. Le tiroir étant commun, l'effacement vaut pour tous les administrateurs (comme l'état « lu »). Tracé au journal d'audit (Info, « Notifications effacées »). | `DELETE /api/admin/notifications` (`InboxService.clearAll`) |
| Durée | Une notification effacée reste masquée tant que sa cause dure (la réconciliation ne la rouvre pas) ; elle réapparaît, non lue, si la cause disparaît puis revient, ou si elle s'aggrave (changement de niveau), ou pour une nouvelle erreur technique. « À traiter » et les signaux du menu ne sont pas concernés : ils suivent toujours l'état réel. | `Notification.clearedAt`, migration `20261025000000_notifications_admin_effacees` |
| Filet de sécurité | Annulation possible pendant 5 s avant l'appel au serveur. | `CLEAR_UNDO_MS` (`Notifications.dc.html`) |

## Guide utilisateur : dépôt unique, indexation vectorielle (30/09/2026)

Demande du commanditaire : dépôt contrôlé du PDF du guide, un seul guide à la fois, historique des dépôts, et base vectorielle (pgvector) du guide pour une future recherche sémantique par Jev. Arbitrages : pgvector installé sur le poste (compilé avec Build Tools pour Visual Studio 2026 ; sur un VPS Linux : `apt install postgresql-18-pgvector`) ; PDF scanné refusé (pas d'OCR) ; traces des anciennes versions gardées ; 10 Mo au plus ; vectorisation sans modèle de secours ; modèle de vectorisation indiqué dans l'historique ; Jev hors périmètre à ce stade (aucune recherche exposée).

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Contrôles du dépôt | Immédiats, réponse 422 avec un message clair, dépôt refusé tracé dans l'historique : taille ≤ 10 Mo ; PDF reconnu à sa signature ; PDF lisible et non protégé ; texte présent (moins de 200 caractères, ou moins de la moitié des pages avec du texte : « document scanné »). 409 si une indexation est en cours (index unique partiel : un seul dépôt INDEXING). | `GUIDE_MAX_BYTES`, `GUIDE_SCANNED`, `GUIDE_BUSY`, `MIN_TEXT_CHARS`, `MIN_TEXT_PAGE_SHARE` ; `guide_uploads_one_indexing` |
| Extraction | pdf.js (`pdfjs-dist` 3.11.174, version CommonJS, sans dépendance système) : texte, position et taille de police par ligne. En-têtes et pieds répétés et numéros de page écartés ; titres = police ≥ texte courant × 1,1, niveau par rang de taille (tailles propres à la couverture ignorées) ; paragraphes séparés par un écart > 1,6 × la police ; retrait = élément de liste (imbrication conservée). | `src/core/pdf-text.ts`, `toBlocks`, `HEADING_SIZE_RATIO`, `BLOCK_GAP_RATIO` |
| Découpage | Par section (titre de plus bas niveau), jamais au milieu d'une phrase, d'une liste ou d'un tableau. Cible 350 jetons (≈ 1 400 caractères), 80 à 600 ; chevauchement ≈ 50 jetons seulement quand une section est coupée ; petites sous-sections regroupées sans franchir un titre de niveau 2 ; reste court rattaché au chunk précédent ; chemin des titres en tête du texte vectorisé. Justification : 300 à 500 jetons donnent la meilleure précision pour un guide « comment faire » ; les modèles acceptent bien plus (Qwen3 32 k, BGE-M3 8 k), la limite vient de la précision, pas du modèle ; le chemin des titres rend un paragraphe trouvable par le sujet de sa section. Guide actuel : 47 pages, ≈ 100 extraits. | `CHUNK_TARGET_TOKENS`, `CHUNK_MIN_TOKENS`, `CHUNK_MAX_TOKENS`, `CHUNK_OVERLAP_TOKENS`, `chunkBlocks`, `embeddingText` (`src/domain/guide-index.ts`) |
| Vectorisation | Modèle de la fonction Documents · Vectorisation, dimension de l'affectation ; appel réel (`/embeddings` compatibles OpenAI, `batchEmbedContents` Gemini ; Anthropic sans embedding), lots de 32, 2 reprises sur 429 / 5xx / délai ; vecteur plus long d'un modèle « Matryoshka » tronqué et renormalisé. Hors ligne et en tests : vecteurs de démonstration déterministes. Consommation tracée (fonction doc_vec, nouvelle source GUIDE). | `LlmClient.embed`, `LlmService.embedTexts`, `EMBED_BATCH_SIZE`, `EMBED_RETRIES`, `hashEmbedding` |
| Vectorisation sans secours | La fonction Vectorisation n'accepte plus de modèle de secours (422) ; le secours enregistré est effacé par la migration ; l'écran Affectation ne propose plus de secours pour cette étape. Motif : des vecteurs d'un autre modèle ne sont pas comparables ; changer de modèle impose de revectoriser (redéposer le guide). | `AiFunctionDef.noFallback` (`doc_vec`), `putAssignments`, `LlmService.route` |
| Stockage | `guide_chunks` (texte, section, pages, jetons, dimension, vecteur pgvector) ; index HNSW cosinus (m = 16, ef_construction = 64) partiel par dimension : `vector` jusqu'à 2 000 dimensions, `halfvec` jusqu'à 4 000, aucun au-delà. | migration `20261026000000_guide_indexation`, `hnswIndexSql` |
| Remplacement sûr | Extraits du nouveau dépôt écrits d'abord ; bascule en une transaction (version, statut, suppression des anciens extraits) ; ancien fichier supprimé ensuite (versions gardées dans l'historique, `storageKey` vidé). Échec à toute étape : extraits partiels et fichier du dépôt retirés, ancien guide intact, échec tracé. Redémarrage pendant une indexation : dépôt clos en échec au démarrage. | `GuideIndexService` (`index`, `fail`, `recoverInterrupted`) |
| Historique et vue | Un enregistrement par dépôt : date, auteur, fichier, taille, pages, extraits, modèle et dimension de vectorisation, statut, motif. Vue : état de l'index (étape n/5, avancement ; pages, extraits, modèle), dernier dépôt non publié, dépôts refusés dans la frise, dépôt désactivé pendant une indexation. | `guide_uploads`, `GET /api/admin/guide/status`, `/uploads` ; `Guide utilisateur.dc.html` |

## Jev de la Console : aiguillage des questions (30/09/2026)

Demande du commanditaire : avant de répondre, Jev détermine le type de chaque question (USAGE → guide utilisateur ; DONNÉES → tables de la Console), par l'API de JEV (TypeSafe) paramétrée dans le Registre des cartes API. Rapport de test : `docs/RAPPORT - aiguillage de Jev.md`.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Appel | Carte « JEV » du Registre (identifiant `jev`, surcharge `JEV_ROUTER_CARD`) : endpoint, clé (Bearer), délai, et modèle (champ `model` du corps de la carte) lus dans le Registre, rien dans le code. Appel par `ApiCardsService.call` (clé déchiffrée au dernier moment, contrôle anti-SSRF, trace `api_card_calls`, source JEV). Une question TypeSafe « Choice » (usage, données, mixte, hors sujet) sur un « state » : périmètre de la Console, page ouverte, 3 questions précédentes, question. | `JEV_ROUTER_CARD`, `buildRouterRequest`, `JevRouterService` |
| Réponse | `{ type: USAGE / DONNEES / AMBIGU / HORS_SUJET, confiance, justification }`. TypeSafe ne rédige pas de justification : elle est construite à partir de l'option retenue et de la distribution des probabilités (écart assumé au format proposé). Mixte, ou confiance < 0,5 (sauf hors sujet à ≥ 0,6) → AMBIGU. | `parseRouterResponse`, `ROUTER_MIN_CONFIDENCE` |
| Traitements | USAGE : réponse sur le fonctionnement, sans dictionnaire ni requête (le guide utilisateur sera branché ensuite). DONNÉES : requête, avec consigne dédiée. AMBIGU : les deux (le modèle explique et peut lire les données ; demande une précision si la question est trop vague). HORS_SUJET : réponse de périmètre, sans appel au modèle de rédaction. **Remplacé le 30/09/2026** par les traitements de la section suivante (`USAGE_INSTRUCTIONS` et `OFF_TOPIC_REPLY` supprimés). | `DATA_HINT` (`jev-sql.service.ts`) |
| Repli | Carte absente, désactivée, sans clé ou sans modèle ; délai dépassé ; erreur HTTP ; réponse illisible → AMBIGU (traitement complet), motif tracé (table et journal du serveur). Jev reste utilisable sans l'API. | `JevRouterService.classify` |
| Traçabilité | Une ligne par question : question, type, option, confiance, probabilités, temps, statut, motif, version des consignes, modèle, source (LIVE / EVAL). | `jev_classifications`, migration `20261027000000_jev_aiguillage` |
| Consignes | Version en service : **v2** (anglais, langue d'entraînement de Jev ; options structurées ; critère « la réponse dépend-elle des enregistrements actuels ? »). Mesures sur 50 questions × 3 passages : v1 97,8 % → v2 **100 %** sur les questions non ambiguës (98 % au global), aucune instabilité, ~250 ms. v3 (questions oui / non ajoutées) écartée : 95,7 %. Exemples des consignes toujours distincts du jeu de test (vérifié par un test). | `ROUTER_PROMPTS`, `ROUTER_PROMPT_VERSION` ; `npm run jev:aiguillage` ; `test/fixtures/jev-routage.json` |

## Jev de la Console : réponses après l'aiguillage (30/09/2026)

Demande du commanditaire : « Implémentation de l'aiguillage de JEV (DONNÉES, USAGE, AMBIGUÏTÉ) ». Arbitrages du 30/09/2026 : réglages dans un écran de la Console ; mémoire « question + réponse » pour tous les cas ; aucun extrait au-dessus du seuil → clarification guidée ; évaluation par critères automatiques + relecture (fichier Excel). Rapport : `docs/RAPPORT - aiguillage de Jev.md` § Réponses finales.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| DONNÉES | Traitement SQL existant, inchangé (consigne `DATA_HINT`) ; mémoire comprise (« Et le mois dernier ? »). Classification impossible → traitement complet (dictionnaire + explication), comme avant. | `JevSqlService.ask(…, 'DONNEES' \| 'AMBIGU')` |
| USAGE : reformulation | Si la conversation a un historique, la question est d'abord reformulée en question autonome par la fonction Guidage (une ligne ; réponse inexploitable → question d'origine). La recherche porte sur la reformulation ; la réponse est rédigée pour la question d'origine. | `REFORMULATE_SYSTEM`, `cleanReformulation` |
| USAGE : recherche | Question vectorisée avec le modèle **et la dimension de l'index du guide en vigueur** (lus sur le dépôt, jamais la fonction Vectorisation du moment) ; préfixe d'instruction pour Qwen3 Embedding. pgvector (index HNSW partiel de la dimension, même expression que l'index), `searchK` plus proches, seuls ceux dont la similarité cosinus atteint `minSimilarity` sont gardés. Modèle de l'index indisponible → clarification (motif `GUIDE_NON_INDEXE`). | `GuideSearchService.search`, `queryForEmbedding`, `EMBED_QUERY_PREFIXES` |
| USAGE : reclassement | Fonction Reclassement (Voyage rerank-2.5, secours rerank-2.5-lite) par `POST /rerank` (OpenRouter), `keepK` meilleurs. Erreur ou délai dépassé (principal puis secours) → les `keepK` premiers de la recherche, incident tracé (`rerankFallback`) et signalé dans le journal du serveur. Hors ligne : classement par mots communs. | `LlmService.rerankTexts`, `LlmClient.rerank` |
| USAGE : rédaction | Fonction **Synthèse** (`doc_syn`, désormais en génération réelle). Partie stable en cache : Identité, Soul, skills, mise en forme, règles de réponse sur le guide ; partie variable ensuite : page, date, résumé, puis « Extraits du guide utilisateur » (chacun avec section et pages) ; la question en dernier. Réponse à partir des seuls extraits, citations (section, p. N), « Le guide utilisateur ne précise pas… » sinon. Jamais d'appel avec un contexte vide. | `GUIDE_ANSWER_RULES`, `guideExtractsBlock`, `LIVE_FUNCTIONS` |
| Sources | Affichées sous la réponse comme pour les données : une par section, pages réunies (« Guide · 3.3.3 Inviter un utilisateur · p. 12-13 »). | `guideSources` ; `jev-format.js` (séparateur saut de ligne) |
| Clarification | AMBIGU, HORS_SUJET, aucun extrait au-dessus du seuil, guide non indexé ou recherche indisponible : fonction Guidage, prompt « Génère une réponse à cette demande, qui nécessite une clarification de la part de l'utilisateur : [question] » + motif ; capacités de Jev et historique récent fournis ; 3 à 5 lignes, 2 ou 3 reformulations ou options. | `clarifyPrompt`, `CLARIFY_RULES`, `JEV_CAPABILITIES` |
| Mémoire commune | Chaque question et sa réponse sont gardées quel que soit le traitement, avec le type détecté, la reformulation et les sources ; les extraits bruts restent au journal technique. Échec du modèle : message d'indisponibilité, échange non gardé. | `jev_messages.route`, `.reformulated` ; `JevMemoryService.record` |
| Réglages | Écran Guide utilisateur (« Recherche de Jev dans le guide ») : extraits recherchés (8), conservés (4), seuil de similarité, délais de vectorisation (10 s), de reclassement (8 s) et de rédaction (30 s) ; bornes contrôlées par le serveur, conservés ≤ recherchés ; modification tracée au journal d'audit (sensible). Modèles : ceux de l'affectation, jamais dans le code. | `jev_rag_settings`, `RAG_DEFAULTS`, `RAG_LIMITS`, `ragSettingsErrors` ; `GET`/`PUT /api/admin/assistant/rag-settings` |
| Seuil par défaut | **0,58**, calibré sur le guide réel (Qwen3 Embedding 8B, 1 536 dim.) avec les 50 questions : meilleure similarité des questions d'usage 0,66 à 0,87, des questions hors sujet 0,51 à 0,52 ; les questions de données atteignent 0,61 à 0,82 (elles ne passent pas par la recherche). Le seuil écarte le hors-sujet sans perdre de question d'usage. | `RAG_DEFAULTS.minSimilarity` |
| Journal technique | Une ligne par question : type détecté, traitement, motif, question reformulée, extraits (8 candidats avec similarité, retenus avec score du reclassement), reclasseur ou repli, modèle, temps par étape, total, erreur ; lien avec la classification. | `jev_answer_logs`, migration `20261028000000_jev_recherche_guide` |
| Évaluation | `npm run jev:reponses` rejoue les 50 questions de bout en bout (historique rejoué dans la même conversation) ; critères : USAGE → au moins une source dans les sections attendues (annotées avant tout appel, `test/fixtures/jev-reponses.json`) ; DONNÉES → requête exécutée ; AMBIGU / HORS SUJET → clarification. Sortie Excel pour la relecture. | `scripts/jev-reponses.ts` |

## Jev de la Console : budget IA lu tel que l'écran l'affiche (30/09/2026)

Constat du commanditaire : à « Où en est le budget IA ? », Jev annonçait 0,33 € au lieu de 1,05 € (Vue générale des coûts). Cause : le modèle recalculait le budget en SQL à partir des règles du dictionnaire et se trompait différemment à chaque fois (ligne Guidage console, sans plafond, écartée par la jointure ; projection de fin de mois mal calculée lors d'un second essai).

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Vue calculée | Nouvelle vue `jev.budget_ia` : une ligne « all » (budget global) et une par ligne budgétaire, même sans plafond ; dépense du mois, rythme des 7 derniers jours, jours restants, projection, plafond, seuil, pourcentage, statut (SOUS_LE_PLAFOND, ALERTE, DEPASSEMENT, SANS_PLAFOND). Mêmes formules que `UsageService.month()` / `thresholds()` ; la fiche du dictionnaire demande de la lire sans rien recalculer. `consommation_ia` et `plafonds_budget_ia` y renvoient pour le budget. | `BUDGET_IA_SOURCE`, `BUDGET_IA_LIGNES`, `BUDGET_IA_SEUIL_DEFAUT`, `BUDGET_IA_FENETRE_JOURS` (`jev-dictionnaire.ts`) ; migration `20261029000000_jev_budget_ia` |
| Date du jour | Paramètre de session `rise.jour` posé par le serveur (date de la plateforme, `TodayService`) avant le passage au rôle `jev_lecteur` ; à défaut, date de Paris. | `JevSqlService.executeReadOnly` |
| Garde-fou | Test : lignes de la vue = lignes budgétaires de l'écran (mêmes fonctions), et chiffres, statuts et pourcentages identiques à `GET /api/admin/usage/month`, lus sous le rôle de Jev. | `test/e2e/dictionnaire.spec.ts` |
| Traçabilité | La requête SQL de chaque réponse DONNÉES est gardée au journal technique. | `jev_answer_logs.sql` |

## Cockpit : Base de connaissance, dépôt et vectorisation des documents (30/09/2026)

Brief du commanditaire « Cockpit, dépôt et vectorisation de documents dans la Base de connaissance ». Arbitrages du 30/09/2026 : 4 formats, PDF scannés refusés ; doublons « contenu identique refusé, même nom → choix » ; petite fenêtre de dépôt (nom, type, confidentialité) ; recherche seule, Jev du Cockpit branché dans un lot suivant.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Formats | PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), 25 Mo au plus. Type réel contrôlé (signature PDF ; archive ZIP avec la partie principale du format). Anciens formats (.doc, .ppt, .xls) refusés avec la marche à suivre (les lire exigerait LibreOffice sur le serveur). Fichier Office protégé par mot de passe (conteneur OLE chiffré), vide, renommé, illisible : refus immédiat avec un message clair, tracé. .msg / .eml ne sont plus acceptés. | `KB_FORMATS`, `KB_OLD_FORMATS`, `KB_MAX_BYTES`, `detectFormat` (`domain/kb-documents.ts`) |
| PDF scanné | Refusé (pas d'OCR) si moins de la moitié des pages ont du texte ; contrairement au guide, un document court n'est pas refusé. Pages sans texte d'un document accepté : extraction « partielle », signalée. | `pdfTextState`, `KB_PAGE_TEXT_CHARS`, `KB_SCANNED` |
| Extraction | PDF : pdf.js, titres par taille de police, pages (moteur du guide). Word : styles de titre (« Titre n » / « Heading n » / niveau hiérarchique), paragraphes, puces, tableaux « en-tête : valeur ». PowerPoint : titre, zones et tableaux de chaque diapositive, notes de l'orateur. Excel : chaque onglet, en-têtes de colonnes, « colonne : valeur » ligne par ligne (20 000 lignes au plus, au-delà extraction partielle). Bibliothèques : `jszip`, `fast-xml-parser`, `exceljs`. | `src/core/office-text.ts`, `XLSX_MAX_ROWS` |
| Découpage | Sections (PDF, Word), une diapositive par extrait (coupée si trop longue), groupes de lignes par onglet (rangées d'origine gardées). Tailles du guide (350 jetons, 50 de chevauchement), réduites si la fenêtre du modèle d'embedding est petite (cible ≤ ¼ de la fenêtre). | `pdfChunks`, `docxChunks`, `pptxChunks`, `xlsxChunks`, `kbSizes` ; `chunkBlocks(…, sizes)` (`guide-index.ts`) |
| Résumé | Fonction Synthèse (`doc_syn`) : JSON `{description, resume}` ; description en deux phrases (métadonnée de chaque extrait), résumé 120 à 250 mots affiché par « Vue ». Texte envoyé : début du document jusqu'à 60 000 caractères. Réponse non conforme : texte brut, description tirée du document. | `KB_SUMMARY_SYSTEM`, `KB_SUMMARY_INPUT_CHARS`, `parseSummary` |
| Métadonnées et vecteur | Chaque extrait : nom du document, date de dépôt, description, et section / page, diapositive (et titre) ou onglet (et lignes). Texte vectorisé : ces métadonnées en tête, puis l'extrait. Modèle de la fonction Vectorisation. | `chunkMetadata`, `kbEmbeddingText` |
| Stockage | Fichiers dans `base-connaissance/<projet>` (distinct du guide) ; extraits dans `kb_chunks` (pgvector, index HNSW partiel par dimension, rattachés au document, suppression en cascade). | `KB_STORAGE_DIR`, `hnswIndexSql(dims, 'kb_chunks')`, migration `20261030000000_base_connaissance` |
| Traitement | Contrôles, extraction et découpage pendant le dépôt (refus immédiat) ; résumé puis vectorisation en tâche de fond, un document à la fois, avancement affiché (relecture toutes les 2,5 s). Échec (résumé, vectorisation, enregistrement) : extraits, résumé et description retirés, document « en échec » avec le motif, fichier gardé (téléchargeable), erreur tracée (journal du serveur et historique). Traitement interrompu par un arrêt du serveur : clos en échec au redémarrage. | `KbService.index`, `fail`, `onModuleInit` ; `KB_POLL_MS` (`api.js`) |
| Doublons | Contenu identique (SHA-256) : refusé, « déjà dans la Base de connaissance : nom, date ». Même nom, contenu différent : 409 `DUPLICATE_NAME`, l'utilisateur choisit Remplacer (version suivante ; l'ancienne, ses vecteurs et son fichier supprimés une fois la nouvelle indexée, liens repris) ou Garder les deux (« Nom (2) »). | `contentHash`, `replaceId`, `keepBoth` |
| Droits | Dépôt : PMO et Responsables. Suppression et remplacement : PMO, ou auteur du dépôt. Document Restreint : visible du PMO, de l'administrateur et de son auteur (liste, bootstrap, fiche, recherche) — le bootstrap les envoyait jusqu'ici à tous les profils. Historique : PMO. | `KbService.canDelete`, `visible` |
| Historique | `document_events`, en ajout seul (trigger SQL) : dépôt, refus, remplacement, indexation, échec, suppression, avec date, auteur, document, statut et détail ; plus le journal d'audit. | `GET /api/projects/:id/documents/history` |
| Recherche | `GET /api/projects/:id/documents/search?q=` : question vectorisée avec le modèle de la fonction Vectorisation ; seuls les extraits de ce modèle et de cette dimension, des documents indexés et visibles, sont comparés ; résultat : document, repère, similarité, extrait. Prête pour le Jev du Cockpit (lot suivant). | `KbService.search`, `KB_SEARCH_MAX` |

## Cockpit : documents factices retirés de la Base de connaissance (30/09/2026)

Demande du commanditaire : supprimer les documents factices. Les 8 fiches de démonstration (sans fichier ni auteur de dépôt) sont supprimées de la base locale, avec leurs liens, et ne sont plus créées par l'amorçage : `seedDemoDocuments()` (`prisma/seed/rise.ts`) ne les charge que pour les tests, comme `seedDemoAi()`. Écran : message « Aucun document pour l'instant » quand la base est vide. Le mode démonstration hors API du frontend (`rise-data.js`) garde ses exemples.

## Guide utilisateur de la Console et du Cockpit (30/09/2026)

Brief et maquette validée « Guide utilisateur Console Cockpit » (remplace la 1c) : chaque application a son guide, ses versions, sa traçabilité, son index et ses réglages de Jev, sans aucune donnée partagée.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Séparation | Colonne `app` (console, cockpit) sur `guide_versions` (numéro unique par application), `guide_uploads` (un dépôt en cours par application), `guide_downloads` (ajout seul) ; réglages `jev_rag_settings` : une ligne par application (l'ancienne ligne `default` devient `console`). Extraits rattachés au dépôt, donc à l'application. Données existantes de la Console conservées. | `GUIDE_APPS`, `GuideApp` ; migration `20261031000000_guides_par_application` |
| API | `GET /api/admin/guides` (`{ console, cockpit }`, format `Guide` de la maquette), `GET /api/admin/guides/:app`, `GET …/:app/file` (trace enregistrée PUIS PDF ; sans trace, pas d'envoi), `POST …/:app` (administrateurs, PDF réel, 202), `PUT …/:app/settings` (format de l'écran : `k`, `keep`, `thr`, délais `tv`, `tr`, `tw` en secondes entières, revalidés). Les anciennes routes `/api/admin/guide/…` et `/api/admin/assistant/rag-settings` sont retirées. | `GuideController`, `toScreenSettings`, `fromScreenSettings`, `screenSettingsErrors` |
| Dépôt et version | Écart assumé à la version précédente : la nouvelle version (1.0, puis +0.1) entre en vigueur dès le dépôt accepté (la maquette sert le PDF aussitôt) ; le fichier de la version précédente n'est plus servi (supprimé). L'index, lui, n'est remplacé qu'une fois le nouveau prêt : pendant l'indexation, Jev utilise l'ancien. Échec de l'indexation : version en vigueur « Non indexé » (motif en notification), Jev garde le dernier index valide. | `GuideIndexService.submit`, `index`, `data` |
| Recherche de Jev | Question posée depuis la Console : guide et réglages de la Console seulement ; depuis le Cockpit : guide et réglages du Cockpit seulement. Sans guide publié pour l'application : message fixe, sans modèle (« Le guide utilisateur du Cockpit n'est pas encore publié… »). | `GuideSearchService.search(app, …)`, `GuideAnswerService`, `guideMissingReply` |
| Jev du Cockpit | Aiguillage par l'API de JEV avec le périmètre du Cockpit (consignes `cockpit-v1`, non mesurées sur un jeu de test) ; USAGE → recherche dans le guide du Cockpit, rédaction par la fonction Synthèse, sources « Guide utilisateur · section · p. N » ; autres types → traitement habituel de l'assistant. Classification indisponible → traitement habituel. | `ROUTER_PROMPT_COCKPIT`, `buildRouterRequest(…, { app })`, `AssistantController.message` |
| Écran | Maquette installée à l'identique ; seule adaptation : la ligne d'indexation affiche le modèle et la dimension renvoyés par le serveur (repli sur « Qwen3 Embedding 8B (1536 dim.) » de la maquette, identique avec la configuration actuelle). `support.js` du projet conservé (version plus récente du même moteur). | `Guide utilisateur.dc.html`, `CHANGES-console.md` |

## Base de connaissance : résumé structuré et fenêtre « Vue » refondue (30/09/2026)

Constat du commanditaire sur un PowerPoint déposé : mise en forme médiocre. Cause technique : la réponse du modèle, plus longue que demandé, a été coupée à 1 024 jetons ; le JSON coupé, illisible, a été gardé brut (texte avec `\n` et clé `"description"`), et la description retenue était le début du document (utilisée aussi pour vectoriser les extraits).

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Format du résumé | JSON structuré et borné : description (2 phrases, 45 mots), 0 à 4 chiffres clés présents dans le texte (valeur courte, libellé de 2 à 6 mots), 3 à 5 rubriques de 1 à 4 points (25 mots) ; 300 mots au plus. Stocké normalisé dans `Document.summary`. | `KB_SUMMARY_SYSTEM`, `KB_SUMMARY_LIMITS`, `KbSummary` |
| Coupure | Plafond de sortie porté à 2 048 jetons pour le résumé (paramètre `maxTokens` de `LlmService.complete`, borné par le modèle). | `KB_SUMMARY_MAX_TOKENS` |
| Lecture tolérante | Réponse ou résumé stocké relus sans jamais afficher de JSON brut : retours à la ligne bruts échappés, ancien format (`resume` Markdown) converti en rubriques, JSON coupé réduit à ses éléments complets (dernier point ramené à sa dernière phrase entière, initiales comprises), texte libre en rubriques. Les résumés déjà stockés sont réparés à la lecture. | `readSummary`, `escapeControlsInStrings`, `markdownSections` |
| Nouveau traitement | `POST /api/projects/:id/documents/:id/reprocess` (PMO, auteur) : résumé et vecteurs refaits depuis le fichier stocké, tracé (« RETRAITEMENT »). Appliqué au document « ECF Projet SAP – Kick off 240207 ». | `KbService.reprocess` |
| Fenêtre « Vue » | En-tête (format discret, type, version, confidentialité, titre, dépôt) ; « En bref » (description, filet d'accent) ; chiffres clés sans cadre, taille commune d'après la valeur la plus longue ; rubriques « titre | points » ; pied discret (état de l'index, Supprimer en lien, Télécharger) ; états chargement, en cours, échec ; mise en page adaptative en CSS (grille auto-fit, rubriques qui passent sur une colonne). | `RISE Cockpit.dc.html` |

## Cockpit : tuile Trafic alimentée par le Registre des cartes API (01/10/2026)

Constat : la tuile Trafic affichait des valeurs écrites dans le code (« 34 min », « +8 min »), la carte `tomtom-traffic` du Registre (flowSegmentData : vitesse sur un tronçon) n'étant ni reliée ni adaptée.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Service | Nouvelle carte « TomTom · Itinéraire » (`tomtom-routing`, catégorie Trafic, cache 2 min) : TomTom Routing `calculateRoute` avec trafic ; durée (`travelTimeInSeconds`) et retard (`trafficDelayInSeconds`). Clé TomTom existante réutilisée (copiée chiffrée, jamais exposée). La carte `tomtom-traffic` n'est plus utilisée par aucun widget. | Registre ; `api.js` (`dbExtLoad`) |
| Lieux | Départ : ville du profil (Paris par défaut) ; arrivée : ville du projet (Référentiel) ; géocodage par la carte `open-meteo-geocodage` (déjà utilisée par la météo) ; aller et retour calculés, bouton ⇅ pour inverser. | `api.js` |
| Variables de chemin | Un endpoint peut porter `{nom=défaut}` dans son chemin (pas dans l'hôte ni les paramètres) : valeur transmise par le widget, sinon la valeur par défaut (contrôle de santé) ; caractères limités à `A-Z a-z 0-9 . , : ; _ + -`, jamais « .. » (400 sinon) ; contrôlé à l'enregistrement. | `PATH_VAR`, `PATH_VALUE`, `fillEndpoint`, `endpointError` |
| Échec | Carte désactivée, en erreur, quota atteint ou itinéraire introuvable : « — » et « Trafic indisponible » ; pendant le calcul : « … » et « Calcul du trajet… » ; retard nul : « Trafic fluide ». Plus aucune valeur inventée. | `RISE Cockpit.dc.html` |

## Cockpit : widgets d'Aujourd'hui sans valeur de démonstration (01/10/2026)

Demande du commanditaire : vérifier que les widgets affichent de vraies valeurs. Carte `tomtom-traffic` supprimée du Registre (plus utilisée). Valeurs écrites dans le code remplacées par des calculs sur les données :

| Widget | Avant | Désormais | Lieu |
|---|---|---|---|
| L'essentiel, par Jev | heure « ce matin · 08:00 », titre « Go-Live reporté… », point Avancement et « 7 modules · 42 éléments » écrits en dur | heure de mise à jour ; titre : Go-Live (date, J-n) et avancement ; phase en cours et écart ; décompte réel des éléments. Les autres points étaient déjà calculés. | `dbCatalog` |
| Avancement vs référence | 72 % / 81 % | moyenne des lignes du suivi d'avancement (% réel, % prévu à date), écart et couleur selon l'écart | `dbCatalog` |
| Mes tâches | 4 tâches, 2 validations | liste « Mes tâches » (hors archivées) : nombre, validations à donner, retards | `dbCatalog` |
| Livrables sous 30 jours | 3, 1 en retard, 74 % | livrables du Référentiel : non livrés dus sous 30 jours, en retard, part livrée | `dbCatalog` |
| Tendance des risques | bloc figé (8 semaines inventées) ; total et critiques absents | calculée par le serveur depuis le registre (création) et le journal d'audit (clôture) ; série à partir du premier risque ; aucune courbe inventée | `riskTrend` (`domain/risk-trend.ts`), bootstrap |
| Baromètre | courbe [1, 2] inventée sans relevé | « — » et « Aucun relevé » | `dbCatalog` |
| Actualité | source indiquée « GDELT » | cartes d'actualité du Registre | `dbCatalog` |

Déjà réels : Go-Live, Prochain COPIL, Fiches d'arbitrage, Décisions, Incohérences, Jalons, Chemin critique, Météo des chantiers, Risques critiques, Problèmes, Actions en retard, Échéances, Documents récents, Météo, Trafic. Limite : la criticité passée d'un risque n'est pas historisée (valeurs actuelles de probabilité et d'impact).

## Jev du Cockpit : aiguillage en 5 cas d'usage (01/10/2026)

Brief « Aiguillage des questions dans l'assistant JEV (application Cockpit) ». Arbitrages du commanditaire du 01/10/2026 : modification limitée d'abord au suivi (risques, problèmes, actions, décisions) ; description, impacts et actions de mitigation d'un risque rangés dans le plan de mitigation, les actions proposées comme actions liées ; mémoire de conversation comme la Console ; essais et génération réelle d'Insights et de Gestion des données acceptés. Ordre de réalisation : aiguillage et banc (fait), puis cas 2 et 5, cas 1, cas 4, cas 3.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Cas et moyens | 1 Insight (fonction Insights, skill « Insights ») ; 2 Guide (Guidage, « Guidage Cockpit ») ; 3 Modification (Gestion des données, « Gestion des données ») ; 4a / 4b Documents (Documents / Synthèse, « Analyser un document ») ; 5 Clarification (Guidage, proposition du brief retenue) | `COCKPIT_CASE_ROUTE`, `backend/src/domain/jev-router-cockpit.ts` |
| Requête TypeSafe | Une question « choice » à 7 options (`donnees`, `guide`, `modification`, `document`, `donnees_et_documents`, `clarification`, `hors_sujet`) et deux questions oui / non (« demande d'écriture », « plusieurs demandes ») dans le même appel | `buildCockpitRouterRequest` |
| Consignes | En anglais, structurées (couvre / exclut / exemples) ; version en service `cockpit-v3` (98,8 % sur 330 classifications) | `COCKPIT_ROUTER_PROMPTS`, `COCKPIT_ROUTER_VERSION` |
| Seuil général | 0,45 (calé sur le banc : aucune bonne réponse perdue entre 0,30 et 0,45) ; en deçà, clarification | `COCKPIT_ROUTER_MIN_CONFIDENCE` |
| Garde-fou d'écriture | Cas 3 seulement si confiance ≥ 0,75 **et** « demande d'écriture » ≥ 0,5 ; sinon clarification. Objectif du brief tenu : 0 % de lecture classée en modification | `COCKPIT_ROUTER_WRITE_MIN_CONFIDENCE`, `COCKPIT_ROUTER_WRITE_NOUL_MIN` |
| Plusieurs demandes | Signalé au-delà de 0,6 ; le cas retenu est celui de la première demande (traitement des suivantes : étapes suivantes) | `COCKPIT_ROUTER_MULTI_NOUL_MIN` |
| Repli | Carte absente, désactivée ou sans clé, délai, erreur, réponse illisible : cas 5, motif tracé | `JevRouterService.classifyCockpit` |
| Journalisation | `jev_classifications` : application (`app`), question, cas (`type`), option, confiance, probabilités, questions oui / non (`write_score`, `multi_score`, `multi`), modèle d'aiguillage, durée, version des consignes, modèle de la réponse (`answer_model`) | migration `20261101000000_jev_aiguillage_cockpit` |
| Banc d'essai | 110 questions, cas attendus fixés avant les appels, 3 passages ; rapport `docs/RAPPORT - aiguillage de Jev (Cockpit).md` | `npm run jev:aiguillage-cockpit`, `test/fixtures/jev-routage-cockpit.json` |
| Ancien aiguillage du Cockpit | Les 4 classes `cockpit-v1` (usage, données, mixte, hors sujet) sont retirées ; la Console garde les siennes | `jev-router.ts` |
| Branchement provisoire | En attendant les étapes suivantes : cas 2 → guide du Cockpit (inchangé) ; autres cas → traitement existant (bouchon et propositions) ; le cas retenu est renvoyé dans la réponse (`route`) | `AssistantController.message` |

## Jev du Cockpit : cas 2 (guide) et cas 5 (clarification) (01/10/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Cas 2 — modèle | Rédaction par le modèle de la fonction Guidage (« Guidage Console / Cockpit »), et non plus par la Synthèse | `COCKPIT_CASE_ROUTE['2']`, `GuideAnswerService.answer({ functionId })` |
| Cas 2 — prompt | Partie stable (mise en cache) : base, Identité, Personnalité, **la seule skill « Guidage Cockpit »**, mise en forme, vouvoiement ; partie variable : écran ouvert, date, puis « Extraits du guide utilisateur » (section, pages) | `cockpitCaseParts`, `JevPromptService.cockpitParts` |
| Cas 2 — recherche | Inchangée : 8 extraits, seuil de similarité, reclassement (fonction Reclassement) puis 4 gardés, 4 premiers si le reclassement est indisponible ; sans extrait au-dessus du seuil, message fixe sans appel au modèle (« Je n’ai pas trouvé cette information dans le guide utilisateur du Cockpit… ») | `GuideSearchService`, `guideNoExtractReply` |
| Cas 5 — clarification | Rédigée par le modèle Guidage (proposition du brief), sans skill ; consignes : ce que Jev sait faire dans le Cockpit, ce qui manque, 2 ou 3 reformulations ou choix, rien d’inventé, aucune modification annoncée ; demande ouverte par la phrase du brief | `COCKPIT_CLARIFY_RULES`, `cockpitClarifyPrompt` (`backend/src/domain/jev-cockpit-answers.ts`) |
| Cas 5 — motifs | AMBIGU (option clarification), HORS_SUJET, CONFIANCE (sous le seuil, piste probable donnée au modèle), ECRITURE (modification incertaine : confirmation demandée), INDISPONIBLE (aiguillage en échec) ; motif renvoyé (`reason`) | `clarifyReasonOf` |
| Registre | Le Jev du Cockpit vouvoie toujours (comme l’application), quel que soit le Persona | `COCKPIT_REGISTER_RULE` |
| Sources | Le modèle ne termine plus par une ligne « Sources » (consigne) ; l’écran retire une telle ligne si elle apparaît, les sources s’affichant en étiquettes | `guideAnswerRules`, `jevRich` (`RISE Cockpit.dc.html`) |
| Journal | Modèle de la réponse ajouté à la trace de l’aiguillage | `JevRouterService.noteAnswerModel` |

## Jev du Cockpit : cas 1, données du projet (01/10/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Mécanisme | Celui du Jev de la Console : 1. le modèle écrit une requête SQL (ou répond directement) ; 2. contrôle puis exécution en lecture seule ; une correction au plus ; 3. rédaction à partir des seuls résultats ; vues consultées = sources (« Données · risques ») | `JevCockpitInsightService` (`backend/src/admin/jev-cockpit-insight.service.ts`) |
| Modèle et skill | Fonction Insights, skill « Insights » seule (partie stable du prompt en cache) | `COCKPIT_CASE_ROUTE['1']` |
| Génération réelle | Insights passe en génération réelle (arbitrage du 01/10/2026) | `LIVE_FUNCTIONS` (`llm.service.ts`) |
| Habilitations | Exécution sous le rôle `jev_lecteur_cockpit`, transaction en lecture seule ; projet et chantiers lisibles posés par le serveur avant le changement de rôle (PMO, administrateur : tous ; Responsable, Lecteur : leurs chantiers) ; les vues filtrent, la requête ne peut pas élargir le périmètre ; le périmètre est aussi rappelé au modèle | `JevSqlService.executeCockpit`, `visibleWorkstreams`, `cockpitScopeLine` |
| Rédaction | Réponse d’abord, codes cités, statuts traduits, aucune valeur inventée ; résultats vides : « aucune donnée dans votre périmètre » ; périmètre limité signalé ; aucune modification annoncée | `COCKPIT_INSIGHT_ANSWER_RULES` |
| Échec | Requête refusée ou en échec deux fois : message fixe, sans valeur inventée | `insightUnavailableReply` |
| Provisoire 4b | Traité par le cas 1 (données), le modèle dit qu’il ne lit pas encore les documents | `COCKPIT_DOCS_PENDING_RULE` |
| Provisoire 4a | Réponse fixe sans modèle : la lecture des documents arrive | `COCKPIT_DOCS_PENDING_REPLY` |
| Provisoire 3 | Propositions existantes ; sans modification identifiée, réponse fixe (plus de texte générique du modèle) | `COCKPIT_WRITE_UNCLEAR_REPLY` |

## Jev du Cockpit : cas 4, documents de la Base de connaissance (01/10/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Identification (4a, 4b) | Le modèle Documents / Synthèse reçoit le catalogue des documents indexés **visibles de l'utilisateur** (identifiant, nom, type, date, version, description) et les séances de comité tenues ; il renvoie en JSON les documents visés (3 au plus) et une requête de recherche ; identifiants inconnus ignorés, repli sur la question | `DOC_IDENTIFY_SYSTEM`, `parseDocIdentification`, `DOC_MAX_IDENTIFIED`, `DOC_SESSIONS_MAX` |
| Recherche | Vectorisation de la requête, 10 extraits les plus proches, limités aux documents visés (sans seuil) ou, sans document visé, dans toute la base avec un seuil de similarité ; reclassement (fonction Reclassement), 5 gardés ; reclassement indisponible : les 5 premiers | `DOC_SEARCH_K`, `DOC_KEEP`, `DOC_MIN_SIMILARITY`, `KbService.searchChunks` |
| Réponse 4a | Modèle Documents / Synthèse, skill « Analyser un document » seule ; partie variable : séances tenues, documents visés (description, plan des diapositives ou sections), extraits ; consignes : seuls ces éléments, document et repère cités, séance précise vérifiée (« le dernier COPIL » dont le support manque est signalé) | `DOC_ANSWER_RULES`, `docOverviewBlock`, `KbService.outline`, `DOC_OUTLINE_MAX` |
| Réponse 4b | Données d'abord (cas 1, droits de l'utilisateur, état actuel seulement), puis documents ; réponse en deux parties « D'après les données du projet » / « D'après les documents », écarts signalés | `DOC_DATA_QUERY_HINT`, `DOC_DATA_ANSWER_HINT`, `DOC_DATA_ANSWER_RULES` |
| Sources | Document et repère (« Nom · Diapositive 4 », « Nom · p. 12 »), plus les vues consultées en 4b | `docSourceLabel` |
| Sans document | Aucun document consultable ou aucun extrait pertinent : message fixe, sans modèle, rien d'inventé | `DOC_EMPTY_REPLY`, `DOC_NOT_FOUND_REPLY` |
| Confidentialité | Documents restreints : seulement pour le PMO, l'administrateur et l'auteur du dépôt, au catalogue comme à la recherche | `KbService.visibleIndexed`, `searchChunks` |
| Données (cas 1) | La réponse ne cite plus les noms techniques des vues ou des colonnes | `COCKPIT_INSIGHT_ANSWER_RULES` |

## Jev du Cockpit : cas 3, modification des données (01/10/2026)

Arbitrages du commanditaire : suivi seulement (risques, problèmes, actions, décisions) ; description, impacts et actions de mitigation d'un risque rangés dans le plan, actions proposées comme actions liées ; mémoire comme la Console.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Partage des rôles | Le modèle de la fonction Gestion des données (skill « Gestion des données ») **extrait** la demande (objet, opération, champs tels que dits, en JSON) ; le **serveur** résout chaque valeur, pose les questions, contrôle les droits et propose le récapitulatif | `WRITE_EXTRACT_RULES`, `parseExtraction`, `JevCockpitWriteService` |
| Résolution | Personnes, chantiers, instances : correspondance exacte puis partielle ; échelles 1-5 (« Élevée » → 4 ; « moyen à élevé » → choix 3 ou 4), priorité de décision, statuts, dates (AAAA-MM-JJ, JJ/MM/AAAA, JJ/MM) ; « moi » = l'utilisateur | `scaleCandidates`, `prio4Candidates`, `enumValue`, `parseDate`, `matchNamed` |
| Questions à choix | Une à la fois, au plus 6 choix plus « Annuler la demande » ; réponse par pastille (structurée, sans modèle) ou libre (nouvelle extraction avec la modification en cours) ; 8 questions au plus par demande | `WRITE_MAX_OPTIONS`, `WRITE_MAX_QUESTIONS`, `WRITE_CANCEL_LABEL` |
| Droits | Chantier proposé parmi ceux où l'utilisateur peut écrire (un seul : retenu d'office) ; objet visé hors périmètre : « introuvable dans votre périmètre » ; non modifiable : refus explicite ; fiche arbitrée : lecture seule | `canWriteWs`, `JevCockpitWriteService.resolveOp` |
| Récapitulatif | Propositions « À valider » : valeurs telles qu'elles seront écrites (avant → après pour une modification) ; contrôle préalable par le schéma de l'API métier ; rien n'est écrit | `AssistantChange`, `WRITE_RECAP_REPLY` |
| Confirmation | Écriture par le service métier (`TransactionalService` : droits, règles, historique d'origine JEV) ; **suppression** : code de l'objet à retaper (`confirmCode`), sinon refus ; lien vers l'enregistrement (écran du Pilotage) | `AssistantController.confirm` |
| Actions liées | Création d'un risque : chaque action de mitigation devient une proposition d'action liée (même chantier, porteur du risque par défaut), validée après le risque (sinon refus « Validez d'abord le risque ») | `sourceRef` |
| Mémoire | Conversation par utilisateur et par projet (`jev_conversations.app`, `project_id`), modification en cours (`draft`) ; 10 derniers échanges et résumé transmis aux modèles des cas 1, 3, 4 et 5 ; questions précédentes transmises à l'aiguillage ; nouvelle conversation à la réouverture du panneau et sur « Effacer tous les messages » | migration `20261102000000_jev_cockpit_memoire`, `JevMemoryService` |
| Génération réelle | Gestion des données (`crud`) passe en génération réelle | `LIVE_FUNCTIONS` |
| Propositions par mots-clés | Le service bouchon (« crée une action : », statuts, reports par expressions régulières) est retiré | `AssistantController` |
| Mémoire de la Console | Ordre déterministe de la conversation en cours (date de création en second critère) : test instable corrigé | `JevMemoryService.current` |

## Notifications : moins de 100 mots, structure brève (01/10/2026)

Demande du commanditaire : toute notification, quelle qu'elle soit, compte moins de 100 mots ; mise en forme refondue.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Longueur | Moins de 100 mots pour le message complet (gabarit compris) ; le contenu rédigé dispose de ce que le gabarit laisse (30 mots au moins) ; consigne impérative à chaque appel ; contenu trop long réécrit une fois par le modèle, puis coupé proprement (lignes entières, rubrique orpheline retirée, « … » si une phrase seule dépasse) | `NOTIFICATION_MAX_WORDS`, `NOTIFICATION_MIN_CONTENT_WORDS`, `wordCount`, `fitWords`, `lengthRule`, `shortenPrompt` |
| Structure | L'essentiel en une phrase ; 2 à 4 chiffres clés ; « ## À surveiller » (3 lignes au plus, code en gras d'abord) ; « ## À faire » (2 actions au plus) ; interdits : tableau, salutation, phrase d'annonce, répétition | `NOTIFICATION_STRUCTURE` |
| Consigne de base | Le contenu est en Markdown léger (la consigne disait encore « texte brut, sans Markdown », en contradiction avec la mise en page) | `NotificationWriterService.base` |

## Jev : recherche dans le guide « momentanément indisponible » (01/10/2026)

Cause : la vectorisation de la question par le modèle de l'index du guide (qwen3-embedding-8b) a une latence très variable (0,4 s à 34 s relevés dans le journal des appels) ; la recherche abandonnait au premier dépassement du délai (réglage « tv », 10 s), sans nouvelle tentative. L'échec, rattrapé par Jev en réponse polie, ne produisait aucune erreur technique : la Console ne signalait rien (et un appel abandonné n'est pas inscrit au journal des appels).

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Seconde tentative | En cas d'échec de la vectorisation de la question, une seconde tentative avec un délai d'au moins 25 s (le double du réglage s'il est plus grand) ; pas de modèle de secours (seul le modèle de l'index peut interroger ses vecteurs) | `GUIDE_EMBED_RETRY_TIMEOUT_MS`, `GuideSearchService.search` |
| Signalement | Échec persistant : incident « Erreur technique » dans la cloche de la Console (« JEV Cockpit · recherche dans le guide », modèle et motif), fermé à la recherche réussie suivante (mécanisme des erreurs techniques existant) | `techErrors` |

## Traces de Jev : décomposition chronométrée de chaque question (01/10/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Traceur | Une trace par question (Jev du Cockpit et de la Console) ; étapes imbriquées, début et durée, détails ; contexte asynchrone (AsyncLocalStorage), sans paramètre à transmettre ; hors trace, sans effet | `traced`, `span`, `note`, `traceMeta` (`backend/src/core/trace.ts`) |
| Étapes relevées | Projet et droits, conversation et mémoire, aiguillage (appel HTTP de la carte JEV), cas d'usage ; guide : réglages, index, vectorisation (modèle, fournisseur, tentatives, attentes entre tentatives), recherche vectorielle, reclassement ; génération (choix du modèle, appel) ; requêtes SQL du cas 1 ; recherche dans la Base de connaissance ; enregistrement de la consommation et de l'échange | services de Jev, `LlmService`, `ApiCardsService.call` |
| Appels HTTP | Pour chaque appel aux fournisseurs : taille de la requête, attente des en-têtes (connexion + envoi + traitement + premier octet), lecture du corps, analyse JSON, statut, en-têtes de temps du fournisseur ; connexions neuves notées avec leur durée (DNS + TCP + TLS, canaux de diagnostic d'undici) | `LlmClient.postTimed` |
| Sorties | Journal du serveur (arborescence lisible, hors essais automatiques) ; table `jev_traces` (30 jours, purge par `jev.purge`) ; lecture : `npm run jev:traces -- --dernieres 5 --min 10000 --etape vectorisation` (résumé moyenne, médiane, maximum d'une étape) | `JevTraceService`, `scripts/jev-traces.ts`, migration `20261103000000_jev_traces` |

## Échecs des modèles d'IA signalés à la Console (01/10/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Constat | Question sur la Base de connaissance (cas 4a) : Claude Sonnet 5 (fonction Synthèse) répond 200 sans aucun bloc de texte, puis le secours Google Gemini répond 503 (surcharge, après 10 s). L'erreur levée est une erreur métier (`ApiError` 503) : le filtre des erreurs techniques l'ignore, rien n'arrive à la Console | `ApiExceptionFilter`, `LlmService.complete` |
| Signalement | Un incident « Erreur technique » par fonction d'IA (« IA · fonction Synthèse »…), ouvert dès que le modèle principal échoue — secours utilisé (mode dégradé) ou fonction indisponible —, fermé à la réussite suivante du modèle principal ; génération et reclassement | `aiIncidentKey`, `techErrors` (`backend/src/core/llm.service.ts`) |
| Réponse vide | Le message d'erreur précise le motif d'arrêt et les types de blocs reçus (« réponse vide (arrêt : max_tokens · blocs : thinking) ») : la cause sera identifiable au prochain cas (non reproduite en trois essais avec le même prompt et le même catalogue) | `LlmClient.result` |

## Jev du Cockpit : vouvoiement et liens (01/10/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Vouvoiement | Constat : réponses du guide au « tu », car la Persona dit « Je tutoie » et les règles du guide demandaient « le registre de l'utilisateur ». Le Cockpit vouvoie toujours, même contre la Persona ou une question au « tu » ; règles du guide du Cockpit : « en vouvoyant l'utilisateur » (la Console garde le registre de l'utilisateur) | `COCKPIT_REGISTER_RULE` (`jev-prompt.ts`), `guideAnswerRules('cockpit')` (`jev-rag.ts`) |
| Liens | Constat : la skill « Guidage Cockpit » demande de « terminer par le lien vers l'écran », le panneau n'en ouvre aucun et le modèle inventait « cockpit://… ». Consigne : aucun lien, l'écran désigné par son chemin en gras ; filet de sécurité : tout lien Markdown d'une réponse devient son libellé en gras | `COCKPIT_LINK_RULE`, `stripMarkdownLinks` (`AssistantController.message`) |

## Analyse des temps de traitement (01/10/2026)

Spécification `docs/specs/TEMPS - specification.md` (écran 1c « Cascade »). Arbitrages du commanditaire (01/10/2026) et choix sur les points non précisés :

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Prompts hors catégorie | Clarifications (cas 5 du Cockpit, AMBIGU de la Console), hors sujet et aiguillage en échec (la catégorie se décide à l'aiguillage) : non comptés. Réponses par boutons du cas 3 (sans modèle) : non comptées | `latencyCategory(null)` |
| Routage | L'API TypeSafe de la carte « JEV » est présentée comme un modèle « JEV · TypeSafe » (vue Par modèle), en erreur quand la classification échoue | `LATENCY_ROUTER_MODEL`, `recordRoute`, `LATENCY_PSEUDO_MODELS` |
| Cas 3 | Chaque message tapé est un prompt « Actualisation Cockpit » (Routage, Formulation = extraction des champs) ; le clic « Confirmer » est un prompt distinct, avec la seule étape Exécution (écriture en base) ; une confirmation refusée avant l'écriture n'est pas comptée | `AssistantController.confirm` |
| Correspondance des étapes | Formulation (`qry`) : requête SQL (cas 1, données Console) et ses corrections, reformulation d'une question de suite (Console), identification des documents (cas 4), extraction des champs (cas 3) ; Exécution (`exe`, « svc ») : SQL en lecture, écriture en base ; Génération (`gen`) : rédaction. Premier appel « requête » qui répond directement : requalifié en Génération. Cas 4b : catégorie « Base de connaissance », toutes ses étapes | `latencyKind`, `relabelLastStep` |
| Reprises | Les essais d'une même vectorisation (`EMBED_RETRIES`) forment une ligne ; la seconde tentative de la recherche dans le guide est un second appel, donc une seconde ligne (la première en erreur) | `LlmService.embedWithModel` |
| Secours | Principal en échec : sa ligne en erreur (durée jusqu'à l'échec), puis une ligne `fallback` ; part des appels = nombre de lignes | `timedStep` |
| Réponse non servie | Exception, ou réponse « indisponible » (guide indisponible, lecture SQL impossible, erreur de la Console) : `e2e` en erreur, prompt compté, exclu du bout en bout | `latencyUnserved` |
| Bout en bout | De la réception de la requête au retour du contrôleur (pas de diffusion par jetons) ; mesuré, jamais calculé | `measuredPrompt` |
| Écriture | Après la réponse (`setImmediate`), par lot ; un échec d'écriture est journalisé sans effet sur la réponse | `latencySinks`, `LatencyService` |
| Ordre des étapes | Médiane du début de la première occurrence de chaque étape dans son prompt (l'ordre réel varie : identification avant vectorisation au cas 4) | `buildLatencyReport` |
| Médiane | Percentile 50 exact (moyenne des deux valeurs centrales, arrondie à la ms) ; pas de t-digest (volumes actuels) ; la vue Par modèle est agrégée par l'écran (médiane pondérée), sa courbe par le serveur (médiane exacte) | `median` |
| Périodes | Jours civils de Paris ; Jour = 24 créneaux horaires ; 1 mois = 30 jours ; 3 mois = 91 jours (13 semaines), 6 mois = 183 jours (27 semaines, la première incomplète, étiquetée au début de la période) ; semaines se terminant la veille ; `day` ignoré hors période Jour ; refus au-delà de 182 jours ou après la veille (400) | `LATENCY_PERIODS`, `LATENCY_MAX_DAYS_BACK`, `seriesSlots` |
| Courbe | Créneau sans prompt : `med`, `min`, `max` à `null` (courbe interrompue) ; erreurs : étapes en erreur de la catégorie, ou appels en erreur du modèle | `buildLatencySeries` |
| API | Chemin de la spécification `/api/ai/latency` (et non `/api/admin/…`), réservé aux administrateurs (`@AdminOnly`) ; le rapport ajoute `models` (nom et fournisseur des modèles cités, « Service RISE » pour `svc`) : l'écran ne connaît pas le catalogue | `LatencyController`, `LatencyService.report` |
| Conservation | 190 jours, purge chaque nuit (tâche `latency.purge`, 03:40) | `LATENCY_RETENTION_DAYS` |
| Dernier jour des périodes (écart à la spécification, 01/10/2026) | Constat : un prompt traité n'apparaissait que le lendemain (périodes et vue Jour arrêtées à la veille, « données consolidées »). Les périodes se terminent aujourd'hui, journée en cours comprise ; la vue Jour s'ouvre sur aujourd'hui (« · aujourd'hui »), « suivant » désactivé sur aujourd'hui (recette 4 adaptée) ; 182 jours avant aujourd'hui au plus. Retour à la règle de la spécification : constante à 1 | `LATENCY_END_OFFSET_DAYS` (`backend/src/domain/latency.ts`) |
| Libellé (01/10/2026) | L'écran s'intitule « Analyse des temps de réponse » (au lieu de « … de traitement », spécification) : titre, sidebar, `META`, page de Jev ; fichier `Analyse des temps de réponse.dc.html` ; identifiant `latency` et routes inchangés | `CONSOLE_PAGE_TITLES.latency` |
| Cache de l'écran | Vidé à chaque ouverture de la page (la journée en cours évolue) | `latReset` (`admin-api.js`) |
| Écran | Démonstration seulement sans `fetchData` (écran seul, Console en `?demo=1`) ; chargement : la période précédente reste affichée, « Chargement… » au premier affichage | `frontends/CHANGES-console.md` |

## Journal consommation et coûts : sélecteur de période (01/10/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Périodes | Jour, 7 jours, 1 mois (30 jours), 3 mois (91), 6 mois (183), se terminant aujourd'hui, jours civils de Paris (comme l'Analyse des temps de réponse) ; défaut « 1 mois » (le mois en cours, du 1er à aujourd'hui, n'est plus proposé) | `PER` (`Journal des appels.dc.html`), `journalApi.range` |
| Jour | Graphique par heure de la journée (heure de Paris) : `GET /api/admin/usage/daily?from=J&to=J&by=hour` (24 points, `hour`), refusé (400) sur plus d'une journée | `UsageService.daily(…, byHour)` |
| Graphique | 3 et 6 mois : une barre par jour (91 et 183) ; pas de regroupement par semaine | — |

## Réponse vide de Claude Sonnet 5 : réflexion coupée (01/10/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Cause | Claude Sonnet 5 réfléchit par défaut (sans paramètre `thinking`) et la réflexion consomme `max_tokens` : sur un appel court (identification des documents, 300 jetons ; requête SQL), réponse sans texte, motif enregistré « réponse vide (arrêt : max_tokens · blocs : thinking) », puis secours (Gemini) ou échec | — |
| Correction | Sonnet 5 et Opus 5 : `thinking: { type: "disabled" }` (réponses courtes de Jev ; vérifié en réel : 0 jeton de réflexion, réponse complète en 1,5 à 1,9 s). Modèles où la réflexion ne se coupe pas (Opus 5.5, Sonnet 5.5, Fable, Mythos : `disabled` refusé) : au moins 4 096 jetons de sortie. Autres modèles (Haiku 4.5…) : inchangés | `anthropicThinking`, `ANTHROPIC_THINKING_MIN_TOKENS` (`backend/src/core/llm-client.ts`) |

## Suppression de la page « Affectation des modèles » (02/10/2026)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Constat | La page n'était pas un doublon complet : seule à permettre de choisir le modèle principal et de secours de chaque fonction (la vue réseau de « Fournisseurs et modèles » est en lecture seule) | — |
| Décision du commanditaire | L'éditeur d'affectation devient une section de « Fournisseurs et modèles » (composant existant, design inchangé) ; menu et page séparée supprimés ; ancienne page redirigée vers la section | `goAsg`, ancre `#ia-affectation` (`Console Admin.dc.html`) |
| Références | Titre de page de Jev retiré (`CONSOLE_PAGE_TITLES`) ; dictionnaire de Jev : « Écran : IA › Fournisseurs et modèles, section Affectation des modèles » ; skill « Guidage console » mise à jour par l'API (journal d'audit) ; guide utilisateur Console publié : 3 extraits citent encore la page, à corriger dans sa prochaine version | `jev-prompt.ts`, `jev-dictionnaire.ts` |
| Retour arrière | Code : `git reset --hard avant-suppression-affectation-modeles` (branche `backup/avant-suppression-affectation-modeles`) ; base : `pg_restore --clean --if-exists --no-owner` de `rise-sauvegardes/rise-avant-suppression-affectation-modeles-2026-10-02.dump` (dossier de l'utilisateur ; restauration vérifiée : 88 tables, 9 860 lignes identiques) | — |

## Vue « Fournisseurs et modèles » (02/10/2026)

Spécification `docs/specs/FOURNISSEURS - specification.md`. Arbitrages du commanditaire (02/10/2026) et choix techniques :

| Sujet | Décision | Constante / lieu |
|---|---|---|
| API | Routes existantes `/api/admin/providers`, `/models`, `/assignments`, `/functions` (la spécification propose `/api/ai/…`, « à adapter à l'existant ») ; affectation d'une fonction par `PUT /assignments` partiel `{ fonction: { primary, fallback, dimension } }` | `AiController` |
| Désactivation | Refusée (409 `MODEL_IN_USE`, liste des affectations) pour un modèle affecté en principal **ou en secours** (auparavant : principal seulement) ; suppression d'un modèle affecté : 409 (inchangé) | `AiController.patchModel` |
| Secours | Doit être actif (422), sauf secours inactif déjà en place et inchangé | `AiController.putAssignments` |
| Dimensions (Embedding) | Champs « Dimensions acceptées » et « Dimension par défaut » ajoutés au formulaire (absents de la maquette) ; le sélecteur de la Vectorisation propose les dimensions du modèle affecté | `Fournisseurs et modeles.dc.html` |
| Revectorisation | Changement du modèle ou de la dimension de la Vectorisation : confirmation, puis tâche de fond qui revectorise tous les extraits (Base de connaissance `kb_chunks`, guides `guide_chunks`) avec le même texte qu'à l'indexation ; un guide est remplacé d'un bloc ; un nouveau changement relance la tâche ; avancement et fin (ou échec) dans la cloche de la Console (type alerte, clé `revector:documents`) ; tracée « Revectorisation des documents planifiée » | `RevectorizeService`, `REVECTORIZE_BATCH` |
| Coût estimé | Volume réel 30 j × tarif courant du modèle qui répond, entrée et sortie séparées (jetons d'entrée × prix d'entrée + jetons de sortie × prix de sortie) ; tarif à la requête : requêtes × prix / 1 000 ; aucun recalcul de l'historique | `costOf` (écran), `estimatedMonthlyCost` (API) |
| États | Ceux du serveur (`NOMINAL`, `FALLBACK`, `UNAVAILABLE`, `BLOCKED`) : clé du fournisseur, modèle actif, chaîne Documents ; bascule sur le secours automatique au routage (clé du principal en erreur) | `functionState`, `chainStates`, `LlmService.route` |
| Clés | Chiffrées (AES-256-GCM), jamais renvoyées (préfixe et 4 derniers caractères), testées à l'ajout et au remplacement (appel léger au fournisseur, horodaté), l'ancienne cesse d'être utilisée dès l'enregistrement ; journal d'audit sans valeur | `ProviderKeyTester`, `keyFingerprint` |
| Vue réseau | Retirée de la page : ses informations (fournisseur → fonctions, secours en service) figurent dans l'affectation et la colonne « Utilisé par » ; indicateur de temps de réponse des clés retiré (demande) | — |

## Consommation et coûts : fusion de la Vue générale des coûts et du Journal (02/10/2026)

Spécification `docs/specs/CONSO - specification.md` (maquette `Consommation et couts.dc.html`). Choix techniques :

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Navigation | Une entrée IA « Consommation et coûts » (page `conso`) ; l'ancienne page `journal` redirige vers `conso` ; écrans `ConsoCouts.dc.html` et `Journal des appels.dc.html` supprimés, liaison `bindConso` et export de la Console retirés | `go` (`Console Admin.dc.html`), `consoApi` (`admin-api.js`) |
| API | Routes existantes gardées sous `/api/admin` (`/usage/month`, `/usage/daily`, `/usage/calls`, `/usage/calls.csv`, `PUT /budget-thresholds/:id`) : agrégation côté serveur, réservées à l'administrateur, modification de plafond auditée (Sensible) | `AiController`, `UsageService` |
| Période | Jour (barres par heure), 7 j, Ce mois (depuis le 1er), 30 j, 3 mois = 90 j, 6 mois = 180 j (maquette), jusqu'à aujourd'hui (date du serveur) ; le budget reste le mois civil | `PER` (écran) |
| Statut | Sur la projection : projection ≥ plafond → `EXCEEDED` (Dépassement projeté) ; projection > plafond × seuil → `ALERT` (Alerte projetée) ; sinon `UNDER` ; sans plafond ou plafond désactivé → `NO_LIMIT` (« Sans plafond »). Auparavant l'alerte venait de la dépense. Même règle dans la vue `jev.budget_ia` de Jev (migration `20261105000000_conso_fusion`) ; la notification budgétaire existante (cloche `budget:`, « À traiter ») suit ce statut | `UsageService.status`, fiche `budget_ia` (`jev-dictionnaire.ts`) |
| Projection | Inchangée : dépense du mois + rythme des 7 derniers jours × jours restants | `UsageService.month` |
| Coût d'un appel | Jetons lus et écrits en cache enregistrés avec l'appel (`cacheReadTokens`, `cacheWriteTokens`) ; jetons facturés = autres jetons + lus × 0,1 + écrits × 1,25 ; pour un appel antérieur, déduits du coût stocké : le calcul affiché retombe exactement sur le coût de la ligne (écarts 0,031 € / 0,024 € corrigés) | `billedInOf`, `CACHE_READ_FACTOR`, `CACHE_WRITE_FACTOR` |
| Données du bandeau et des tuiles | `/usage/month` ajoute `tokensMonth`, `dailyCumul` (dépense cumulée par jour) et, par ligne budgétaire, `models` (modèles principaux affectés à ses étapes) | `MonthView` |
| Performance | Index `UsageRecord (functionId, at)` en plus de `(at)` ; journal par curseur, 30 appels par page, chargés au défilement | migration `20261105000000_conso_fusion`, `PAGE` (écran) |
| Lisibilité | Tuiles 5 de front, 3 + 2 quand la page fait moins de 900 px (requête de conteneur : la barre latérale réduit la largeur) ; colonnes fluides du journal ; libellés et modèles passent à la ligne plutôt que d'être tronqués | `[data-conso-tiles]`, `[data-conso-row]` |
| Plafond désactivé | Affiché « Sans plafond » ; saisir un plafond le réactive (`enabled: true`) | `setCap` (écran) |

## Message d'accueil de Jev, écran Aujourd'hui du Cockpit (02/10/2026)

Arbitrages du commanditaire (02/10/2026) : alternative 4 (message rédigé par Jev) ; consommation sur la ligne Insights (aucune nouvelle ligne) ; une génération par jour ; interrupteur dans Console › Modules ; ton donné par le Soul de la Persona.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Faits | Rassemblés par le serveur, limités aux chantiers visibles : prochain COPIL (sinon premier comité stratégique), décisions à arbitrer par la personne, ses actions en retard et à échéance dans 7 jours, risques critiques ouverts (score ≥ 20) et ceux modifiés depuis 24 h, jalons à 7 jours, ses actions terminées la veille ; classés par priorité, 6 au plus envoyés | `rankedFacts`, `GREETING_MAX_FACTS`, `TodayGreetingService.facts` |
| Rédaction | Fonction `insights` (ligne Insights), source `COCKPIT` ; prompt : base, Identité et Personnalité (Soul) sans skill, consignes du message, vouvoiement du Cockpit (le registre l'emporte sur le Soul, décision du 01/10/2026) ; 45 mots demandés, délai 20 s | `GREETING_RULES`, `JevPromptService.greetingSystem`, `GREETING_MAX_WORDS`, `GREETING_TIMEOUT_MS` |
| Contrôle | Texte brut sur une ligne (Markdown et guillemets retirés), 240 caractères au plus, sans lien, sans tutoiement, chaque nombre présent dans les faits ; sinon refusé (motif tracé) | `checkGreeting`, `GREETING_MAX_CHARS` |
| Une génération par jour | Une ligne `today_greetings` par compte, projet et jour (fuseau du projet), réussie (`JEV`), refusée (`REFUSE`) ou en échec (`ECHEC`) : pas de nouvel essai le même jour ; deux ouvertures simultanées, un seul appel ; purge à 30 jours (`today-greeting.purge`, 3 h 50) | `GREETING_PURGE_DAYS`, `GREETING_PROMPT_VERSION` |
| Repli | Message par règles : salutation selon le moment (Bonsoir après 18 h, « Bonne semaine » le lundi matin) et une seule priorité, sans compteur à zéro ni accord (« prêt » retiré) ; servi aussi par `GET /today` (`message`) et affiché par l'écran tant que le message de Jev n'est pas arrivé | `ruleGreeting`, `todayMsg` (écran) |
| Hors ligne | Pas de génération si la fonction est sur le bouchon : jamais de texte de bouchon à l'écran, rien d'enregistré | `LlmService.isLive` |
| Interrupteur | Module `jev_accueil` « Message d'accueil de Jev » (Console › Modules), actif sur tous les projets à sa création (migration `20261106000000_jev_accueil`) ; désactivé (ou par projet) : message par règles, modification auditée (Sensible) | `GREETING_MODULE_ID`, `TodayGreetingService.enabled` |
| API | `GET /api/projects/:id/today/greeting` → `{ text, source: 'jev' \| 'regles', reason, day }` ; l'écran l'appelle à l'ouverture d'Aujourd'hui et au changement de jour, nouvel essai au plus une fois par minute après un échec | `greetLoad` (`api.js`) |

### Message d'accueil : mise en forme (02/10/2026, demande du commanditaire)

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Salutation | Sur sa propre ligne : le modèle commence par « {Salutation} {Prénom}, » (donnée fournie), l'écran sépare la salutation du message et met la première lettre du message en majuscule ; repli : tout le texte en message | `GREETING_RULES`, `greetView` (écran) |
| Lecture immédiate | Message en une phrase de 160 caractères au plus après la salutation ; titres cités raccourcis au mot entier (60 caractères, « … ») ; nombres et dates (« 26 oct. ») en relief ambre clair | `GREETING_TITLE_MAX`, `shortTitle`, `greetView` |
| Design | Filet ambre vertical (écho de l'arc du bandeau) qui se déploie, salutation 19 px, message 15 px, ombre douce pour la lisibilité sur la photo ; message de Jev révélé mot à mot (flou → net, 34 ms par mot) puis signé « ✦ Jev » ; message par règles affiché sans animation ni signature ; aucune animation si l'utilisateur les réduit | `@keyframes greet-word`, `greet-line` (écran) |
| Nouvelles consignes | Un message gardé avec une version antérieure des consignes est réécrit une fois (`accueil-v1` → `accueil-v2`) ; sinon, toujours une génération par jour | `GREETING_PROMPT_VERSION` |
| Panneau de Jev | Trombone « Joindre un fichier » retiré (demande) ; la route `POST /assistant/files` et `jevAttach` restent, sans point d'entrée | `RISE Cockpit.dc.html` |

## Format du rapport, étape B de « Créer un template » (02/10/2026)

Demande du commanditaire (02/10/2026) : étape « Format du rapport » après la Fiche d'identité ; 4 pages modèles obligatoires (couverture, intercalaire, standard, clôture), .pptx en priorité, PDF et image en complément ; extraction de la mise en page, des fonds, des éléments fixes, de la typographie, de la palette et des zones ; aperçu, remplacement, suppression, messages clairs ; rapport généré visuellement identique aux pages modèles.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Fidélité | Le PowerPoint généré **copie** chaque page modèle (diapositive, disposition, masque, thème, médias, polices incorporées) au lieu de la redessiner : fonds, logos, couleurs, polices et positions sont ceux du fichier ; seul le texte des zones de contenu change. L'extraction sert à l'aperçu, aux contrôles et est enregistrée avec le template | `buildReportPptx` (`core/report-format-write.ts`) |
| Structure du rapport | Couverture (titre du template, sous-titre « comité · projet · version », date), puis pour chaque section une page intercalaire (« 01 · Jalons », périmètre) et ses pages standard (titre de section, « (suite) »), puis la clôture telle quelle (date et numéro mis à jour) | `buildReportPptx` |
| Pagination | Lignes par page standard = hauteur de la zone de texte / (taille × 1,35), entre 4 et 16 (12 sans zone) ; lignes longues comptées selon la largeur | `linesPerPage`, `paginate`, `LINES_PER_SLIDE` |
| Zones | Placeholders PowerPoint : titre, sous-titre, texte (ou objet), graphique, tableau, image, date, numéro de diapositive, pied ; position et style hérités disposition → masque → styles du masque. Zone prévue par la disposition mais absente de la diapositive : ajoutée ; aucune zone : zone de texte aux proportions usuelles, avec la typographie extraite. Zones vides non utilisées retirées (sinon « Cliquez pour ajouter… » en édition) | `fillPptxSlide`, `estimatedZones` |
| Contenu d'exemple | Sur la page standard, tableaux et graphiques hors placeholder sont retirés (contenu d'exemple, pas un élément fixe) ; formes, images et textes fixes sont gardés. Mots-clés remplacés partout : `{{titre}}`, `{{sous-titre}}`, `{{date}}`, `{{projet}}`, `{{comite}}`, `{{section}}`, `{{page}}` | `fillPptxSlide`, `tokens` |
| Plusieurs fichiers | Une page venant d'un autre fichier importe son masque, sa disposition, son thème, ses médias et ses polices incorporées (identifiants de masques et de dispositions renumérotés) | `Assembler.importMaster`, `importLayout`, `importFonts` |
| Dimensions | Un PowerPoint n'a qu'une taille de diapositive : les pages PowerPoint doivent avoir les mêmes dimensions (tolérance 0,5 %), sinon erreur bloquante ; une page PDF ou image est reconstruite à la taille du rapport | `sameSize`, `formatErrors` |
| PDF | Extraction par pdf.js : dimensions, aplats (fond = aplat ≥ 90 % de la page), positions des images, textes (plus grand corps → titre, petits textes en bas → pied et pagination, reste → texte), polices ; couleur des textes non lue, déduite du contraste avec le fond ; images non reprises (alerte) ; page reconstruite (fond, aplats, zones élargies jusqu'aux marges) | `analyzePdf`, `contrastOn` |
| Image | PNG ou JPEG, 960 px de large au minimum ; fond plein écran, dimensions d'après les proportions (hauteur 19,05 cm), zones estimées ; le texte d'exemple éventuel de l'image reste visible (alerte) | `analyzeImage`, `IMAGE_MIN_WIDTH_PX`, `estimatedZones` |
| Erreurs (bloquantes) | Extension non prise en charge, .ppt, contenu ne correspondant pas à l'extension, fichier vide, protégé, illisible, sans diapositive, image trop petite, plus de 25 Mo ; page manquante, diapositive inexistante, dimensions différentes | `FORMAT_*`, `formatErrors`, `FORMAT_MAX_BYTES` |
| Alertes (non bloquantes) | « Police introuvable » : police ni standard d'Office ni incorporée au fichier (le rapport s'affichera avec une police de remplacement sur un poste qui ne l'a pas) ; zone de titre, de contenu ou de pagination absente ; extraction partielle (PDF, image) ; image EMF / WMF non prévisualisable ; forme libre approchée dans l'aperçu | `pageWarnings`, `STANDARD_FONTS` |
| Aperçu | SVG reconstitué par le serveur à partir de l'extraction (fond, éléments fixes à leur position exacte, médias intégrés, zones en pointillés) : il montre ce que le générateur reprendra ; pas de rendu bitmap (pas de moteur PowerPoint sur le serveur) | `previewSvg`, `GET …/report-formats/:id/slides/:n/preview` |
| Stockage | Un fichier chargé = une ligne `report_format_files` (analyse JSON) + le fichier (`report-formats/{projet}/…`) ; le template garde dans `format` la référence de chaque page et les éléments extraits de sa diapositive ; suppression d'un fichier refusée s'il sert à un template (409 `IN_USE`) | migration `20261107000000_format_rapport`, `ReportFormatService.formatForTemplate` |
| API | `POST /api/projects/:id/report-formats` (multipart), `GET …/:fileId`, `GET …/:fileId/slides/:n/preview`, `DELETE …/:fileId`, `POST …/report-formats/check`, `format` dans `POST`/`PATCH /report-templates` (null = présentation par défaut), `GET /report-templates/:id/pptx` | `ReportFormatController` |
| Droits | Charger, supprimer : profils qui écrivent dans les outils (PMO, Responsable) ; consulter et générer : tout profil du projet | `canWriteTools` |
| Templates existants | Sans format : présentation par défaut de RISE (couverture marine, intercalaire sarcelle, pages standard blanches à bandeau, clôture « Merci »), générée sans fichier modèle | `builtInFormat` |
| Données | Une section par composant, sur son périmètre (projet, lot, phase, chantier) : synthèse et tableau de bord (statut, objectif, go-live, compteurs), planning (phases), jalons (glissement), risques ouverts par criticité, décisions, actions ouvertes, baromètre (6 derniers mois) ; budget : renvoi au module Budget | `ReportFormatService.sections` |

## Templates de rapport : étapes 3 à 6, PowerPoint de référence et publications (03/10/2026)

Demande du commanditaire (03/10/2026) : composants (étape 3), ordre, sections, intercalaires et sources de données (étape 4), aperçu complet au format (étape 5), publication d'un PowerPoint qui devient le template de référence (étape 6) ; publications suivantes par remplacement des seules valeurs ; champs identifiés, graphiques natifs, tableaux à lignes variables, versions, anomalies signalées avant la génération.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Structure figée | Couverture, une page intercalaire par section, **une page standard par composant**, clôture ; pages = 2 + sections + composants. Une section commence au premier composant et à chaque composant marqué « nouvelle section » | `sectionsOf`, `pagesOf` (`domain/report-components.ts`) |
| Nature des composants | Synthèse : indicateurs et texte (faits marquants) ; Planning, Jalons, Risques, Actions, Décisions : tableaux ; Baromètre : courbes ; Tableau de bord : indicateurs et histogramme (avancement réel / prévu par phase) ; Budget : indicateurs (périodes de mission, en k€) | `COMPONENTS` |
| Source de données | Par composant : périmètre (projet, lot, phase, chantier), période (mois, trimestre, 3 / 6 derniers mois, 30 / 90 prochains jours, sans filtre ; seulement pour les composants datés), indicateurs (colonnes, séries, indicateurs chiffrés ; au moins un, quatre chiffrés au plus) ; périodes recalculées à chaque publication | `PERIODS`, `periodRange`, `indicatorsOf`, `configErrors`, `KPI_MAX` |
| Zones variables | Chaque zone porte un nom de forme stable `rise:{id}` : `report.subtitle`, `report.date`, `cNN.caption` (périmètre et période), `cNN.kpi.{indicateur}`, `cNN.text`, `cNN.table`, `cNN.chart` (`cNN` = rang du composant) ; le manifeste de la version liste chaque zone, sa page, son composant et, pour un tableau, ses colonnes, sa capacité et ses gabarits de ligne | `fieldName`, `TemplateManifest` (`core/report-template.ts`) |
| Éléments posés | Dans la zone de contenu de la page standard (zone de texte du modèle, sinon proportions usuelles) : ligne de légende, tuiles d'indicateurs, tableau natif, graphique PowerPoint natif (classeur incorporé), texte ; couleurs : celles réellement utilisées par les pages modèles (non neutres), sinon accents du thème ; police et couleur du texte du corps de la page standard | `composeTemplate`, `designOf`, `neutral` |
| Publications | Le PowerPoint de la version en vigueur est rouvert ; seules les valeurs changent : texte des zones (style du premier paragraphe conservé), lignes des tableaux, cache et classeur des graphiques ; pages, formes, masques, médias et thème inchangés (vérifié par les tests) | `fillTemplate`, `fillChartXml`, `chartWorkbook` |
| Tableaux | Nombre de lignes variable : gabarits de ligne alternés (style du template) ; hauteur de ligne fixe (texte abrégé « … » sur une ligne) ; au-delà de la capacité de la page, la dernière ligne indique « … et N autres » (avertissement) ; tableau vide : « Aucune donnée » | `tableFrame`, `fillTable`, `reportData` |
| Graphiques | Graphiques natifs (`c:barChart`, `c:lineChart`) : catégories et valeurs du cache réécrites, classeur incorporé régénéré ; jamais d'image | `fillChartXml` |
| Versions | Création du template = publication de la version 1 (PowerPoint, manifeste, structure) ; modification du nom, du comité, des composants ou du format = nouvelle version, étiquette +0,1 si elle n'est pas fournie (1.0 → 1.1) ; activer / désactiver : pas de version ; versions précédentes conservées et téléchargeables ; template antérieur aux versions : version 1 publiée à sa première utilisation | `ReportTemplateVersion`, `nextLabel`, `STRUCTURAL`, `ReportTemplateService.current` |
| Anomalies | Avant toute génération (`GET …/check`, aperçu) : **bloquantes** = périmètre qui n'existe plus, fichier du template absent, zone variable introuvable (template modifié à la main) → génération refusée (422 `REPORT_DATA_INVALID` / `TEMPLATE_DAMAGED`) ; **avertissements** = données manquantes (go-live, date de référence, échéance, score, budget, aucune donnée sur la période) ou incohérentes (fin avant début, avancement hors 0–100 %, probabilité / impact hors 1–5), lignes au-delà de la capacité → confirmation « Générer quand même » | `componentValues`, `Issue` |
| Aperçu | Rapport construit en mémoire avec le format et les données du jour, gardé 15 min (20 au plus), vignettes SVG reconstituées (tableaux et graphiques dessinés à partir du fichier) | `PREVIEW_TTL_MS`, `previewSvg(…, { final: true })` |
| API | `GET /report-components` ; `POST /report-templates/preview`, `GET /report-previews/:id/slides/:n` ; `GET /report-templates/:id/check`, `/pptx` (publication), `/versions`, `/versions/:seq/file` ; composants : `period`, `indicators`, `newSection`, `sectionTitle` | `ReportFormatController` |
| Abandon | L'ancien générateur qui découpait une section en pages « (suite) » est retiré : la structure est désormais figée par le template | — |

## Comités et rapports : données de démonstration retirées (03/10/2026)

Demande du commanditaire (03/10/2026) : supprimer toutes les données de démonstration de Comités et rapports.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Périmètre | Templates (6), journal « Historique des générations », rapports rattachés aux séances (4, les séances gardent leur place sans rapport) ; avec eux, les versions et fichiers de format créés pendant les essais. Les comités (instances) et les séances, qui relèvent du Pilotage, restent | — |
| Amorçage | Plus chargés par `npm run db:seed` ni par `demarrer-rise -Reinitialiser` ; gardés pour les tests, chargés par `test/helpers.ts` (même principe que les documents de la Base de connaissance) | `seedDemoReports` (`prisma/seed/rise.ts`) |
| Base locale | Purgée le 03/10/2026 (templates, versions, fichiers de format, rapports, journal ; fichiers `storage/reports`, `report-templates`, `report-formats`) ; le journal d'audit, en ajout seul, garde la trace des créations | — |

## Rapports : fidélité au design des pages modèles et rédaction par l'IA (03/10/2026)

Analyse du rapport « Test v1.0 » (pages modèles « remplies » d'une vraie mission, sans placeholder : chevauchements, titres en double, contenu d'exemple resté visible) et arbitrage du commanditaire (03/10/2026) : passer Claude Opus 5.5 en modèle principal de « Génération de rapports » et implémenter la fidélité au design puis la rédaction par l'IA avec les skills de Jev.

| Sujet | Décision | Constante / lieu |
|---|---|---|
| Modèle | « Génération de rapports » : Claude Opus 5.5 en principal, Claude Sonnet 5 en secours (Console › Fournisseurs et modèles, audité) ; la fonction passe en génération réelle | `LIVE_FUNCTIONS` (`rapports`) |
| Rôles des formes | Chaque forme de premier niveau de la diapositive modèle (un groupe compte pour une forme) reçoit un rôle : design fixe, contenu d'exemple (retiré), titre, sous-titre, nom / numéro de la section, date, période, projet, client, comité, numéro de page, bas de page | `ShapeRole`, `SHAPE_ROLES`, `inventory` (lecture) |
| Proposition | Par règles (plus grand texte du haut = titre, texte dessous = sous-titre, capitales au-dessus = section, dates, numéros, petites mentions du bas ; reste de la page standard sous le titre et de l'intercalaire = exemple), affinée par l'IA (liste des formes : type, texte, corps, gras, position) ; réponse contrôlée (rôles connus, texte seulement dans une zone de texte, un titre) sinon règles ; gardée avec le fichier, par diapositive et type de page | `suggestRoles`, `ROLES_SYSTEM`, `parseRoles`, `ReportFormatService.roles` |
| Validation | L'utilisateur corrige les rôles à l'étape B (liste par carte, aperçu annoté) ; enregistrés avec le template ; sans titre (sauf clôture) : erreur bloquante | `roleErrors`, `PageRef.roles` |
| Application | Contenu d'exemple retiré ; le texte du rapport est écrit dans la forme du modèle (premier paragraphe et premier run gardés : police, taille, couleur, position) ; titre de page standard = zone variable `cNN.title`, sous-titre = légende `cNN.caption`, section = nom de la section, numéro de page fixe | `applyRoles`, `topLevelShapes` |
| Zone de contenu | Place libérée par le contenu d'exemple (sous le titre et le sous-titre), sinon zone de texte du modèle ou proportions usuelles | `exampleArea`, `composeTemplate` |
| Fichiers antérieurs | Analyse refaite une fois (inventaire des formes) à la première demande de rôles ou à l'enregistrement | `ReportFormatService.withShapes` |
| Rédaction | Un appel par publication (et par aperçu) : titres-messages de chaque page et synthèse (5 phrases au plus), à partir des valeurs calculées ; consignes système + skills actives « Rapports » et « Rédiger les slides PowerPoint » (Persona non utilisé : registre de rapport) ; délai 90 s | `writingSystem`, `writingPrompt`, `WRITING_SKILLS`, `WRITING_TIMEOUT_MS` |
| Contrôle des textes | JSON lisible ; titre d'une ligne, sans point final, au plus la capacité de sa zone (caractères calculés d'après la taille et le corps de la forme, 110 au plus) ; chaque nombre cité présent dans les données ; textes refusés redemandés une fois avec le motif, sinon texte par défaut (intitulé) et point d'attention | `parseWriting`, `retryPrompt`, `capacity`, `TITLE_MAX` |
| Hors ligne, IA indisponible | Textes par défaut (intitulés, faits par règles), point d'attention « Rédaction par l'IA indisponible » ; rôles par règles | `ReportTemplateService.write` |
| Contrôle visuel | Après chaque construction (aperçu, publication du template) : élément posé qui recouvre un texte du modèle (> 15 % de la plus petite surface), qui sort de la page, texte qui dépasse sa zone (estimation) → points d'attention avec le numéro de page | `visualCheck` |
| Skills de Jev | Les textes versionnés « Rapports » et « Rédiger les slides PowerPoint » ne disent plus que le rapport « s'exporte en PDF » ; la skill en base est à mettre à jour depuis Console › Assistant › Skills ; les consignes de rédaction demandent d'ignorer ce qu'elles disent de l'absence de fichier PowerPoint | `docs/skills/…` |

## Rapports : système de design, Gantt et baromètre (03/10/2026)

Demande du commanditaire : design « médiocre » à améliorer fortement (lecture immédiate, aucune surcharge, finesse des
finitions, cinq principes du bon design) ; Gantt pour la vue Phase avec phase en cours, repère du jour et avancement ;
tableau au-delà de 25 lignes ; baromètre bien plus riche ; opportunité d'une skill de designer.

| Sujet | Choix | Constante / code |
|---|---|---|
| Système de design | Jetons déduits de la charte des pages modèles : encre (noir pur adouci en `1E2124`), texte secondaire, filets, surface, accent (assombri s'il est trop clair), seconde couleur, états vert / ambre / rouge ; échelle typographique dérivée du corps (label, small, body, lead, stat ×2,6, hero ×4,2) ; jetons gardés au manifeste (`manifest.design`) : chaque publication redessine avec les mêmes | `designTokens`, `typeScale`, `STATUS_COLORS` (`src/domain/report-design.ts`) |
| Polices | Celles réellement employées par la page standard (titre : forme de rôle « titre » ou plus grand texte ; texte : police la plus présente), et non celles du thème du fichier, qui peuvent différer (cas du commanditaire : thème Calibri, pages en Poppins) ; les graphiques natifs les reprennent | `composeTemplate` |
| Planning | Composant de nature « Gantt » : une planche (groupe `rise:cNN.board`) redessinée à chaque publication ; indicateurs « Jalons sur la frise » (par défaut) et « Sous-phases » | `COMPONENTS.planning`, `drawGantt` (`src/core/report-draw.ts`) |
| Gantt | Frise graduée au mois, trimestre, semestre ou année (6 à 14 graduations) ; une barre par ligne : terminé en gris, en cours avec l'avancement dans la barre (accent), en retard en rouge (non terminé, fin dépassée), à venir en contour ; phase en cours sur un bandeau teinté ; couloir des jalons (passés en gris, prochain en seconde couleur, jalons proches regroupés) ; repère « Aujourd'hui » sur toute la hauteur ; bandeau de lecture immédiate : phase en cours (avancement et part du temps écoulé, en rouge si l'avancement a plus de 10 points de retard), prochain jalon (date, délai), fin du planning ; le bandeau cède la place si les lignes descendent sous 0,24 pouce | `timeScale`, `isLate`, `drawGantt` |
| Bascule en tableau | Au-delà de 25 lignes (phases + sous-phases), tableau ; les sous-phases des phases terminées y sont regroupées sur la ligne de leur phase ; au-delà de la hauteur disponible, « … et N autres lignes » et point d'attention | `GANTT_MAX_ROWS`, `foldPlan`, `PLAN_TABLE_MIN_ROW_IN` (0,21 po), `PLAN_TABLE_HEAD_IN` |
| Baromètre | Composant « Tableau de bord » : score global du dernier relevé en grand (/10) et écart au relevé précédent, répondants sur la population ; évolution du score (graphique natif, échelle fixe 0–10, sans axe ni quadrillage, valeurs étiquetées) ; avis positifs / neutres / négatifs (barre empilée, écart en points) ; score par domaine trié (barre, valeur à une décimale, écart) ; points clés (risques d'abord) et deux questions ; chaque bloc suit un indicateur (tous par défaut) | `COMPONENTS.barometre`, `drawBarometer`, `barometerLayout` |
| Tableaux | En-tête en petites capitales sous un filet d'encre, filets fins, statut en pastille de couleur, criticité et écarts colorés, chiffres à droite, lignes sans fond | `tableHeaderRow`, `tableRow`, `COLUMN_KIND` |
| Indicateurs et synthèse | Cartes : trait d'accent court, libellé en capitales, valeur en grand dans la police des titres ; synthèse : message principal en gras puis faits à puces carrées de l'accent | `kpiCards`, `synthesisParas` |
| Skill de designer | Pas de skill pour la génération (l'IA ne rédige que les textes ; le design est déterministe, dans le code). Skill Claude Code de projet `.claude/skills/designer-rapports/SKILL.md` : règles du système de design et boucle de contrôle visuel dans PowerPoint, pour toute évolution future | — |

## Rapports : jalons en frise, risques en matrice et tableau (03/10/2026)

Demande du commanditaire : pages Jalons et Risques « très médiocres » ; jalons représentés en frise (visuel fourni : cercles numérotés reliés, titre et description, cartes d'indicateurs sombres) ; risques avec le tableau et la matrice (visuels du Cockpit fournis).

| Sujet | Choix | Constante / code |
|---|---|---|
| Jalons | Composant de nature « Frise » : un cercle par jalon (code dedans) relié au suivant, nom (deux lignes au plus), date, écart à la référence seulement si la date a bougé, phase en option ; six jalons par ligne, deux lignes au plus ; au-delà, fenêtre de 12 jalons autour du prochain et mention « Non affichés : … » | `drawMilestones`, `MILESTONES_PER_ROW` (6), `MILESTONES_MAX` (12) |
| États d'un jalon | Le référentiel ne dit pas si un jalon est atteint (`confirmedAt` = date confirmée) : franchi = date passée (plein, accent), prochain = première date à venir (plein, encre, « Prochain », délai), glissé = à venir et postérieur à sa référence (contour rouge, « Glissé »), à venir (contour d'accent) ; filet de liaison en accent entre jalons franchis | `milestoneStates` |
| Indicateurs des jalons | Quatre cartes sombres (indicateur « Indicateurs clés », par défaut) : jalons franchis / total de la période, jalons glissés à venir, délai du prochain jalon, glissement moyen par rapport à la référence ; masquées si la frise manque de place | `drawMilestones` |
| Risques | Composant « Matrice et tableau » : tableau à gauche (code ; risque en gras sur deux lignes et plan de mitigation dessous, « Aucun plan approuvé — à qualifier » en rouge ; criticité en pastille colorée avec P × I ; porteur et chantier ; échéance, « échue » en rouge ; statut en option), matrice P × I 5 × 5 à droite (zones de criticité en teinte claire, cases occupées en plein avec les codes empilés, trois au plus puis « +N » ; légende avec le nombre de risques par niveau) ; lignes à hauteur variable, risques au-delà de la page : « … et N autres risques (tous dans la matrice) » | `drawRisks`, `drawRiskMatrix`, `RISK_LEVELS` (seuils de `scoreTone`) |
| Indicateurs des risques | Nouveaux : « Matrice P × I » et « Plan de mitigation » ; défauts : matrice, code, risque, criticité, probabilité, impact, plan, responsable, échéance ; point d'attention pour un risque critique (≥ 20) sans plan | `COMPONENTS.risques` |
| Texte | Coupe en lignes selon une largeur moyenne de caractère de 0,6 corps (prudente pour Poppins), dernière ligne abrégée « … » | `wrapText`, `CHAR_EM` |

## Créer un template, étape B : nouvelle maquette « Format du rapport » (04/10/2026)

Maquette livrée (`docs/specs/MAQUETTE - Etape 2 Format du rapport/`) intégrée à l'identique dans `RISE Cockpit.dc.html` : stepper, en-tête, séquence des 4 pages, espace de travail (aperçu et zones, fichier, fiche technique, palette, zones de la page, alertes), bandeau de validation ; textes repris mot pour mot ; polices Plus Jakarta Sans, JetBrains Mono (badges) et Poppins chargées par le Cockpit.

| Sujet | Choix | Code |
|---|---|---|
| Données | La constante `PAGES` de la maquette est remplacée par l'analyse réelle : formes de `POST …/slides/{n}/roles` (type texte / image / forme, texte d'exemple ou nom, position et taille en fraction de la diapositive, rôle proposé), fiche et palette de `pageSummary` (contrôle du serveur, qui tient compte des rôles), alertes de `pageWarnings` ; rôles : les 13 libellés de la maquette, dans l'ordre des identifiants du serveur (`SHAPE_ROLES`) | `fbPage`, `FB_ROLES`, `FB_IDS` |
| Aperçu | Rendu réel de la diapositive (SVG du serveur, sans annotation) en fond, couche de zones de la maquette par-dessus ; le contenu retiré est atténué par un voile de la couleur du fond puis hachuré ; proportions de la diapositive réelles (`size` ajouté à la vue du fichier) | `fbSlideStyle`, `tplFmtRefresh`, `ReportFormatService.fileView` |
| Statut « Vérifiée » | Par page, enregistré avec le format du template (`PageRef.verified`, `formatRefs`, `formatForTemplate`) ; il ne relance ni le contrôle du format ni l'aperçu (`fmtPagesKey`) | `fbToggleVerified` |
| Valider le format | Passe à l'étape C quand les 4 pages sont chargées, contrôlées par le serveur et vérifiées ; sinon ouvre la première page à reprendre (aucun texte ajouté à la maquette) ; « Étape précédente » revient à l'étape A ; le stepper et la navigation génériques de l'assistant sont masqués à l'étape B | `fbValidate`, `tplNotFmt` |
| Persistance | Le brouillon (fichiers, rôles, statut) vit dans l'assistant jusqu'à la publication (étape F), qui enregistre le template et son format ; les fichiers chargés sont enregistrés dès l'import (`report_format_files`) | — |

Écarts à la maquette, nécessaires au fonctionnement réel : liste « Diapositive N » à côté de « Remplacer » quand le fichier a plusieurs diapositives (choix de la diapositive de chaque type) ; page vide : « Charger un fichier / ou déposez-le ici » (textes existants) dans la vignette et l'aperçu, « Analyse en cours… » pendant l'analyse ; proposition faite par règles quand l'IA n'est pas disponible : « Proposé par règles » / « Rétablir la proposition » ; erreurs bloquantes et autres alertes du serveur (zone de titre absente, extraction d'un PDF ou d'une image) affichées avec le style des alertes de la maquette ; badge du fichier : PPTX, PDF ou IMAGE selon le fichier.

## Créer un template : composant Budget soumis au module Budget de la Console (04/10/2026)

Anomalie signalée par le commanditaire : le composant « Budget » était sélectionnable à l'étape 3 alors que le module Budget est inactif dans la Console.

| Sujet | Choix | Code |
|---|---|---|
| Règle | Un composant lié à un module optionnel n'est disponible que si le module est actif pour le projet (portée « tous les projets » ou projet rattaché) ; aujourd'hui : Budget → module `bud` | `COMPONENT_MODULE`, `ReportTemplateService.moduleActive` |
| Serveur | Création, modification de la structure et aperçu d'un template refusés (400, champ `components.N`, « Budget : le module n'est pas activé pour ce projet (Console › Modules). ») ; template existant : anomalie bloquante à la génération (422) | `moduleErrors`, `moduleOffMessage` |
| Écran | Carte verrouillée : cadenas à la place de la case (même pictogramme que les widgets des modules inactifs), mention « Module Gestion du budget non activé », carte atténuée, curseur interdit ; un clic affiche « Le module Gestion du budget n'est pas activé pour votre projet » ; un composant verrouillé déjà présent dans le brouillon en est retiré ; état des modules lu par `GET /modules` (`modOn`) | `CMOD`, `compLocked` |

## Créer un template, étape D : maquette « Ordre et données » et brouillon enregistré (04/10/2026)

Maquette livrée (`docs/specs/MAQUETTE - Etape 4 Ordre et donnees/`) intégrée à l'identique dans `RISE Cockpit.dc.html` : stepper (A à C terminées, D active), en-tête et résumé dynamique, rail des chapitres, glisser-déposer, indicateurs, bloc données, déroulé du rapport, navigation ; textes repris mot pour mot ; JetBrains Mono 600 ajoutée.

| Sujet | Choix | Code |
|---|---|---|
| Modèle | `order` = ordre de `comps` ; `breaks` = positions des composants marqués `newSection` (0 toujours) ; `titles` = `sectionTitle` du premier composant de chaque section ; par composant : `indicators`, `kind` (périmètre), `target` (cible), `period` — même format qu'avant côté serveur (`components[]` : `newSection`, `sectionTitle`, `scope`, `targetId`, `period`, `indicators`) | `fdBreaks`, `tplBody` |
| Glisser-déposer | Le composant déplacé est retiré puis réinséré ; coupures et titres sont réappliqués à leurs positions d'origine (les sections ne suivent pas le composant) ; dépôt à sa propre place sans effet | `fdMove`, `fdDrop` |
| Données réelles | Composants retenus à l'étape C, indicateurs et état proposé (`defaults`) du catalogue ; cibles = vagues, phases et chantiers du référentiel (`targetsFor`), première sélectionnée ; périodes proposées par composant (catalogue `periods`, `GET /report-components`) | `COMPONENTS.*.periods` |
| Périodes par composant | Synthèse : mois en cours, mois précédent, trimestre en cours ; Jalons : 30, 60, 90 prochains jours, sans filtre ; Actions : sans filtre, mois en cours, 30 et 90 prochains jours ; Décisions : mois en cours, mois précédent, trimestre, 3 et 6 derniers mois, sans filtre ; Baromètre : 3, 6, 12 derniers mois ; nouvelles périodes `prevMonth`, `last12`, `next60` ; une période hors de la liste du composant est refusée (« période non proposée pour ce composant ») | `PERIODS`, `periodRange`, `configErrors` |
| Indicateurs | Pastilles de la maquette ; garde-fous existants conservés (au moins un indicateur ; 4 indicateurs chiffrés au plus) par un message ponctuel, sans texte ajouté à l'écran | — |
| Brouillon | Enregistré sur le serveur à chaque modification (800 ms après la dernière), un par compte et par projet, relu à la première ouverture de « Créer un template » si l'assistant est vide ; supprimé quand le brouillon redevient vide (publication) ; contient l'étape, la fiche, le format (pages, rôles, statut vérifié) et les composants ; 3 millions de caractères au plus ; Lecteur : lecture seule | `report_template_drafts`, `GET`/`POST`/`DELETE /report-template-draft`, `DRAFT_MAX_CHARS`, `tplDraftSync` |
| Génération | Inchangée : une intercalaire par section, titre par défaut = nom du premier composant, données recalculées à chaque publication | `sectionsOf`, `periodRange` |

Écarts : stepper cliquable vers les étapes déjà accessibles (comme le reste de l'assistant) ; stepper et navigation génériques masqués à l'étape D.

## Créer un template, étape E : maquette « Prévisualisation » et génération par étapes (04/10/2026)

Maquette livrée (`docs/specs/MAQUETTE - Etape 5 Previsualisation/`) intégrée à l'identique dans `RISE Cockpit.dc.html` (stepper A à D terminées, carte de progression, emplacements des pages, contrôle des données, structure du document, vue agrandie ; animations `e5-*`) et branchée sur la génération réelle ; `Slide.dc.html` remplacé par l'image réelle de chaque diapositive (SVG du serveur), même cadre 16:9.

| Sujet | Choix | Code |
|---|---|---|
| Plan avant génération | Pages (type, libellé) et structure (sections, composants, numéro de page) calculées par la même règle que la composition : côté serveur (`reportPlan`, renvoyé à la création de la tâche) et côté écran pour l'affichage immédiat (`tplLocalPlan`) | `reportPlan`, `tplLocalPlan` |
| Génération par étapes | `POST /report-templates/preview-jobs` (202 : `id`, `slides`, `structure`) lance la construction en tâche de fond : phase 0 format de l'étape B appliqué, 1 données du jour collectées (et rédaction par l'IA), 2 pages générées une à une (rendu de chaque diapositive), 3 contrôle des données (contrôle visuel), 4 terminé ; `GET …/preview-jobs/{id}` : phase, pourcentage, pages prêtes, alertes (avec la page de leur composant), erreur ; images : `GET /report-previews/{id}/slides/{n}` dès qu'elles sont prêtes ; tâches gardées 15 min, 20 au plus | `startPreview`, `runPreview`, `previewJob`, `previewPct` |
| Transport | Interrogation toutes les 350 ms plutôt que SSE : l'authentification de développement (jeton porteur `?as=`) n'est pas transmise par `EventSource` ; une page n'est affichée qu'une fois son image chargée, dans l'ordre de livraison du serveur | `tplPreviewRun` |
| Pourcentage | 6 % (format), 16 % (données), 20 à 88 % selon les pages affichées, 94 % (contrôle), 100 % ; la phase affichée ne dépasse pas les pages réellement affichées | `previewPct`, `fePhase` |
| Reconstruction | À l'arrivée sur l'étape et à chaque retour après une modification des étapes B, C ou D (clé du brouillon), même séquence | `tplDraftKey` |
| Alertes | Gabarit ambre de la maquette pour toutes les alertes (avertissements et anomalies bloquantes) ; point ambre sur la page concernée ; « Voir la page NN » ouvre la page ; compteur « n point(s) » | `feAlerts` |
| Vue agrandie | Placée hors du conteneur animé de l'assistant (sinon elle n'occupe pas tout l'écran) ; flèches du clavier, Échap, bouton, clic hors de la page | `feLightbox`, `_feKeys` |
| Échec de la génération | Pas d'état d'erreur dédié tant que son libellé et son visuel ne sont pas validés (demande du commanditaire) : message du serveur en notification, « Suivant › » reste désactivé ; proposition faite au commanditaire | — |

Correctif au passage : la publication d'un template remplaçait l'historique des générations par les 4 lignes de démonstration de la maquette ; il est désormais conservé.

## Créer un template, étape F et « Générer un rapport » : publication et mise en service (04/10/2026)

Maquettes livrées (`docs/specs/MAQUETTE - Etape 6 Publication et mise en service/`) intégrées à l'identique (l'en-tête photo de l'application est conservé au-dessus de « Générer un rapport ») et branchées sur le serveur.

| Sujet | Choix | Constante / code |
|---|---|---|
| Publication | `POST /report-templates` enregistre le template à l'état `PENDING` et répond aussitôt ; la mise en service se poursuit en tâche de fond : PowerPoint de référence (étape 0), gel dans une version (1), activation (2), Bibliothèque (3), zones de données vérifiées dans le fichier (4), puis `READY` | `ReportTemplateService.commission`, `ReportTemplate.serviceStatus` / `servicePhase` |
| Suivi | `GET /report-templates/{id}/service` (statut, étape, tâches faites, phase de la carte, erreur, « Nouveau ») relu toutes les 600 ms par l'écran (même raison que l'étape E : pas de SSE avec le jeton porteur de développement) ; même flux pour les 4 tâches de l'étape F et les 3 phases de la carte (0-1 enregistrement, 2-3 Bibliothèque, 4 zones de données) | `serviceView`, `cardPhase`, `tplSvcPoll` |
| Persistance | État enregistré en base, lu à l'amorçage de l'écran (`bootstrap.templates[].service`) : rechargement et autres utilisateurs voient le même état ; au démarrage du serveur, une mise en service restée en cours est marquée interrompue | `onModuleInit`, `INTERRUPTED_ERROR` |
| Garde | Template non prêt : génération (`/pptx`), contrôle (`/check`) et rapport de séance refusés (409 `TEMPLATE_NOT_READY`) ; à l'écran, téléchargement et interrupteur masqués, « Télécharger le rapport » désactivé | `assertReady`, `NOT_READY_MESSAGE` |
| Redirection | « Valider et publier » redirige vers « Générer un rapport » dès la réponse du serveur, template présélectionné et placé en tête de son comité ; « Template publié » sert de repli sans serveur | `f6Publish` |
| Prêt | Onde verte unique, étiquette « Nouveau », sections révélées une à une (110 ms), notification « <Nom> v<version> est prêt à être utilisé. » pendant 3,6 s, données rechargées | `tplSvcReady` |
| « Nouveau » | Arbitrage du 04/10/2026 : jusqu'à la première génération d'un rapport (téléchargement ou rapport de séance, par n'importe quel utilisateur), 24 h au plus après la mise en service | `NEW_BADGE_MS`, `firstReportAt` |
| Point bloquant (étape F) | Libellé validé : point rouge, « Publication impossible : N point(s) bloquant(s) à corriger. » et lien « Voir l'étape E › » ; « Valider et publier » atténué et inactif ; l'étape F n'est accessible qu'une fois l'aperçu construit | `f6Blocked`, `canGo` |
| Échec (validé) | Étape F : pastille rouge « ! », « Publication interrompue », tâche en échec en rouge avec sa cause, « Relancer la publication ». Générer un rapport : pastille « Mise en service interrompue », cause sous la carte, lien « Relancer la mise en service » (`POST /report-templates/{id}/commission`), téléchargement désactivé | `recommission`, `FAILED_MESSAGE` |
| Échec de l'aperçu (étape E, validé) | Carte rouge pâle, pastille « ! », « La construction de l'aperçu a échoué », phase en échec en rouge avec sa cause sous la carte, phases suivantes grises, pages prêtes gardées, « Relancer l'aperçu » à la place du pourcentage, « Contrôle non effectué », « Suivant › » désactivé | `feErr` |

## Comités et rapports : nouvel écran « Générer un rapport » (04/10/2026)

Maquette livrée (`docs/specs/MAQUETTE - Generer un rapport/`) intégrée à l'identique sous l'en-tête de l'application ; elle remplace la version de la mise en service du même jour ; le bouton « Télécharger le rapport » est supprimé (téléchargement depuis la ligne du template).

| Sujet | Choix | Constante / code |
|---|---|---|
| Séance | Pavé date (mois abrégé et jour de la séance sélectionnée), texte de rattachement (comité, participants), sélecteur des séances à venir (30 au plus), « Calendrier des comités → » | `genSesVals` |
| Tuiles | Deux tuiles de 640 px, côte à côte (empilées sous ~950 px), défilement interne sans barre visible ; la page ne s'allonge pas avec le nombre de templates | `[data-noscrollbar]` |
| Recherche et filtre | Nom, auteur, composants et comité, sans accents ni casse ; filtre « Tous les comités » ou un comité ; une recherche ou un filtre ouvre les groupes concernés ; « x sur n templates » ; au-delà de 300 templates, recherche faite par le serveur (`GET /report-templates/search?q=&bodyId=&offset=&limit=`, 200 au plus par page) | `GEN_LOCAL_MAX`, `searchTemplates` |
| Groupes | Par comité, repliables, en-têtes collants, compteur ; par défaut seul le groupe du template sélectionné est ouvert ; « Tout déplier / Tout replier » | `gnOpen` |
| Lignes | Hauteur fixe 66 px : radio, nom, version, métadonnées tronquées (liste complète au survol), téléchargement, interrupteur ; mise en service sur la ligne (reflet, « Mise en service », phase n / 3, barre de 2 px en bas) sans changement de hauteur ; échec : « Mise en service interrompue » et « Relancer la mise en service » | `gnGroups` |
| Interrupteur | Arbitrage du 04/10/2026 : un template désactivé reste listé, atténué, jusqu'au prochain chargement de l'écran (réactivation d'un clic) ; il reste dans la Bibliothèque ; activation et désactivation journalisées (auteur, date) | `genKeep`, `PATCH /report-templates/{id}/active` |
| Prévisualisation | Bandeau (titre, comité, date, version · pages), sommaire (numéro, section, pointillés, périmètre et pages), note ; sommaire estompé pendant la mise en service puis révélé section par section | `gnPv` |

## Rapports : échéancier des actions, arbitrages, tableau de bord (04/10/2026)

Demande du commanditaire : pages Actions, Décisions et Tableau de bord « médiocres » (tableau tronqué, tableau vide « Aucune donnée » alors qu'une décision restait à arbitrer, deux chiffres isolés et un graphique en barres 100 / 100 répété) ; contenu à enrichir, lecture immédiate, aucune surcharge, cohérence avec les autres planches. Trois nouvelles planches dessinées (`src/core/report-draw-pilotage.ts`), sur le modèle des Jalons et des Risques.

| Sujet | Choix | Constante / code |
|---|---|---|
| Actions | Composant de nature « Échéancier » : actions ouvertes triées par urgence (les plus en retard d'abord, puis les échéances proches, enfin sans échéance) ; pour chacune, code (et priorité en option), action en gras sur deux lignes, dessous responsable, chantier (sauf périmètre chantier) et origine (« issue de R01 » : risque, problème, jalon ou décision) ; frise centrée sur un axe « Aujourd'hui » daté, même échelle des deux côtés : retard en rouge à gauche, délai à droite (ambre sous 14 jours, accent au-delà), « sans échéance » ; échéance (rouge si dépassée) ; statut (bloquée en rouge) ; au-delà de la page, « … et N autres actions ouvertes » | `drawActions`, `sortActions`, `ACTION_SOON_DAYS` (14) |
| Panneau des actions | Indicateur « Indicateurs clés » (par défaut) : panneau sombre à droite, actions en retard sur les ouvertes en grand, la plus ancienne et son retard ; en bas, répartition par échéance (barre segmentée et légende : en retard, sous 14 jours, plus tard, sans échéance) ; avec « Priorité » : priorité haute et nombre en retard. Sans action ouverte : état vide centré, sans panneau | `actionBuckets` |
| Décisions | Composant de nature « Arbitrages » : à gauche, les décisions en attente **quelle que soit la période** (brouillon, en revue, à arbitrer), nombre et « dont N à arbitrer » ; pour chacune, code, intitulé, instance (nom complet) et séance attendue, étape sur trois segments (étapes franchies en gris, étape courante en accent, ambre si à arbitrer), attente en jours (rouge à partir de 30) ; à droite, les décisions prises sur la période (date d'arbitrage), en fil chronologique : date, instance, code, ce qui a été décidé, la question dessous, impact en option ; sans décision prise sur la période, les trois dernières sont rappelées, atténuées | `drawDecisions`, `sortPending`, `DECISION_STAGES`, `DECISION_STALE_DAYS` (30), `DECISIONS_RECALL` (3) |
| Indicateurs des décisions | « Statut » devient « Étape », « Date » devient « Attente » ; nouveaux : « Décision prise » (par défaut) et « Impact » ; défauts : code, décision, étape, attente, instance, décision prise | `COMPONENTS.decisions` |
| Tableau de bord | Composant de nature « Tableau de bord » : à gauche, la phase en cours (n / N), avancement réel en grand, prévu à date et écart en points (« ▲ +1 pt » vert ; ambre jusqu'à -5 ; rouge au-delà), fin prévue et délai ; barre réel / repère « Prévu » ; repères go-live prévu (projet) et prochain jalon (date, délai, nom) ; chemin des phases (une case par phase : terminées en gris, en cours en accent avec son avancement, à venir en filet, date de début) ; à droite, « Santé du projet » en quatre tuiles qualifiées : risques ouverts (dont critiques, sinon élevés), actions ouvertes (dont en retard, sinon sous 14 jours), jalons glissés (glissement maximal, sinon « aucun glissement »), décisions en attente (dont à arbitrer) ; tuiles seules : une ligne, valeurs en grand | `drawDashboard`, `focusPhase`, `gapTone`, `DASH_GAP_WATCH` (-5) |
| Indicateurs du tableau de bord | Nouveau : « Décisions en attente » ; défauts : les six indicateurs | `COMPONENTS.dashboard` |
| Versions déjà publiées | Leur PowerPoint contient encore le tableau (Actions, Décisions) ou les cartes et le graphique (Tableau de bord) : ces parties restent calculées à chaque génération et remplissent ces zones ; elles ne servent plus à la rédaction par l'IA (les faits viennent des planches) ; une nouvelle version publiée passe aux planches | `LEGACY_PARTS` |
| Rédaction par l'IA | Faits des planches : retards et échéances des actions, étape et attente des décisions en attente, décisions prises, phase en cours (réel, prévu, écart), tuiles | `ReportTemplateService.write` |

## Créer un template : session réinitialisée à la publication (04/10/2026)

Demande du commanditaire : après « Valider et publier », revenir sur « Créer un template » ne doit plus réafficher l'écran de publication. La publication clôt la session de l'assistant : le serveur supprime le brouillon de l'auteur dans la transaction qui crée le template (`createTemplate`, `report_template_drafts`), et l'écran annule l'enregistrement différé du brouillon, le supprime (`tplDraftDrop`) et repart d'un assistant vierge à l'étape A (`f6Publish`), y compris après un rechargement de la page.

## Créer un template : un seul bandeau des étapes ; vignettes vides de l'étape B (04/10/2026)

Demande du commanditaire : le bandeau des étapes différait entre l'étape A et les étapes B à F (maquettes livrées avec leur propre bandeau) ; le bon design est celui de l'étape A. Il est désormais affiché à toutes les étapes (`tplSteps`, drapeau `tplStepper`) et les bandeaux des maquettes (`fbSteps`, `fdSteps`, `feSteps`, `f6Steps`) ne sont plus affichés ; la navigation par le bandeau est suspendue pendant la publication. Étape B : les vignettes des pages vides n'affichent plus « Charger un fichier / ou déposez-le ici » (sans action au clic, redondant avec la grande zone de chargement) et la zone vide garde le curseur normal.

## Créer un template, étape F : plus de double affichage de la publication (04/10/2026)

Constat du commanditaire : au clic sur « Valider et publier », une liste d'étapes de publication s'affichait sur l'étape F puis la mise en service recommençait dans « Générer un rapport ». La liste « Publication en cours » (quatre tâches de la maquette de l'étape 6, antérieure à la maquette de mise en service) est retirée : elle n'avançait pas réellement (simple attente de l'enregistrement). Pendant l'enregistrement, la carte « Prêt à publier » reste affichée et le bouton, désactivé, indique « Publication… » (`f6Ready`, `f6BtnOff`) ; la mise en service n'est suivie que sur la ligne du template. L'état d'échec validé le 04/10/2026 est inchangé.

## Créer un template, étapes B et E : retraits demandés (04/10/2026)

| Sujet | Choix | Code |
|---|---|---|
| Retrait d'une page depuis sa vignette | Icône corbeille en haut à droite de chaque vignette chargée (« Retirer la page de … », rouge au survol) : même effet que « Supprimer » du panneau ; la page vidée est sélectionnée pour être rechargée | `fbPages[].remove` |
| Import d'un fichier pour les 4 pages | Bouton et code retirés (répartition d'un fichier sur les 4 types, erreur commune) : chaque page se charge depuis son panneau ; un fichier de 4 diapositives ou plus y propose la diapositive du type | `tplFmtLoad(kind, file)` |
| « Proposé par l'IA » | Mention retirée des zones de la page ; « Rétablir la proposition (de l'IA) » n'apparaît qu'après la modification d'un rôle | `fbHasAi` |
| Étape E | Phrase « Revenez aux étapes précédentes pour corriger le design (B)… » retirée de la structure du document | — |

## Générer un rapport : téléchargement suivi étape par étape (04/10/2026)

Demande du commanditaire : un laps de temps important séparait le clic sur « Télécharger » du téléchargement ; animation suivant les étapes jusqu'au fichier.

| Sujet | Choix | Constante / code |
|---|---|---|
| Génération suivie | La génération devient une tâche du serveur : `POST /report-templates/{id}/generations` (202), avancement `GET /report-generations/{id}` (phases 0 collecte des données du jour, 1 rédaction des titres et de la synthèse, 2 mise en page au format du template, 3 prêt ; erreur avec code, message et anomalies ; avertissements une fois terminée), fichier `GET /report-generations/{id}/file` remis une seule fois (première génération enregistrée) ; tâches oubliées au bout de 15 min. `GET /report-templates/{id}/pptx` reste disponible | `startGeneration`, `generationJob`, `generationFile`, `GenerationJob` |
| Contrôle avant génération | Données seules, sans rédaction par l'IA : la rédaction (plusieurs secondes) n'a plus lieu deux fois ; ses avertissements sont rendus par la génération | `reportData(…, { write: false })` |
| Écran | Sur la ligne du template : reflet, étape en cours (« Contrôle des données… », « Collecte des données du jour… », « Rédaction des titres et de la synthèse… », « Mise en page au format du template… », « Téléchargement du fichier… »), compteur n / 5, mention « Génération » avec indicateur, barre de 2 px ; puis « Rapport téléchargé » (1,8 s) ; échec : message du serveur, « Réessayer », « Génération interrompue ». L'affichage avance d'une étape à la fois vers celle atteinte par le serveur, chacune visible au moins 0,45 s ; le fichier n'est remis qu'une fois « Téléchargement du fichier » affiché ; bouton de téléchargement masqué pendant la génération | `tplGenRun`, `GEN_STEPS`, `GEN_STEP_MIN_MS` (450 ms), `gnDl`, client `tplGenerate` |

## Générer un rapport : bloc « Séance du rapport » retiré (04/10/2026)

Analyse présentée au commanditaire : le sélecteur de séance n'avait pas d'effet sur le rapport (comité du template, date du jour, aucun rattachement enregistré au téléchargement) et partageait la variable `sesSel` avec le calendrier des comités. Améliorations proposées (rattachement réel, rapport adapté à la séance) demandées puis annulées : le bloc est retiré (pavé date, texte, sélecteur, lien vers le calendrier, `genSesVals`). Un rapport versé dans la Base de connaissance reste rattaché à la prochaine séance planifiée du comité du template (`onReportGenerated`).

## Rapports, composant Planning : chemin critique et atterrissages (04/10/2026)

Demande du commanditaire : indicateurs « Chemin critique », « Atterrissage rythme actuel » et « Atterrissage rythme prévu » dans le composant Planning (étape D). Mêmes définitions que l'écran Planning du Cockpit (`plItems`).

| Sujet | Choix | Constante / code |
|---|---|---|
| Chemin critique | Phases et sous-phases marquées critiques au référentiel : contour rouge détaché autour de la barre (Gantt) ; mention « critique » après le nom (tableau) | `GanttRow.critical` |
| Atterrissage au rythme actuel | Aujourd'hui + jours écoulés × reste à faire / réalisé (phase commencée, 0 < réalisé < 100) : cercle ambre à la date projetée | `planLandings` (`lc`) |
| Atterrissage au rythme prévu | Aujourd'hui + reste à faire × durée prévue (phase commencée, non terminée) : losange gris | `planLandings` (`lp`) |
| Lecture | Filet pointillé depuis la fin prévue jusqu'au repère, écart « +N j » au-dessus du filet ; frise étendue jusqu'aux atterrissages affichés (repère à sa vraie date) ; phases terminées sans repère ; légende complétée, « Terminé » puis « À venir » retirés si la place manque ; planning en tableau : colonne « Atterrissage » (rythme actuel, ambre s'il dépasse la fin, puis « prévu … »), nom abrégé sur une ligne | `drawGantt`, `drawPlanTable` |
| Indicateurs | Trois nouveaux indicateurs du Planning, non cochés par défaut ; faits transmis à la rédaction par l'IA | `COMPONENTS.planning` |

## Notifications : e-mail mis en page (04/10/2026)

Demande du commanditaire : e-mails de notification « médiocres » (texte brut issu du Markdown) ; refonte sur le modèle fourni (titre éditorial, chiffres en grand, « À surveiller », bloc sombre « À faire »), lecture immédiate, sans surcharge.

| Sujet | Choix | Constante / code |
|---|---|---|
| Format | E-mail HTML (texte brut joint en alternative, `mailText`) compatible avec les messageries : tableaux, styles en ligne, 600 px, une colonne sous 620 px ; Georgia (titre, chiffres), Helvetica / Arial (texte) ; papier chaud, encre, rouge (risque), ambre (vigilance), vert d'eau (maîtrisé) | `notificationHtml`, `EMAIL_COLORS` (`src/domain/notification-email.ts`) |
| Lecture du contenu | Blocs lus dans le Markdown rédigé par l'IA, comme dans le tiroir du Cockpit : salutations en introduction, première phrase utile en titre, chiffres clés, lignes codées « À surveiller », actions numérotées « À faire », anciens tableaux en lignes codées ; formules finales omises | `emailBlocks` |
| Mise en page | En-tête « RISE Cockpit · projet · date » ; rubrique (nom de la règle) précédée d'un point de la couleur de gravité ; titre en grand (réduit au-delà de 150 caractères) ; chiffres sous un filet (rouge si critique, criticité ≥ 20 ou dépassement « 79 / 40 »), dénominateur en gris, barre de progression quand la valeur est une part (« 27 / 61 ») ; codes colorés selon l'état décrit ; bloc sombre des actions, numéros en corail, échéances (« avant 14/10 ») en relief, précisions entre parenthèses en gris ; lien « Ouvrir RISE Cockpit » ; pied : adresse d'expédition et raison de l'envoi (profil, projet) ; texte d'aperçu = l'essentiel ; espaces insécables de la typographie française | `notificationHtml`, `RISK`, `toneOf` |
| Envoi | `Mail.html` facultatif ; adresse d'expédition lue dans les réglages SMTP de la Console | `MailerService.senderAddress`, `NotificationsService.deliver` |
