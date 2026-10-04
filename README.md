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
RISE_INITIAL_ADMIN_PASSWORD='…' npm run init:admin   # compte initial (voir § 4) ; mot de passe provisoire jamais écrit dans un fichier
npm run ia:reinitialiser -- --confirmer   # (au besoin) supprime modèles, affectation et consommation ; garde les fournisseurs
npm run ia:catalogue -- --confirmer       # modèles d'IA du catalogue (prisma/catalog/ia-modeles.ts) et fournisseur OpenRouter
npm run build && npm start        # API sur http://localhost:3000
```

Pour le développement, `npm run dev` relance l'API à chaque modification.

- La documentation OpenAPI est servie sur **http://localhost:3000/api/docs**, en JSON sur `/api/docs/openapi.json`. Une copie versionnée se trouve dans `backend/openapi.json` ; `npm run openapi` la régénère.
- Les frontends sont servis par l'API elle-même (variable `FRONTEND_DIR`), derrière leurs écrans de connexion :
  - Cockpit : http://localhost:3000/connexion, puis http://localhost:3000/
  - Console : http://localhost:3000/console/connexion, puis http://localhost:3000/console
  - Lien de réinitialisation : http://localhost:3000/mot-de-passe/reinitialiser?token=…
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
| `APP_URL` | Adresse publique de l'application, utilisée dans les liens des e-mails (réinitialisation, invitation) | `http://localhost:<PORT>` |
| `COOKIE_SECURE` | Attribut `Secure` des cookies de session ; `false` seulement pour un accès http hors `localhost` | `true` |
| `PWNED_CHECK` | Contrôle complémentaire des mots de passe compromis (Have I Been Pwned, k-anonymat) | `false` |
| `TRUST_PROXY` | Mandataire inverse devant l'API (IP réelle pour le blocage par IP), ex. `1` | — |
| `RISE_INITIAL_ADMIN_PASSWORD` | Mot de passe provisoire du compte initial, lu une seule fois à sa création. À passer au lancement, jamais dans `.env` | — |

## 4. Authentification

Deux écrans de connexion, chacun à son adresse : **`/connexion`** pour l'application (Cockpit) et **`/console/connexion`** pour la plateforme d'administration. Il n'y a pas d'inscription : les comptes sont créés par l'administrateur dans la Console (Utilisateurs), et l'invité reçoit un lien pour choisir son mot de passe. Le détail des règles est dans `docs/DECISIONS.md` (section Authentification).

- **Connexion** : adresse e-mail et mot de passe (Argon2id). En cas d'échec, le message est toujours « Identifiant ou mot de passe incorrect ». Après 5 échecs, la connexion est bloquée 15 minutes.
- **Console** : réservée aux comptes administrateurs. Un autre compte voit « Accès non autorisé », et la tentative est journalisée. `/console` sans session de console renvoie vers `/console/connexion`.
- **Session** : cookie HttpOnly, `Secure`, `SameSite=Strict`, un par surface ; jeton anti-CSRF pour les écritures. Expiration après 30 min d'inactivité (application) ou 15 min (console), avec l'avertissement « Toujours là ? » 60 s avant. Déconnexion : bouton du profil (Cockpit, Console).
- **Mot de passe oublié** : message neutre, lien à usage unique valable 30 minutes. Sans SMTP et avec `AUTH_DEV=true`, le lien est aussi écrit dans le journal du serveur.
- **Compte initial** : Cédric Schmitz (`c.schmitz@groupeonepoint.com`), administrateur de la plateforme et PMO de chaque projet. Son mot de passe provisoire vient de la variable `RISE_INITIAL_ADMIN_PASSWORD` : `outils/start_cockpit.ps1` le demande en saisie masquée si le compte n'existe pas, sinon `RISE_INITIAL_ADMIN_PASSWORD='…' npm run init:admin`. Le script refuse si la variable est absente ou si le compte existe déjà. Le mot de passe doit être changé à la première connexion. `npm run db:seed` vide la base, compte initial compris : relancer ensuite `init:admin` (ou `outils/start_cockpit.ps1`).

### Connexion de développement

Avec `AUTH_DEV=true` (jamais en production), `POST /api/auth/dev-login` délivre un jeton porteur sans mot de passe, pour les tests et l'API :

```bash
curl -X POST localhost:3000/api/auth/dev-login -H 'Content-Type: application/json' -d '{"personId":"p01"}'
```

Dans les écrans, `?as=<personne>` (Cockpit) ou `?as=<compte>` (Console) utilise ce mode au lieu de la session par cookie, par exemple `/RISE%20Cockpit.dc.html?as=p06`. Comptes utiles du jeu de démonstration :

| Qui | Connexion | Droits |
|---|---|---|
| Robin Lefèvre | `{"personId":"p01"}` | PMO sur RISE (et ATLAS) — utilisateur de développement |
| Julien Morel | `{"accountId":"u1"}` | Admin (console) |
| Laurent Garnier | `{"personId":"p03"}` | Directeur de programme, Responsable C8 |
| Karim Benali | `{"personId":"p06"}` | Responsable C5 et C6 |
| Philippe Aubert | `{"personId":"p04"}` | Lecteur C3, décideur (sponsor) |

Les comptes de démonstration n'ont pas de mot de passe. Pour en donner un, utiliser « Mot de passe oublié ? » sur l'écran de connexion : le lien s'affiche dans le journal du serveur.

## 5. Tests

```bash
cd backend
npm test            # unitaires + e2e (Jest + Supertest) sur la base DATABASE_URL_TEST, exécutés en série
npm run test:unit   # règles de domaine seules (sans base)
```

- La base de test est migrée automatiquement, puis réamorcée au début de chaque suite.
- Les tests e2e reprennent les critères d'acceptation des deux briefs (§ 13).
- Tests des frontends dans le navigateur (Chromium sans interface, Playwright). Ils nécessitent un PostgreSQL local (`rise:rise@localhost:5432`) et un `npm run build` préalable :

  ```bash
  npx ts-node --transpile-only test/browser/cockpit.e2e.ts   # 23 vues comparées à l'original + persistance après rechargement
  npx ts-node --transpile-only test/browser/console.e2e.ts   # 13 menus comparés à l'original + actions de la console
  npx ts-node --transpile-only test/browser/format-rapport.e2e.ts   # étape « Format du rapport » de Créer un template, PowerPoint téléchargé (écrit en base)
  ```

  Chaque script amorce sa propre base (`rise_fe_cockpit`, `rise_fe_console`). Le script du Cockpit démarre l’API (port 3101) si besoin ; celui de la console attend une API déjà lancée sur le port 3102 avec `DATABASE_URL=…/rise_fe_console AUTH_DEV=true DEMO_TODAY=2026-09-26 DEMO_NOW=2026-09-26T08:24:00Z JOBS_ENABLED=false OFFLINE=true FRONTEND_DIR=../frontends`. La page du Cockpit est ouverte avec `?e2e=1`, qui expose le composant au test (`window.__riseCockpit`) ; sans ce paramètre, rien n'est exposé.

## 6. Brancher les frontends

Les frontends sont servis par l'API, sur la même origine : aucune configuration CORS n'est nécessaire.

- **Cockpit** : `frontends/api.js` centralise les appels, le jeton et les erreurs.
  - Au montage, le Cockpit charge `GET /api/projects/{projectId}/bootstrap`, qui a la même forme que `rise-data.js` + `planning-data.js`.
  - Chaque écriture est traduite en appel API, puis les données sont rechargées.
  - Paramètres d'URL : `?project=RISE`, et `?as=p06` en développement pour se connecter sous une autre personne (connexion de développement ; sans `?as=`, session par cookie ouverte sur `/connexion`).
- **Console** : `frontends/admin-api.js` remplace les constantes de démonstration par les appels `/api/admin/…` et branche chaque action de l'écran.
  - Paramètre d'URL : `?as=u1` (connexion de développement ; sans `?as=`, session par cookie ouverte sur `/console/connexion`).
- **Écrans de connexion** : `Connexion.dc.html` et `Connexion Console.dc.html` (composant `Authentification.dc.html`), branchés par `frontends/auth-api.js`, qui gère aussi l'expiration après inactivité dans le Cockpit et la Console.
- Le détail et la justification de chaque modification des frontends se trouvent dans `frontends/CHANGES-cockpit.md`, `frontends/CHANGES-console.md` et `frontends/CHANGES-auth.md`.

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
