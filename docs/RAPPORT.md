# Rapport final — backends RISE Cockpit et Console Admin

Ce rapport répond au brief Cockpit § 14 et au brief Console § 14 : ce qui est fait, les tests, les écarts, les questions ouvertes. Les arbitrages et les décisions techniques sont détaillés dans `docs/DECISIONS.md`. Le branchement des frontends est justifié ligne par ligne dans `frontends/CHANGES-cockpit.md` et `frontends/CHANGES-console.md`.

## 1. Ce qui est livré

| Livrable demandé | Emplacement |
|---|---|
| Code source (un seul service NestJS pour les deux backends) | `backend/src/` : `core`, `domain`, `cockpit`, `import`, `admin` |
| Migrations (schéma, trigger du journal d'audit en ajout seul, console) | `backend/prisma/migrations/` |
| Script d'amorçage (RISE depuis `rise-data.js` et `planning-data.js`, démonstration de la console) | `backend/prisma/seed/`, `npm run db:seed` |
| `openapi.json` (166 chemins, 236 opérations), aussi servi sur `/api/docs` | `backend/openapi.json`, `npm run openapi` |
| `README.md` : installation, variables, lancement, tests, branchement | racine du dépôt |
| `DECISIONS.md` : arbitrages Q1 à Q12 et décisions documentées | `docs/DECISIONS.md` |
| `api.js` et le Cockpit branché | `frontends/api.js`, `frontends/RISE Cockpit.dc.html` |
| `admin-api.js` et la console branchée | `frontends/admin-api.js` et les quatre écrans de la console |
| Docker (API et PostgreSQL) | `docker-compose.yml`, `backend/Dockerfile` |

Étapes du plan (`docs/02-PLAN.md`), toutes réalisées :

1. Socle : authentification JWT liée à une session révocable, format d'erreur unique, journal d'audit, ETag / If-Match, OpenAPI.
2. Droits effectifs (RG5), `/api/me`, Référentiel : CRUD générique, usages bloquants (`409 IN_USE`), relations N-N.
3. Amorçage et `GET /bootstrap` (même forme que `rise-data.js` + `planning-data.js`).
4. Jalons, Pilotage (risques, problèmes, actions, décisions, arbitrage, planning, livrables, avancement, baromètre, budget, anomalies), Comités et rapports, Aujourd'hui, Mes tâches.
5. Import Excel du Référentiel (moteur commun au Cockpit et à la console), documents, commentaires de cellule, historique, Jev, météo et actualités par proxy.
6. Console Admin : comptes et habilitations, administrateurs, audit, fournisseurs et clés chiffrées, affectation des modèles, consommation et plafonds, snapshots, notifications, modules, bibliothèque et initialisation de projet, tâches planifiées.
7. Branchement des deux frontends, README, vérification dans le navigateur.

## 2. Tests

| Suite | Contenu | Résultat |
|---|---|---|
| `npm test` (Jest + Supertest, base `rise_test`) | 14 tests unitaires des règles de domaine ; 85 tests e2e qui reprennent les critères d'acceptation des deux briefs (§ 13) : droits, Référentiel, Pilotage, bootstrap, import, annexes, console | **8 suites, 99 tests verts** |
| `test/browser/cockpit.e2e.ts` (Chromium, Playwright) | 23 vues, 48 écrans comparés au pixel près avec le frontend d'origine ; 20 contrôles de persistance après rechargement | **0 erreur JS, 20/20 contrôles** ; écart moyen 0,4 % (voir § 3.3) |
| `test/browser/console.e2e.ts` | 12 menus comparés avec l'origine ; actions réelles (suspension, plafond, règle, snapshot, import ORION, clés, invitation, envoi de test) vérifiées après rechargement et dans l'API ; mode démonstration | **34/34 vérifications** ; écarts de 0 à 1,7 % |
| `test/browser/cockpit.stores.ts` | Sonde : modifie chaque magasin synchronisé du Cockpit et liste les appels émis | Tous les appels aboutissent |

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
- **Cockpit, Aujourd'hui (jusqu'à 7,6 % selon le moment de la capture)** : les widgets s'appuient sur `Widget.dc.html`, qui **ne fait pas partie des fichiers livrés**. Les deux versions affichent donc des emplacements vides. La version branchée les affiche un peu plus tard, une fois les données du serveur chargées. Après quelques secondes, les deux rendus sont identiques.
- **Console** : écarts entre 0 et 1,7 %. Ils viennent de données mesurées au lieu de données générées (consommation, projection), du module Budget inactif (Q10) et de la carte « Charger l'exemple », masquée hors démonstration.

### 3.4 Limites du branchement de la console

- **Horodatage** : les écritures sont horodatées à l'heure réelle, même quand `DEMO_NOW` est défini.
- **Sessions** : chaque navigateur sans jeton ouvre une session de développement, visible dans « Mon profil › Sécurité ».
- **Identité** : l'écran considère toujours `u1` comme l'utilisateur courant. Cela affecte les libellés « moi » et les filtres, pas les droits.
- **Habilitations** : `habOf` lit encore les habilitations dans `rise-data.js` pour certains libellés.
- **Écrans manquants** : il n'y a pas d'écran pour l'export d'un snapshot ni pour les demandes d'invitation venues du Cockpit (Q8 bis). Les routes existent : `GET /api/admin/snapshots/{id}/export`, `GET /api/admin/invitation-requests` avec `…/{id}/approve` et `…/{id}/reject`. Les demandes d'invitation apparaissent aussi dans « À traiter » de la vue d'ensemble, mais sans bouton pour les valider.

## 4. Questions ouvertes

1. **Déclencheur des règles de notification** : faut-il ajouter un sélecteur de déclencheur dans la console ? Aujourd'hui, une règle créée depuis l'écran reçoit un déclencheur par défaut : « planifié » pour une notification, « manuel » pour une alerte.
2. **Clé stable des commentaires de cellule** : faut-il que le Cockpit expose un identifiant de ligne ? Cela rendrait les commentaires insensibles aux renommages, mais demande de modifier chaque tableau du frontend.
3. **Écrans manquants de la console** : faut-il ajouter l'export d'un snapshot et le traitement des demandes d'invitation ?
4. **Identité dans la console** : faut-il remplacer `u1` par le compte connecté (`GET /api/admin/me`) ? La modification est simple, mais elle touche plusieurs libellés.
5. **`Widget.dc.html`** : ce composant est référencé par l'écran Aujourd'hui mais absent des fichiers livrés. Pouvez-vous le fournir ?
6. **Fournisseur d'identité (SSO)** : il est hors périmètre (Q11). L'AuthGuard accepte un jeton porteur, et le passage à OIDC ne touche que `core/auth`.
