# RISE — Backend du Cockpit et de la Console Admin

Ce dépôt contient :

- le backend de **RISE Cockpit**, l'application de pilotage de projet ;
- le backend de la **Console Admin**, la plateforme d'administration ;
- les deux frontends branchés sur ce backend.

| Dossier | Contenu |
|---|---|
| `backend/` | API NestJS + PostgreSQL (Prisma), un seul service : `/api/…` (Cockpit) et `/api/admin/…` (Console) |
| `frontends/` | Frontends livrés (copie d'origine dans le premier commit), puis branchés via `api.js` et `admin-api.js` |
| `docs/specs/` | Briefs du backend et audit du frontend (fournis) |
| `docs/01-ANALYSE.md` | Analyse des frontends et des briefs, incohérences relevées |
| `docs/02-PLAN.md` | Architecture, modèle de données, endpoints, étapes |
| `docs/DECISIONS.md` | Arbitrages du commanditaire et décisions techniques documentées |
| `docs/RAPPORT.md` | Rapport final : réalisé, tests, écarts, questions ouvertes |

---

## 1. Prérequis

- Node.js 20 ou plus récent (testé avec Node 22) et npm ;
- PostgreSQL 15 ou plus récent (testé avec PostgreSQL 16) ;
- facultatif : Docker et Docker Compose, pour tout lancer en une commande.

## 2. Installation et lancement en local

```bash
cd backend
npm install
cp .env.example .env              # puis adapter DATABASE_URL, SECRETS_KEY, JWT_SECRET
npx prisma migrate deploy         # crée le schéma (et le trigger qui protège le journal d'audit)
npm run db:seed                   # charge le jeu de démonstration (rise-data.js, planning-data.js, console)
npm run build && npm start        # API sur http://localhost:3000
```

Pour le développement, `npm run dev` relance l'API à chaque modification.

- La documentation OpenAPI est servie sur **http://localhost:3000/api/docs**, en JSON sur `/api/docs/openapi.json`. Une copie versionnée se trouve dans `backend/openapi.json` ; `npm run openapi` la régénère.
- Les frontends sont servis par l'API elle-même (variable `FRONTEND_DIR`) :
  - Cockpit : http://localhost:3000/RISE%20Cockpit.dc.html
  - Console : http://localhost:3000/Console%20Admin.dc.html
- `npm run db:seed` vide la base puis la recharge : l'amorçage est idempotent.

### Avec Docker

```bash
docker compose up --build -d
docker compose exec api npm run db:seed
```

L'API et les frontends sont alors disponibles sur http://localhost:3000.

## 3. Variables d'environnement

Elles sont décrites dans `backend/.env.example` :

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_URL` | Base PostgreSQL | — |
| `DATABASE_URL_TEST` | Base dédiée aux tests (`npm test`) | `…/rise_test` |
| `JWT_SECRET`, `JWT_TTL` | Signature et durée des jetons | `dev-secret-change-me`, `12h` |
| `AUTH_DEV` | Active `POST /api/auth/dev-login` (connexion de développement) | `false` |
| `DEMO_TODAY` | Date du jour de démonstration (brief § 7.1) ; vide = date réelle dans le fuseau du projet | — |
| `DEMO_NOW` | Instant de démonstration de la console (facultatif) | — |
| `SECRETS_KEY` | Clé maître AES-256-GCM des clés API (64 caractères hexadécimaux) | — |
| `STORAGE_DIR` | Stockage des fichiers (documents, rapports, snapshots, imports) | `./storage` |
| `FRONTEND_DIR` | Dossier des frontends servis en statique | — |
| `JOBS_ENABLED` | Tâches de fond pg-boss (tests de clés, alertes, snapshots, notifications, purge) | `true` |
| `OFFLINE` | Coupe les appels sortants (météo, actualités) | `false` |
| `SMTP_URL`, `MAIL_FROM` | Envoi d'e-mails ; sans SMTP, les e-mails sont écrits dans le journal | — |

## 4. Authentification et comptes de démonstration

Le fournisseur d'identité réel est hors périmètre (brief § 4). Les jetons sont des JWT porteurs (`Authorization: Bearer …`), liés à une session révocable. En développement, `AUTH_DEV=true` active une route de connexion :

```bash
curl -X POST localhost:3000/api/auth/dev-login -H 'Content-Type: application/json' -d '{"personId":"p01"}'
```

Comptes utiles du jeu de démonstration :

| Qui | Connexion | Droits |
|---|---|---|
| Robin Lefèvre | `{"personId":"p01"}` | PMO sur RISE (et ATLAS) — utilisateur de développement |
| Julien Morel | `{"accountId":"u1"}` | Admin (console) |
| Laurent Garnier | `{"personId":"p03"}` | Directeur de programme, Responsable C8 |
| Karim Benali | `{"personId":"p06"}` | Responsable C5 et C6 |
| Philippe Aubert | `{"personId":"p04"}` | Lecteur C3, décideur (sponsor) |

## 5. Tests

```bash
cd backend
npm test            # unitaires + e2e (Jest + Supertest) sur la base DATABASE_URL_TEST, exécutés en série
npm run test:unit   # règles de domaine seules (sans base)
```

- La base de test est migrée automatiquement, puis réamorcée au début de chaque suite.
- Les tests e2e reprennent les critères d'acceptation des deux briefs (§ 13).
- Tests des frontends dans le navigateur (Chromium sans interface, Playwright) : voir `backend/test/browser/` et la section 6.

## 6. Brancher les frontends

Les frontends sont servis par l'API, sur la même origine : aucune configuration CORS n'est nécessaire.

- **Cockpit** : `frontends/api.js` centralise les appels, le jeton et les erreurs.
  - Au montage, le Cockpit charge `GET /api/projects/{projectId}/bootstrap`, qui a la même forme que `rise-data.js` + `planning-data.js`.
  - Chaque écriture est traduite en appel API, puis les données sont rechargées.
  - Paramètres d'URL : `?project=RISE`, et `?as=p06` en développement pour se connecter sous une autre personne.
- **Console** : `frontends/admin-api.js` remplace les constantes de démonstration par les appels `/api/admin/…` et branche chaque action de l'écran.
  - Paramètre d'URL : `?as=u1`.
- Le détail et la justification de chaque modification des frontends se trouvent dans `frontends/CHANGES-cockpit.md` et `frontends/CHANGES-console.md`.

Pour héberger les frontends ailleurs que sur l'API, il suffit de servir le dossier `frontends/` et de définir `window.RISE_API_BASE` (par exemple `https://api.exemple.fr`) avant le chargement de la page. CORS est ouvert par l'API.

## 7. Architecture en bref

- **`src/core`** : socle commun.
  - Configuration, Prisma, authentification JWT et sessions, garde des droits.
  - Format d'erreur unique, journal d'audit en ajout seul (trigger SQL), ETag / If-Match, date du jour.
  - Stockage de fichiers, e-mail, file de tâches (pg-boss), passerelle LLM (bouchon), chiffrement des clés.
- **`src/domain`** : règles de calcul pures et testées (§ 7) et droits effectifs (§ 8, RG5).
- **`src/cockpit`** :
  - `/api/me` et `/api/projects` ;
  - Référentiel (moteur CRUD générique, usages bloquants) ;
  - Pilotage, Comités, Aujourd'hui, Mes tâches ;
  - documents, commentaires, historique, Jev ;
  - `GET /bootstrap`.
- **`src/import`** : lecture et contrôle du fichier Excel d'initialisation. Le moteur est commun au Cockpit et à la Console.
- **`src/admin`** : Console Admin (comptes, administrateurs, audit, IA, consommation, snapshots, notifications, modules, bibliothèque, initialisation).

Les décisions prises en l'absence de règle ou en cas de contradiction sont listées dans `docs/DECISIONS.md`, avec la constante nommée qui les porte.
