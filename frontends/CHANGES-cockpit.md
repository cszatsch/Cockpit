# Branchement du RISE Cockpit sur l'API — journal des modifications

Référence : brief backend § 11 (branchement du frontend), `docs/DECISIONS.md` (Q1 : branchement complet, design et textes inchangés ; Q8 et Q8 bis). Version d'origine du fichier : révision `f7707a4` (« Ajoute les frontends et ressources livrés, à l'identique »).

## Principe

- **Nouveau module `frontends/api.js`** (module ES, chargé par `import()` comme l'étaient `rise-data.js` et `planning-data.js`). Il porte presque tout le branchement :
  - accès HTTP : base `window.RISE_API_BASE` si elle est définie, sinon même origine (`/api`) ; jeton dans `localStorage['rise-token']`, sinon connexion de développement `POST /api/auth/dev-login` avec `?as=<personId>` ou `p01` ; projet courant `?project=` sinon `RISE` ; `get/post/patch/put/del` ; erreurs `{code, message, fields?, usages?}` transformées en texte lisible ;
  - chargement : `GET /bootstrap` (même forme que `rise-data.js` + `planning-data.js`), complété par `GET /project` (sections libres), `GET /me/tasks`, `GET /comments`, `GET /api/me` (préférences), `GET /barometer` (mois AAAA-MM), `GET /modules` et `GET /invitation-requests` ;
  - **synchronisation centralisée** : `attach(comp)` enveloppe `comp.setState`. Après chaque mise à jour (synchrone dans `support.js`), les magasins persistants sont comparés avant/après et chaque changement devient un appel API. Les saisies continues (lieu, heure, % d'avancement, préférences, sections) sont regroupées (600 ms) ; les corps successifs d'une même ressource sont fusionnés ; les écritures partent en série. Après écriture réussie : rechargement anti-rebond (400 ms, différé tant qu'une saisie ou une écriture est en cours) et remise à zéro des magasins de surcharge — les identifiants attribués par le serveur remplacent ceux du client. En cas d'erreur : message du serveur dans le toast existant (usages compris pour un `409 IN_USE`), puis rechargement, ce qui annule la modification locale. Les `warnings[]` d'une réponse 200/201 s'affichent aussi dans le toast. Le rechargement écrit l'état par le `setState` d'origine : il ne déclenche aucune synchronisation ;
  - appels directs qui remplacent les blocs `// SIMULÉ` (météo, actualités, dépôt et téléchargement de documents, Jev).
- **Fichier HTML** : 16 emplacements, 22 lignes ajoutées ou remplacées et 38 supprimées (`git diff --stat f7707a4`) ; chaque emplacement porte un commentaire `API :`. Aucun changement de design, de texte ni de `support.js`.

## Modifications de `RISE Cockpit.dc.html`

| # | Emplacement (ligne actuelle) | Avant | Après | Raison |
|---|---|---|---|---|
| 1 | `componentDidMount` (l. 1903) | Lecture de `localStorage['rise-cell-comments']` dans `this.state.cmts` | Commentaire `// API :` (ligne supprimée) | Les commentaires de cellule viennent de `GET /comments` (hydratation de `cmts` par api.js) ; brief § 11.6 |
| 2 | `componentDidMount` (l. 1920-1921) | `import('./rise-data.js')` et `import('./planning-data.js')` | `import('./api.js').then(A => A.attach(this))`, toast si le module ne se charge pas | `GET /bootstrap` (même forme de données) et synchronisation des écritures ; brief § 11.2-11.3 |
| 3 | `dbExtLoad` (l. 1953-1954) | Bloc `// SIMULÉ` : appels directs Open-Meteo et GDELT depuis le navigateur | Délégation à `api.dbExtLoad()` : `GET /external/weather?city=` et `/external/news?country=` | Proxy serveur (brief § 9.7) ; hors ligne, le serveur répond 503 et la tuile affiche son état d'erreur habituel |
| 4 | `dbLoad` (l. 1955) | Lecture de `localStorage['rise-db-layout']` et `['rise-db-theme']` | Plus de lecture locale | Disposition et thème du tableau de bord lus dans les préférences (`GET /api/me`) ; brief § 11.6 |
| 5 | `componentDidUpdate` (l. 1957) | Lecture de `localStorage['rise-prof-photo' / 'rise-prof-first' / 'rise-prof-city']` | Commentaire `/* API : … */` | Photo, prénom et ville lus dans les préférences |
| 6 | `downloadDoc` (l. 2136-2137) | Bloc `// SIMULÉ` : fichier texte fabriqué dans le navigateur | Délégation à `api.downloadDoc(d)` : `GET /documents/{id}/file` avec jeton | Téléchargement du binaire stocké ; si le document de démonstration n'a pas de fichier, le message du serveur s'affiche |
| 7 | `pickFile` (l. 2138-2141) | Bloc `// SIMULÉ` : toast sans envoi | `api.uploadDocuments(files)` : `POST /documents` (multipart), puis rechargement | Dépôt réel, extraction asynchrone côté serveur ; le toast d'origine est conservé |
| 8 | Commentaire de `jevExplain` (l. 2348) | `// SIMULÉ : réponses de Jev par règles` | `// API : …` | Les règles locales ne servent plus que de repli si api.js n'est pas chargé |
| 9 | `jevSendText` « Charger » (l. 2406) | Toast seul | + `api.jevLoadFiles(names)` : `POST /documents` des fichiers joints | Les fichiers « chargés dans la Base de connaissance » y sont réellement déposés |
| 10 | `jevSendText` (l. 2410, ligne ajoutée) | Réponse calculée par `jevReply` | `POST /assistant/messages` (contexte espace/onglet/bloc/ligne, `fileIds`) ; réponse, sources et propositions « À valider » | Brief § 7.14 / § 9.10 |
| 11 | `renderVals` › `validate` / `reject` (l. 2433) | Changement d'état local | `POST /assistant/changes/{id}/confirm` ou `/reject`, puis état local et toast d'origine | Rien n'est enregistré avant validation ; même droits qu'une saisie manuelle |
| 12 | `renderVals` › `jevOnFile` (l. 2486) | Progression simulée | `api.jevAttach(files)` : `POST /assistant/files`, progression à 100 % à la réponse | Pièces jointes réelles de Jev |
| 13 | Tableau de bord › `save` (l. 3009) | `localStorage.setItem('rise-db-layout')` | Supprimé (le changement de `dbL` part en `PATCH /api/me/preferences`) | Préférences serveur |
| 14 | Tableau de bord › `thTog` (l. 3019) et `reset` (l. 3054) | `localStorage.setItem('rise-db-theme')` / `removeItem('rise-db-layout')` | Supprimés (changements de `dbInv` / `dbL` synchronisés) | Préférences serveur |
| 15 | Commentaires de cellule › `save` (l. 3083) | `localStorage.setItem('rise-cell-comments')` | Supprimé (le nouvel élément de `cmts` part en `POST /comments`) | Brief § 11.6 |
| 16 | Profil › `setProfFirst`, `setProfCity`, `profFile` (l. 3299-3300) | `localStorage.setItem('rise-prof-first' / 'rise-prof-city' / 'rise-prof-photo')` | Supprimés (changements de `profFirst`, `profCity`, `profPhotoUrl` synchronisés) | Préférences serveur |

Plus aucune clé `localStorage` n'est lue ou écrite par le fichier HTML. api.js conserve le seul jeton (`rise-token`, `rise-token-as`).

## Magasins synchronisés (api.js)

| Magasin de l'état | Appel API |
|---|---|
| `ed['ms:<id>']` (jalon : nom, date, référence, porteur, phase, sous-phase, chantier ; `confIso`) | `PATCH /milestones/{id}` ; `POST /milestones/{id}/confirm` |
| `ed['rk:<id>']`, `ed['is:<id>']`, `ed['ac:<id>']` (nom du chantier converti en `wsId`, origine d'action en `sourceType/sourceId`) | `PATCH /risks|issues|actions/{id}` |
| `ed['fa:<id>']`, `ed['dc:<id>']` (libellés FR → codes de statut, instance → `bodyId`, chantier → `wsId`) | `PATCH /decisions/{id}` (D-007 arbitrée : `409 READ_ONLY` affiché) |
| `ed['pl:<id>']` (début, fin, réel, porteur, prévu forcé) | `PATCH /planning/{phase|subphase|workstream}/{id}` |
| `actStatus` | `PATCH /actions/{id}` `{status}` |
| `sesEd` (date, heure, lieu, statut) / `sesAdded` | `PATCH /sessions/{id}` / `POST /sessions` |
| `refValues['OBJ/id']` (ligne `cells` complète → champs de l'API ; dates « JJ/MM/AAAA », « MM/AAAA », « AAAA » avec précision D/M/Y ; libellés FR → codes ; noms → identifiants) | `PATCH /project`, `/clients`, `/waves`, `/phases` (+ `PUT /phases/{id}/waves`), `/subphases`, `/workstreams`, `/teams`, `/roles`, `/persons` (+ affectations créées ou closes selon la colonne rôle), `/governance-bodies`, `/assignments`, `/deliverables` |
| `refDeleted` | `DELETE /{route}/{id}` (`409 IN_USE` : usages dans le toast, la ligne revient) |
| `phLots` (lots d'une phase et leurs dates) | `PUT /phases/{id}/waves`, `PUT /phases/{id}/waves/{waveId}/dates` (Q8) |
| `txtEd`, `critEd` (fiche de D-007) / `arbData` (autres fiches) | `PATCH /decisions/{id}/arbitration` (`texts`, `criteria`) |
| `bmEd`, `bmAdd` (baromètre : l'écran fusionné est comparé à sa référence) | `PATCH /barometer/surveys/{AAAA-MM}`, `PATCH /barometer/global`, `PATCH /barometer/domains/{id}`, `POST /barometer/surveys`, `POST /barometer/domains` |
| `lvTrack` (avancement, risque saisi) / `lvAdded` / `dlOwner` | `PATCH /deliverables/{id}` / `POST /deliverables` |
| `mineArch`, `mineTitles`, `mineDetails`, `mineDue`, `mineCta` (index → objet recalculé comme l'écran) | `PUT /me/tasks/{type}/{id}/override` ; tâche manuelle : `PATCH /tasks/{id}` |
| `newTasks` | `POST /tasks` |
| `added.ms / rk / is / ac / fa` | `POST /milestones|risks|issues|actions|decisions` (chantier par défaut C8, Q2) |
| `plAdd.ph / sp / ch` | `POST /phases|subphases|workstreams` |
| `psAdded`, `gbAdded`, `roAdded`, `tmAdded`, `wsAdded`, `spAdded`, `phAdded`, `waAdded` | `POST` de l'objet du Référentiel (valeurs par défaut : responsable = directeur de programme, sigle et couleur d'instance) |
| `gbExtra` (sigle, couleur) / `gbMem` (membres) | `PATCH /governance-bodies/{id}` / `PUT /governance-bodies/{id}/members` |
| `roTier` | `PATCH /roles/{id}` `{tier}` |
| `spDesc`, `phDesc` | `PATCH /subphases|phases/{id}` `{description}` |
| `psAcc` (« Inviter ») | `POST /invitation-requests` (Q8 bis) |
| `modPh` (demande d'activation Budget / Bénéfices) | `POST /module-requests` (`bud`, `ben`) |
| `templates` (publication, activation, modification, suppression) | `POST`, `PATCH …/active`, `PATCH`, `DELETE /report-templates` |
| `tplHistory` (rapport « versé ») | `POST /sessions/{id}/reports` |
| `cmts` | `POST /comments` (objet reconnu dans le libellé de ligne : R01, A-41, D-007, P02, J05 ; sinon le projet ; `field` = clé de cellule) |
| `projEd`, `goliveEd`, `goliveDate`, `chronoEd` (contenus libres de la fiche projet) | `PATCH /project/sections/ui.<magasin>` (endpoint existant, Q8) |
| `dbL`, `dbInv`, `profFirst`, `profCity`, `profPhotoUrl`, `profNotif` | `PATCH /api/me/preferences` |

À l'hydratation, api.js reconstruit aussi les magasins dont l'écran a besoin et que le bootstrap ne porte pas dans la forme attendue : sections de la fiche projet, fiches d'arbitrage (`arbData`), lots multiples (`phLots`), risque saisi des livrables (`lvTrack`), niveau des rôles (`roTier`), invitations et demandes de module en attente, tâches manuelles et surcharges de « Mes tâches », commentaires, préférences.

## Magasins non synchronisés (état d'interface)

| Magasin | Raison |
|---|---|
| `audit` | Journal local de l'écran ; l'historique fait foi côté serveur (`GET /audit`) |
| `kbDocs` | Support « versé » à la génération d'un rapport : le serveur crée le rapport (`ReportInstance`), pas un document de la Base de connaissance ; la ligne disparaît au rechargement |
| `modAt` | Horodatage affiché de la demande d'activation : non stocké (la demande l'est) |
| `spCodeEd`, `mineDraft`, `tplDraft`, `refDraft`, `addD`, `psNew`, `tf`, filtres, tris, sélections, panneaux, `pop`, `cm`, `jev*` | Brouillons et état d'affichage ; leur validation passe par un magasin synchronisé |

## Changements backend (`backend/src/cockpit/` uniquement)

| Fichier | Changement | Raison |
|---|---|---|
| `collab/collab.controller.ts` | `field` d'un commentaire : 80 → 200 caractères (`COMMENT_FIELD_MAX`) | Le Cockpit identifie une cellule par `onglet|libellé de ligne|colonne` (libellé jusqu'à 70 caractères) |
| `test/e2e/annexes.spec.ts` | Test : clé de cellule longue acceptée, 201 caractères refusés | Couverture du changement |

`cd backend && npm test` : 8 suites, 99 tests verts.

## Vérification navigateur

- `backend/test/browser/cockpit.e2e.ts` (ts-node) : amorce `rise_fe_cockpit`, démarre l'API si besoin, sert la révision d'origine du HTML (dernière révision git sans api.js), visite 23 vues (Aujourd'hui ; Pilotage : planning, jalons, livrables, risques, actions, décisions, baromètre, séances, budget, mes tâches ; Comités : générer, bibliothèque, historique ; Base de connaissance ; Info projet : fiche, dispositif, Référentiel et 5 de ses objets), capture chaque écran en faisant défiler le conteneur principal (48 écrans) et mesure l'écart de pixels avec l'origine ; puis vérifie la persistance après rechargement (plan de risque et lieu de séance saisis dans l'interface, date de jalon, cellules du Référentiel dont une date MM/AAAA, statut d'action, commentaire, création de risque, refus de suppression 409, fiche D-007 en lecture seule 409). Captures dans `<tmp>/rise-cockpit-e2e/`.
- `backend/test/browser/cockpit.stores.ts` : sonde qui modifie chaque magasin synchronisé et liste les appels émis et leur statut (base réamorcée au préalable).

## Écarts et limites connus

- **Données du jeu** (décisions backend, pas le branchement) : nom et objectifs du projet pris dans `project.name` (Référentiel › Projet) ; colonne « société » des personnes = équipe ; `late` recalculé (Q5) : une action échue de plus, filtre « porteur » légèrement différent ; affectations régénérées (Q6) : le bloc « Historique des rôles » de Dispositif (Karim Benali, Antoine Mercier) n'a plus de rôles passés ; habilitation ADMIN synthétisée (`admin-p02` au lieu de `h02`).
- **Commentaires de cellule** : la « valeur au moment du commentaire » (`val`) n'est pas stockée par l'API ; la clé de cellule dépend du libellé de la ligne (un renommage de ligne détache ses commentaires).
- **Surcharges de « Mes tâches »** : indexées par position dans la liste recalculée ; une modification simultanée qui change la liste (ex. action terminée dans le même geste) peut décaler l'objet visé.
- **Rapport non versé** (téléchargement seul) : aucun objet serveur ; l'entrée de journal disparaît au rechargement. Le support versé n'apparaît pas dans la Base de connaissance (voir `kbDocs`).
- **Création puis modification immédiate** d'une ligne du Référentiel avant le rechargement (moins de ~1 s) : la modification de la ligne locale est ignorée (la ligne n'a pas encore d'identifiant serveur).
- **Chantiers et sous-phases sans dates** (créés depuis le Référentiel) : exclus du Gantt (l'écran d'origine ne sait pas les dessiner).
- **Jev** : les réponses sont celles du service bouchon du serveur (création d'action, statut, report d'échéance) ; les règles locales (création de risque guidée, confirmations multiples) ne servent plus qu'en repli.
- **API injoignable** : l'écran reste vide et le toast affiche « Données indisponibles — … · nouvel essai dans 15 s » jusqu'au rétablissement.

## Fichier ajouté

- `Widget.dc.html` : composant des widgets de l'écran Aujourd'hui (`<dc-import name="Widget">`). Il manquait dans la première livraison et a été fourni ensuite. Il est ajouté **sans modification** : il ne fait qu'afficher l'objet `w` calculé par le Cockpit, et n'appelle donc pas l'API.

## Authentification (écrans de connexion, voir `CHANGES-auth.md`)

- **`RISE Cockpit.dc.html`, `logout` du profil (barre latérale)** : le bouton affichait seulement le toast « Vous êtes déconnecté ». Il appelle désormais `api.logout()` : `POST /api/auth/logout`, puis écran `/connexion` avec le bandeau « Vous êtes déconnecté ». Sans `api.js` chargé, le toast d'origine reste. Une ligne modifiée, commentée `API :`.
- **`api.js`** : sans `?as=`, les appels passent par la session par cookie ouverte sur `/connexion` (en-têtes `X-Rise-Surface: app` et `X-CSRF-Token`). Une réponse `401` (session absente, expirée, fermée) ou `403 PASSWORD_CHANGE_REQUIRED` renvoie vers `/connexion`, avec `?raison=expiree` si la session a expiré et `?suite=` pour revenir à la page ouverte. `attach()` lance la surveillance d'inactivité (30 min, « Toujours là ? » 60 s avant). Avec `?as=<personne>` (serveur en `AUTH_DEV`), la connexion de développement par jeton reste inchangée : c'est le mode des tests navigateur, qui passent maintenant `&as=p01`.
- **Mon profil › Sécurité** (décisions du 28/09/2026) : « Modifier » (`profPwd`) affichait « Modification du mot de passe — à venir ». Il ouvre maintenant la fenêtre de changement de mot de passe (`api.changePassword` → `openPasswordDialog` d'`auth-api.js`, `POST /api/auth/password`), activable aussi au clavier (`role="button"`, `tabIndex`, Entrée ou Espace). « Modifié il y a 3 mois » devient `{{ profPwdAge }}`, l'ancienneté réelle lue dans `GET /api/auth/session` (le texte d'origine reste sans API). La ligne « Authentification à deux facteurs · Activée » est retirée : la double authentification n'existe pas. Trois emplacements, commentés `API :`.

## Widgets Météo et Actualités par le proxy des cartes API (28/09/2026)

- `api.js` : la tuile météo appelle `/api/widgets/proxy/open-meteo-geocodage` puis `/api/widgets/proxy/open-meteo`, la tuile actualités `/api/widgets/proxy/gdelt` (en-tête `X-RISE-Widget`) ; la mise en forme des données est inchangée. `request()` accepte des en-têtes supplémentaires (`opts.headers`).
- Justification : spécification REGISTRE API § 5 (clé, quota, cache et état gérés par le serveur ; 503 → état d'erreur de la tuile).

## Tuile Actualités : secours par les flux RSS (28/09/2026)

- `api.js` : si GDELT ne répond pas ou ne renvoie rien, la tuile lit `GET /api/widgets/feeds?limit=5` (Le Monde, L'Équipe, BBC…) ; la date est remise au format attendu par la tuile.

## Tuile Actualités : actualités agrégées du registre (28/09/2026)

- `api.js` : la tuile lit `GET /api/widgets/news?limit=5` (cartes actives de la catégorie Actualités : GNews, NewsData.io, flux RSS…) ; GDELT retiré.

## Date réelle du jour (29/09/2026)

- `RISE Cockpit.dc.html` : aides `thisYear()`, `nextSession()`, `sessionLabel()`, `frShortIso()`. Plus de dates figées : compte à rebours du Go-Live (prévision du bootstrap), prochain COPIL et échéances des 15 jours (séances planifiées), compte à rebours de la fiche d'arbitrage (prochaine séance), mini-Gantt du chemin critique (éléments critiques du planning), références de planning (bootstrap), raccourcis d'échéance du formulaire de tâche (calculés), année en cours au lieu de 2026 ; date du jour du projet (`fToday()`) au lieu de l'horloge du navigateur pour ces calculs.

## Registre des cartes API v3c : identifiants de widgets (29/09/2026)

- `api.js` : l'en-tête `X-RISE-Widget` porte l'identifiant du catalogue des widgets (`meteo`, `news`) au lieu des libellés « Météo · ville » et « Actualités ». Aucun effet visible.

## Notifications internes (29/09/2026)

- `RISE Cockpit.dc.html` : cloche « Notifications » dans le pied de la barre latérale, au-dessus de Jev, avec le nombre de non lues (pastille sur l'icône en mode replié) ; tiroir `Notifications Cockpit.dc.html` le long de la barre ; méthodes `ntToggle`, `ntRead` et `ntReadAll`.
- `Notifications Cockpit.dc.html` : nouveau composant (tiroir, onglets, lecture au clic, « Tout lire », Échap), démonstration intégrée sans API.
- `api.js` : chargement des notifications au démarrage, toutes les 60 s et au retour sur l'onglet ; `ntLoad`, `ntRead` et `ntReadAll`, avec mise à jour immédiate du compteur.

## Connexion Cockpit : nouvelle photo du volet gauche (29/09/2026)

- `Authentification.dc.html` (surface `app`) : `assets/connexion-cockpit.webp` (1190 × 1322, 90 Ko) remplace `banner-aujourdhui.jpg` dans le volet gauche ; cadrage `32% 38%` (visage et cartes visibles, y compris dans le bandeau mobile) ; dégradés et textes inchangés. La fenêtre « session expirée » garde son image.

## Correctif : contenu principal invisible (29/09/2026)

- `RISE Cockpit.dc.html` : le tiroir `Notifications Cockpit` était importé à l'intérieur de la grille du shell ; son enveloppe occupait la colonne du contenu et poussait `<main>` dans une colonne de 0 px (écran vide, ou contenu écrasé dans la colonne de Jev quand il est ouvert). L'import est placé après la grille ; le tiroir, en position fixe, s'affiche à l'identique.

## Correctif : droits de l'utilisateur connecté (onglet Référentiel) ; carte de la barre latérale (29/09/2026)

- `RISE Cockpit.dc.html` : `prof()` calculait les droits de l'utilisateur connecté à partir des seules habilitations de sa personne du référentiel. Un compte sans personne (PMO attribué par la Console, comme le compte initial) n'avait donc aucun droit dans l'écran : pas d'onglet « Référentiel » dans Info projet, référentiel en lecture seule. Pour l'utilisateur connecté, l'écran utilise désormais ses droits effectifs calculés par le serveur (`GET /api/me` → `effective` : compte et personne réunis) ; le calcul par personne reste pour les autres personnes affichées.
- `api.js` : `meAccess` (droits effectifs de `/me`) transmis à l'écran au chargement.
- Carte de la barre latérale : initiales et profil principal de l'utilisateur connecté, au lieu de « RL » et « PMO projet » écrits en dur.

## Référentiel › Personnes : invitation (29/09/2026)

- `RISE Cockpit.dc.html` : état du compte de chaque personne lu sur le serveur (`psAccSrv`) : « Compte activé », « Invitation envoyée le JJ/MM par l'administrateur · en attente d'activation », « Demande d'invitation transmise à l'administrateur le JJ/MM ». Le bouton « Inviter à activer son compte » n'apparaît que pour une personne sans compte ; message « Demande d'invitation transmise à l'administrateur » ; un nouveau clic sur une demande en cours ne crée rien. Démonstration sans serveur inchangée.
- `api.js` : chargement de `/account-states` ; après une demande, état relu sur le serveur ; message précis si la personne a déjà un compte.

## Objet « Info projet » et Fiche projet (30/09/2026)

- Référentiel, « Objets du modèle » : nouvel objet « Info projet » après « Projet » (rubrique · libellé · valeur, une ligne par élément ; rubrique en liste de choix ; « + » pour ajouter ; suppression par ligne). Méthodes `ipRub`, `ipRows`, `projectInfo`.
- Fiche projet : blocs lus dans l'objet au lieu du texte écrit en dur (programme en une phrase, enjeux stratégiques, pays et entités avec leurs compteurs, nom du client de l'en-tête « Le client — … ») ; rendu inchangé. « Marques du groupe » et « Le programme en une phrase » sont permutés.
- `api.js` : magasin `ipAdded` ; `onProjectInfo` envoie `PUT /project/info` quand une ligne de l'objet change.

## Tiroir des notifications : retrait des alertes (30/09/2026)

- `Notifications Cockpit.dc.html` : onglet « Alertes » supprimé (restent « Toutes » et « Non lues ») ; icône, pastille et libellé toujours ceux d’une notification ; texte d’état vide « Les notifications de vos projets apparaîtront ici. » ; données de démonstration sans alertes. Prop `items` : champ `kind` retiré.

## Tiroir des notifications : mise en forme du contenu (30/09/2026)

- Constat : le texte rédigé par le modèle (rubriques « ## », puces, **gras**) s'affichait brut, en un bloc gris uniforme.
- `Notifications Cockpit.dc.html` :
  - liste : pastille de tuile et étiquette « Notification » retirées (un seul type) ; point de non-lecture discret ; titre, puis « PROJET · date » ; résumé de deux lignes tiré du premier paragraphe utile (salutations et annonces « Veuillez trouver… » écartées) ;
  - lecture (notification dépliée) : carte blanche ; salutation en retrait ; première phrase utile mise en avant ; rubriques « ## » en petites capitales avec un filet sarcelle ; liste dont chaque élément commence par un chiffre (2 à 6 éléments) rendue en rangée de chiffres clés (valeur, libellé, précision entre parenthèses ; valeur en rouge si le libellé parle de critique, retard, dépassement ou échec) ; puces sarcelle ; étapes numérotées en pastilles ; gras conservé ; titres « # » omis (redondants avec l'objet) ;
  - données de démonstration : une notification structurée ajoutée.

## Tiroir des notifications : effacer toutes les notifications (30/09/2026)

- `Notifications Cockpit.dc.html` : icône « Effacer toutes les notifications » (fournie par le commanditaire, liste qui s'estompe barrée d'une croix) entre « Tout lire » et la fermeture ; inactive sans notification ; survol rouge. Un clic vide la liste et affiche le bandeau « N notifications effacées » avec « Annuler » et une jauge de 5 s ; l'effacement définitif part à la fin du délai (ou à la fermeture de l'écran). Nouvelle prop `onClearAll`.
- `RISE Cockpit.dc.html` : `on-clear-all` relié à `ntClearAll` (démonstration : liste vidée localement).
- `api.js` : `ntClearAll` appelle `DELETE /api/me/notifications` ; en cas d'échec, la liste est relue.

## Jev : icône « Effacer tous les messages » (30/09/2026)

- `RISE Cockpit.dc.html` : bouton ajouté dans l'en-tête du panneau de Jev, à gauche de la croix de fermeture, avec l'icône fournie `jev-effacer-4a.svg`. Il efface les messages affichés et ramène au message d'accueil de Jev (avec ses suggestions) ; saisie, pièces jointes et proposition en attente sont abandonnées. Désactivé tant qu'il n'y a que le message d'accueil. Aucun appel à l'API : les échanges du Cockpit ne sont pas conservés côté serveur.

## Base de connaissance : dépôt, résumé, suppression (30/09/2026)

- « Déposer un document » ouvre une fenêtre : nom de chaque fichier (modifiable), type (Référence, Support de comité, Compte rendu, Contractuel, Livrable), confidentialité (Interne / Restreint, avec la portée affichée). Formats proposés : PDF, Word, PowerPoint, Excel.
- Doublon de nom : fenêtre « Ce document existe déjà » (version et auteur) : Remplacer (version suivante), Garder les deux, Annuler ; Remplacer n'est proposé qu'au PMO et à l'auteur du dépôt.
- Tableau : « Déposé par … le … » sous le nom ; colonne Extraction · indexation avec l'avancement (« En cours · 45 % »), l'échec et son motif (« En échec · … »), la précision d'une extraction partielle ; icône Supprimer (PMO et auteur du dépôt) avec confirmation ; colonne Actions élargie ; badge Excel en vert.
- Icône « Vue » : le faux aperçu (lignes grises, versions inventées) est remplacé par le résumé du document : description en deux phrases, résumé mis en forme, avancement ou motif d'échec, nombre d'extraits et modèle d'indexation, Télécharger et Supprimer.
- `api.js` : `uploadDocuments(items, { type, conf })` (un fichier après l'autre, choix du doublon), `docDetail`, `deleteDoc` ; relecture toutes les 2,5 s tant qu'un document est en cours de traitement (`KB_POLL_MS`) ; `ApiError.body` garde le corps de l'erreur.

## Base de connaissance vide (30/09/2026)

- `RISE Cockpit.dc.html` : sous le tableau, « Aucun document pour l'instant » et une invitation à déposer (ou « Aucun document de ce type » quand un filtre est actif), les documents factices n'étant plus amorcés.

## Base de connaissance : fenêtre « Vue » refondue (30/09/2026)

- `RISE Cockpit.dc.html` : fenêtre du résumé redessinée — en-tête épuré (format en étiquette discrète, type · version · confidentialité, titre, auteur et date du dépôt), « En bref » (description en deux phrases, filet d'accent), chiffres clés (jusqu'à 4, taille commune sans troncature), rubriques en deux colonnes « titre | points » (une colonne quand la place manque), états chargement (chatoiement), traitement en cours (avancement) et échec (motif) ; pied discret (état de l'index, « Supprimer » en lien, « Télécharger ») ; défilement fin avec fondu en bas. Animation `kb-shimmer`.
- Le résumé est désormais un objet structuré (`description`, `figures`, `sections`) renvoyé par `GET /documents/:id`.

## Tuile Trafic alimentée par le Registre des cartes API (01/10/2026)

- `api.js` : géocodage de la ville du profil et de la ville du projet (carte `open-meteo-geocodage`), puis aller et retour par la carte `tomtom-routing` (proxy, en-tête `X-RISE-Widget: trafic`).
- `RISE Cockpit.dc.html` : la tuile Trafic affiche la durée réelle (« 50 min », « 1 h 05 ») et le retard (« +1 min », « Trafic fluide ») ; « Calcul du trajet… » pendant l'appel ; « Trafic indisponible » en cas d'échec, au lieu des valeurs d'exemple écrites dans le code.

## Widgets d'Aujourd'hui : valeurs réelles (01/10/2026)

- `RISE Cockpit.dc.html` (`dbCatalog`) : « L'essentiel, par Jev » (heure, titre, avancement, décompte), « Avancement vs référence », « Mes tâches », « Livrables sous 30 jours » calculés à partir des données ; « Tendance des risques » et « Baromètre » sans courbe inventée quand l'historique manque ; libellé de la source des actualités corrigé ; barres de la page Risques protégées contre une semaine sans risque ouvert.

## Widget Actualité : six titres (01/10/2026)

- `RISE Cockpit.dc.html` : le widget Actualité affiche les 6 titres les plus récents (au lieu de 3) ; sa taille passe de 2 × 1 à 2 × 2 pour que les six lignes tiennent sans être coupées (une tuile 2 × 1 n'en contient que 3 ou 4).
- `api.js` : 6 titres demandés à `GET /api/widgets/news` et conservés.

## Widgets d'Aujourd'hui : refonte visuelle (01/10/2026)

Météo et Trafic inchangés. Pour tous les autres (`Widget.dc.html`, préparation `w.view` dans `RISE Cockpit.dc.html`) :
- Langage commun : grands chiffres en italique gras (style des chiffres de la maison), étiquettes en petites capitales plus serrées, filets fins au lieu de cadres ; la couleur ne porte qu'un statut (bleu nuit neutre, sarcelle en avance, ambre en léger retard, rouge en décrochage).
- KPI : taille du chiffre adaptée à sa longueur ; anneau pour « Avancement vs référence » (réel en arc, prévu en repère, écart au centre) et « Livrables » (part livrée) ; barre segmentée avec légende pour « Fiches d'arbitrage » ; « dans N j » pour le prochain COPIL.
- Listes : clé alignée en colonne (score, code, date, source) colorée selon le statut, pastille de gravité seulement quand elle informe, une ligne par élément, lignes plus aérées dans les tuiles hautes, état « Rien à signaler » ; « Risques critiques » affiche jusqu'à 8 risques.
- Courbes : aire en dégradé, dernier point marqué d'un halo, série plate centrée.
- Météo des chantiers : couleur de chaque barre selon l'écart à la référence (le signal d'origine n'était pas reconnu : tout était en bleu nuit), repère de référence, légende « réel · référence ».
- Chemin critique : tâches terminées, en cours, à venir distinguées ; repère « Aujourd'hui » en pointillé, étiqueté sur l'axe.
- L'essentiel, par Jev : titre fort, points en deux colonnes (rubrique colorée, texte), signature « ✦ Jev · à jour », ligne des sources sur une ligne.
- Thème sombre : nouvelles couleurs converties (`dbDarkView`).

## Widgets d'Aujourd'hui : une forme propre à chaque liste (01/10/2026)

Les widgets en liste reçoivent chacun une visualisation adaptée à leur donnée (`w.viz` et `w.vz` préparés dans `dbCatalog()`, blocs `isTimeline`, `isStrip`, `isFeed`, `isDocs`, `isRiskmap`, `isHero` dans `Widget.dc.html`). La liste générique ne sert plus qu'en repli :
- Prochains jalons : frise chronologique partant d'aujourd'hui, losanges placés à leur date, légendes réparties et reliées (date, nom, « à l'heure » ou « +N j de glissement ») ; méta « prochain dans N j ».
- Échéances des 15 prochains jours : ruban de 15 jours (aujourd'hui en pastille, week-ends atténués), un symbole par échéance (● comité, ◆ jalon, ■ arbitrage), les deux prochaines journées en clair ; légende en méta.
- Actualité : titre principal à la une, cinq titres suivants ; source colorée, heure relative ; chaque titre ouvre l'article (`url` conservée par `api.js`).
- Documents récents : tranche colorée par format, titre sur deux lignes, type · version · date.
- Risques critiques : matrice probabilité × impact (zones teintées, pastilles comptées, détail au survol), puis les quatre plus exposés.
- Décisions en attente, Actions en retard, Problèmes ouverts, Incohérences : chiffre en tête puis liste priorisée (échéance ou ancienneté ; initiales du porteur et jours de retard ; histogramme des sévérités ; blocages et avertissements).
- Thème sombre : couleur de fond `--wbg` pour les contours des repères.

## Décisions en attente et Actualité : nouvelle mise en forme (01/10/2026)

- Décisions en attente : file d'attente — les trois plus anciennes d'abord, jauge d'attente relative à la plus ancienne, colorée à partir de 14 jours (ambre, `DEC_WAIT_WATCH`) et 30 jours (rouge, `DEC_WAIT_ALERT`) ; « + N plus récentes » ; méta « prochaine instance aujourd'hui / demain / le … » (prochaine séance planifiée des instances concernées).
- Actualité : une éditoriale en deux colonnes — à gauche le titre principal (filet et source en couleur, « il y a … », « Lire l'article ↗ »), à droite le fil des cinq suivants sur un rail horodaté (source, titre sur deux lignes).
