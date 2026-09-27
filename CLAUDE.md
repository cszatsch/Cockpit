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
  - Cockpit : http://localhost:3000/RISE%20Cockpit.dc.html — Console : http://localhost:3000/Console%20Admin.dc.html — OpenAPI : http://localhost:3000/api/docs

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
- **Frontends** : le Cockpit passe par `frontends/api.js` (charge le bootstrap au montage ; chaque écriture appelle l'API puis recharge), la Console par `frontends/admin-api.js`. Design et textes restent inchangés ; chaque modification d'un frontend est justifiée dans `frontends/CHANGES-cockpit.md` / `CHANGES-console.md`. Paramètres d'URL de développement : `?as=p06` (Cockpit), `?as=u1` (Console), `?e2e=1` (expose `window.__riseCockpit` aux tests).
- **Amorçage** : `prisma/seed/source.ts` lit les fichiers de données des frontends, `rise.ts` amorce le Cockpit (y compris les corrections et affectations des décisions Q5 et Q6), `admin.ts` la Console.
- **Authentification de développement** (`AUTH_DEV=true`) : `POST /api/auth/dev-login` avec `{"personId":"p01"}` (PMO) ou `{"accountId":"u1"}` (Admin) ; autres comptes dans le README § 4.
