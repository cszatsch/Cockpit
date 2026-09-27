# Questions ouvertes avant développement

Chaque question indique ma recommandation. Tant qu'une question n'est pas tranchée, rien n'est tenu pour acquis. Une fois tranchée, la réponse sera reportée dans `DECISIONS.md` avec la constante qui la porte.

## Bloquantes (elles changent le schéma ou le contrat)

**Q1. Périmètre des modifications des frontends.**

Pour que les écritures survivent au rechargement, chaque méthode d'écriture doit appeler l'API. Il y en a environ 40 dans le Cockpit et 30 dans la console. Il faut aussi convertir les libellés FR en codes, les noms en identifiants, et accepter les identifiants du serveur. Les briefs (§ 11) demandent ce travail ; ta consigne est de ne modifier que si c'est indispensable.

- **(a) Recommandé** : branchement complet, selon les briefs, dans des fichiers `api.js` et `admin-api.js` avec des adaptateurs.
  - Aucun changement de design ni de texte.
  - Les messages d'erreur du serveur (403, 409, 422) s'affichent dans les toasts existants.
  - Chaque modification est justifiée dans `frontends/CHANGES.md`.
- (b) Lecture seule : `GET /bootstrap` et les listes de la console. Les écritures restent locales.
- (c) Backend seul : aucun changement des frontends. Le branchement est seulement documenté.

**Q2. Chantier des actions.** Le § 8.6 exige un `wsId`. Le modèle § 6.2 n'en a pas, les données non plus, et le formulaire ne le saisit pas.

- **(a) Recommandé** : ajouter `wsId` à Action.
  - À l'amorçage, il est dérivé de la source (risque, problème, jalon ou décision → son chantier). Sans source, l'action va sur C8 « Pilotage et transverse ».
  - En création, il est obligatoire pour un Responsable. Pour le PMO, il vaut C8 par défaut.
  - Ce choix implique d'ajouter un champ Chantier au formulaire d'action.
- (b) Action sans chantier : seul le PMO peut la modifier, plus le porteur ?
- (c) Dériver le chantier du porteur.

**Q3. Profils et comptes dans la console.** La console affiche **un profil unique global** par compte et des projets `pr[]`. Le § 8.3 prévoit des habilitations **par projet et par chantier**. Les administrateurs existent en deux sources : `u.p === 'admin'` et `admins[]`.

- **(a) Recommandé** :
  - Le serveur ne stocke que des `Habilitation` par projet, plus des `AdminGrant`.
  - ADMIN est une habilitation globale de plateforme, synchronisée avec `AdminGrant`.
  - `profile` + `projectCodes[]` de la console attribue ADMIN ou PMO sur ces projets.
  - Si l'Admin choisit `resp` ou `lec` pour une personne du référentiel : `422` (« à attribuer par le PMO »). Pour un compte externe : LECTEUR, avec des chantiers transmis par `PUT /accounts/{id}/reader-scopes`, sans écran dans la console (hors du code actuel).
  - La console affiche le profil le plus fort, calculé par le serveur.
  - Le « profil utilisé » dans l'audit est le profil qui accorde le droit ; ADMIN pour toute la console.
- (b) Autre règle : à préciser.

**Q4. Import Excel.** Deux points se contredisent : les colonnes CONTRÔLE (ignorées selon le brief Cockpit, utilisées selon le brief Console) et la colonne Permission (obsolète selon le brief, mais obligatoire dans le fichier).

- **(a) Recommandé** :
  - Les colonnes CONTRÔLE (`⚠` et `◔`) sont lues comme **indications**, et le serveur **refait tous les contrôles** lui-même, car il fait foi. Un fichier non recalculé, sans valeurs de formule en cache, n'est donc pas un problème.
  - La colonne Permission est ignorée, même vide.
  - Les LECTEUR ne sont pas créés par l'import : le PMO les attribue ensuite.
  - Valeurs par défaut des champs absents du fichier :
    - responsable de phase = directeur de programme ;
    - avancement = 0 ;
    - chantier sans dates = dates du projet ;
    - rôle de membre = MEMBER ;
    - prénom et nom séparés au **premier espace** ;
    - devise = EUR.
  - « Bimensuelle » devient BIWEEKLY.
  - Les codes C* et J* sont réattribués par le serveur.
- (b) Autre règle : à préciser.

## Majeures

**Q5. Critères d'acceptation contredits par les données.**

- **Numéro de séance** : le COPIL a déjà les séances n°21 à 23. La règle § 7.8 donne n°24, alors que le test attend n°21. *Recommandé* : appliquer la règle (n°24) et adapter le test.
- **Validations en attente** : la règle est « dont je suis décideur », mais D-009 (TO_ARBITRATE) n'a pas de décideur. Le résultat vaut 0, alors que le frontend actuel affiche 1. *Recommandé* : appliquer la règle du brief et renseigner `maker` des décisions ouvertes à l'amorçage (D-009, D-005 et D-010 → p04, sponsor et décideur de D-007). Ce choix est **à valider**.
- **Actions en retard** : A-43 et A-44 sont échues mais portent `late:false` dans les données. Le calcul serveur donne 4 actions en retard au lieu de 2. *Recommandé* : le calcul fait foi.
- **Anomalies** : faut-il ne signaler que les risques **critiques** sans plan (brief), ou tous les risques sans plan (frontend) ? Et les actions échues, que le frontend ajoute ? *Recommandé* : suivre le brief (critiques uniquement) et **ajouter** les actions échues comme dans le frontend.

**Q6. Affectations.** `PROJECT_ASSIGNMENT` n'est pas résoluble : les libellés de rôle sont absents de `model.ROLE`, et 23 personnes n'ont aucune affectation.

- *Recommandé* : créer les affectations à partir de `PERSON.cells[4]`, qui contient les rôles du référentiel. Date de début = début du projet. Fin = fin du `PROJECT_ASSIGNMENT` correspondant quand la personne en a un.
- Les libellés de `PROJECT_ASSIGNMENT` sont ignorés.

**Q7. Transitions de séance.** Le frontend permet « Rétablir » (CANCELLED → PLANNED), HELD → PLANNED, et « Confirmer » sur une séance future. Le brief est muet.

- *Recommandé* :
  - PLANNED → HELD : autorisé ; refusé pour une séance future (`422`).
  - PLANNED → CANCELLED : autorisé.
  - CANCELLED → PLANNED : autorisé.
  - HELD → autre statut : refusé (`422`).

**Q8. Données écrites par le frontend sans entité dans le brief.** Faut-il les persister ?

Liste :
- dates de phase par lot (`phLots`) ;
- avancement prévu forcé (`prevuSet`) ;
- historique du go-live et chronologie ;
- niveau de rôle (`roTier`) ;
- archivage et renommage des tâches calculées ;
- suppression de template ;
- composant `budget` et portée `Phase` des templates ;
- type d'équipe (client / AMOA / intégrateur) ;
- chantiers d'une personne ;
- invitation depuis le Référentiel ;
- module Bénéfices.

*Recommandé* : **oui**, avec des champs ou tables minimaux documentés dans `DECISIONS.md`. Sinon, ces saisies seraient perdues au rechargement. Exceptions :
- « chantiers d'une personne » : dérivé des habilitations, en lecture seule ;
- invitation de compte depuis le Référentiel (`psAcc`) : le brief réserve les comptes à l'Admin. Deux options : `403` pour le PMO, ou une « demande d'invitation » que l'Admin valide dans la console. **À trancher.**

**Q9. Signal `sig` de l'avancement des chantiers.** Le brief le rattache à la fraîcheur des données (7 et 14 j). Le frontend le calcule à partir de l'écart entre avancement et cible (seuils −20 et 0).

- *Recommandé* : écart entre avancement et cible pour `sig`, avec les seuils du frontend. La fraîcheur alimente seulement l'écran « À revoir ».

**Q10. Points de la console.**

- **(a) Module Budget** : le brief le dit inactif, mais la console l'a actif sur RISE et ATLAS. *Recommandé* : inactif partout à l'amorçage (brief).
- **(b) Planification des snapshots** : globale dans l'écran, par projet dans le brief. *Recommandé* : par projet côté serveur ; l'écran édite la planification du projet sélectionné.
- **(c) Fournisseur non testé (UNTESTED)** : est-il disponible pour l'état des fonctions ? *Recommandé* : non disponible (règle prudente).
- **(d) Snapshot manuel sans libellé** : l'écran met « Capture manuelle » par défaut, alors que le brief exige `400`. *Recommandé* : `400`, et le frontend retire la valeur par défaut. C'est une modification justifiée.

## Environnement

**Q11. Déploiement.** Je développe et teste ici avec PostgreSQL 16 en local, et je fournirai un `docker-compose.yml`. Y a-t-il une cible de déploiement ou une contrainte d'infrastructure (Docker, cloud, SSO réel) ?

**Q12. Frontends dans ce dépôt.** J'ai copié le contenu du ZIP **à l'identique** dans `frontends/` (commit séparé), pour que toute modification ultérieure soit visible en diff. Cela te convient-il ?
