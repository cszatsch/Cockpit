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
- **Génération** : la passerelle LLM reste un bouchon pour les réponses de Jev et les notifications ; seul le test des clés appelle réellement les fournisseurs.

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
19. **Moteur de mots-clés de la Console** : il répond avant `guidage` à toute question contenant un de ses mots-clés (ex. « journalier » → audit) ; faut-il faire passer toutes les questions par `guidage` (le moteur ne servant plus qu'aux actions confirmables) ?
20. ~~**Les Échos**~~ (retiré le 28/09/2026) : leur hébergeur refuse l'accès au flux RSS (403). Faut-il demander un accès (abonnement, liste blanche) ou retirer la carte ?
21. **GNews gratuit** (12 h de retard ; NewsData.io renvoie aussi des articles plus anciens que les flux RSS) : garder le tri par date (GNews rarement visible), intercaler les sources (un article par source à tour de rôle), ou passer à l'offre payante ?
