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

## Page Skills (28/09/2026)

- `Skills.dc.html` (livraison Skills) copié tel quel ; affiché pour `skills` par `<dc-import name="Skills" …>` (spécification § 7), à la place de l'écran provisoire. En-tête générique masqué sur cette page (`notOv`), marges de la Console neutralisées (`skWrap`) ; `META.skills` de la spécification.
- Rappels `skSave`, `skToggle`, `skCreate`, `skDelete` : démonstration (journal local, toast) ; API dans `admin-api.js` (`/api/assistant/skills`, chargement `skills` à l'ouverture de la page, correspondance identifiant provisoire → serveur, rechargement après chaque écriture, rechargement aussi en cas d'erreur pour rétablir l'état du serveur).
- `admin-api.js` : `apiAbs()` pour les routes hors `/api/admin`.

## Page Persona (28/09/2026)

- `Persona.dc.html` (livraison Persona) copié tel quel ; affiché pour `persona` (spécification § 7) à la place de l'écran provisoire ; en-tête générique masqué ; `META.persona` de la spécification.
- Rappels `psSave` / `psUpload` : démonstration (état local) ; API dans `admin-api.js` (`/api/assistant/persona`, chargement au démarrage et à l'ouverture de la page, image envoyée dès son choix puis URL substituée à l'aperçu à l'enregistrement).
- Nom de Jev (`identity.name`) : bouton Jev de la sidebar (`jev-name`), en-tête, libellé et champ de saisie du panneau Jev ; avatar (image ou teinte prédéfinie avec l'emoji) et emoji dans l'en-tête du panneau (`PERSONA_AV`, mêmes teintes que le composant).
- `Sidebar Console.dc.html` : prop `jevName` (« Jev » par défaut) pour le texte et les libellés accessibles du bouton Jev ; aucune autre modification.

## Notifications de l'administrateur (28/09/2026)

- `Sidebar Console.dc.html` remplacé par la version livrée (cloche) ; prop `jevName` réappliquée à l'identique (Persona). Nouveaux attributs : `notif-count`, `notif-has-error`, `notif-open`, `on-toggle-notifications`.
- `Notifications.dc.html` (livraison) copié tel quel et placé à la fin du shell (`ntLeft` : 252, 72 en mode réduit, 0 en mobile).
- Démonstration : `NT0` (mêmes notifications que le composant, avec la page à ouvrir) ; décisions locales annulables 10 s. API (`admin-api.js`) : `/api/admin/notifications`, rafraîchie à l'ouverture et toutes les 60 s, décisions, annulation, « Tout lire », lecture et navigation pour « Corriger » / « Voir le détail ».
- Échap ferme d'abord le tiroir ; signal « Accès » = demandes d'invitation à traiter.

## Registre des cartes API (28/09/2026)

- `Registre API.dc.html` (livraison) copié tel quel ; affiché pour `apis` (spécification § 7), en-tête générique masqué ; `META.apis`.
- `Sidebar Console.dc.html` remplacé par la version livrée (entrée `apis` dans Plateforme) ; prop `jevName` réappliquée à l'identique.
- Signal `apis` de la sidebar (§ 2) : corail si une carte active est en erreur ou a une clé expirée, ambre si échéance ≤ 30 j ou quota ≥ 85 % (`apiSignal`) ; démonstration : `APIS0`, mêmes états que le composant.
- `admin-api.js` : chargement `apis` (au démarrage et à l'ouverture), `apTest` (renvoie la promesse `{ code, ms, body }`), `apCreate`, `apRotate`, `apToggle` (route puis rechargement ; un refus rétablit l'état du serveur) ; `apiNow` = date du jour du serveur. En démonstration, le test reste simulé par le composant.

## Guidage console (IA v3, 28/09/2026)

- `FNS` : fonction `guidage` (scope console, estimation) ; `CONSO` : ligne Guidage console (volume de démonstration nul) ; affectation de démonstration Claude Haiku 4.5 / GPT-5 mini.
- `iaVals()` transmet `scope`, `est` et `vol: null` tant que la fonction n'a pas d'historique (`aiHistory`, d'après `vol` renvoyé par `GET /functions`, chargé désormais au démarrage).

## Registre des cartes API : clé à saisir (28/09/2026)

- `Registre API.dc.html` : une carte dont l'endpoint attend une clé (`{key}`) sans l'avoir affiche « Clé à saisir » (tableau : « À saisir ») et le bouton « Remplacer la clé », pour saisir la clé d'une carte créée sans (TomTom Traffic). Aucun style modifié.

## Jev : toutes les questions passent par la fonction guidage (28/09/2026)

- `admin-api.js` (`c.jevReply`) : chaque question part à `POST /api/admin/assistant/messages`, et plus seulement celles que le moteur local ne comprend pas. La réponse du moteur local est envoyée comme faits (`facts`) ; la réponse du modèle la remplace, et les boutons, choix, confirmations et récapitulatifs du moteur local restent affichés en dessous. Sans réponse du modèle (`ai: null`) ou en cas d'erreur, la réponse locale s'affiche telle quelle. Design et textes des écrans inchangés.

## Jev : suppression du moteur de mots-clés (28/09/2026)

- `Console Admin.dc.html` : la méthode `jevReply` (moteur de mots-clés, actions directes) et l'utilitaire `nrm` sont supprimés ; `jevReply()` ne renvoie plus qu'un message « la console doit être reliée au serveur » (page sans API). Textes du panneau Jev ajustés, car Jev n'agit plus : accueil, badge « Explication et guidage », pied du panneau, et suggestions d'action reformulées en questions (« Comment relancer les invitations en attente ? », « Comment suspendre un compte ? », « Comment tester les clés API ? », « Comment créer un snapshot ? », « Comment activer un module sur un projet ? »).
- `admin-api.js` (`c.jevReply`) : la question part seule au serveur (`POST /api/admin/assistant/messages`) ; l'indicateur « Jev réfléchit » reste affiché jusqu'à la réponse du modèle ; sans modèle disponible, le motif s'affiche en erreur.

## Jev : sources des réponses sur les données (28/09/2026)

- `admin-api.js` (`c.jevReply`) : les vues consultées renvoyées par le serveur (`sources`) s'affichent sous la réponse, dans l'emplacement « Sources : » déjà prévu par le panneau (libellés lisibles : « modeles_ia » → « modèles IA »).

## Consommation et coûts : Rapports et Guidage console (29/09/2026)

- `ConsoCouts.dc.html` : les lignes budgétaires ne sont plus figées à trois ; constantes `BUDGET_LINES` / `BUDGET_FN` (Insights, Rapports, Guidage console, Documents, Gestion des données), utilisées par le tableau, la courbe, la répartition, les plafonds et les données de démonstration (séries Rapports et Guidage ajoutées). Couleurs des nouvelles lignes : violet (Rapports), rose (Guidage console). Part du mois à 0 % si la dépense est nulle (plus de « NaN % »). Design inchangé.
- `admin-api.js` (`bindConso`) : cumuls par jour, jetons, plafonds et modèles servis calculés pour les cinq lignes.

## Journal des appels (29/09/2026)

- `Journal des appels.dc.html` : nouvelle vue livrée, gabarit inchangé. Script : données lues par `journalApi` (`admin-api.js` : `/usage/daily` par ligne budgétaire, `/usage/calls` avec curseur, `/usage/calls.csv`) ; `build()` réservé au mode démonstration. Ajustements aux règles de la spécification : agrégats en euros à 2 décimales sous 100 € ; mois lu dans les données au lieu de « sept. » en dur ; état vide sans division par zéro (« Aucun appel sur la période ») ; calcul du coût avec les tarifs figés de l'appel (« Tarif non enregistré » pour les appels antérieurs ; facturation à la requête pour le Reranking) ; logos Google et OpenRouter ajoutés.
- `Console Admin.dc.html` : `META.journal`, montage de la vue quand `S.sec === 'journal'` (sous Consommation et coûts), suggestions de Jev pour la page.
- `Sidebar Console.dc.html` : entrée « Journal des appels » dans IA, après « Consommation et coûts ».

## Écrans de coûts renommés ; journal sans données fictives (29/09/2026)

- `Sidebar Console.dc.html`, `Console Admin.dc.html` (`META`, repères d'écran), `ConsoCouts.dc.html`, `Journal des appels.dc.html` : « Vue générale des coûts » et « Journal consommation et coûts » (demande du commanditaire).
- `Journal des appels.dc.html` : les données de démonstration ne s'affichent plus qu'en mode démonstration ; en mode API, la vue reste vide jusqu'au chargement et après un échec (message).

## Date réelle du jour (29/09/2026)

- `Console Admin.dc.html` : `TODAY` modifiable et `apiClock()` (horloge recalée sur le serveur) ; année courante dans `fD` ; `dayDate` relatif à aujourd'hui ; `nextCapture()` pour le prochain snapshot ; libellés « Coût IA · », « Projection », « fin … » au mois en cours ; `apiNow` transmis au Registre à l'heure courante.
- `ConsoCouts.dc.html` : mois en cours déduit des données (plus de `getMonth() === 8`, de 30 jours ni de « sept. » en dur).
- `ProjetsBiblio.dc.html` : avancement à la date du serveur (`apiToday`).
- `admin-api.js` : appel de `apiClock()`, titre du mois de la répartition, `apiToday` de la bibliothèque.

## Sidebar Console v3 (29/09/2026)

- `Sidebar Console.dc.html` : remplacée par la v3 livrée ; `jevName` (nom de Jev tiré du Persona) réintégré.
- `Console Admin.dc.html` : largeur de la sidebar dépliée 300 px (constante `SB_W`) dans la grille, le tiroir mobile (`min(300px, 86vw)`) et le décalage du tiroir de notifications.
- `Notifications.dc.html` : bord gauche par défaut à 300 px.

## Suppression des règles, {date} du jour, déconnexion depuis l'avatar (29/09/2026)

- `Console Admin.dc.html` : bouton « Supprimer la règle » (pied de l'éditeur de règle) et méthode `deleteRule()` avec confirmation ; aperçu : {date} = date du jour ; `on-logout` de la sidebar branché sur la déconnexion.
- `admin-api.js` : `deleteRule` → `DELETE /notification-rules/:id` après confirmation (règle non enregistrée : retrait local).
- `Sidebar Console.dc.html` : icône « Déconnexion » au survol de l'avatar (prop d'événement `onLogout`).

## Vue « Notifications et alertes » (proposition 1a, 29/09/2026)

- `Notifications et alertes.dc.html` : ajouté tel que livré. Aucune modification.
- `Console Admin.dc.html` : la page `notifs` intègre le composant par `<dc-import>` et masque l'en-tête générique. Retirés : l'ancien écran (liste, éditeur, aperçu, historique), ses données de démonstration (`RULES0`, `HIST0`, `SAMPLE`) et ses méthodes (`rule`, `ntExtra`, `edR`, `reach`, `toggleRule`, `saveRule`, `deleteRule`, `newRule`). Ajoutés : les rappels `nrSave`, `nrToggle`, `nrCreate`, `nrDelete` et `nrTest`, vides en démonstration, où le composant simule seul. Le lien « règle budgétaire » de la vue des coûts ouvre la page.
- `admin-api.js` : chargements `nrRules`, `nrHist` et `nrCounts` ; rappels branchés sur `/notifications/rules…` ; écritures en file ; remontage de la vue après un refus. Retirés : `toRule`, `fromRule`, `toHist` et les constantes `FREQ`, `CHANNEL` et `KIND`.

## Registre des cartes API v3c (29/09/2026)

- `Registre des cartes API.dc.html` : ajouté depuis la livraison. Seul le script est complété ; balisage, styles et textes inchangés.
  - Props : `cards` (modèle Card du § 5, avec `last4` et `series` en plus), `widgets` (catalogue), `now`, `checked`.
  - Rappels : `onCreate`, `onSave`, `onToggle`, `onDelete`, `onRestore`, `onTest`, `onWidgets`.
  - Liste du serveur reprise à chaque rechargement (`syncCards`, les tags ajoutés à la volée sont conservés).
  - Catalogue et suggestions pris dans `widgets` (`wl`, `wid`, `sug`) ; date du jour du serveur (`NOW`).
  - Test réel par `onTest` ; 4 derniers caractères de la clé (`last4`) au lieu de « 7f3a » ; « dernière vérification » calculée.
  - Corps de réponse XML reconnu à son premier caractère ; mini-courbe tracée sur la série horaire réelle quand elle existe.
  - Sans props, la démonstration d'origine reste intacte.
- `Registre API.dc.html` : retiré (ancienne vue).
- `Console Admin.dc.html` : la page `apis` intègre le nouveau composant ; montage une fois les cartes et le catalogue reçus. Rappels `apCreate`, `apSave`, `apToggle`, `apDelete`, `apRestore`, `apTest` et `apWidgetsSet`, vides en démonstration. Signal de la sidebar aligné sur les seuils de 60 jours et 80 %.
- `admin-api.js` : adaptateur (`toCard`, `toResp`, `toDdmmyy`, `fromDdmmyy`, `lastCheck`), catalogue `GET /widgets`, écritures en file puis relecture, suppression différée de 5 s. La clé n'est envoyée que si elle a été saisie ; `key: null` quand « Sans clé » remplace une clé existante.

## Serveur d'envoi SMTP (29/09/2026)

- `Serveur SMTP.dc.html` : ajouté depuis la livraison ; seul le script est complété.
  - Prop `settings` et rappels `onSave`, `onTest`, `onTestEmail`.
  - Synchronisation avec les réglages du serveur (`syncSettings`), sans écraser un brouillon en cours.
  - Mot de passe jamais reçu : il n'est exigé que si aucun n'est enregistré (`hasPass`) ; le compteur « n / 16 » ne s'affiche que pour un mot de passe saisi.
  - Test réel (`runTest`, puis déroulé des étapes `play`), aide française d'après le code réel (`helpFor`) ; durée de connexion et version TLS mesurées ; dernier test daté ; e-mail de test avec sa durée réelle ; enregistrement confirmé après la réponse du serveur.
  - Démonstration : adresse fictive à la place de l'adresse réelle ; mot de passe fictif d'origine.
- `Sidebar Console.dc.html` : entrée « Serveur d’envoi SMTP » après « Notifications et alertes ».
- `Console Admin.dc.html` : page `smtp` (en-tête générique masqué), `META` et suggestions de Jev, rappels `smSave`, `smTest` et `smTestEmail` (vides en démonstration).
- `admin-api.js` : chargement `smtp`. Rappels vers `PUT /settings/smtp`, `POST /settings/smtp/test` et `POST /settings/smtp/test-email` ; le mot de passe n'est envoyé que s'il a été saisi.

## Registre des cartes API : carte API requise, « Exp. Clé » (29/09/2026)

- `Registre des cartes API.dc.html` : « Associer un widget » ne liste que les widgets à carte API requise (`needsCard`) ; en-tête « CLÉ » renommé « EXP. CLÉ ».

## Notifications et alertes : fréquences, calendrier, variables (29/09/2026)

- `Notifications et alertes.dc.html` :
  - « Personnalisée » retirée ;
  - en quotidienne et hebdomadaire, sélecteur d'heure (pas de 30 minutes) et, en hebdomadaire, sélecteur du jour ; fuseau affiché (prop `schedule`) ;
  - variables limitées à {projet}, {date} et {reponse_llm} ;
  - démonstration sans les variables retirées.
- `Console Admin.dc.html` et `admin-api.js` : prop `schedule` chargée depuis `GET /notifications/schedule`.

## Initialisation d'un projet : nouvelle version de l'écran (29/09/2026)

- `ProjetInit.dc.html` : remplacé par la version livrée. Une seule ligne ajoutée : `componentDidMount` charge `admin-api.js` (`bindInit`). La carte « Charger l'exemple » n'est plus limitée au mode démonstration (arbitrage : exemple simulé).
- `admin-api.js` :
  - `validateXlsx` : `POST /projects/import/validate`, dates converties en `Date` ;
  - `bindInit` : contrôle par le serveur ; création suivie par `GET /projects/import/{jobId}` sans jamais devancer le serveur ; en cas de refus (409, 422, échec), retour au contrôle avec le motif ;
  - « Réinitialiser la session » et « Importer le fichier corrigé » oublient l'ancien fichier côté serveur (`DELETE`) ;
  - `importXlsx` retiré.
- `Referentiel RISE - initialisation.xlsx` : liste Sous-phase des jalons dépendante de la phase choisie (validation de la colonne E de « 12 Jalons », reste du classeur intact).

## Initialisation d'un projet : zone de dépôt « Feuillets » (29/09/2026)

- `ProjetInit.dc.html`, demande du commanditaire (« plus classe et professionnel », sans les points) :
  - la trame de points et le pointillé sont remplacés par un filet continu d'un pixel (#dde6e4), plus foncé au survol de la souris ;
  - au survol d'un fichier, le filet passe en sarcelle, avec un halo de 4 px ;
  - la tuile d'icône devient un éventail de trois feuilles de tableur (en-tête marine, grille) :
    - au survol d'un fichier, l'éventail s'ouvre, la feuille du dessus se soulève et son en-tête passe en sarcelle ;
    - pendant la lecture, l'indicateur de chargement tourne sur la feuille du dessus.
  - textes, bouton, message d'erreur et bandeau « Onglets attendus » inchangés.

## Snapshots : vue livrée branchée sur le serveur (29/09/2026)

- `Snapshots.dc.html` : nouvelle vue livrée, design et textes inchangés ; `support.js` identique à celui en place. Trois points d'accroche :
  - `componentDidMount` charge `admin-api.js` (`bindSnapshots`) ;
  - onglets : `this.projects` (projets du serveur) à la place de la liste fixe ;
  - date du jour : `this.now()` (heure du serveur) à la place de `nowD()`, figée au 29 sept.
  Sans serveur, la simulation d'origine reste.
- `admin-api.js` : `bindSnapshots` remplace les données simulées (`SEED`, `EV`, `BASE`, `counts`, `diff`, `capture`, `nextCap`, restauration, planification) par les routes du serveur. La confirmation de restauration de la vue est gardée ; seul son bouton « Restaurer » appelle le serveur. `toSnap` lit le nouveau format de liste ; l'ancienne capture et l'ancienne comparaison de la Console sont retirées ; la vue d'ensemble relit la planification.
- `Console Admin.dc.html` : la page Snapshots intègre la vue (`<dc-import name="Snapshots">`) à la place de l'ancienne section ; en-tête générique masqué (la vue a le sien, mêmes textes).

## Persona : écran en tuiles (29/09/2026)

- `Persona.dc.html` : remplacé par la version livrée (deux tuiles de 680 px, côte à côte dès 720 px), design et textes inchangés ; `support.js` identique à celui en place. Deux méthodes adaptées pour attendre le serveur quand les props renvoient une promesse :
  - `commit` : la tuile n'est marquée enregistrée qu'après la réponse ; en cas d'échec, « Non enregistré » reste et la notification donne le motif ;
  - `upload` : l'URL stockée remplace l'aperçu base64 ; refus : message sous l'avatar, image précédente rétablie.
  Sans promesse, comportement d'origine.
- `admin-api.js` : `psSave` et `psUpload` renvoient des promesses (Persona enregistré, URL de l'image) ou des erreurs en français ; plus de notification de la Console (l'écran affiche les siennes).
- `Console Admin.dc.html` : en démonstration, `psSave` ne notifie plus (l'écran confirme « Identity enregistré » / « Soul enregistré »). En-tête générique toujours masqué sur la page.

## Skills : écran en tuiles (29/09/2026)

- `Skills.dc.html` : version livrée (tuiles de 680 px, côte à côte dès 740 px), design et textes inchangés ; `support.js` identique à celui en place. Adaptations :
  - les appels qui renvoient une promesse sont attendus (`settle`), avec retour à l'état précédent en cas d'échec ;
  - l'id du serveur remplace l'id provisoire (`adopt`) ;
  - prop supplémentaire `onQuery` : mode serveur au-delà de 200 skills (`remote`, `query` ; `support.js` ne transmettant que les props précédentes, la dernière recherche lue est gardée) ;
  - règle qui masque les barres de défilement limitée à l'écran.
  Sans promesse ni `onQuery`, comportement d'origine.
- `admin-api.js` : routes `PUT /:id`, `PATCH /:id/active`, liste paginée `skQuery` ; les actions renvoient des promesses (erreurs en français) sans relire la liste ; `skRemote` au-delà de 200 skills.
- `Console Admin.dc.html` : `on-query` transmis à l'écran ; en démonstration, plus de seconde notification (l'écran confirme lui-même).

## Connexion Console : photo du volet gauche (29/09/2026)

- `Authentification.dc.html` (surface `admin`) : photo `assets/connexion-console.webp` (aviron vu du ciel, 1190 × 1322, 126 Ko) sous un dégradé bleu nuit qui garde le logo et le titre lisibles ; cadrage `72% 46%` (bateau visible, y compris dans le bandeau mobile de 196 px) ; même animation d'entrée que la photo du Cockpit ; quadrillage et arc conservés.

## Snapshots : barres de défilement masquées (29/09/2026)

- `Snapshots.dc.html` : demande du commanditaire. La liste et le panneau de comparaison passent de `scrollbar-width:thin` à `none`, et une règle limitée à l'écran (`[data-screen-label="Snapshots 1a"]`) masque aussi les barres dans Safari. Le défilement (molette, clavier, tactile) et les en-têtes de mois collants sont inchangés.

## Jev : mise en forme des réponses (29/09/2026)

- Nouveau module `jev-format.js` : le Markdown du modèle devient des blocs typés, rendus par les gabarits du panneau (aucun HTML injecté) :
  - titre en tête de réponse (emoji décoratifs retirés), puis étiquettes de section ;
  - paragraphes (gras, code), listes à puces et numérotées, encadré de citation, bloc de code ;
  - lignes « **Libellé** : valeur (détail) » → paires libellé / valeur alignées, le détail en second plan ;
  - tableau de 2 colonnes → paires ; au-delà → fiches : code dans une colonne alignée, nom sur deux lignes au plus, statut en pastille (🟢 / 🟡 / 🔴 / 🟣 ou mot : Actif, En préparation, Clos…), période « 3 févr. 2025 → 30 juin 2027 » et autres colonnes en méta ;
  - question de relance finale plus discrète ; sources en étiquettes au pied de la réponse.
- `Console Admin.dc.html` : bulle de Jev rendue par blocs (pleine largeur pour une réponse structurée) ; module chargé au montage, texte brut en attendant ; les messages d'erreur restent en texte brut.

## Vue d'ensemble : données vérifiées et corrigées (29/09/2026)

Vérification des éléments de la vue d'ensemble face au serveur. Conformes : date et heure (horloge du serveur), utilisateurs actifs et invitations (comptes), fournisseurs (statut du dernier test), actions sensibles récentes (journal d'audit). Corrections :

- `Console Admin.dc.html` :
  - **Coût IA** : les centimes sont affichés sous 100 € (« 0,41 € » au lieu de « 0 € »), et « < 1 % du budget » dès qu'une dépense existe (au lieu de « 0 % »).
  - **Dernier snapshot** : valeurs du serveur (dernier snapshot de tous les projets, prochaine capture de son projet calculée par le serveur), au lieu d'un calcul local sur les seuls projets de démonstration et la planification de RISE ; « Aucun snapshot » et « planification suspendue » gérés.
  - **« il y a… »** : durées écoulées complètes (4 j 16 h → « 4 j », et non « 5 j »), dans toute la Console.
  - **À traiter** : reprend aussi les points que seul le serveur calcule (échecs d'envoi de notifications sur 7 jours, demandes d'invitation du PMO), jusque-là jamais affichés.
- `admin-api.js` : chargement `ov` (`GET /overview` et planification du projet du dernier snapshot), au démarrage et à chaque retour sur la vue d'ensemble.

## Vue générale des coûts : montants au centime (29/09/2026)

- `ConsoCouts.dc.html` et sa liaison dans `admin-api.js` : les montants étaient arrondis à l'euro (0,41 € affiché « 0 € »). Nouvelle règle, la même que dans le Journal des appels et la vue d'ensemble :
  - centimes sous 100 € (« 0,41 € », « 0,06 € / jour ») ;
  - « < 0,01 € » pour une dépense infime ;
  - euros entiers au-delà de 100 € ou pour un montant rond (« 1 200 € ») ;
  - le reste sous le plafond est toujours exact (« 1 199,53 € », jamais arrondi vers le haut).
  Les parts et progressions non nulles inférieures à 1 % s'affichent « < 1 % » au lieu de « 0 % ». Les données et les calculs sont inchangés.

## Projets de la base, et non de la démonstration (29/09/2026)

- `Console Admin.dc.html` : `PROJ` et les noms des projets (`PROJ_NAMES`) sont remplacés par ceux de la base dès qu'elle est lue (`apiProjects`, même mécanisme que `apiClock`) ; codes de la bibliothèque tirés de `PROJ`. Démonstration inchangée.
- `admin-api.js` : chargement `projects` → `apiProjects` (du plus ancien au plus récent) ; chargement `snaps` sur les projets de la base (les projets de démonstration supprimés faisaient échouer le démarrage).

## Registre : « WIDGETS ALIMENTÉS » ; Snapshots sans données factices (29/09/2026)

- `Registre des cartes API.dc.html` : colonne « ALIMENTE » renommée « WIDGETS ALIMENTÉS » (en-tête du tableau et bloc de la fiche).
- Snapshots : plus aucun snapshot factice en base ni à l'amorçage ; la vue affiche « Aucun snapshot pour ce projet » et la vue d'ensemble « Aucun snapshot » jusqu'à la première capture.

## Utilisateurs : profils multiples (29/09/2026)

- `Console Admin.dc.html`, fenêtre d'un utilisateur :
  - le choix unique « PROFIL » (Admin / PMO / Responsable / Lecteur) est remplacé par l'interrupteur « Administrateur de la plateforme », qui se cumule avec les profils par projet ;
  - « ACCÈS PAR PROJET » : pour chaque projet rattaché, un choix « PMO » ou « Chantiers » ; les chantiers se règlent d'un clic (sans accès → Lecteur → Responsable), avec une légende ; le lien « Modifier dans le Référentiel » disparaît (attribution depuis la Console, décision du 29/09/2026) ;
  - contrôle avant envoi : au moins un projet ou le rôle d'administrateur, et sur chaque projet PMO ou au moins un chantier.
- Liste des utilisateurs : le libellé de profil montre tous les profils détenus (« Admin · PMO ») ; les filtres et compteurs par profil comptent chaque compte dans chacun de ses profils.
- `admin-api.js` : `toUser` lit `profiles`, `admin` et `habilitations` ; chargement `wsAll` (chantiers de chaque projet) ; `saveUser` envoie les habilitations (`POST /accounts` avec `habilitations`, `PUT /accounts/:id/habilitations`).

## Utilisateurs : proposition du référentiel (29/09/2026)

- `Console Admin.dc.html`, fenêtre d'un utilisateur lié à une personne du référentiel : pour chaque projet rattaché, encart « RÉFÉRENTIEL DU PROJET » (« Karim Benali : responsable de C5, C6 · rattaché à C5. ») avec :
  - « Appliquer » : coche Responsable et Lecteur selon le référentiel, ajustable avant d'enregistrer ;
  - « La saisie diffère du référentiel. » (encart ambré) ou « Conforme ».
- Vue d'ensemble, « À traiter » : « N comptes : droits différents du référentiel », avec le détail par compte et « Voir les utilisateurs ».
- `admin-api.js` : `toUser` lit `referentiel` ; le chargement `ov` reprend l'écart `REFERENTIAL_GAP` du serveur.

## Invitation : e-mail non parti (29/09/2026)

- `admin-api.js` : si l'e-mail d'invitation n'a pas pu partir, la Console le dit (« Compte créé, mais l'e-mail d'invitation n'a pas pu partir (…) : utilisez « Relancer » ») au lieu d'une erreur, et le compte apparaît dans la liste.

## Personne désactivée dans le référentiel : accès à retirer (29/09/2026)

- `Console Admin.dc.html`, fenêtre d'un utilisateur : si la personne du référentiel est désactivée, l'encart passe en rouge (« … est désactivé(e) dans le référentiel : aucun accès proposé sur RISE. », « Accès encore ouvert : à retirer. ») et le bouton devient « Retirer l'accès » (détache le projet). Le message « Rattachez au moins un projet… » ajoute « Pour couper tout accès, suspendez le compte depuis la liste. »
- Vue d'ensemble, « À traiter » : item rouge « N accès à retirer : personne(s) désactivée(s) dans le référentiel ».
- `admin-api.js` : `toUser` lit `referentiel[].active` ; le chargement `ov` reprend `ACCESS_TO_REMOVE` (ton erreur).
- Cloche : notification « Accès à retirer : … » fournie par le serveur, sans changement de l'écran.

## Compte à réactiver (30/09/2026)

- Vue d'ensemble, « À traiter » : item ambre « N compte(s) suspendu(s) : personne(s) réactivée(s) dans le référentiel » (`admin-api.js`, chargement `ov`, type `ACCOUNT_TO_REACTIVATE`).
- Cloche : notification « Compte à réactiver : … » fournie par le serveur, sans changement de l'écran.

## E-mail du référentiel (30/09/2026)

- `Console Admin.dc.html`, fenêtre d'un utilisateur : sous « E-mail professionnel », encart ambré « E-MAIL DU RÉFÉRENTIEL » quand la fiche Personne liée porte une autre adresse (« Le référentiel indique … (compte : …). »), avec « Appliquer » (compte actif) ou « Appliquer et renvoyer l'invitation » (compte invité). Méthode `applyRefMail` (démonstration : remplace l'adresse localement).
- Vue d'ensemble, « À traiter » : item ambré « N compte(s) : e-mail différent du référentiel ».
- `admin-api.js` : `toUser` lit `emailReferentiel` (`refMail`) ; `applyRefMail` appelle `POST /accounts/:id/referential-email` et met à jour la fenêtre ouverte ; le chargement `ov` reprend `EMAIL_MISMATCH`.
- Cloche : notification « E-mail différent du référentiel : … » fournie par le serveur.

## Bibliothèque des projets : version 1c, Liste et fiche (30/09/2026)

- `ProjetsBiblio.dc.html` remplacé par la maquette `Projets 1c.dc.html` (visuel et textes repris tels quels) : en-tête propre (PROJETS, titre, sous-titre, « Initialiser un projet »), tuile Liste (filtres avec compteurs, recherche, 7 projets par page, pagination) et tuile Fiche, toutes deux de 660 px, l'une sous l'autre sous environ 900 px.
- Écarts à la maquette, nécessaires à l'intégration :
  - données : prop `projects` si fournie, sinon liste du serveur (`bindBiblio`, `GET /api/admin/projects`, date du serveur) ; le jeu de démonstration (`jeu`) n'est pas repris ;
  - pendant le chargement, ni « Aucun projet ne correspond. » ni « Sélectionnez un projet. » ;
  - « Ouvrir » et Entrée mènent au Cockpit du projet (`./RISE Cockpit.dc.html?project=CODE`) ; la maquette n'ouvrait par Entrée qu'avec un `onOpen` ;
  - styles globaux de la maquette (liens, champs, focus) limités à l'écran pour ne pas modifier le reste de la Console.
- `Console Admin.dc.html` : l'en-tête de page de la Console est masqué sur cette page (l'écran porte le sien, comme Snapshots) ; hauteur réservée 900 px.

## Registre des cartes API : envoi Bearer et appels POST (30/09/2026)

- `Registre des cartes API.dc.html`, formulaire de carte :
  - sous la clé, « ENVOI DE LA CLÉ » : En-tête X-Api-Key / Authorization: Bearer, avec une aide (« Envoyée dans l’en-tête … », ou « La clé remplace {key} dans l’endpoint. ») ;
  - nouveau bloc « REQUÊTE » : GET / POST · corps JSON ; en POST, zone du corps JSON (contrôlée : « JSON invalide », « Saisissez le corps JSON de l’appel ») et aide sur le contrôle de santé espacé de 24 h.
- Nécessaire pour la carte JEV (API TypeSafe : POST, `Authorization: Bearer`), que le registre ne pouvait pas appeler.
- `admin-api.js` : `toCard` lit `authMode`, `method`, `body` ; `apCreate` et `apSave` les envoient.

## Jev : mémoire de la conversation (30/09/2026)

- `Console Admin.dc.html`, en-tête du panneau Jev : bouton « Nouvelle conversation » (icône crayon, avant « Fermer Jev »), désactivé tant qu'aucune question n'a été posée ; méthode `jevNew` (démonstration : l'échange affiché est effacé, puis l'accueil de Jev).
- `admin-api.js` : chaque question part avec `conversationId` (le serveur y joint les échanges précédents) ; au démarrage, la conversation en cours est réaffichée (`GET /assistant/conversations/current`) ; « Nouvelle conversation » ouvre une conversation neuve (`POST /assistant/conversations`).

## Notifications et alertes : historique des envois planifiés (30/09/2026)

- `Notifications et alertes.dc.html`, « Historique des envois » : statut selon le mode de l'envoi planifié, « Rattrapé » (ambre), « Remplacé » (gris), « Abandonné » (rouge), en plus de « Distribué » et « Échec » ; sous le nom de la règle, une ligne grise avec l'heure prévue et l'heure réelle (champ `note` du serveur). Les envois sur événement s'affichent comme avant.

## Guide utilisateur (30/09/2026)

- Nouvel écran `Guide utilisateur.dc.html`, repris de la maquette « Guide utilisateur 1c » : textes, couleurs et mise en page inchangés ; seules les règles de style de page (`a`, `button`, `input`, focus) sont limitées à l'écran pour ne pas modifier le reste de la Console.
- `Sidebar Console.dc.html` : entrée « Guide utilisateur » dans Plateforme, après « Serveur d’envoi SMTP ».
- `Console Admin.dc.html` : page `guide` (en-tête générique masqué, le composant a le sien) ; props `versions`, `downloads`, `current-user`, `can-replace`, `today` (horloge du serveur), `on-download`, `on-replace`.
- `admin-api.js` : chargement `guide` (`/guide/versions`, `/guide/downloads`), listes vides dès le démarrage ; `gdDownload` (téléchargement tracé par le serveur) et `gdReplace` (dépôt), suivis d'un rechargement.

## Notifications et alertes : enregistrement qui efface la saisie (correction du 30/09/2026)

- Constat : « Enregistrer » réinitialisait le formulaire et la règle n'apparaissait pas avec son nouveau contenu. Cause : l'enregistrement était optimiste (« Règle enregistrée » et brouillon vidé avant la réponse du serveur) ; en cas d'échec (serveur injoignable pendant un redémarrage, session expirée, saisie refusée), `admin-api.js` relisait les règles et remontait la vue (`nrResync`) : la saisie était perdue et la sélection revenait à la première règle (« Jalon en retard »).
- `Notifications et alertes.dc.html`, `save` : « Règle enregistrée » seulement après l'accord du serveur ; en cas d'échec, la liste et la saisie sont rétablies, la règle reste sélectionnée, et le message « Enregistrement impossible : vos modifications sont conservées. Réessayez. » s'affiche (nouveau texte).
- `admin-api.js`, `nrSave` : la promesse échoue sans recharger ni remonter la vue ; le motif du serveur reste affiché (toast) ; en cas de succès, la liste est relue.

## Notifications : retrait des alertes (30/09/2026)

- Décision du commanditaire : il ne reste que des notifications, envoyées à heure fixe (quotidienne ou hebdomadaire).
- `Notifications et alertes.dc.html` (nom de fichier inchangé) : titre « Notifications », sous-titre « Les notifications informent les utilisateurs chaque jour ou chaque semaine, à l’heure prévue. » ; section ALERTES de la liste et ligne TYPE du formulaire supprimées ; fréquence « Immédiate » supprimée (le calendrier est toujours affiché) ; phrase de synthèse « Informer {profils} sur {projets}, … » (au lieu de « Quand {événement}, alerter / informer … ») ; aperçu toujours au style notification ; nouvelle règle quotidienne à l’heure par défaut ; historique d’une règle supprimée affiché sous « Règle supprimée » ; données de démonstration sans alertes. Props : `type` et `evt` retirés du modèle `Rule`, `freq` vaut `day` ou `week`.
- `Sidebar Console.dc.html` : entrée « Notifications » (au lieu de « Notifications et alertes »).
- `Console Admin.dc.html` : en-tête (META) et suggestions de Jev de la page `notifs` ; libellé de permission « Notifications et modules ».
- `Serveur SMTP.dc.html` : sous-titre « Le serveur qui envoie les e-mails de notifications aux utilisateurs. »

## Tiroir des notifications : effacer toutes les notifications (30/09/2026)

- `Notifications.dc.html` : icône « Effacer toutes les notifications » (fournie par le commanditaire) entre « Tout lire » et la fermeture ; inactive s'il n'y a ni incident ni alerte ; survol rouge. Un clic masque les incidents et alertes, affiche « N notifications effacées » (et « Les demandes à traiter restent affichées. » s'il y en a) avec « Annuler » et une jauge de 5 s ; l'effacement part à la fin du délai. Les demandes (invitation, module) ne sont jamais effacées. Nouvelle prop `onClearAll`.
- `Console Admin.dc.html` : `on-clear-all` relié à `ntClearAll` (démonstration : seules les demandes restent).
- `admin-api.js` : `ntClearAll` appelle `DELETE /api/admin/notifications`, puis relit le tiroir.

## Guide utilisateur : dépôt indexé (30/09/2026)

- `Guide utilisateur.dc.html` : sous la ligne de publication, état de l'index (« Indexé · N pages · N extraits · modèle (dimension) »), panneau « Indexation en cours » (étape n sur 5, libellé, fichier, avancement en %), ou « Dernier dépôt non publié (fichier) : motif » ; bouton de dépôt désactivé pendant une indexation (info-bulle) ; mention « 10 Mo au plus » ; dépôts refusés ou en échec dans la frise (« Dépôt non publié · fichier », motif, point rouge) ; modèle de vectorisation sur les versions ; motif du serveur affiché en cas de refus. Nouvelles props `status`, `uploads`.
- `admin-api.js` : chargement `guide` étendu (`/guide/status`, `/guide/uploads`) ; après un dépôt (202), suivi toutes les 1,2 s jusqu'à la publication (« Guide vX publié · N extraits indexés ») ou l'échec (« Guide non publié : motif »).
- `Affectation des modeles.dc.html` : plus de liste « secours » pour la Vectorisation (mention « Pas de modèle de secours : un autre modèle imposerait de revectoriser tous les documents. ») ; conseils adaptés. `Vue reseau IA.dc.html` : voie S de la Vectorisation « Sans secours (revectorisation) », sans invitation à en ajouter un.

## Jev : réponses à partir du guide et réglages de la recherche (30/09/2026)

- `Guide utilisateur.dc.html` : bloc « Recherche de Jev dans le guide » sous le guide (grille 3 × 2 : extraits recherchés, extraits conservés, seuil de similarité, délais de vectorisation, de reclassement et de rédaction en secondes) ; aide sous chaque champ, remplacée en rouge par la borne attendue quand le serveur refuse la valeur ; « Valeurs par défaut » et « Enregistrer » (actif seulement si une valeur change) ; date et auteur de la dernière modification. Nouvelles props `ragSettings`, `onSaveRag` ; bloc masqué si les réglages ne sont pas transmis (`null`).
- `Console Admin.dc.html` : `rag-settings` et `on-save-rag` passés au composant ; hauteur indicative portée à 1 180 px.
- `admin-api.js` : chargement `guide` étendu (`GET /assistant/rag-settings`) ; `gdSaveRag` (`PUT /assistant/rag-settings`), erreurs par champ renvoyées au composant ; sources « Guide · section · p. N » jointes par un saut de ligne.
- `jev-format.js` : puces de sources séparées sur le saut de ligne quand il est présent (les titres de section du guide contiennent des virgules), sinon sur `, ; ·` comme avant.

## Jev : icône « Effacer tous les messages » (30/09/2026)

- `Console Admin.dc.html` : le bouton d'en-tête du panneau de Jev (auparavant crayon « Nouvelle conversation ») prend l'icône fournie `jev-effacer-4a.svg` (bulle barrée d'une croix), libellé « Effacer tous les messages ». Même action : les messages affichés sont effacés et une nouvelle conversation est ouverte côté serveur (sinon ils reviendraient au rechargement) ; désactivé tant que l'utilisateur n'a rien écrit.
