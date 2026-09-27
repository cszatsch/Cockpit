# Rapport final — backends RISE Cockpit et Console Admin

Ce rapport répond au brief Cockpit § 14 et au brief Console § 14 : ce qui est fait, les tests, les écarts, les questions ouvertes. Les arbitrages et les décisions techniques sont détaillés dans `docs/DECISIONS.md`. Le branchement des frontends est justifié ligne par ligne dans `frontends/CHANGES-cockpit.md` et `frontends/CHANGES-console.md`.

## 1. Ce qui est livré

| Livrable demandé | Emplacement |
|---|---|
| Code source (un seul service NestJS pour les deux backends) | `backend/src/` : `core`, `domain`, `cockpit`, `import`, `admin` |
| Migrations (schéma, trigger du journal d'audit en ajout seul, console) | `backend/prisma/migrations/` |
| Script d'amorçage (RISE depuis `rise-data.js` et `planning-data.js`, démonstration de la console) | `backend/prisma/seed/`, `npm run db:seed` |
| `openapi.json` (172 chemins, 242 opérations), aussi servi sur `/api/docs` | `backend/openapi.json`, `npm run openapi` |
| `README.md` : installation, variables, lancement, tests, branchement | racine du dépôt |
| `DECISIONS.md` : arbitrages Q1 à Q12 et décisions documentées | `docs/DECISIONS.md` |
| `api.js` et le Cockpit branché | `frontends/api.js`, `frontends/RISE Cockpit.dc.html` |
| `admin-api.js` et la console branchée | `frontends/admin-api.js` et les quatre écrans de la console |
| Docker (API et PostgreSQL) | `docker-compose.yml`, `backend/Dockerfile` |
| Écrans de connexion (application et console), mot de passe oublié, compte initial (spécification AUTH) | `frontends/Connexion.dc.html`, `frontends/Connexion Console.dc.html`, `frontends/Authentification.dc.html`, `frontends/auth-api.js`, `backend/src/core/auth/`, `npm run init:admin` |

Étapes du plan (`docs/02-PLAN.md`), toutes réalisées :

1. Socle : authentification JWT liée à une session révocable, format d'erreur unique, journal d'audit, ETag / If-Match, OpenAPI.
2. Droits effectifs (RG5), `/api/me`, Référentiel : CRUD générique, usages bloquants (`409 IN_USE`), relations N-N.
3. Amorçage et `GET /bootstrap` (même forme que `rise-data.js` + `planning-data.js`).
4. Jalons, Pilotage (risques, problèmes, actions, décisions, arbitrage, planning, livrables, avancement, baromètre, budget, anomalies), Comités et rapports, Aujourd'hui, Mes tâches.
5. Import Excel du Référentiel (moteur commun au Cockpit et à la console), documents, commentaires de cellule, historique, Jev, météo et actualités par proxy.
6. Console Admin : comptes et habilitations, administrateurs, audit, fournisseurs et clés chiffrées, affectation des modèles, consommation et plafonds, snapshots, notifications, modules, bibliothèque et initialisation de projet, tâches planifiées.
7. Branchement des deux frontends, README, vérification dans le navigateur.
8. Authentification (spécification AUTH, 28/09/2026) : écrans `/connexion` et `/console/connexion`, mots de passe Argon2id, blocage temporaire, sessions par cookie avec CSRF et expiration après inactivité, mot de passe oublié par lien à usage unique, invitations par lien, compte initial.

## 2. Tests

| Suite | Contenu | Résultat |
|---|---|---|
| `npm test` (Jest + Supertest, base `rise_test`) | 14 tests unitaires des règles de domaine ; 85 tests e2e qui reprennent les critères d'acceptation des deux briefs (§ 13) : droits, Référentiel, Pilotage, bootstrap, import, annexes, console ; 23 tests e2e de l'authentification (`auth.spec.ts`) : cookies, CSRF, message générique, blocage par adresse (compte existant ou non), console refusée et journalisée, inactivité, rotation, déconnexion, mot de passe oublié (message neutre, lien haché, usage unique, expiration, renvoi limité, règles, mot de passe compromis ou identique), invitation, changement depuis le profil (mot de passe actuel, autres sessions fermées, rotation), compte initial, adresses des pages | **9 suites, 124 tests verts** |
| `test/browser/cockpit.e2e.ts` (Chromium, Playwright) | 23 vues, 48 écrans comparés au pixel près avec le frontend d'origine ; 20 contrôles de persistance après rechargement | **0 erreur JS, 20/20 contrôles** ; écart moyen 0,1 %, maximum 3,5 % (voir § 3.3) |
| `test/browser/console.e2e.ts` | 12 menus comparés avec l'origine ; actions réelles (suspension, plafond, règle, snapshot, import ORION, clés, invitation, envoi de test) vérifiées après rechargement et dans l'API ; mode démonstration | **34/34 vérifications** ; écarts de 0 à 1,7 % |
| `test/browser/cockpit.stores.ts` | Sonde : modifie chaque magasin synchronisé du Cockpit et liste les appels émis | Tous les appels aboutissent |
| Écrans de connexion (vérification manuelle dans le navigateur, 28/09/2026) | Erreur générique avec tentatives restantes ; première connexion du compte initial avec refus d'un mot de passe compromis ; arrivée sur le Cockpit ; « Toujours là ? » (Échap = rester connecté) puis expiration ; console : connexion, déconnexion, mot de passe oublié, lien ouvert avec l'habillage console, réinitialisation, refus d'un compte non administrateur ; affichage mobile (375 px, sans défilement horizontal) ; « Mon profil › Sécurité › Modifier » dans le Cockpit et la Console (mot de passe actuel refusé, changement, session conservée, autres sessions fermées) | Conforme. Les trois scripts Playwright ci-dessus n'ont pas été relancés après ce changement (voir § 3.5) |

## 3. Écarts connus

### 3.1 Écarts par rapport aux briefs

- **Routes IA alternatives du brief Cockpit § 9.11** : non implémentées. Jev passe par `POST /assistant/messages` et par la validation des propositions (`/assistant/changes/{id}/confirm|reject`), c'est-à-dire ce que le frontend utilise.
- **Pagination `?limit&cursor`** : implémentée uniquement pour le journal d'audit de la console. Les autres listes sont petites et renvoyées en entier, comme le frontend les attend.
- **LLM, Jev, météo et actualités** : la passerelle LLM est un bouchon déterministe qui enregistre malgré tout la consommation (jetons, coût, bascule vers le modèle de secours). Hors ligne (`OFFLINE=true`), la météo et les actualités répondent `503` et la tuile affiche son état d'erreur habituel.
- **Ajout au modèle de données** : `NotificationRule.trigger` indique ce qui déclenche une règle (le brief ne le précise pas). La console n'a pas de sélecteur pour ce champ ; les règles de démonstration l'ont reçu à l'amorçage.
- **Données corrigées par les règles (Q5, Q6, Q9)** : COPIL n°24, `late` recalculé, signal d'avancement recalculé, affectations régénérées à partir de `PERSON.cells[4]`. Les écrans concernés affichent donc la valeur calculée au lieu de la valeur figée du jeu de démonstration.

### 3.2 Limites du branchement du Cockpit

- **Commentaires de cellule** : leur clé est `onglet|libellé de ligne|colonne`. Renommer une ligne détache ses commentaires, et la valeur de la cellule au moment du commentaire n'est pas stockée.
- **Surcharges de « Mes tâches »** : repérées par leur position dans la liste recalculée. Si la liste change dans le même geste, la surcharge peut viser un autre objet.
- **Rapport téléchargé mais non versé** : il ne laisse aucune trace côté serveur, et son entrée de journal disparaît au rechargement.
- **Ligne créée puis modifiée en moins d'une seconde** : tant que la ligne n'a pas reçu son identifiant serveur, la modification est perdue.
- **Chantiers et sous-phases sans dates** : absents du Gantt, parce que l'écran d'origine ne sait pas les dessiner.
- **Date de l'en-tête « Aujourd'hui »** : le frontend affiche la date du navigateur, alors que les calculs du serveur utilisent `DEMO_TODAY` en démonstration.

### 3.3 Écarts visuels mesurés

- **Cockpit, Dispositif (3,5 %)** : l'historique des rôles est plus court, conséquence des affectations régénérées (Q6).
- **Cockpit, Aujourd'hui (0,2 %)** : seul le bloc « Incohérences à traiter » diffère. Dans l'original, ses lignes sont des textes figés de `rise-data.js` (par exemple « Jalon Go / No-Go replanifié… »). Le serveur les calcule selon les règles du brief (§ 7.13 et § 9) : risque critique sans plan, jalon non confirmé depuis plus de 14 jours, budget non renseigné, modifications depuis la dernière capture, actions échues. Les widgets eux-mêmes (`Widget.dc.html`, fourni après la première livraison et ajouté tel quel) s'affichent à l'identique.
- **Console** : écarts entre 0 et 1,7 %. Ils viennent de données mesurées au lieu de données générées (consommation, projection), du module Budget inactif (Q10) et de la carte « Charger l'exemple », masquée hors démonstration.

### 3.4 Limites du branchement de la console

- **Horodatage** : les écritures sont horodatées à l'heure réelle, même quand `DEMO_NOW` est défini.
- **Sessions** : chaque navigateur sans jeton ouvre une session de développement, visible dans « Mon profil › Sécurité ».
- **Identité** : l'écran considère toujours `u1` comme l'utilisateur courant. Cela affecte les libellés « moi » et les filtres, pas les droits.
- **Habilitations** : `habOf` lit encore les habilitations dans `rise-data.js` pour certains libellés.
- **Écrans manquants** : il n'y a pas d'écran pour l'export d'un snapshot ni pour les demandes d'invitation venues du Cockpit (Q8 bis). Les routes existent : `GET /api/admin/snapshots/{id}/export`, `GET /api/admin/invitation-requests` avec `…/{id}/approve` et `…/{id}/reject`. Les demandes d'invitation apparaissent aussi dans « À traiter » de la vue d'ensemble, mais sans bouton pour les valider.

### 3.5 Authentification

- **Tests navigateur non relancés** : `cockpit.e2e.ts`, `console.e2e.ts` et `cockpit.stores.ts` passent maintenant `?as=` (connexion de développement), puisque sans ce paramètre les pages exigent une session. Ils n'ont pas été relancés sur ce poste : ils supposent PostgreSQL sur le port 5432 et `python3`, absents ici. Le mode `?as=` est le code d'avant, à l'option `credentials` de `fetch` près.
- **Blocage par IP** : 20 échecs par IP au lieu de 5, pour ne pas bloquer tout un bureau derrière la même adresse (`IP_MAX_FAILURES`).
- **Mots de passe compromis** : liste locale des mots de passe courants qui passent les règles, plus Have I Been Pwned en option (`PWNED_CHECK=true`). Il n'y a pas de liste complète embarquée.
- **Délai de la console** : l'expiration suit l'activité des onglets de la console ; l'activité dans le Cockpit ne la prolonge pas, puisque les sessions sont distinctes.
- **Composant livré** : ses trois formulaires n'avaient pas de gestionnaire accessible au moteur (`onLogin`, `onForgot` et `onSetPwd` hors de `renderVals()`), si bien que la soumission rechargeait la page. C'est corrigé et consigné dans `frontends/CHANGES-auth.md`.
- **Réinitialisation de la base** : `npm run db:seed` (et `demarrer-rise.ps1 -Reinitialiser`) vide aussi le compte initial. Le script de démarrage redemande alors son mot de passe provisoire.

## 4. Questions ouvertes

1. **Déclencheur des règles de notification** : faut-il ajouter un sélecteur de déclencheur dans la console ? Aujourd'hui, une règle créée depuis l'écran reçoit un déclencheur par défaut : « planifié » pour une notification, « manuel » pour une alerte.
2. **Clé stable des commentaires de cellule** : faut-il que le Cockpit expose un identifiant de ligne ? Cela rendrait les commentaires insensibles aux renommages, mais demande de modifier chaque tableau du frontend.
3. **Écrans manquants de la console** : faut-il ajouter l'export d'un snapshot et le traitement des demandes d'invitation ?
4. **Identité dans la console** : faut-il remplacer `u1` par le compte connecté (`GET /api/admin/me`) ? La modification est simple, mais elle touche plusieurs libellés.
5. **Fournisseur d'identité (SSO)** : il est hors périmètre (Q11). L'authentification par mot de passe (spécification AUTH) est en place ; un passage à OIDC ne toucherait que `core/auth` et les écrans de connexion.
6. ~~Double authentification~~ : tranché le 28/09/2026, pas pour l'instant ; les mentions « Activée » sont retirées (`docs/DECISIONS.md`).
7. ~~Changement de mot de passe depuis le profil~~ : tranché le 28/09/2026, oui ; branché dans le Cockpit et la Console.
