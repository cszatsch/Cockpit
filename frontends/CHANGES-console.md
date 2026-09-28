# Branchement de la Console Admin — journal des modifications

Branchement de la console d'administration sur l'API `/api/admin` (brief Console § 11, arbitrage Q1).
Le design et les textes sont inchangés, à deux exceptions voulues : la valeur par défaut « Capture manuelle » est retirée (Q10), et la carte « Charger l'exemple » n'est proposée qu'en mode démonstration.

## Principe

- **`frontends/admin-api.js`** (nouveau, module ES) porte l'essentiel du branchement :
  - les appels HTTP : base `window.RISE_API_BASE`, sinon même origine ; jeton `localStorage['rise-admin-token']`, sinon `POST /api/auth/dev-login` avec le compte `?as=<accountId>`, ou `u1` par défaut ; nouvelle connexion après un `401` ;
  - la gestion d'erreur : le corps `{ code, message, fields?, usages? }` est affiché dans le toast existant, avec les champs en erreur et les usages de RG12 ;
  - les adaptateurs API ↔ écran : `toUser`, `toAdmin`, `toAudit`, `toProv`, `toModel`, `toAsg`/`fromAsg`, `toUsageRows`, `toTh`, `toSnap`, `toSched`/`fromSched`, `toRule`/`fromRule`, `toHist`, `toMod`, `toReq`, `toProf`/`fromProf`, `toSess`, `toLib`, `importXlsx` ;
  - `bindConsole`, `bindConso`, `bindInit`, `bindBiblio` : remplacement des méthodes sur l'**instance** de chaque écran (monkey-patch), appelé depuis `componentDidMount`.
- Chaque écran charge `admin-api.js` par `import('./admin-api.js')` au montage. C'est la seule modification de logique dans les `.dc.html`.
- **Mode démonstration** : `?demo=1` dans l'URL, ou `window.RISE_DEMO = true` avant le chargement. Dans ce mode, rien n'est branché : constantes, simulations et « Charger l'exemple » d'origine, sans aucun appel à l'API.
- Le journal d'audit est écrit par le serveur : `log()` est neutralisé sur l'instance, sans supprimer ses appels. Le journal est relu après chaque écriture réussie.

## Modifications des fichiers `.dc.html`

Toutes les lignes ajoutées ou modifiées portent un commentaire `// API :` (ou `<!-- API : -->` dans le gabarit).

| Fichier | Emplacement | Avant | Après | Raison |
|---|---|---|---|---|
| `Console Admin.dc.html` | `componentDidMount()`, fin (l. 1183-1184) | — | `import('./admin-api.js').then(m => m.bindConsole(this))` | Chargement par `GET` au montage ; méthodes d'écriture branchées sur l'API (§ 11.2-11.4, 11.8). |
| `Console Admin.dc.html` | `capture()` (l. 1439-1440) | `lab = (S.form.lab \|\| '').trim() \|\| 'Capture manuelle'` | `lab = (S.form.lab \|\| '').trim()` | Q10 : snapshot manuel sans libellé → `400`. Le message du serveur (« libellé obligatoire ») s'affiche dans le toast. |
| `ConsoCouts.dc.html` | `componentDidMount()` (l. 90-92) | `this.setState(…th0…); this.count();` | idem + `import('./admin-api.js').then(m => m.bindConso(this))` | `data()` lit `/usage/month` et `/usage?groupBy=day` ; plafonds lus et écrits par `/budget-thresholds` (§ 11.5, source unique § 12). |
| `ProjetInit.dc.html` | gabarit, carte « Découvrir avec un exemple » (l. 28-29) | carte toujours affichée | carte entourée de `<sc-if value="{{ demoOn }}">` | « Charger l'exemple » en mode démonstration seulement (§ 11.6). |
| `ProjetInit.dc.html` | classe, avant `componentWillUnmount` (l. 136-137) | — | `componentDidMount() { import('./admin-api.js').then(m => m.bindInit(this)) }` | Lecture du fichier par `POST /project-imports` (fini SheetJS) ; création par `/commit` (§ 11.6, 11.8). |
| `ProjetInit.dc.html` | `renderVals()`, objet `v` (l. 151-153) | — | `demoOn: window.RISE_DEMO === true \|\| /[?&]demo=1\b/.test(location.search)` | Condition d'affichage de la carte d'exemple, évaluée sans attendre `admin-api.js`. |
| `ProjetsBiblio.dc.html` | classe, après `state` (l. 45-46) | — | `componentDidMount() { import('./admin-api.js').then(m => m.bindBiblio(this)) }` | Liste depuis `GET /projects` (§ 11.7). |
| `ProjetsBiblio.dc.html` | `renderVals()`, `const base = [` (l. 49) | `const base = [ …projets de démo… ]` | `const base = this.state.api \|\| [ …projets de démo… ]` | Cartes du serveur ; les constantes ne restent que pour le mode démonstration. |
| `ProjetsBiblio.dc.html` | `cards` (l. 64-65) | — | `href: './RISE Cockpit.dc.html?project=' + code` | « Ouvrir » ouvre le Cockpit sur le projet choisi (§ 11.7, écart § 12). |
| `ProjetsBiblio.dc.html` | gabarit, lien « Ouvrir » (l. 33-34) | `href="./RISE Cockpit.dc.html"` | `href="{{ p.href }}"` | Idem. |

Lignes modifiées (`git diff --numstat`) : Console Admin **+4 / −1** ; ConsoCouts **+3 / −1** ; ProjetInit **+7 / −2** ; ProjetsBiblio **+7 / −3**. `support.js` n'est pas modifié.

## Méthodes branchées (`admin-api.js`)

| Écran / méthode | Appel | Remarque |
|---|---|---|
| Montage | `GET /overview`, `/me/profile`, `/accounts`, `/admins`, `/audit`, `/providers`, `/models`, `/assignments`, `/usage/month`, `/usage?from&to&groupBy=day`, `/projects/{p}/snapshots` (×4), `/projects/{sPj}/snapshot-schedule`, `/notification-rules`, `/deliveries`, `/modules`, `/module-requests?status=PENDING`, `/me/sessions`, `/projects` | Squelette de chargement jusqu'à la réponse, puis les constantes (`USERS`, `AUDIT0`, `PROV0`, `MODELS0`, `SNAPS0`, `RULES0`, `HIST0`, `mods`, `reqs`, `admins`, `th`, `asg`, `sess`, `prof`, `pn`, `sched`, `usage`) sont remplacées. Horloge de référence : `date` de `/overview`. |
| `go(sec)` | rechargement de la section en arrière-plan | Correspondance menu → ressources dans `SECTION`. |
| `setUser` (suspendre, réactiver, relancer, y compris par Jev et « Annuler ») | `POST /accounts/{id}/suspend`, `/reactivate`, `/resend-invite` | Confirmation d'origine conservée. L'état est remplacé par la réponse ; en cas d'erreur, le toast affiche l'erreur et la liste est relue. |
| `saveUser` | `POST /accounts`, `PATCH /accounts/{id}` (champs modifiés seulement) | `409` (e-mail déjà utilisé) sous le champ e-mail ; `422` (profil attribué par le PMO, Q3) dans le toast, fenêtre rouverte. |
| `removeUser` | `DELETE /accounts/{id}` | `409` + usages (RG12) dans le toast. |
| `saveAdmin`, `removeAdmin` | `POST /admins`, `DELETE /admins/{id}` | Dernier administrateur ou soi-même : `409` affiché. |
| `exportAudit` | `GET /audit/export.csv?severity&q` | Filtres courants ; l'export est tracé par le serveur. |
| `testKey`, `testAll` | `POST /providers/{id}/test`, `/providers/test-all` | Plus de temporisation simulée : « Test en cours » jusqu'à la réponse. |
| `saveKey` | `PUT /providers/{id}/key` | La saisie est effacée de l'état dès l'envoi, et la clé n'est jamais stockée dans `provs`. Le serveur reteste la clé et renvoie préfixe + 4 derniers caractères. |
| `saveProv` | `POST /providers` | Test immédiat par le serveur. |
| `toggleModel`, `saveModel`, `saveFiche` | `PATCH /models/{id}` | Désactiver un modèle principal : `409 MODEL_IN_USE` affiché. |
| `saveAsg` | `PUT /assignments` | Brouillon appliqué après confirmation, puis état du serveur (`state`). |
| `mtd()`, `thVals()` | données de `/usage/month` | Dépense et projection du serveur (une seule source) ; statut calculé sur le pourcentage exact, comme le serveur. |
| `setTh` (validation d'un plafond ou d'un seuil) | `PUT /budget-thresholds/{id}` | ConsoCouts est prévenu (événement `rise-admin:thresholds-console`). |
| `exportCsv` | `GET /usage/export.csv?from&to` | |
| `doCapture` (et `capture`, Jev) | `POST /projects/{p}/snapshots`, puis `GET /snapshots/{id}` jusqu'à `DONE` | La progression reste indicative et plafonnée à 92 % tant que le serveur n'a pas terminé. |
| planification (`sched`, inline) | `GET`/`PUT /projects/{sPj}/snapshot-schedule` | Planification **par projet** (Q10) : rechargée à chaque changement de projet, enregistrée à chaque modification. |
| comparaison A/B (inline) | `GET /snapshots/compare?a&b` | Ajouts, modifications et suppressions calculés par le serveur, puis mis en cache. |
| `newRule`, `saveRule` | `POST` (règle nouvelle) ou `PATCH /notification-rules/{id}` | Validations d'origine côté écran ; celles du serveur (`400`) sont affichées dans le toast. |
| `toggleRule` | `POST /notification-rules/{id}/enable` et `/disable` | « Annuler » réactive la règle sur le serveur. |
| « M'envoyer un test » (inline) | `POST /notification-rules/{id}/test` | Envoi réel à l'administrateur connecté ; l'historique est rechargé. |
| `setMod` (donc `setScope`, `togProj`, activation par Jev) | `PATCH /modules/{id}` | |
| `approve`, `reject` | `POST /module-requests/{id}/approve` et `/reject` | |
| `saveMe`, `onPhoto` | `PATCH /me/profile` | La photo est envoyée en data URL (`photoUrl`). |
| `pwd` (inline) | `POST /me/password-reset` | |
| préférences `pn` (inline) | `PATCH /me/notifications` | |
| `revoke`, `revokeAll` | `DELETE /me/sessions/{id}`, `DELETE /accounts/{moi}/sessions` | La session courante est conservée. |
| `jevReply` | `POST /assistant/messages` | Les règles locales de Jev répondent d'abord, avec leurs confirmations. Une demande qu'elles ne comprennent pas part au serveur. |
| `onImported` (inline) | relecture de `GET /projects` | La bibliothèque lit la liste du serveur (projet importé en tête, badge « Nouveau »). |
| ConsoCouts `data()` | `GET /usage/month`, `/usage?from=J-89&to=J&groupBy=day`, `/assignments`, `/models`, `/providers` | Jours à venir projetés au rythme des 7 derniers jours, par fonction (même règle que le serveur). Répartition par modèle et par fournisseur mesurée. Tokens réels. Modèle servi par fonction (principal, ou secours). |
| ConsoCouts `thSave`, `exportCsv` | `PUT /budget-thresholds/{id}`, `GET /usage/export.csv` | La console est prévenue (événement `rise-admin:thresholds`). |
| ProjetInit `file()`, `doImport` | `POST /project-imports` (multipart), `GET /project-imports/{id}/preview?tab=…`, `POST /project-imports/{id}/commit` | Le contrôle d'import affiche le rapport du serveur. La prévisualisation est convertie au format de `parseXlsx()`. La barre de progression s'arrête à 90 % jusqu'à la réponse de `commit`. Une erreur de `commit` revient au contrôle et affiche le message. |
| ProjetsBiblio | `GET /projects` | Tri : nouveaux projets, puis actifs, en préparation, clos, par date de début. |

## Non branchés, et pourquoi

- **Matrice des droits, profils types et super-administrateur** : `cell`, `setLv`, `reviewRights`, `profLv`, `modLv`, `fnLv`, `saveProf`, `setAdminLv`, `lvSeg`. Code mort, supprimé du périmètre (brief § 5 et § 12).
- **`restore()`** : aucune restauration (RG14), et aucune route côté serveur.
- **Export d'un snapshot** (`GET /snapshots/{id}/export`) : l'écran n'a pas de bouton d'export.
- **Demandes d'invitation du PMO** (`/invitation-requests`, Q8 bis) : l'écran de la console n'a pas d'emplacement pour les afficher. Elles restent visibles dans `GET /overview`.
- **Chantiers affichés par compte** (`habOf`) : ils viennent toujours de `rise-data.js`. `GET /accounts/{id}` renvoie les chantiers réels par projet, mais l'écran les calcule de façon synchrone à partir de `rise-data.js`. À brancher dans une seconde passe.
- **« À traiter »** : calculé par l'écran (`attention()`) à partir des données réelles du serveur. `overview.attention` n'est pas utilisé, car ses libellés diffèrent de ceux de l'écran. Les échecs d'envoi et les demandes d'invitation, présents dans la réponse du serveur, n'y figurent donc pas.
- **Effectifs par snapshot** (`stats`) : ils restent calculés par l'écran (BASE + EV) ; seule la comparaison A/B vient du serveur.
- **Jev** : les actions proposées par le serveur, autres que « ouvrir une section », ne sont pas reprises. Les règles locales couvrent déjà ces cas, avec confirmation.

## Changements backend (`backend/src/admin/` uniquement)

| Fichier | Changement | Raison |
|---|---|---|
| `accounts.controller.ts` (`PATCH /accounts/{id}`) | Le profil n'est réattribué (`applyProfile`) que s'il change, ou si les projets d'un profil global (ADMIN, PMO) changent. | Sans cela, modifier seulement les projets d'un Responsable ou d'un Lecteur du référentiel renvoyait `422` : le profil était recalculé à l'identique et heurtait la règle Q3. |
| `data.controller.ts` (`PUT /projects/{id}/snapshot-schedule`) | Fréquence `Mensuelle` acceptée. | La console propose Quotidienne, Hebdomadaire et Mensuelle ; le serveur refusait la troisième. |
| `snapshots.service.ts` (`runScheduled`) | Mensuelle : exécution le 1er du mois, à l'heure choisie. | Idem. |
| `test/e2e/console.spec.ts` | Deux tests : projets d'un Responsable modifiés → `200` ; planification mensuelle acceptée, fréquence inconnue → `400`. | Couverture des deux corrections. `npm test` : 98/98. |

## Vérification navigateur

`backend/test/browser/console.e2e.ts` : script ts-node, pas Jest. Le backend de la console doit tourner sur le port 3102, base `rise_fe_console`.

```
cd backend && npx ts-node --transpile-only test/browser/console.e2e.ts
```

Le script :
1. amorce la base ;
2. sert la copie d'origine (`git show HEAD:…` des 4 écrans, `support.js`, `rise-data.js`, `planning-data.js` et `assets/`) avec `python3 -m http.server` (port 3297, ou `ORIG_PORT`) ;
3. visite les 12 menus des deux versions (fuseau Europe/Paris, mouvement réduit) ;
4. capture chaque écran et mesure l'écart en pixels ;
5. effectue des modifications par l'interface et vérifie après rechargement :
   - suspension d'un compte ;
   - plafond ;
   - règle désactivée ;
   - snapshot libellé, et snapshot sans libellé refusé ;
   - import ORION ;
   - test et rotation de clé ;
   - invitation ;
   - demande de module ;
   - planification ;
   - préférence ;
   - envoi de test ;
6. vérifie le mode démonstration.

Les captures sont écrites dans `OUT` (par défaut `<tmp>/rise-console-e2e`).

Écarts visuels restants (pixels différents, fenêtre 1440×900) :

| Menu | Écart | Explication |
|---|---|---|
| Consommation et coûts | ≈ 1,7 % | Données mesurées au lieu de la série générée par l'écran. La projection vaut 1 190 € (rythme des 7 derniers jours, § 7.4) au lieu de 1 250 €. La bande « secours » disparaît : la démonstration du serveur n'a pas de journée majoritairement servie par le secours. Les tokens et la répartition par modèle sont réels. |
| Initialisation d'un projet | ≈ 0,7 % | La carte « Charger l'exemple » est masquée hors mode démonstration (voulu). |
| Modules | ≈ 0,5 % | Budget inactif partout (Q10) au lieu d'actif sur RISE et ATLAS. |
| Affectation des modèles | ≈ 0,2 % | Estimations mensuelles recalculées sur les volumes du serveur : la série est comptée depuis le 1er du mois et recalée sur 1 032,40 €. |
| Vue d'ensemble | ≈ 0,1 % | Montants arrondis du serveur. |
| Autres menus | 0 % | — |

## Limites connues

- **Horodatage** : le serveur de démonstration fixe `DEMO_NOW` au 26/09/2026 10:24, mais il horodate les écritures à l'heure réelle. Les nouvelles entrées d'audit, les snapshots capturés et la dernière connexion de l'administrateur apparaissent donc « à l'instant », avec une date postérieure au 26/09. `ll` est borné à 0.
- **Sessions** : chaque navigateur sans jeton ouvre une session par `dev-login`. « Mon profil › Sécurité » liste donc cette session courante, en plus des trois sessions de démonstration.
- **Identité** : l'écran considère toujours `u1` comme « moi » (`isMe`, filtres « Julien Morel »). La connexion `?as=<autre compte>` fonctionne pour l'API, mais pas pour ces libellés.
- **Premier rendu** : avant la réponse du serveur, la console affiche son squelette de chargement. ConsoCouts trace une série nulle, et la bibliothèque affiche brièvement ses cartes de démonstration.
- **Import** : le rapport de contrôle affiche les messages du serveur. La colonne « Permission » des personnes est ignorée (Q4) et n'apparaît plus dans la prévisualisation. Le doublon de code projet est signalé par l'écran à partir de la liste des codes du serveur.

## Authentification (écrans de connexion, voir `CHANGES-auth.md`)

- **`Console Admin.dc.html`, carte du profil** : bouton « Se déconnecter » ajouté sous « Changer la photo », même style de lien que ce dernier, avec l'icône de déconnexion du Cockpit. La console livrée n'avait aucun moyen de se déconnecter, alors que les écrans d'authentification l'exigent. Il appelle `POST /api/auth/logout`, puis ouvre `/console/connexion` avec le bandeau « Vous êtes déconnecté ». Deux emplacements modifiés : le bouton et `pf.logout`.
- **`admin-api.js`** : sans `?as=`, les appels passent par la session par cookie de la console, ouverte sur `/console/connexion` (en-têtes `X-Rise-Surface: admin` et `X-CSRF-Token`). Un `401`, ou un `403 PASSWORD_CHANGE_REQUIRED`, renvoie vers `/console/connexion`. `bindConsole()` lance la surveillance d'inactivité (15 min, « Toujours là ? » 60 s avant) et fournit `c._logout`. Avec `?as=<compte>` (serveur en `AUTH_DEV`), la connexion de développement par jeton reste inchangée ; le test navigateur passe maintenant `?as=u1`. Un jeton `rise-admin-token` resté dans le navigateur n'est plus utilisé sans `?as=`.
- **Mon profil › Sécurité** (décisions du 28/09/2026) : « Modifier » envoyait une fausse demande (`POST /api/admin/me/password-reset`, e-mail sans lien, route supprimée). Il ouvre maintenant la fenêtre de changement de mot de passe (`openPasswordDialog` d'`auth-api.js`, `POST /api/auth/password`), puis recharge la liste des sessions, où ne reste que la session courante. Le sous-titre « Modifié il y a 3 mois · renouvellement exigé tous les 6 mois pour les administrateurs » devient `{{ pf.pwdAge }}`, l'ancienneté réelle. Le renouvellement semestriel n'est pas appliqué, d'où son retrait. Les lignes « Authentification à deux facteurs » et « Confirmation renforcée » (« Activée ») sont retirées, et la confirmation de fermeture d'une session dit « Il faudra s'y reconnecter avec son mot de passe » au lieu de « avec la double authentification ».

## Modèles d'IA : catégorie, ajout et suppression (28/09/2026)

- **Dialogue du modèle** : champ **Catégorie** (LLM, Embedding, Reranking), au même dessin que les choix de profil des autres dialogues (`role="radiogroup"`). Le dialogue sert aussi à l'**ajout** (« Ajouter un modèle », avec le choix du fournisseur) et propose **Supprimer** en modification (confirmation, puis `DELETE /models/{id}` ; refus du serveur affiché si le modèle a servi).
- **Fiche du modèle** : même champ Catégorie, pris en compte dans « Modifications non enregistrées ».
- **Liste des modèles** : badge de catégorie à côté du nom, bouton « Ajouter un modèle » à droite du filtre par fournisseur, ligne « Aucun modèle… » quand la liste est vide.
- **Affectation** : seuls les LLM sont proposés ; une fonction sans modèle principal affiche « Choisir un modèle principal… » (ou « Aucun LLM… ») au lieu de planter, et n'est pas envoyée à `PUT /assignments`.
- **Règles de notification** : seuls les LLM sont proposés ; une règle dont le modèle n'existe plus affiche « Choisissez un LLM » (le calcul du tarif plantait). Nouvelle règle : premier LLM actif.
- **Schéma des connexions** : chaque fournisseur réserve au moins deux lignes, pour que les tuiles ne se chevauchent pas quand il n'a aucun modèle actif.
- **`admin-api.js`** : `toModel` lit `category` ; `saveModel` crée (`POST /models`) ou modifie (`PATCH`) avec la catégorie ; `delModel` supprime après la confirmation d'origine ; `fromAsg` omet les fonctions sans principal.

## Test réel des clés d'API (28/09/2026)

- **Schéma des connexions** : sous un fournisseur en erreur, « <code> · clé révoquée » devient « <code> · clé refusée » (le code vient du fournisseur : 401, 403, 400…) ; sans code, « Injoignable » ou « Test impossible » selon la cause, au lieu de « Clé invalide ». Un emplacement, commenté `API :`.
- **`admin-api.js`, message après un test** : « <fournisseur> refuse la clé (<code>) », ou « <fournisseur> : <cause> » quand le fournisseur est injoignable ou non reconnu. « Tester toutes les clés » compte les clés réellement acceptées.

## Pipeline Documents et fiche modèle (28/09/2026, voir `CHANGES-ia.md`)

- **En-tête** : `<script src="./ia-data.js">` (règles partagées des écrans IA).
- **Fournisseurs et modèles** : le schéma sombre d'origine (`pv.wire`, méthode `wireVals`) est remplacé par `<dc-import name="Vue reseau IA">` ; clic sur un modèle → fiche modèle, sur un fournisseur → sa fiche, « Tester » / « Remplacer la clé » → actions existantes, « en ajouter un » → Affectation. Liste des modèles : tarif selon l'unité (€ / 1 000 req. pour un Reranking à la requête, « — » sans tarif de sortie) et badge d'ancienneté (« À surveiller », « Ancien »).
- **Affectation des modèles** : le contenu d'origine (cartes et barre d'enregistrement) est remplacé par `<dc-import name="Affectation des modeles">` ; « Enregistrer » passe par la confirmation existante (`saveAsg`) puis `PUT /assignments`.
- **Fiche modèle** : la modale « Ajouter / Modifier un modèle » (`dl.isModel`) est remplacée par `<dc-import name="Fiche modele">`, rendue hors du cadre des dialogues (elle a son propre voile) ; la fiche latérale d'un modèle ouvre désormais cette fiche. « Supprimer » ferme la fiche puis demande la confirmation existante.
- **Données** : `FNS` décrit les cinq fonctions (catégorie, chaîne, étape) ; `CONSO` garde les trois lignes de consommation et de plafond (Insights, Gestion des données, Documents). Démonstration : Vectorisation et Reclassement sans modèle, Synthèse sur l'ancienne affectation de Documents. Coût estimé (`est`) selon l'unité ; état d'une fonction (`fnState`) selon sa catégorie ; libellé des étapes « Documents · Synthèse ».
- **`admin-api.js`** : `toModel` lit date de sortie, max output tokens et tarif `{ unit, in, out, per1k }` ; `fns` charge `GET /functions` (volumes 30 jours) ; `saveIaModel` crée (`POST`) ou modifie (`PATCH`) et garde la fiche ouverte en cas de refus ; la ligne Documents de la consommation affiche le modèle de l'étape Synthèse.

## Fournisseur OpenRouter (28/09/2026)

- Logo `assets/logos/lh-openrouter.webp` (fourni par le commanditaire) ajouté aux tables de logos de `Console Admin.dc.html` (3), `ConsoCouts.dc.html` et `admin-api.js`.

## Liste des modèles triable et barre latérale réglable (28/09/2026)

- **Tri** : les en-têtes de la liste des modèles (Modèle, Fournisseur, Entrée, Sortie, Utilisé par, Actif) deviennent des boutons de tri (`aria-sort`, indicateur ▲ ▼ ↕) ; un clic trie en ordre croissant, un second en ordre décroissant ; valeurs absentes (pas de tarif de sortie, modèle inutilisé) en dernier ; à égalité, ordre alphabétique. Entrée d'un Reranking à la requête : tarif pour 1 000 requêtes. Méthodes `sortModels`, `sortCols`, état `mSort`.
- **Réduire / déployer** : bouton en haut à droite de la barre latérale déployée (« Réduire la barre latérale ») et sous le logo de la barre réduite (« Déployer la barre latérale »). Le choix l'emporte sur le mode automatique (déployée à partir de 1 180 px, réduite en dessous) ; sous 760 px, le menu mobile est inchangé. Méthodes `navMode`, `toggleNav`.
- **Largeur** : poignée à la limite de la barre et de l'écran central (`role="separator"`) : au survol ou au focus, un trait et une icône ↔ apparaissent ; glisser règle la largeur entre 200 et 420 px (`NAV_W_MIN`, `NAV_W_MAX`), les flèches du clavier par pas de 16 px (Début / Fin : minimum / maximum), le double-clic revient à 252 px (`NAV_W_DEF`). L'animation de la grille est coupée pendant le glisser.
- **Mémorisation** : réduite / déployée et largeur dans `localStorage['rise-console-nav']` (préférence du navigateur, sans appel au serveur).

## Dimensions des modèles d'embedding (28/09/2026)

- `iaModel` / `fromIa` transportent l'identifiant chez le fournisseur, le contexte et les dimensions ; l'affectation porte la dimension (`d`) de la vectorisation (`admin-api.js` : `toModel`, `fromIaModel`, `toAsg`, `fromAsg`).
- Confirmation d'enregistrement de l'affectation : ligne « dimensions » et, pour un changement de modèle d'embedding ou de dimension, l'avertissement de réindexation (corps du dialogue avec retours à la ligne conservés).

## Génération de rapports (28/09/2026)

- `FNS` : fonction `rapports` (LLM, badge « Nouveau », sortie requise) ; `iaVals()` transmet `isNew` et `needOut` aux écrans IA (sortie requise du serveur, `GET /functions`, via `admin-api.js` → `aiNeed`).
- `CONSO` : ligne Rapports, volume de démonstration nul (sans effet sur le tirage de la consommation de démonstration) ; affectation de démonstration Claude Sonnet 4.5 / Mistral Large 2.

## Nouvelle barre latérale : composant Sidebar Console (28/09/2026)

- `Sidebar Console.dc.html` (livraison Sidebar) copié tel quel ; le bloc `<aside>` de la Console (en-tête, recherche, navigation, lien Cockpit, Jev, profil) et la poignée de largeur sont remplacés par `<dc-import name="Sidebar Console" …>` (spécification § 3), dans un conteneur `sbWrap` qui en fait un tiroir en mobile.
- Retirés : `NAV`, la construction `nav`, les styles `asideSt`, `jevBtnSt`, `meSt`, `meAv`, `srchPad`, la largeur réglable (`NAV_W_*`, `navWidth`, `rzStart`, `rzKey`), la palette ⌘K (`palItems`, état `pal*`, fenêtre) et les raccourcis ⌘K / ⌘J.
- Props : `sbMode`, `sec`, `sbSignals()` (invitations, clés refusées, fonctions IA à l'arrêt ou sur secours), `sbUser` (nom et photo de l'administrateur connecté, sans initiales sur la photo), `sbGo`, `toggleJev`, `goProfil`, `toggleRail`, `closeNav`.
- `META` : groupes renommés selon les domaines ; pages `persona` et `skills` ajoutées avec un écran provisoire « Bientôt disponible ».
- Test navigateur `console.e2e.ts` : `goMenu` déplie le domaine avant de cliquer une page.
- Correctif : le conteneur `sbWrap` est lui-même collant (`position:sticky;top:0;align-self:start;height:100vh`) ; l'`aside` sticky du composant, enfermé dans un conteneur de sa propre hauteur, défilait avec la page.
