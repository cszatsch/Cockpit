# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Règles de travail

- **On travaille en français** : échanges, commentaires de code, messages de commit et documentation.
- **Après chaque modification** : lancer `npm test` dans `backend/`, puis commiter et pousser sur la branche courante (`git push origin HEAD`).
- Les décisions (arbitrages du commanditaire et choix techniques) sont dans `docs/DECISIONS.md` ; le rapport (réalisé, tests, écarts, questions ouvertes) dans `docs/RAPPORT.md`. Toute nouvelle hypothèse ou tout écart aux briefs s'y consigne, avec la constante nommée qui la porte dans le code.

## Lancement local (Windows)

- **Démarrer** : `demarrer-rise.cmd` (double-clic) à la racine. Il appelle `demarrer-rise.ps1`, qui libère les ports, démarre le PostgreSQL personnel, crée `backend/.env` si absent, installe/migre/compile seulement si nécessaire, lance l'API dans sa propre fenêtre et ouvre le Cockpit et la Console.
  - Options du `.ps1` : `-Reinitialiser` (recharge les données de démo), `-Compiler` (force la compilation), `-Arreter`.
- **Arrêter** : `arreter-rise.cmd` (application et PostgreSQL).
- **PostgreSQL local : port 5433** (et non 5432), utilisateur `rise` en authentification `trust`, données dans `%USERPROFILE%\rise-pgdata`. L'application écoute sur le port 3000.
  - Connexion Cockpit : http://localhost:3000/connexion (puis `/`) — Connexion Console : http://localhost:3000/console/connexion (puis `/console`) — OpenAPI : http://localhost:3000/api/docs
  - Compte initial (Cédric Schmitz, admin + PMO) : `demarrer-rise.ps1` demande son mot de passe provisoire s'il n'existe pas ; sinon `RISE_INITIAL_ADMIN_PASSWORD='…' npm run init:admin`. Ne jamais écrire ce mot de passe dans un fichier.

## Commandes (dans `backend/`)

```bash
npm run dev             # API avec rechargement à chaud (ts-node-dev)
npm run build           # compilation (tsc -p tsconfig.build.json) vers dist/
npm run lint            # vérification des types (tsc --noEmit)
npm test                # unitaires + e2e, en série (--runInBand)
npm run test:unit       # règles de domaine seules, sans base
npm run test:e2e
npx jest test/e2e/pilotage.spec.ts -t "nom du test"   # un seul fichier / un seul test
npm run db:migrate      # prisma migrate deploy
npm run db:seed         # vide puis recharge le jeu de démonstration (idempotent)
npm run db:reset
npm run openapi         # régénère backend/openapi.json (versionné)
npm run init:admin      # compte initial (RISE_INITIAL_ADMIN_PASSWORD, jamais dans un fichier)
npm run ia:reinitialiser -- --confirmer   # supprime modèles d'IA, affectation et consommation (fournisseurs gardés)
npm run ia:catalogue -- --confirmer       # applique le catalogue des modèles (prisma/catalog/ia-modeles.ts) ; sans l'option : simulation
npm run dictionnaire:charger              # recharge les dictionnaires des données (Console : jev-dictionnaire.ts, Cockpit : jev-dictionnaire-cockpit.ts) en base
npm run dictionnaire:doc                  # régénère docs/specs/JEV CONSOLE (et JEV COCKPIT) - dictionnaire des donnees.md
```

- **Base de test** : Jest ne lit pas `.env`. `test/env.ts` et `test/global-setup.ts` prennent `DATABASE_URL_TEST`, sinon `…@localhost:5432/rise_test`. Avec le PostgreSQL local sur 5433, exporter avant `npm test` : `DATABASE_URL_TEST=postgresql://rise@localhost:5433/rise_test` (base `rise_test` à créer une fois avec `createdb -h localhost -p 5433 -U rise rise_test`). Les migrations sont appliquées automatiquement et chaque suite réamorce la base.
- L'environnement de test fige la date (`DEMO_TODAY=2026-09-26`, `DEMO_NOW`), active `AUTH_DEV`, coupe les appels sortants (`OFFLINE`) et les tâches de fond (`JOBS_ENABLED=false`).
- **Tests navigateur** (Playwright, hors `npm test`) : `npx ts-node --transpile-only test/browser/cockpit.e2e.ts` et `…/console.e2e.ts` ; ils supposent un `npm run build` préalable (prérequis détaillés dans le README § 5).

## Architecture

Monorepo : `backend/` (API NestJS 11 + Prisma 6 + PostgreSQL), `frontends/` (pages `.dc.html` livrées, servies en statique par l'API), `docs/` (analyse, plan, questions, décisions, rapport, briefs dans `docs/specs/`).

- **Un seul service** : `/api/…` pour le Cockpit (le plus souvent `/api/projects/{projectId}/…`) et `/api/admin/…` pour la Console Admin. `src/app.factory.ts` construit l'application (partagée par `main.ts`, les tests e2e et l'export OpenAPI) : filtre d'erreurs global, intercepteur ETag, Swagger, statique `FRONTEND_DIR`.
- **`src/core`** : socle transversal — config (lecture directe de `process.env`), Prisma, auth JWT liée à une session révocable, droits (`access.service`), format d'erreur unique `{ code, message, fields?, usages? }`, verrouillage optimiste `ETag`/`If-Match`, journal d'audit en ajout seul (protégé par un trigger SQL dans les migrations), date du jour (`today.service`, pilotée par `DEMO_TODAY`), stockage, e-mail, tâches pg-boss, passerelle LLM (bouchon), chiffrement AES-256-GCM des clés API.
- **`src/domain`** : règles de calcul pures (`rules.ts`, brief § 7) et droits effectifs (`rights.ts`, § 8 / RG5), testées dans `test/unit`.
- **`src/cockpit`** : référentiel (moteur CRUD générique avec contrôle des usages bloquants), pilotage, comités, Aujourd'hui, documents, collaboration… et `GET /api/projects/{id}/bootstrap`, qui renvoie la même forme que `frontends/rise-data.js` + `planning-data.js`.
- **`src/import`** : lecture et contrôle du fichier Excel d'initialisation, moteur commun au Cockpit et à la Console ; le serveur refait tous les contrôles et fait foi.
- **`src/admin`** : Console Admin (comptes, habilitations, audit, IA, consommation, snapshots, notifications, modules, bibliothèque).
- **Frontends** : le Cockpit passe par `frontends/api.js` (charge le bootstrap au montage ; chaque écriture appelle l'API puis recharge), la Console par `frontends/admin-api.js`. Design et textes restent inchangés ; chaque modification d'un frontend est justifiée dans `frontends/CHANGES-cockpit.md` / `CHANGES-console.md`. Paramètres d'URL de développement : `?as=p06` (Cockpit), `?as=u1` (Console) — sans eux, session par cookie —, `?e2e=1` (expose `window.__riseCockpit` aux tests).
- **Amorçage** : `prisma/seed/source.ts` lit les fichiers de données des frontends, `rise.ts` amorce le Cockpit (y compris les corrections et affectations des décisions Q5 et Q6), `admin.ts` la Console — sans modèle d'IA depuis le 28/09/2026 ; `seedDemoAi()` (9 LLM, affectation, consommation) n'est chargé que par les tests (`test/helpers.ts`).
- **Modèles d'IA** (spécification `docs/specs/IA - specification.md`) : catégorie `LLM` / `EMBEDDING` / `RERANKING`, date de sortie, max output tokens (LLM), tarif au token ou à la requête (`src/domain/ai-pricing.ts`). Cinq fonctions (`AI_FUNCTIONS`) dont la chaîne Documents `doc_vec` → `doc_rrk` → `doc_syn`, chacune limitée à sa catégorie ; une étape indisponible suspend la suite. Écrans : `Affectation des modeles.dc.html`, `Vue reseau IA.dc.html`, `Fiche modele.dc.html` (règles `ia-data.js`), intégrés par `<dc-import>` dans la Console.
- **Registre des cartes API** (spécification `docs/specs/REGISTRE API - specification.md`) : `api_cards` / `api_card_calls`, routes `/api/admin/api-cards`, proxy des widgets `/api/widgets/proxy/:cardId` (`src/admin/api-cards.*`, règles et SSRF dans `src/domain/api-cards.ts`), contrôle de santé toutes les 15 min, alertes dans le tiroir de notifications ; flux RSS / Atom (`src/domain/rss.ts`, `GET /api/widgets/feeds`) ; délai par carte appliqué aussi à la connexion (client `undici`) ; écran `Registre API.dc.html`.
- **Journal des appels** (spécification `docs/specs/JOURNAL - specification.md`) : `UsageRecord` porte les tarifs figés (`priceIn`, `priceOut`, `pricePer1k`) et la durée de chaque appel (identifiant `req_…`) ; routes `/api/admin/usage/daily`, `/usage/calls` (curseur), `/usage/calls.csv` (`UsageService`, règles dans `src/domain/journal.ts`) ; écran `Journal des appels.dc.html` (« Journal consommation et coûts »), sous « Vue générale des coûts ».
- **Notifications de l'administrateur** (spécification `docs/specs/NOTIFICATIONS - specification.md`) : `Notification` (une par cause), `InboxService` (`src/admin/inbox.service.ts` : réconciliation avec l'état de la plateforme à chaque lecture, décisions exécutées après 10 s d'annulation par le code des pages Utilisateurs et Modules), erreurs techniques via `src/core/tech-errors.ts` ; tiroir `Notifications.dc.html` et cloche de la sidebar.
- **Notifications et alertes** (spécification `docs/specs/NOTIFICATIONS ET ALERTES - specification.md`) : règles envoyées aux utilisateurs ; vue `Notifications et alertes.dc.html` (page `notifs`), routes `/api/admin/notifications/rules…`, `/history`, `/counts` au format `Rule` du § 2 (adaptateur `src/domain/notification-rules.ts`, `RulesController`) ; une règle sans modèle ou sans destinataire n'envoie rien (`blockingErrors`).
- **Persona de Jev** (spécification `docs/specs/PERSONA - specification.md`) : `Persona` unique + `PersonaVersion` (API `/api/assistant/persona`, image `/avatar`, `src/admin/persona.controller.ts`) ; écran `Persona.dc.html` ; `identity.name` alimente le nom de Jev dans la Console.
- **Skills de Jev** (spécification `docs/specs/SKILLS - specification.md`) : `Skill` (API `/api/assistant/skills`, `src/admin/skills.controller.ts`) ; prompt système de Jev assemblé à chaque réponse par `JevPromptService` (`src/domain/jev-prompt.ts` : base, Identité, Personnalité, skills actives dans l'ordre) pour les Jev du Cockpit et de la Console. Le Jev de la Console passe entièrement par la fonction `guidage` (Identité, Soul, skill « Guidage console », page ouverte ; `assembleConsoleGuidancePrompt`), sans moteur de mots-clés ni action : seul le modèle répond. C’est la seule fonction en génération réelle (`LIVE_FUNCTIONS`, `src/core/llm-client.ts`) ; les autres restent sur le bouchon, et toutes le sont hors ligne. Écran `Skills.dc.html` dans la Console ; barre latérale `Sidebar Console.dc.html` (`docs/specs/SIDEBAR - specification.md`).
- **Authentification** (`src/core/auth`, spécification `docs/specs/AUTH - specification.md`) : écrans `Connexion.dc.html` / `Connexion Console.dc.html` (composant `Authentification.dc.html`, client `frontends/auth-api.js`) ; sessions par cookie HttpOnly, une par surface (`APP`, `ADMIN`), jeton anti-CSRF `X-CSRF-Token` pour les écritures ; règles et durées dans `policy.ts`. Les pages `/` et `/console` sont servies par `pages.ts` seulement avec une session de leur surface.
- **Authentification de développement** (`AUTH_DEV=true`) : `POST /api/auth/dev-login` avec `{"personId":"p01"}` (PMO) ou `{"accountId":"u1"}` (Admin) délivre un jeton porteur ; dans les écrans, `?as=p06` / `?as=u1` active ce mode (les tests navigateur l'utilisent) ; autres comptes dans le README § 4.
