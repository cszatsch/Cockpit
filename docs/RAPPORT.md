# Rapport final — backends RISE Cockpit et Console Admin

Ce rapport répond au brief Cockpit § 14 et au brief Console § 14 : ce qui est fait, les tests, les écarts, les questions ouvertes. Les arbitrages et les décisions techniques sont détaillés dans `docs/DECISIONS.md`. Le branchement des frontends est justifié ligne par ligne dans `frontends/CHANGES-cockpit.md` et `frontends/CHANGES-console.md`.

## 1. Ce qui est livré

| Livrable demandé | Emplacement |
|---|---|
| Code source (un seul service NestJS pour les deux backends) | `backend/src/` : `core`, `domain`, `cockpit`, `import`, `admin` |
| Migrations (schéma, trigger du journal d'audit en ajout seul, console) | `backend/prisma/migrations/` |
| Script d'amorçage (RISE depuis `rise-data.js` et `planning-data.js`, démonstration de la console) | `backend/prisma/seed/`, `npm run db:seed` |
| `openapi.json` (173 chemins, 245 opérations), aussi servi sur `/api/docs` | `backend/openapi.json`, `npm run openapi` |
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
| `npm test` (Jest + Supertest, base `rise_test`) | 14 tests unitaires des règles de domaine ; 85 tests e2e qui reprennent les critères d'acceptation des deux briefs (§ 13) : droits, Référentiel, Pilotage, bootstrap, import, annexes, console ; 23 tests e2e de l'authentification (`auth.spec.ts`) : cookies, CSRF, message générique, blocage par adresse (compte existant ou non), console refusée et journalisée, inactivité, rotation, déconnexion, mot de passe oublié (message neutre, lien haché, usage unique, expiration, renvoi limité, règles, mot de passe compromis ou identique), invitation, changement depuis le profil (mot de passe actuel, autres sessions fermées, rotation), compte initial, adresses des pages ; 5 tests des modèles d'IA (`ai-models.spec.ts`) : catégorie, ajout, suppression, LLM obligatoire, réinitialisation ; 8 tests unitaires du test réel des clés (`provider-key-tester.spec.ts`) : requête et authentification par fournisseur, 2xx, 401, 400 de Google, 429, réseau, délai, fournisseur non reconnu ; pipeline Documents et fiche modèle (`ai-models.spec.ts` réécrit, 8 tests ; `ai-pricing.spec.ts`, 4 tests unitaires : coût tokens / requêtes, tarif selon la catégorie, ancienneté, chaîne) | **12 suites, 144 tests verts** |
| `test/browser/cockpit.e2e.ts` (Chromium, Playwright) | 23 vues, 48 écrans comparés au pixel près avec le frontend d'origine ; 20 contrôles de persistance après rechargement | **0 erreur JS, 20/20 contrôles** ; écart moyen 0,1 %, maximum 3,5 % (voir § 3.3) |
| `test/browser/console.e2e.ts` | 12 menus comparés avec l'origine ; actions réelles (suspension, plafond, règle, snapshot, import ORION, clés, invitation, envoi de test) vérifiées après rechargement et dans l'API ; mode démonstration | **34/34 vérifications** ; écarts de 0 à 1,7 % |
| `test/browser/cockpit.stores.ts` | Sonde : modifie chaque magasin synchronisé du Cockpit et liste les appels émis | Tous les appels aboutissent |
| Écrans de connexion (vérification manuelle dans le navigateur, 28/09/2026) | Erreur générique avec tentatives restantes ; première connexion du compte initial avec refus d'un mot de passe compromis ; arrivée sur le Cockpit ; « Toujours là ? » (Échap = rester connecté) puis expiration ; console : connexion, déconnexion, mot de passe oublié, lien ouvert avec l'habillage console, réinitialisation, refus d'un compte non administrateur ; affichage mobile (375 px, sans défilement horizontal) ; « Mon profil › Sécurité › Modifier » dans le Cockpit et la Console (mot de passe actuel refusé, changement, session conservée, autres sessions fermées) ; console sans aucun modèle (tous les menus sans erreur), ajout d'un Embedding et d'un LLM, affectation limitée aux LLM, suppression, changement de catégorie refusé pour un modèle affecté ; test réel des clés depuis le poste (28/09/2026) : les clés de démonstration sont refusées par Anthropic, OpenAI et Mistral AI (401) et par Google (400), avec le message de chacun | Conforme. Les trois scripts Playwright ci-dessus n'ont pas été relancés après ce changement (voir § 3.5) |

- **Jev de la Console (28/09/2026)** : `test/e2e/guidage.spec.ts` passe de 3 à 20 tests : ordre du prompt système, Persona modifié pris en compte, skill reconnue sans tenir compte de la casse, skill désactivée, questions à mots-clés passées au modèle avec leurs données et leurs actions, faits de la page (bornés), refus des clés sans modèle, changement d’affectation, bascule sur le secours, modèles indisponibles ; génération réelle simulée (double de `fetch`) : requête Anthropic, identifiant chez le fournisseur, bascule vers OpenAI, double échec sans fuite de clé, autres fonctions sur le bouchon. 3 tests unitaires (nom de skill, message au modèle, protocole). `npm test` : 207 tests, tous verts. Vérification réelle sur une seconde instance (port 3001) : trois questions, réponses de Claude Haiku 4.5 avec la voix du Persona, consommation tracée.

- **Moteur de mots-clés supprimé (28/09/2026)** : `guidage.spec.ts` vérifie que les questions autrefois interceptées (relance, coût, snapshot, suspension, clé API) partent telles quelles au modèle, sans réponse toute faite ni action ; qu'aucune clé n'entre dans ce qui part au modèle ; que le champ `facts` est refusé. `npm test` : 207 tests, tous verts. Vérifié dans le navigateur (instance de test sur le port 3001) : page chargée, nouveaux textes du panneau, réponses de Claude Haiku 4.5.

- **Dictionnaire des données du Jev de la Console (28/09/2026)** : `test/e2e/dictionnaire.spec.ts`, 46 tests : une vue par fiche, colonnes des 31 vues identiques aux colonnes documentées, fiches complètes, tables du dictionnaire conformes à la source ; aucune colonne ni valeur secrète (empreinte de mot de passe, clés de démonstration, chiffrés, clé en clair dans un endpoint masquée) ; 10 questions de référence égales aux écrans (comptes par statut, invitations sans réponse et expirées, fournisseurs opérationnels, dernier snapshot, dépense et projection du mois, statut du plafond global, état des fonctions IA, appels du jour et état des cartes API, actions sensibles récentes). `npm test` : 253 tests, tous verts. Dictionnaire chargé dans la base locale (31 fiches).

- **Jev interroge les données (Text-to-SQL, 28/09/2026)** : `test/unit/jev-sql.spec.ts` (22 tests : extraction, requêtes acceptées et refusées, sources, dictionnaire et consignes, mise en forme des résultats) et `test/e2e/jev-sql.spec.ts` (13 tests, modèle simulé : prompt de la Console + dictionnaire lu en base + date du jour, résultats réels transmis, fiche désactivée non envoyée, réponse directe sans données, correction après erreur, double échec, écriture refusée ; garanties de la base : lecture des vues permise, écriture impossible, tables réelles et secrets inaccessibles, `set_config` et `query_to_xml` refusés, 5 s et 200 lignes au plus). `npm test` : 288 tests, tous verts. Essai réel (Claude Haiku 4.5, instance de test) : « Quels sont les modèles LLM utilisés par Anthropic ? » → les 3 modèles, sorties et tarifs exacts, « Sources : modèles IA » ; invitations en attente exactes ; dépense du mois : 0,12 €, écart avec l'écran expliqué en question 23.

- **Consommation et coûts, toutes les lignes (29/09/2026)** : 2 tests dans `console.spec.ts` (une ligne par ligne budgétaire même sans plafond ; plafonds Guidage console et Documents modifiables, étape refusée). `npm test` : 290 tests, tous verts. Vérifié dans le navigateur : six lignes (Budget global, Insights, Rapports, Guidage console, Documents, Gestion des données) avec les modèles réellement affectés, en mode API comme en démonstration ; plus de « NaN % ».

- **Journal des appels (29/09/2026)** : `test/e2e/journal.spec.ts` (10 tests, recette § 6 : appel avec identifiant `req_`, tarifs figés, durée et coût recalculé ; tarif du catalogue modifié sans effet sur les appels passés ; secours ; jours vides ; coûts entrée + sortie = dépense de Consommation et coûts, jetons et appels identiques ; filtre Guidage console ; Documents et fournisseur ; pagination par curseur sans doublon ni oubli ; CSV BOM / « ; » / virgule, lignes = total ; paramètres et droits) et `test/unit/journal.spec.ts` (6 tests). `npm test` : 306 tests, tous verts. Vérifié en réel (instance de test sans date de démonstration) : vue montée dans la Console sous Consommation et coûts ; 23 appels, graphique, ligne ouverte (requête, durée, calcul « 6 683 × 0,88 €/M + 136 × 4,38 €/M = 0,006 € ») ; bascule Coûts 0,22 € = dépense de Consommation et coûts ; pagination 10 → 20 sur 23 ; filtres ; CSV. Constat : la rédaction des notifications budgétaires est comptée sur la fonction Insights (comportement antérieur, inchangé).

- **Renommage et journal sans données fictives (29/09/2026)** : `npm test` 306 tests verts. Vérifié dans le navigateur sur l’API locale non relancée (port 3000, route `/usage/daily` absente) : libellés renommés dans la sidebar et les pages, journal vide sans aucune donnée fictive ; mode démonstration (`?demo=1`) intact.

- **Date réelle du jour (29/09/2026)** : `npm test` 306 tests verts (les tests gardent leur date figée). Vérifié dans le navigateur (instance de test, `.env` sans date de démonstration) : Console « Mardi 29 septembre 2026 », prochain snapshot « ven. 2 oct. 04:00 », Vue générale des coûts et journal au mois en cours (25 appels, dont ceux du 29/09) ; Cockpit « Mardi 29 septembre 2026 », Go-Live J-184 (1er avr. 2027), prochain COPIL « 26 oct. · Comité de pilotage n°21 · 14:00 ». Les tests navigateur de comparaison au pixel avec les frontends d’origine (`test/browser`) n’ont pas été relancés : les dates affichées diffèrent désormais par construction.

- **Sidebar Console v3 (29/09/2026)** : recette § 5 vérifiée dans le navigateur (API locale) : colonne de 300 px, Vue d’ensemble 46 px, pages 42 px, titres de domaine en capitales 11 px, aucun titre tronqué (« Journal consommation et coûts », « Initialisation d’un projet ») ; ouverture d’IA au clic (titre sarcelle, filet reliant ses pages) ; arrivée sur Snapshots depuis la Vue d’ensemble : Projets déplié, IA replié ; aucune barre ambre ; mode rail 72 px ; mode mobile (tiroir de 300 px, nom de Jev). Navigation au clavier non testée. `npm test` : 306 tests verts.

- **Dictionnaire des données du Cockpit (29/09/2026)** : `test/e2e/dictionnaire-cockpit.spec.ts` (44 tests) : une vue par fiche et colonnes identiques pour les 33 vues, `projet_id` partout, une règle de droits par fiche, tables du dictionnaire conformes ; aucun chemin de stockage lisible ; vues fermées au rôle de lecture de Jev ; questions de référence égales au Cockpit (actions en retard, risques critiques sans plan, jalons non confirmés, compteurs du suivi des livrables, prochain COPIL, risques visibles du PMO). `npm test` : 350 tests verts. Dictionnaire chargé dans la base locale (31 fiches Console, 33 Cockpit).

- **Suppression des règles, {date} du jour, déconnexion (29/09/2026)** : 2 tests dans `console.spec.ts` ({date} = date du jour dans l’aperçu et l’envoi de test ; suppression 204, liste, historique conservé, audit, 403 pour le PMO, 404 ensuite). `npm test` : 352 tests verts. Vérifié dans le navigateur : aperçu « RISE · 29 sept. 2026 », confirmation puis suppression d’une règle non enregistrée, icône de déconnexion visible au survol de l’avatar et masquée sinon.

- **Vue « Notifications et alertes » (29/09/2026)** :
  - Tests automatiques : 7 tests unitaires (`test/unit/notification-rules.spec.ts` : conversions, aller-retour, calendrier, cas bloquants, historique) et 3 tests e2e (`console.spec.ts` § 7 bis : format `Rule`, destinataires par profil, historique filtré, création sous l'identifiant de la vue, 409, contrôles d'enregistrement, activation d'une règle bloquée, test refusé puis accepté avec le brouillon, suppression, audit ; une règle sans destinataire n'envoie rien).
  - Recette dans le navigateur, avec l'API et une base de démonstration :
    - les 7 points du § 5 sont conformes ;
    - le dernier canal ne peut pas être retiré ;
    - changer de règle avec un brouillon demande une confirmation ;
    - la suppression se fait en deux clics ;
    - le serveur refuse `{reponse_llm}` dans le prompt, et la vue revient à l'état réel ;
    - à 900 px de large, aucun débordement et aucun libellé de bouton sur deux lignes (33 boutons mesurés, y compris le pied en mode brouillon et « Confirmer la suppression »).
  - Test navigateur Playwright adapté (message de confirmation du composant, envoi vérifié dans l'historique), mais non relancé.

- **Historique des envois sans données factices (29/09/2026)** : jeu d’essai déplacé dans `seedDemoDeliveries()`, chargé par les tests seulement ; 10 envois factices supprimés de la base locale (7 envois réels conservés). `npm test` : 362 tests verts.

- **Registre des cartes API v3c (29/09/2026)** :
  - Tests automatiques : 3 tests unitaires (`test/unit/widgets.spec.ts` : catalogue identique à celui du Cockpit, identifiants, latence médiane). Les seuils de `api-cards.spec.ts` passent à 60 jours et 80 %. 1 test e2e (`api-cards.spec.ts`) : catalogue, tag libre, association (422 si le widget est inconnu), clé dans le `PATCH` (4 derniers caractères seulement), endpoint modifié, latence médiane, retrait de la clé. La suppression d'une carte liée à un widget est désormais permise, avec les widgets cités dans la trace.
  - Recette navigateur, composant seul (démonstration) : les 7 points du § 7 sont conformes.
  - Recette navigateur, Console branchée sur l'API (base de recette avec les 29 cartes de démonstration côté serveur) : mêmes états (21 opérationnelles, 3 lentes, 3 à surveiller, 2 en erreur, 13 sans widget). Points 1, 2, 4, 5, 6 et 7 conformes (requêtes vérifiées : `PUT …/widgets`, `DELETE` 5 s après la confirmation et aucun en cas d'annulation, `POST`, `PATCH { enabled }`).
  - Point 3 avec l'API : le `PATCH` porte la clé saisie et le serveur ne renvoie que « A1B2 » ; le test appelle réellement Pappers, qui refuse une clé fictive (401). Le 200 OK n'est vérifiable qu'avec une vraie clé ; en démonstration, il est conforme.
  - Endpoint modifié : latence « — », dernière réponse effacée, pastille « Non vérifiée ».
  - Côte à côte (1680 px), les colonnes ont la même hauteur (746 px) et le pied du panneau est ancré en bas.
  - À 900 px : aucun libellé de bouton sur deux lignes (47 à 69 boutons, en vue, modification, confirmation, nouvelle carte et liste des widgets) et aucun défilement de la page.
  - Avec 100 cartes : 3 rangées de pastilles au plus par tag, légende exacte, colonnes de même hauteur.
  - Test navigateur Playwright non relancé ; il ne vise pas cet écran.

- **Serveur d'envoi SMTP (29/09/2026)** :
  - Tests automatiques : 5 tests unitaires (`test/unit/smtp.spec.ts` : ports, validation, classement des échecs, valeurs d'environnement, lecture des réponses) et 5 tests e2e (`test/e2e/smtp.spec.ts`, contre un faux serveur SMTP local) :
    - lecture et droits, mot de passe chiffré, jamais renvoyé et conservé si vide ;
    - vrai dialogue : succès, 535, 530, 553, ECONNREFUSED, hôte introuvable, serveur muet ;
    - e-mail de test, et canal E-mail d'une règle de notification remis par ce serveur.
  - Vrai serveur Gmail, avec un identifiant fictif : 535 à l'authentification (TLS 1.3 négocié), 530 STARTTLS exigé et « SSL routines: wrong version number » au chiffrement, « Greeting never received » (465 avec STARTTLS), 530 « Authentication Required » sans authentification.
  - Recette navigateur (Console branchée sur l'API) :
    - points 1, 3, 4, 5, 6 et 8 conformes contre Gmail ;
    - points 2 et 7 (connexion validée, e-mail de test remis) contre un faux serveur local, faute du vrai mot de passe d'application, qui ne peut être saisi que par le commanditaire ;
    - ports proposés (587 / 465 / 25), alerte « en clair » et « Chiffrer », test invalidé par une modification, envoi de l'e-mail de test impossible avant une connexion validée ;
    - enregistrement : mot de passe chiffré en base et effacé du champ ; une notification envoyée par e-mail passe par ce serveur ;
    - 900 px : ni débordement ni libellé de bouton sur deux lignes.
  - Registre : carte API requise (2 tests e2e mis à jour), « EXP. CLÉ » sur une ligne dans sa colonne de 88 px.

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

### 3.6 Modèles d'IA

- **Jeu de démonstration sans modèle** : les tests navigateur de la console (`console.e2e.ts`) comparent l'affectation et la consommation au rendu d'origine, qui avait des modèles ; ils ne sont plus comparables tels quels sur une base amorcée par `db:seed`.
- **Tarifs** : un Embedding ou un Reranking garde les deux tarifs « entrée » et « sortie » en € par million de tokens ; la sortie vaut en général 0. Un Reranking facturé à la requête n'est pas représentable.
- **Jev et analyse de documents (Cockpit)** : aucun modèle n'étant affecté après la réinitialisation, Jev et l'analyse de documents répondent « indisponible » (`503 AI_UNAVAILABLE`) jusqu'à l'affectation d'un LLM.

### 3.7 Test des clés d'API

- **Réseau** : le test part du serveur de l'API. Derrière un proxy d'entreprise non configuré pour Node.js, les fournisseurs apparaissent « injoignables », ce qui n'est pas une erreur de clé.
- **Fournisseurs** : seuls les fournisseurs reconnus (Anthropic, OpenAI, Mistral AI, Google Gemini, Cohere, Groq, DeepSeek, xAI) sont testables ; un autre nom donne « Test impossible ». Un fournisseur compatible OpenAI hébergé ailleurs (adresse propre) demanderait un champ d'adresse, absent aujourd'hui.
- **Génération** : la passerelle LLM reste un bouchon pour le Jev du Cockpit et les notifications. Depuis le 28/09/2026, le Jev de la Console (fonction `guidage`) génère réellement chez le fournisseur ; vérifié sur la base locale : Claude Haiku 4.5, environ 5 400 jetons en entrée (prompt système avec Identité, Soul et skill), 0,006 € par question.

### 3.8 Pipeline Documents et fiche modèle

- **Vérification navigateur (28/09/2026)** : affectation (chaîne Documents à trois étapes, listes filtrées par catégorie, étape 3 sur secours quand la clé Google est refusée, enregistrement avec la confirmation de la console), vue réseau (chaîne regroupée sous Documents), fiche modèle (champs selon la catégorie, Reranking à la requête, refus du serveur affiché sans fermer la fiche), mode démonstration (chaîne « Interrompue à l'étape 1 »). Aucune erreur JavaScript.
- **Bouchon** : la vectorisation et le reclassement ne font pas de vraie recherche sémantique ; ils tracent seulement leur consommation. La Synthèse reste le bouchon de la passerelle LLM.
- **Volume des étapes** : tant qu'aucun document n'est passé par la chaîne, les volumes (et donc les coûts estimés) de Vectorisation et de Reclassement valent zéro.
- **Seuils d'ancienneté** : 12 et 24 mois, marqués « à confirmer » dans la spécification.
- **Ta base locale** : la migration s'applique au prochain `demarrer-rise.cmd` ; sans modèle, la chaîne Documents est « Interrompue à l'étape 1 » jusqu'à l'ajout d'un Embedding, d'un Reranking et d'un LLM.

### 3.9 Catalogue des modèles

- **Base locale** : 11 modèles ajoutés (catalogue du 28/09/2026) et OpenRouter créé sans clé. Les clés des quatre fournisseurs de démonstration sont fictives : le test réel les refuse, donc ces modèles restent indisponibles tant que de vraies clés ne sont pas saisies.
- **Mise à jour des tarifs** : le catalogue est un relevé daté ; un changement de prix d'un fournisseur (ex. Gemini 3.8 Flash au 01/01/2027) demande de modifier `prisma/catalog/ia-modeles.ts` et de relancer `npm run ia:catalogue -- --confirmer`.
- **Modèles OpenRouter** : 2 modèles d'embedding (Qwen3 Embedding 8B, BAAI bge-m3) et 2 de reranking (Voyage rerank-2.5 et rerank-2.5-lite) ajoutés le 28/09/2026 et appliqués sur la base locale. OpenRouter n'a pas encore de clé : ces modèles restent indisponibles tant qu'elle n'est pas saisie.
- **Contexte des LLM** : le nouveau champ « longueur de contexte » n'est renseigné que pour les 4 modèles OpenRouter ; les 11 LLM du catalogue l'ont vide (à compléter au besoin).
- **Barre latérale de la Console** : contrôlée dans le navigateur (démonstration) : les 12 pages ouvrent la bonne vue avec le trait ambre, un seul domaine déplié, signaux sur les domaines repliés, ↗ ouvre le Cockpit dans un nouvel onglet, menu flottant du mode réduit (Échap, clic extérieur, choix d'une page), croix du tiroir mobile, aucune erreur d'exécution. Le test navigateur `console.e2e.ts` (comparaison visuelle avec les écrans d'origine) n'a pas été relancé : sa navigation est adaptée à l'accordéon, mais les captures de la barre latérale diffèrent désormais de l'origine par construction.
- **Skills slides et documents (28/09/2026)** : « Rédiger les slides PowerPoint » (≈ 1 640 tokens) et « Analyser un document » (≈ 1 520 tokens) rédigées au format Claude Skill (`docs/skills/*/SKILL.md`) et créées désactivées sur la base locale. Pour qu'« Analyser un document » soit utile, il faudra transmettre au modèle le texte extrait du document (question ouverte 16, routage de Jev).
- **Clé NewsData.io (28/09/2026)** : test 200 en 388 ms (« success », 10 036 résultats), proxy 200 (10 articles : Radio France, Boursorama…), présent dans la route d'actualités agrégées (5 sources en service) ; articles datés de 06:55 UTC, derrière les flux RSS dans le tri par date ; un nom de source tronqué côté fournisseur (« L' ») ; clé absente de la réponse.
- **Clés GNews et Finnhub (28/09/2026)** : Finnhub : test 200 en 199 ms, 100 articles économiques (CNBC, Reuters…), route `economie` alimentée. GNews : test 200 en 374 ms, 10 articles ; l'offre gratuite a **12 h de retard** (message du fournisseur) ; un 429 a été reçu quand la route a suivi le test à moins d'une seconde (limite de débit de GNews), puis 200 après une pause ; ses articles, plus anciens, passent derrière ceux des flux RSS dans le tri par date. Clés absentes des réponses de la console.
- **Actualités (28/09/2026)** : GDELT et Les Échos retirés ; NewsData.io, GNews et Finnhub ajoutés sans clé (désactivés, clés à saisir) ; route d'actualités agrégées, tuile Actualités branchée dessus (aujourd'hui : Le Monde, L'Équipe, BBC) ; économie vide tant que Finnhub n'a pas de clé. TomTom vérifié avec la clé saisie. Tests : `news.spec.ts`, `api-cards.spec.ts`.
- **Registre : TomTom, GDELT, RSS (28/09/2026)** : TomTom Traffic ajoutée (désactivée, clé à saisir : bouton vérifié). GDELT : la connexion aboutit désormais (≈ 11 s), mais le service répond 429 depuis le réseau local ; la tuile Actualités passe alors sur les flux RSS. Flux RSS vérifiés en réel : Le Monde 16 articles, L'Équipe 50, BBC 34 (≈ 60 ms chacun), agrégation correcte ; Les Échos refusé par le site (désactivée). Skills renommées sur la base locale. Tests : `rss.spec.ts`, `api-cards.spec.ts`.
- **Guidage console (IA v3)** : recette § 8 : 1 quatre cartes sur une ligne (1 160 px), rien ne déborde des cartes (certains libellés de liste coupés par des points de suspension, style prévu), coût du guidage « ≈ 1,98 € · estimé sur 800 questions / mois » (la spécification cite 2,10 € comme montant de démonstration ; le calcul de `ia-data.js` livré donne 1,98 €) ; 2 principal Haiku 4.5 → Sonnet 4.5 : bandeau « 66 € → 70 € » ; 3 vue réseau : ligne Guidage console après Rapports, lumineuse sur Haiku 4.5 ; clé Anthropic coupée (données de démonstration, sans toucher aux clés réelles) : principal en corail « 401 », secours GPT-5 mini en ambre « répond » ; 4 question posée dans la console : enregistrement `guidage · claude-haiku-4-5 · sans secours` sur la base locale. Bascule vers le secours et prompt : test e2e `guidage.spec.ts`. Sur la base locale, le guidage a désormais un historique : l'estimation « ≈ » n'y est plus affichée.
- **Registre des cartes API** : recette du § 9 déroulée dans le navigateur sur la base locale (carte de test vers `https://httpbin.org/status/401`, clés fictives, supprimée ensuite) : 1 point corail sur Plateforme et sur l'entrée ; 2 carte en erreur sélectionnée à l'ouverture ; 3 test « 401 Unauthorized · 426 ms », ligne en corail ; 4 clé remplacée affichée « •••• Z9Y8 », absente de la page ; 5 `http://` refusé à la saisie, IP privée refusée par le serveur (422) ; 6 aucune clé dans les réponses réseau de la console. Widgets du Cockpit : météo par le proxy (23°) ; **GDELT dépasse le délai de 8 s** et passe en erreur (widget Actualités en mode dégradé). Tests : `api-cards.spec.ts` (unitaires et e2e).
- **Anciennes skills supprimées** (demande du commanditaire, 28/09/2026) : « Analyser le projet », « Rédiger un livrable », « Mettre à jour les données », « Assister l’administration » et « Guider l’utilisateur » supprimées de la base locale par l’API (tracées « Skill supprimée »). Les cinq nouvelles skills restent désactivées. Les données initiales (`DEMO_SKILLS`, migration `20261003000000_skills_jev`) contiennent toujours les anciennes : un `-Reinitialiser` les recharge et efface les nouvelles.
- **Skills du Cockpit** : quatre skills créées désactivées sur la base locale (≈ 1 000 à 1 250 tokens chacune) ; textes versionnés dans `docs/skills/`. La génération d’un vrai fichier PowerPoint n’existe pas (export PDF seulement) : question ouverte 15.
- **Skill Console** : « Répondre sur la Console d’administration » (7 824 caractères, ≈ 2 000 tokens) créée désactivée sur la base locale ; texte versionné dans `docs/skills/`.
- **Notifications de l'administrateur** : contrôlées dans le navigateur. Sur l'API (base locale) : cloche, tiroir à 252 px, filtres, Refuser → confirmation verte « Robin Lefèvre est prévenu », Annuler, refus exécuté après 10 s puis « Tout est traité », fermeture par la cloche, Échap, le voile et la croix, aucune erreur. En démonstration : cloche corail (4) puis ambre (3) après lecture de l'incident, « Accès, 2 en attente » → 1 → 0 puis retour à l'annulation, « Tout lire » à 0 sans retirer les demandes, « Remplacer la clé » ouvre Fournisseurs et modèles, tiroir à 72 px en mode réduit. Création et fermeture automatiques des incidents, e-mail d'invitation différé, message au demandeur : test e2e `inbox.spec.ts`. Les clés de la base locale n'ont pas été modifiées (la clé Google y répond correctement). Une demande d'activation de module de test (Suivi des bénéfices, RISE) a été créée puis refusée sur la base locale.
- **Persona de Jev** : contrôlé dans le navigateur sur l'API (base locale) : Assistant › Persona ouvre la page (active dans la sidebar), point ambre et « Modifications non enregistrées », changement d'onglet sans perte, Annuler, Enregistrer conservé après rechargement, nom répercuté dans la sidebar et le panneau Jev (avatar et emoji compris), image > 1 Mo refusée avec le message, image valide stockée puis remplacée par un avatar prédéfini, Aperçu du Soul, aucune erreur. Prise en compte par la réponse suivante de Jev : test e2e `persona.spec.ts`. Le Persona de la base locale a été remis à sa valeur initiale après les essais (versions conservées).
- **Skills de Jev** : contrôlées dans le navigateur sur l'API (base locale) : Assistant › Skills ouvre la page (ligne active), création désactivée en mode Modifier conservée après rechargement, « Modifications non enregistrées », Annuler, Enregistrer conservé après rechargement, brouillon conservé au changement de skill (point ambre), Aperçu (`##`, `-`, `1.`), suppression en deux temps, aucune erreur. Retrait du prompt dès la réponse suivante : test e2e `skills.spec.ts` (Jev de la Console et du Cockpit). La passerelle LLM étant un bouchon, le prompt système n'influence pas encore le texte des réponses.
- **Génération de rapports** : la fonction existe pour l'affectation, la vue réseau, la consommation et les plafonds, mais aucun écran du Cockpit ne l'appelle encore ; la bascule sur le secours en cas de réponse tronquée (`stop_reason = max_tokens`, spécification § 7) n'est pas faite, la passerelle LLM étant un bouchon.
- **Dimensions et réindexation** : la dimension choisie est enregistrée et tracée, l'avertissement s'affiche, mais aucune réindexation n'est lancée (la vectorisation des documents n'est pas encore construite).

### Vue « Notifications et alertes » : limites du composant livré (non modifié)

- Le composant confirme « Règle enregistrée », « Règle supprimée » et « Test envoyé sur votre compte » sans attendre le serveur. En cas de refus, un second message donne l'erreur et la vue revient à l'état réel. La règle sélectionnée redevient alors la première de la liste, car le composant n'a pas de prop pour la sélection.
- `{reponse_llm}` dans le prompt n'est signalé que par un rappel dans la vue ; c'est le serveur qui le refuse à l'enregistrement.
- Le jour et l'heure d'envoi (`at`) ne sont pas modifiables dans la vue. Une règle passée en quotidienne, hebdomadaire ou personnalisée prend les valeurs par défaut. Le déclencheur n'est pas modifiable non plus (question ouverte n° 1).
- Les fonctions de l'ancien écran sans équivalent dans la vue ne sont plus accessibles depuis la Console, mais les routes existent toujours : aperçu généré par le modèle, relance d'un envoi en échec, liste des destinataires d'un aperçu e-mail.
- Base locale sans modèle d'IA depuis le 28/09/2026 : toutes les règles y affichent « aucun modèle » et la liste des modèles est vide, jusqu'à l'ajout d'un LLM actif.

### Registre des cartes API v3c : points d'attention (design non modifié)

- **Largeur :** les deux colonnes demandent 1 124 px (720 + 24 + 380). Dans la Console, avec la sidebar dépliée (300 px), le panneau de détail passe sous la table en dessous d'une fenêtre d'environ 1 560 px de large (à 1 440 px, il est dessous). Avec la sidebar en rail, il reste à côté dès 1 440 px.
- **900 px :** la page ne déborde pas, mais le tableau (680 px au moins) défile horizontalement dans sa carte : les colonnes Clé et Alimente se trouvent au-delà du bord visible.
- **100 cartes :** un tag de 36 cartes allonge la page à environ 3 000 px. Le panneau de détail suit la même hauteur, et son pied (Désactiver, Supprimer la carte) se retrouve en bas, loin de la carte sélectionnée. Un panneau collant ou une table à hauteur limitée l'éviterait, au prix d'une modification du design.
- **Messages :** « Carte enregistrée », « Associée à … » et les autres sont affichés par le composant sans attendre le serveur. En cas de refus (par exemple un nom d'hôte introuvable, 422), un second message donne l'erreur et la liste est relue.
- **Suppression :** fermer la page pendant les 5 s d'annulation abandonne la suppression.

### Serveur d'envoi SMTP : à faire par le commanditaire

- Saisir le mot de passe d'application Google dans Plateforme › Serveur d’envoi SMTP, puis tester et enregistrer (points 2 et 7 de la recette contre Gmail). Avant cela, régénérer le mot de passe d'application qui a circulé pendant la conception (spécification § 5).
- Contrôle de santé des cartes API : un test toutes les 15 minutes, soit 96 appels par jour, consomme le quota gratuit des cartes d'actualités (GNews : 100 appels par jour). À arbitrer.

## 4. Questions ouvertes

1. **Déclencheur des règles de notification** : faut-il ajouter un sélecteur de déclencheur dans la console ? Aujourd'hui, une règle créée depuis l'écran reçoit un déclencheur par défaut : « planifié » pour une notification, « manuel » pour une alerte.
2. **Clé stable des commentaires de cellule** : faut-il que le Cockpit expose un identifiant de ligne ? Cela rendrait les commentaires insensibles aux renommages, mais demande de modifier chaque tableau du frontend.
3. **Écrans manquants de la console** : faut-il ajouter l'export d'un snapshot et le traitement des demandes d'invitation ?
4. **Identité dans la console** : faut-il remplacer `u1` par le compte connecté (`GET /api/admin/me`) ? La modification est simple, mais elle touche plusieurs libellés.
5. **Fournisseur d'identité (SSO)** : il est hors périmètre (Q11). L'authentification par mot de passe (spécification AUTH) est en place ; un passage à OIDC ne toucherait que `core/auth` et les écrans de connexion.
6. ~~Double authentification~~ : tranché le 28/09/2026, pas pour l'instant ; les mentions « Activée » sont retirées (`docs/DECISIONS.md`).
7. ~~Changement de mot de passe depuis le profil~~ : tranché le 28/09/2026, oui ; branché dans le Cockpit et la Console.
8. **Secours de la vectorisation** : un modèle d'embedding de secours produit des vecteurs incompatibles avec ceux du principal ; s'il prenait le relais, la recherche sur l'index existant serait fausse. Faut-il interdire le secours pour la vectorisation, ou ne s'en servir qu'après une réindexation complète ?
9. **Tarif du reranking Voyage** : OpenRouter le facture au token (0,05 $ et 0,02 $ / M) ; si la facturation passait à la requête, l'unité est à changer dans la fiche du modèle.
10. **Repli des groupes par administrateur** : l'état plié / déplié est mémorisé par navigateur ; faut-il le stocker par administrateur (`/api/me/preferences`, clés `ia.asg.open` et `ia.net.open`) ?
11. **Ordre des skills** : faut-il pouvoir les réordonner (la position existe côté serveur, le composant ne propose pas de glisser-déposer) ?
12. **Persona dans le Cockpit** : le Jev du Cockpit affiche toujours « Jev » ; faut-il exposer le nom, l'emoji et l'avatar du Persona aux utilisateurs du Cockpit (lecture ouverte à tous) ? Et faut-il un écran pour revenir à une version précédente du Persona ?
13. **Page « Notifications et alertes »** : la renommer « Alertes utilisateurs » (proposition de la spécification) pour la distinguer du tiroir de l'administrateur ?
14. **Lecture des notifications** : l'état lu / non lu est commun à tous les administrateurs ; faut-il le suivre par administrateur ?
15. **Export PowerPoint des rapports** : faut-il générer un vrai fichier .pptx (rapports de comité, fonction IA « Génération de rapports ») ? Aujourd’hui Jev prépare le contenu slide par slide et le Cockpit exporte un PDF minimal.
16. **Routage de Jev** : Jev ne relie pas la demande, la skill et le modèle (mots-clés, toutes les skills envoyées, fonction fixe, aucune donnée transmise, passerelle bouchon) ; analyse et architecture cible dans `docs/ANALYSE - Jev, intentions, skills et modeles.md`. Quel chantier engager en premier (passerelle réelle, routeur d'intention, contexte de données) ?
17. ~~**GDELT trop lent**~~ (retiré le 28/09/2026) : le service d'actualités dépasse les 8 s imposés par la spécification (appels réels du 28/09/2026) ; garder GDELT avec un délai plus long, ou changer de source d'actualités ?
18. **Emplacement de la clé** : marqueur `{key}` dans l'endpoint ou en-tête `X-Api-Key` ; faut-il un champ pour choisir le nom de l'en-tête ou du paramètre (ex. `Authorization: Bearer`) ?
19. ~~**Moteur de mots-clés de la Console**~~ — *réglée le 28/09/2026 : le moteur de mots-clés est supprimé, seuls les modèles de la fonction `guidage` répondent (DECISIONS, « suppression du moteur de mots-clés »).* : il répond avant `guidage` à toute question contenant un de ses mots-clés (ex. « journalier » → audit) ; faut-il faire passer toutes les questions par `guidage` (le moteur ne servant plus qu'aux actions confirmables) ?
20. ~~**Les Échos**~~ (retiré le 28/09/2026) : leur hébergeur refuse l'accès au flux RSS (403). Faut-il demander un accès (abonnement, liste blanche) ou retirer la carte ?
21. ~~**GNews gratuit**~~ : tranché le 28/09/2026, tri par date conservé (`docs/DECISIONS.md`). Rappel de la question : garder le tri par date (GNews rarement visible), intercaler les sources (un article par source à tour de rôle), ou passer à l'offre payante ?
22. ~~**Données de la plateforme pour Jev de la Console**~~ — *réglée le 28/09/2026 par l’interrogation des données (Text-to-SQL) ; reste l’affichage brut du Markdown.* : depuis la suppression du moteur de mots-clés, le modèle ne reçoit aucune donnée (comptes, invitations, coûts, état des clés) ; il guide, mais un chiffre qu'il avance n'est pas vérifié (essai : « 2 invitations en attente », deviné). Faut-il lui transmettre un état de la plateforme à chaque question, ou lui donner des outils de lecture ? Par ailleurs, ses réponses en Markdown (`**gras**`) s'affichent brutes dans le panneau.
23. ~~**Date de démonstration de la base locale**~~ — *réglée le 29/09/2026 : date réelle partout (DECISIONS, « Date réelle du jour partout »).* : le `.env` local fixe `DEMO_TODAY=2026-09-26` alors que les appels réels à l’IA sont datés du jour réel (28/09). L’écran Consommation compte « jusqu’au 26/09 » (0 €), Jev a compté tout le mois (0,12 €, dépense réelle). Faut-il retirer `DEMO_TODAY` du `.env` local maintenant que la base sert à de vrais essais ?
