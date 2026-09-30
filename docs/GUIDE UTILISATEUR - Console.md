# Guide utilisateur de la Console d'administration RISE

Version du 30 septembre 2026. Ce guide décrit le comportement réel de la Console, établi à partir de son code. Les écarts et les points encore ouverts sont regroupés en annexe.

## Sommaire

1. Présentation générale
2. Prise en main
3. Fonctionnalités, une par une
4. Rôles et droits
5. Paramétrage
6. FAQ et dépannage
7. Annexes : règles de gestion, points à clarifier, fonctionnalités non documentées

# 1. Présentation générale

## 1.1 À quoi sert la Console

RISE comprend deux espaces :

- **le Cockpit**, où les équipes projet pilotent leurs projets (planning, risques, décisions, comités…) ;
- **la Console d'administration**, qui règle la plateforme elle-même.

La Console sert à :

- gérer les comptes et les droits d'accès aux projets ;
- régler l'intelligence artificielle : fournisseurs, clés, modèles, affectation aux fonctions, budgets ;
- créer des projets à partir d'un fichier Excel, en garder l'historique (snapshots) et les restaurer ;
- régler les services de la plateforme : modules, cartes API, notifications envoyées aux utilisateurs, serveur d'e-mail, guide utilisateur ;
- surveiller l'ensemble : points à traiter, notifications de l'administrateur, journal d'audit.

La Console ne modifie pas les données métier des projets (actions, risques, jalons…). Ces données se gèrent dans le Cockpit.

## 1.2 À qui elle s'adresse

La Console est réservée aux **administrateurs de la plateforme**. Un compte sans droit d'administration ne peut pas l'ouvrir, même s'il est PMO d'un projet.

## 1.3 Principes à connaître

- **Tout est tracé.** Chaque action de la Console est inscrite dans le journal d'audit. Ce journal ne peut être ni modifié ni effacé.
- **Le référentiel du projet fait foi pour les personnes.** Le PMO tient la liste des personnes dans le Cockpit. La Console crée les comptes et les droits, et signale les écarts avec ce référentiel. Elle ne corrige jamais un compte d'elle-même.
- **Heure de Paris.** Les dates et heures affichées, les envois planifiés et les tâches automatiques suivent l'heure de Paris, sauf mention contraire.
- **La Console se tient à jour.** Les points « À traiter » et les notifications de l'administrateur sont recalculés à chaque lecture. Ils disparaissent d'eux-mêmes quand leur cause n'existe plus.

## 1.4 Glossaire

| Terme | Définition |
|---|---|
| Administrateur | Compte qui a accès à la Console. Il voit tous les projets du Cockpit en lecture seule. |
| PMO | Profil qui gère un projet dans le Cockpit : référentiel et suivi. |
| Responsable | Profil qui gère un ou plusieurs chantiers d'un projet. |
| Lecteur | Profil qui consulte un ou plusieurs chantiers d'un projet. |
| Habilitation | Droit d'un compte sur un projet : PMO, ou Responsable / Lecteur d'un chantier. |
| Référentiel | Données de base d'un projet dans le Cockpit : équipes, personnes, lots, phases, chantiers, jalons, instances. |
| Chantier | Sous-ensemble d'un projet, avec un responsable. |
| Invitation | E-mail qui permet à une nouvelle personne de choisir son mot de passe et d'activer son compte. |
| À traiter | Liste des points qui demandent une action, sur la Vue d'ensemble. |
| Cloche | Tiroir des notifications de l'administrateur : incidents, alertes et demandes. |
| Fournisseur IA | Société qui fournit des modèles d'IA (Anthropic, OpenAI, Google, Mistral…). Il faut sa clé API. |
| Clé API | Code secret qui autorise la plateforme à appeler un service externe. |
| Modèle | Un modèle d'IA d'un fournisseur. Trois catégories : LLM (génère du texte), Embedding (vectorise des textes), Reranking (reclasse des résultats). |
| Fonction IA | Usage de l'IA dans la plateforme : Insights, Gestion des données, Rapports, Guidage console, chaîne Documents. |
| Principal / secours | Modèle qui répond normalement à une fonction, et modèle qui prend le relais s'il est indisponible. |
| Plafond, seuil d'alerte | Budget mensuel d'IA, et pourcentage de ce budget à partir duquel la Console alerte. |
| Jeton (token) | Unité de mesure du texte traité par un modèle ; la facturation en dépend. |
| Jev | L'assistant IA de la plateforme. Dans la Console, il explique et guide, sans agir. |
| Persona | Identité (nom, style, avatar…) et personnalité de Jev. |
| Skill | Consigne ajoutée aux instructions de Jev. |
| Snapshot | Copie de l'état des données d'un projet à un instant donné. Elle permet de comparer et de restaurer. |
| Module | Fonction optionnelle du Cockpit (Budget, Suivi des bénéfices), activable par projet. |
| Carte API | Service externe appelé par les widgets du Cockpit (météo, trafic, actualités…). |
| Règle de notification | Message envoyé automatiquement aux utilisateurs, chaque jour ou chaque semaine, rédigé par un modèle d'IA à partir des données du projet. |
| Rattrapage | Envoi d'une notification prévue pendant un arrêt de la plateforme, fait au redémarrage. |
| Journal d'audit | Registre, non modifiable, de toutes les actions. |
| Niveau d'audit | Info, Sensible ou Critique, selon la portée de l'action. |

# 2. Prise en main

## 2.1 Accéder à la Console

- Adresse de connexion : `…/console/connexion`. Adresse de la Console : `…/console`.
- Sans session valide, l'adresse de la Console renvoie vers la page de connexion.
- Se connecter au Cockpit n'ouvre pas la Console, et inversement : chaque espace a sa propre session.

> [Capture] Page « Espace administrateur » de connexion à la Console.

## 2.2 Se connecter

1. Saisissez votre adresse e-mail (format `prenom.nom@entreprise.com`).
2. Saisissez votre mot de passe. L'icône en forme d'œil l'affiche ou le masque. Si la touche Verr. Maj est active, l'écran le signale.
3. Cliquez sur **Se connecter**.
4. En cas de succès, l'écran affiche « Bonjour {prénom}. » avec vos rôles, puis ouvre la Console.

**Règles**

- Le message d'échec est toujours le même : « Identifiant ou mot de passe incorrect. ». Il ne dit pas si l'adresse existe, ni si le compte est invité ou suspendu.
- À partir du 3e échec, l'écran indique le nombre de tentatives restantes.
- **Blocage temporaire :**
  - 5 échecs sur une même adresse e-mail bloquent la connexion 15 minutes ;
  - 20 échecs depuis un même poste (adresse IP), toutes adresses confondues, ont le même effet ;
  - sans nouvel échec, le compteur revient à zéro au bout de 15 minutes ;
  - une connexion réussie remet le compteur à zéro.
- Pendant un blocage, l'écran affiche « Connexion suspendue. » avec un compte à rebours et le bouton **Réinitialiser mon mot de passe**. Définir un nouveau mot de passe lève le blocage lié à l'adresse e-mail, pas celui lié au poste.
- Un compte sans droit d'administration voit « Accès non autorisé. ». La tentative est inscrite au journal d'audit.

**Messages possibles**

| Message | Cause | Que faire |
|---|---|---|
| « Identifiant ou mot de passe incorrect. » | Adresse ou mot de passe erroné, compte invité (mot de passe pas encore choisi) ou suspendu | Vérifiez la saisie ; utilisez « Mot de passe oublié ? » ; sinon, demandez à un autre administrateur l'état de votre compte |
| « Connexion suspendue. » | Trop d'échecs | Attendez la fin du compte à rebours, ou réinitialisez votre mot de passe |
| « Accès non autorisé. » | Le compte n'est pas administrateur | Utilisez le Cockpit, ou demandez le droit à un administrateur |
| « Service indisponible. Réessayez dans un instant. » | Serveur injoignable | Réessayez plus tard |

## 2.3 Première connexion et invitation

- **Compte invité.** L'invitation arrive par e-mail avec un lien valable **14 jours**, utilisable une seule fois.
  1. Ouvrez le lien. L'écran indique la durée de validité restante.
  2. Choisissez votre mot de passe, puis confirmez-le.
  3. Cliquez sur **Enregistrer le mot de passe**.
  4. Le compte devient actif, puis l'écran vous renvoie à la connexion.
- **Compte initial avec mot de passe provisoire.** Seul le compte créé à l'installation en a un. À la première connexion, l'écran « Première connexion » impose un nouveau mot de passe avant tout autre usage.
- Un lien déjà utilisé, expiré, ou envoyé à un compte suspendu affiche « Ce lien n'est plus valide. ». Demandez une nouvelle invitation à un administrateur.

## 2.4 Règles du mot de passe

- 12 caractères au minimum, 128 au maximum ;
- au moins une majuscule et une minuscule ;
- au moins un chiffre ;
- au moins un caractère spécial ;
- différent du mot de passe précédent ;
- absent de la liste des mots de passe compromis connus.

L'écran montre ces règles et une jauge de solidité. Le bouton reste inactif tant qu'une règle manque ou que la confirmation diffère (« Les deux saisies ne correspondent pas. »).

## 2.5 Mot de passe oublié

1. Sur la page de connexion, cliquez sur **Mot de passe oublié ?**.
2. Saisissez votre adresse e-mail, puis cliquez sur **Envoyer le lien**.
3. L'écran affiche toujours « Vérifiez votre messagerie. », que le compte existe ou non.
4. Ouvrez le lien reçu (valable **30 minutes**) et choisissez un nouveau mot de passe.

**Règles**

- Aucun e-mail n'est envoyé à un compte suspendu ni à une adresse inconnue. L'écran ne le signale pas, pour des raisons de sécurité.
- Au plus 1 envoi par minute et 5 par heure pour une même adresse. Le bouton **Renvoyer** devient actif après 60 secondes.
- Après le changement, toutes vos autres sessions sont fermées.

## 2.6 Session, inactivité et déconnexion

- La Console ferme la session après **15 minutes sans activité** (souris, clavier, défilement). L'activité dans un autre onglet de la Console compte aussi.
- Une minute avant l'échéance, la fenêtre « Toujours là ? » s'ouvre :
  - **Rester connecté** (ou la touche Échap) prolonge la session ;
  - **Se déconnecter** ferme la session.
- À l'échéance, l'écran affiche « Session expirée après 15 minutes d'inactivité. Reconnectez-vous pour continuer. ».
- Pour vous déconnecter :
  - survolez votre avatar en bas de la barre latérale et cliquez sur l'icône de déconnexion ;
  - ou utilisez **Se déconnecter** dans Mon profil.

## 2.7 Se repérer dans la Console

> [Capture] Console complète : barre latérale, en-tête, Vue d'ensemble, panneau de Jev.

**La barre latérale** (à gauche)

- **En-tête** :
  - le logo, qui ouvre la Vue d'ensemble ;
  - le bouton **Ouvrir le Cockpit** (raccourci Maj+Ctrl+C), qui ouvre le Cockpit dans un nouvel onglet ;
  - le bouton **Réduire la navigation** ;
  - la **cloche** des notifications de l'administrateur.
- **Vue d'ensemble**, puis cinq domaines en accordéon (un seul ouvert à la fois) :

| Domaine | Pages |
|---|---|
| Accès | Utilisateurs, Administrateurs |
| IA | Fournisseurs et modèles, Affectation des modèles, Vue générale des coûts, Journal consommation et coûts |
| Assistant | Persona, Skills |
| Projets | Bibliothèque des projets, Initialisation d'un projet, Snapshots |
| Plateforme | Modules, Registre des cartes API, Notifications, Serveur d'envoi SMTP, Guide utilisateur |

- **Pied de la barre** :
  - le bouton de **Jev**, l'assistant ;
  - votre avatar, qui ouvre **Mon profil**.
- **Signaux** : un point ou un compteur signale un problème sur une page.
  - Utilisateurs : demandes d'invitation en attente.
  - Fournisseurs et modèles : clé en erreur.
  - Affectation des modèles : fonction indisponible (corail) ou sur son secours (ambre).
  - Registre des cartes API : carte en erreur, clé qui expire, quota élevé.
  - Un domaine replié affiche le signal le plus grave de ses pages.
- **Affichage** :
  - la barre est dépliée sur un grand écran, réduite aux icônes entre 760 et 1 180 pixels de large, et devient un tiroir sur mobile ;
  - votre choix « Réduire / Déplier » est mémorisé par le navigateur.

**L'en-tête de page**

- Le fil d'Ariane indique le domaine et la page.
- La pastille d'état affiche « N incident(s) » ou « Opérationnelle ». Un clic ouvre la Vue d'ensemble.
- Chaque page a un titre et une phrase qui en résume l'usage.

**Enregistrement des modifications.** Selon la page, il est immédiat (interrupteurs, décisions) ou se fait par un bouton **Enregistrer** : une barre « non enregistré » le rappelle.

# 3. Fonctionnalités, une par une

## 3.1 Vue d'ensemble et espace « À traiter »

**À quoi elle sert.** Voir en un coup d'œil l'état de la plateforme, ce qui demande une action et les dernières actions sensibles.

> [Capture] Vue d'ensemble : bandeau, quatre indicateurs, « À traiter », « Actions sensibles récentes ».

**Ce qu'elle affiche**

- **Le bandeau** : date et heure, puis un titre selon l'état :
  - « Une intervention est requise. » s'il existe un point critique ;
  - « Plateforme opérationnelle, sous surveillance. » s'il n'y a que des avertissements ;
  - « Tout est en ordre. » sinon.
- **Quatre indicateurs cliquables** :

| Indicateur | Contenu | Page ouverte |
|---|---|---|
| Utilisateurs actifs | Comptes actifs, nombre total de comptes, invitations en attente | Utilisateurs |
| Coût IA du mois | Dépense du mois et part du budget consommée | Vue générale des coûts |
| Fournisseurs IA | Fournisseurs opérationnels sur le total, ou noms de ceux hors service | Fournisseurs et modèles |
| Dernier snapshot | Ancienneté, projet, prochaine capture prévue ou « planification suspendue » | Snapshots |

- **À traiter** : les points classés du plus critique au moins urgent. Chaque ligne est un bouton qui ouvre l'endroit où agir.
- **Actions sensibles récentes** : les 5 dernières actions de niveau Sensible ou Critique du journal d'audit, et le lien **Journal d'audit complet**.

**Les points « À traiter »**

| Point | Niveau | Quand il apparaît | Action proposée |
|---|---|---|---|
| Clé API {fournisseur} invalide | Critique | Le dernier test de la clé a échoué | Remplacer la clé |
| Budget IA à N % du plafond | Critique si ≥ 100 %, avertissement sinon | La dépense du mois atteint le seuil d'alerte d'un plafond actif | Voir la consommation |
| Échecs d'envoi de notification sur 7 jours | Critique | Un envoi de notification a échoué ces 7 derniers jours (5 au plus sont comptés) | Voir l'historique |
| Accès à retirer | Critique | Une personne désactivée dans le référentiel garde un compte actif ou invité avec des droits | Voir les utilisateurs |
| E-mail différent du référentiel | Avertissement | L'adresse du compte diffère de celle de la personne dans le référentiel | Voir les utilisateurs |
| Compte suspendu : personne réactivée | Avertissement | Le PMO a réactivé la personne après la suspension de son compte | Voir les utilisateurs |
| Droits différents du référentiel | Avertissement | Les droits d'un compte diffèrent de ce que propose le référentiel | Voir les utilisateurs |
| Invitations sans réponse depuis plus de 7 jours | Avertissement | Un invité n'a pas activé son compte après 7 jours | Voir les invités |
| Demande d'invitation du PMO | Information | Un PMO a demandé l'invitation d'une personne | Examiner |
| Demande d'activation de module | Information | Un PMO ou un Responsable a demandé un module | Examiner |

**Automatique**

- Rien n'est stocké. Chaque point est recalculé à chaque affichage de la Vue d'ensemble.
- Un point disparaît dès que sa cause n'existe plus : clé remplacée et testée, droits retirés, compte réactivé, e-mail appliqué…

**Exemple.** Le PMO désactive Karim Benali dans le référentiel de RISE, mais son compte reste Responsable de deux chantiers. La Vue d'ensemble affiche en rouge « 1 accès à retirer ». Vous cliquez, retirez l'accès de Karim dans sa fiche (ou suspendez son compte), et le point disparaît.

## 3.2 Notifications de l'administrateur (la cloche)

**À quoi elle sert.** Rassembler en un seul endroit les incidents, les alertes et les demandes qui concernent l'administration.

> [Capture] Tiroir de la cloche : filtres, une demande d'invitation, un incident.

**Utilisation**

1. Cliquez sur la cloche. Le compteur indique les notifications non lues : fond corail s'il y a un incident, ambre sinon.
2. Filtrez avec **Tout**, **Demandes** ou **Incidents**.
3. Selon le type de notification :
   - **incident ou alerte** : cliquez sur son bouton (par exemple « Remplacer la clé ») pour ouvrir la page concernée. La notification est alors marquée comme lue ;
   - **demande** : cliquez sur **Inviter** / **Activer**, ou sur **Refuser**.
4. **Tout lire** marque toutes les notifications comme lues.

**Types de notifications**

| Titre | Cause |
|---|---|
| Clé API {nom} refusée | Le test de la clé d'un fournisseur a échoué |
| Import refusé : {fichier} | Un fichier d'initialisation déposé il y a moins de 7 jours n'est pas conforme |
| Échec du snapshot {projet} | La dernière capture d'un projet a échoué |
| Budget IA à N % | Un plafond actif est en alerte ou en dépassement |
| Accès à retirer : {nom} | Personne désactivée dans le référentiel, accès encore ouvert (une notification par compte et par projet) |
| E-mail différent du référentiel : {nom} | Adresse du compte différente de celle du référentiel |
| Compte à réactiver : {nom} | Personne réactivée par le PMO après la suspension de son compte |
| Inviter {nom} | Demande d'invitation d'un PMO |
| Activer « {module} » | Demande d'activation d'un module |
| Carte API {nom} en erreur | Le service externe ne répond pas correctement |
| Clé {nom} : expire dans N j / expirée | Clé d'une carte API proche de son échéance (30, 7 et 1 jour avant), ou expirée |
| Quota {nom} à N % | Quota journalier d'une carte API atteint à 80 % ou plus |
| Erreur technique | Une opération du serveur a échoué de façon inattendue |

**Règles**

- **Cycle de vie** : une notification par cause.
  - Elle se ferme d'elle-même quand la cause disparaît.
  - Elle se rouvre, non lue, si la cause revient.
  - Si la situation s'aggrave (dépassement après une alerte, échéance plus proche), elle redevient non lue.
- **L'état « lu » est commun à tous les administrateurs.** Ce que l'un lit est lu pour tous.
- **Décision sur une demande : 10 secondes pour annuler.**
  - Après **Inviter**, **Activer** ou **Refuser**, la ligne affiche la confirmation et un bouton **Annuler** pendant 10 secondes.
  - La décision est exécutée ensuite : création du compte et envoi de l'invitation, activation du module sur le seul projet demandé, ou refus.
  - Le demandeur est prévenu dans la cloche du Cockpit et par e-mail.
  - Si l'exécution échoue, la demande redevient à traiter avec la mention « Échec du traitement : {motif} ».
- **Rafraîchissement** : la liste se recharge à l'ouverture et toutes les 60 secondes.

**Messages d'erreur**

| Message | Cause |
|---|---|
| « La décision ne peut plus être annulée (10 s écoulées) » | Vous avez cliqué sur Annuler trop tard |
| « Cette demande a déjà été traitée » | Un autre administrateur a décidé avant vous |

**Exemple.** Camille Rey, PMO de RISE, demande l'invitation de Léa Martin. La cloche affiche « Inviter Léa Martin », avec les droits proposés par le référentiel. Vous cliquez sur **Inviter**. Dix secondes plus tard, le compte de Léa est créé et son invitation part. Camille est prévenue.

## 3.3 Utilisateurs

**À quoi sert la page.** Voir tous les comptes, inviter de nouvelles personnes, régler leurs droits, suspendre, réactiver ou supprimer un compte.

> [Capture] Page Utilisateurs : bandeaux, filtres, liste, fiche latérale.

### 3.3.1 Liste, filtres et fiche

- **Bandeaux en tête de page** :
  - « N invitation(s) en attente », avec **Relancer**, qui relance toutes les invitations en attente, sans confirmation ;
  - « N compte(s) sans connexion depuis plus de 14 jours », avec **Voir**.
- **Filtres** :
  - puces par profil (Admin, PMO, Responsable, Lecteur) ;
  - onglets de statut (Tous, Actifs, Invités, Suspendus) ;
  - recherche « Nom ou e-mail » ;
  - choix du projet.
- **Colonnes** : Utilisateur, Profil et chantiers, Statut, Projets, Dernière connexion, Actions.
  - Un invité affiche « Invité il y a N j », en ambre au-delà de 7 jours.
- **Fiche** : un clic sur une ligne ouvre la fiche du compte, avec :
  - le statut ;
  - la fraîcheur de connexion (vert jusqu'à 7 jours, ambre jusqu'à 14, rouge au-delà) ;
  - le profil le plus large ;
  - les projets ;
  - les boutons **Modifier le compte**, **Relancer l'invitation** / **Suspendre** / **Réactiver** et **Journal du compte**.

### 3.3.2 Statuts d'un compte

| Statut | Signification | Peut se connecter |
|---|---|---|
| Invité | Compte créé, mot de passe pas encore choisi | Non |
| Actif | Compte activé | Oui |
| Suspendu | Accès coupé, compte et droits conservés | Non |

| Transition | Comment |
|---|---|
| Création → Invité | Invitation, ou demande d'un PMO acceptée |
| Invité → Actif | La personne choisit son mot de passe avec le lien d'invitation |
| Actif ou Invité → Suspendu | **Suspendre** |
| Suspendu → Actif | **Réactiver**, si la personne s'est déjà connectée |
| Suspendu → Invité | **Réactiver**, si la personne ne s'est jamais connectée |

### 3.3.3 Inviter un utilisateur

1. Cliquez sur **Inviter**.
2. Saisissez le **nom complet** et l'**e-mail professionnel**.
3. Si la personne doit administrer la plateforme, cochez **Administrateur de la plateforme**.
4. Sous **Accès par projet**, activez chaque projet concerné, puis choisissez :
   - **PMO** ;
   - ou **Chantiers** : un clic sur un chantier le fait passer de Lecteur à Responsable, puis à sans accès.
5. Cliquez sur **Envoyer l'invitation**.

**Règles**

- Nom : 2 à 120 caractères. E-mail valide, enregistré en minuscules.
- Une adresse déjà utilisée par un autre compte est refusée.
- Il faut au moins un projet, ou le rôle Administrateur.
- Pour chaque projet activé, il faut PMO ou au moins un chantier.
- Le lien d'invitation est valable **14 jours**, une seule fois. Il mène à la Console si la personne est administrateur, sinon au Cockpit.
- Si une personne du référentiel a la même adresse e-mail, le compte lui est rattaché.
- Si l'e-mail ne part pas (serveur d'envoi en panne), le compte est quand même créé. La Console l'indique et il suffit de **Relancer**.
- Action tracée au journal d'audit (Info).

**Messages d'erreur**

| Message | Que faire |
|---|---|
| « Indiquez le nom complet. » | Saisissez au moins 2 caractères |
| « Adresse e-mail invalide. » | Corrigez l'adresse |
| « Cette adresse est déjà utilisée par un autre compte. » | Recherchez le compte existant |
| « Rattachez au moins un projet, ou cochez Administrateur de la plateforme. » | Donnez au moins un accès |
| « {PROJET} : choisissez PMO ou au moins un chantier. » | Complétez l'accès au projet |

**Exemple.** Vous invitez Hugo Lambert, Responsable du chantier C3 de RISE. Il reçoit « Invitation à RISE Cockpit », choisit son mot de passe dans les 14 jours, et son compte passe à Actif.

### 3.3.4 Relancer une invitation

- Utilisez l'icône de la ligne, le bouton de la fiche ou le bandeau (qui relance tous les invités).
- Seul un compte **Invité** peut être relancé.
- La relance crée un nouveau lien, valable 14 jours à partir de la relance, et invalide les précédents.
- Le délai de 7 jours « sans réponse » repart de zéro.

**Automatique** : à l'expiration des 14 jours, rien ne se passe. Le compte reste Invité et seul le lien ne fonctionne plus. Relancez l'invitation.

### 3.3.5 Demandes d'invitation venant du Cockpit

Un PMO peut demander, depuis le référentiel du Cockpit, l'invitation d'une personne qui n'a pas de compte. La demande arrive :

- dans la cloche (« Inviter {nom} ») ;
- dans « À traiter » ;
- et par un compteur sur le menu Accès.

La décision se prend **dans la cloche** (voir 3.2). En cas d'acceptation, le compte reçoit les droits proposés par le référentiel.

### 3.3.6 Suspendre et réactiver

**Suspendre**

1. Cliquez sur **Suspendre**, puis confirmez par **Suspendre le compte**.
2. Toutes les sessions de la personne sont fermées immédiatement.
3. Le compte, ses droits et ses contributions sont conservés.

La suspension vaut pour **toute la plateforme**, tous projets confondus.

**Réactiver**

- Cliquez sur **Réactiver**, sans confirmation.
- Le compte redevient Actif, ou Invité s'il ne s'était jamais connecté.

**Règles**

- On ne peut pas se suspendre soi-même.
- Juste après une suspension, un bouton **Annuler** reste affiché quelques secondes. Il réactive le compte, mais ne rouvre pas les sessions fermées.
- Suspension et réactivation sont tracées au journal d'audit (Sensible).

### 3.3.7 Supprimer un compte

1. Cliquez sur **Supprimer**.
2. Saisissez le nom complet pour confirmer.
3. Cliquez sur **Supprimer le compte**.

**Règles**

- La suppression est définitive.
- Elle est **refusée** dès que le compte a laissé une trace :
  - il est l'auteur d'une entrée du journal d'audit (c'est le cas de tout compte qui a activé son accès) ;
  - la personne liée est responsable d'une action, d'un risque, d'un problème, d'un jalon, d'un livrable ou d'un chantier ;
  - elle a pris une décision ;
  - elle est membre d'une instance.
- On ne peut pas supprimer son propre compte.
- En pratique, seul un invité qui n'a jamais activé son compte peut être supprimé. Pour couper l'accès d'une autre personne, **suspendez** son compte.
- Suppression tracée au journal d'audit (Critique).

**Message** : « Suppression impossible : objet utilisé ailleurs · N usages : … ». Suspendez le compte à la place.

### 3.3.8 Écarts avec le référentiel

La Console compare chaque compte à la personne correspondante du référentiel. Elle signale les écarts, sans rien modifier d'elle-même.

**E-mail différent du référentiel**

- Quand le PMO corrige l'adresse d'une personne, la Console ne recopie pas cette adresse sur le compte : c'est l'identifiant de connexion.
- Elle signale l'écart (« À traiter » et cloche). Dans la fenêtre du compte, l'encart « E-mail du référentiel » propose **Appliquer**.
- Pour un invité, le bouton devient **Appliquer et renvoyer l'invitation** : les anciens liens deviennent invalides et une nouvelle invitation de 14 jours part à la nouvelle adresse.

**Accès à retirer**

- La personne est désactivée dans le référentiel, mais son compte actif ou invité garde des droits sur le projet.
- Le point est affiché en rouge dans « À traiter » et dans la cloche. Aucun e-mail n'est envoyé.
- Dans la fenêtre du compte, **Retirer l'accès** détache le projet. L'effet a lieu à l'enregistrement.
- L'alerte tombe quand les droits sont retirés ou le compte suspendu.

**Compte à réactiver**

- Le PMO a réactivé la personne après la suspension de son compte.
- Deux issues possibles : réactivez le compte, ou demandez au PMO de la désactiver de nouveau.

**Droits différents du référentiel**

- La Console propose des droits d'après le référentiel :
  - **Responsable** des chantiers dont la personne est responsable ;
  - **Lecteur** de ses autres chantiers de rattachement.
- Dans la fenêtre du compte, l'encart « Référentiel du projet » indique « Conforme », ou « La saisie diffère du référentiel. » avec **Appliquer**, qui coche la proposition. Vous pouvez l'ajuster avant d'enregistrer.
- Ne sont pas des écarts :
  - être PMO du projet ;
  - avoir une lecture en plus de la proposition.

**Messages d'erreur (e-mail)**

| Message | Cause |
|---|---|
| « Ce compte n'est lié à aucune personne du référentiel » | Pas de personne rattachée |
| « L'e-mail du référentiel (…) n'est pas valide : faites-le corriger par le PMO » | Adresse erronée dans le référentiel |
| « L'e-mail du compte est déjà celui du référentiel » | Plus d'écart |
| « Un compte existe déjà pour … » | L'adresse est prise par un autre compte |

### 3.3.9 Modifier un compte et ses droits

1. Cliquez sur **Modifier le compte**.
2. Ajustez le nom, l'e-mail, le rôle Administrateur et les accès par projet.
3. Cliquez sur **Enregistrer**. Le message « Modifications enregistrées pour {nom} » s'affiche.

**Règles des droits (habilitations)**

- Un compte peut cumuler :
  - le rôle Administrateur de la plateforme ;
  - et, projet par projet, le profil PMO ou des chantiers en Responsable ou Lecteur.
- Le nombre de PMO par projet n'est pas limité.
- PMO sur un projet vaut pour tout le projet : les chantiers cochés sont alors ignorés.
- Un chantier coché à la fois Responsable et Lecteur est gardé en Responsable.
- Si la personne existe dans le référentiel du projet, les droits sont écrits sur cette personne ; sinon, sur le compte.
- Retirer un projet retire toutes les habilitations de la personne sur ce projet, y compris celles créées à l'initialisation.
- **Garde-fous** :
  - on ne peut pas se retirer ses propres droits d'administrateur ;
  - il doit toujours rester au moins un administrateur.
- Changer l'e-mail d'un invité invalide son lien : relancez ensuite l'invitation.
- Tracé au journal d'audit (Sensible) avec l'avant et l'après.

## 3.4 Administrateurs

**À quoi sert la page.** Voir qui administre la plateforme, accorder ou retirer ce rôle, et consulter le journal d'audit (onglet **Journal d'audit**, voir 3.5).

> [Capture] Onglet Administrateurs.

**Ajouter un administrateur**

1. Cliquez sur **Ajouter un administrateur**.
2. Choisissez un utilisateur actif dans la liste.
3. Cliquez sur **Accorder les droits**.

**Retirer un administrateur**

1. Cliquez sur **Retirer**.
2. Saisissez **RETIRER** pour confirmer.
3. Cliquez sur **Retirer les droits**. Le compte est conservé, mais perd l'accès à la Console dès sa prochaine action.

**Règles**

- Seul un compte **actif** peut devenir administrateur.
- Le bouton **Retirer** est masqué pour vous-même et quand il ne reste qu'un administrateur.
- Ajout et retrait sont tracés au journal d'audit (Critique).

**Messages d'erreur**

| Message | Cause |
|---|---|
| « Seul un compte actif peut devenir administrateur » | Compte invité ou suspendu |
| « Ce compte est déjà administrateur » | Doublon |
| « Il doit toujours rester au moins un administrateur » | Dernier administrateur |
| « Vous ne pouvez pas retirer vos propres droits d'administrateur » | Action sur vous-même |

## 3.5 Journal d'audit

**À quoi il sert.** Retrouver qui a fait quoi, quand et sur quoi.

**Utilisation**

1. Ouvrez Administrateurs, onglet **Journal d'audit**.
2. Filtrez par niveau : **Tout**, **Critique**, **Sensible** ou **Info**.
3. Recherchez par auteur, action ou cible.
4. Cliquez sur **Exporter** pour obtenir un fichier CSV.

**Règles**

- Chaque action de la Console et chaque modification métier du Cockpit est tracée.
  - Pour le Cockpit, une entrée est créée par champ modifié, avec l'avant et l'après.
  - Les connexions sensibles sont aussi tracées : activation d'un compte, blocage, accès refusé.
- Niveaux :
  - **Critique** : ajout ou retrait d'administrateur, suppression de compte, clés API, restauration…
  - **Sensible** : suspension, droits, réglages…
  - **Info** : invitations, modifications courantes.
- Aucune entrée ne peut être modifiée ni supprimée.
- **Conservation 24 mois** : une tâche automatique supprime chaque nuit, à 3 h 15, les entrées plus anciennes.
- L'écran affiche les 500 entrées les plus récentes. L'export en contient 5 000 au plus, au format CSV (séparateur « ; »), et l'export lui-même est tracé.

**Exemple.** Vous voulez savoir qui a modifié le plafond budgétaire. Filtrez **Sensible**, recherchez « plafond » : l'entrée « Modification d'un plafond budgétaire IA » indique l'auteur, la date et les valeurs avant et après.

## 3.6 Fournisseurs et modèles

**À quoi sert la page.** Déclarer les fournisseurs d'IA et leurs clés, vérifier que les clés fonctionnent, et tenir la liste des modèles avec leurs tarifs.

> [Capture] Vue réseau des fournisseurs et liste des modèles.

### 3.6.1 Ajouter un fournisseur

1. Cliquez sur **Ajouter un fournisseur**.
2. Saisissez le nom du fournisseur et la clé API.
3. Cliquez sur **Ajouter et tester**.

**Règles**

- Nom : 2 à 60 caractères. Clé : 20 à 400 caractères.
- Un fournisseur déjà déclaré est refusé : « Le fournisseur « X » existe déjà ».
- La clé est chiffrée. Elle n'est plus jamais affichée en entier : seuls son préfixe et ses 4 derniers caractères restent visibles.
- La clé est testée immédiatement. Ajout tracé au journal d'audit (Critique).
- Aucun bouton ne permet de supprimer ou de renommer un fournisseur.

### 3.6.2 Tester et remplacer une clé

- **Tester** :
  - **Tester** (sur un fournisseur), **Tester la clé** (dans sa fiche) ou **Tester toutes les clés** ;
  - le test lit la liste des modèles chez le fournisseur : il ne coûte rien ;
  - délai maximal : 10 secondes.
- **Remplacer la clé** :
  1. Collez la nouvelle clé.
  2. Cliquez sur **Remplacer et tester**.
  3. L'ancienne clé cesse d'être utilisée immédiatement. Le remplacement est tracé (Critique).

**États d'une clé** : Opérationnelle, Clé invalide, Non testée, Test en cours.

**Automatique**

- Toutes les clés sont testées toutes les **2 heures**.
- Une clé qui passe en erreur crée :
  - une notification dans la cloche ;
  - un point « À traiter » ;
  - une entrée d'audit (Critique).
- Un fournisseur jamais testé est considéré comme **indisponible** : ses modèles ne répondent pas tant que sa clé n'a pas réussi un test.
- Une réponse « quota atteint » du fournisseur compte comme une clé valide.

**Messages**

| Message | Cause | Que faire |
|---|---|---|
| « {Nom} répond en N ms » | Clé valide | — |
| « {Nom} refuse la clé (401) » | Clé révoquée ou erronée | Remplacez la clé |
| « {Nom} injoignable » / « délai de 10 s dépassé » | Réseau ou fournisseur indisponible | Réessayez plus tard |
| « Aucune clé enregistrée » | Fournisseur déclaré sans clé | Ajoutez une clé |
| « La clé semble incomplète (20 caractères minimum). » | Saisie trop courte | Collez la clé complète |

### 3.6.3 Ajouter ou modifier un modèle

1. Cliquez sur **Ajouter un modèle**, ou sur le crayon d'un modèle existant.
2. Choisissez ce que fait le modèle : **Génère du texte** (LLM), **Vectorise des textes** (Embedding) ou **Reclasse des résultats** (Reranking).
3. Renseignez les champs :
   - le fournisseur ;
   - le nom, et une description d'une ligne ;
   - l'identifiant chez le fournisseur ;
   - la longueur de contexte (facultative) ;
   - la **date de sortie** ;
   - pour un LLM, le **nombre maximal de jetons en sortie** ;
   - pour un Embedding, les dimensions proposées et la dimension par défaut.
4. Renseignez la **tarification** :
   - LLM : prix en entrée et en sortie, en euros par million de jetons ;
   - Embedding : prix en entrée seulement ;
   - Reranking : à la requête (euros pour 1 000 requêtes, choix par défaut) ou au jeton.
5. Vérifiez l'**aperçu en direct** : fonctions possibles, coût estimé sur le volume actuel, continuité (existe-t-il un secours ?).
6. Cliquez sur **Ajouter le modèle** ou **Enregistrer**.

**Règles**

- Nom : 1 à 80 caractères, unique chez un même fournisseur.
- La date de sortie est obligatoire et ne peut pas être dans le futur.
- Un LLM doit avoir un nombre maximal de jetons en sortie.
- Tous les tarifs sont positifs ou nuls. Le tarif à la requête est réservé au Reranking.
- Un nouveau modèle est créé actif.
- Selon son ancienneté, un badge « À surveiller » ou « Ancien » s'affiche.
- On ne peut pas changer la catégorie d'un modèle déjà utilisé par une fonction d'une autre catégorie : « {Nom} est utilisé comme … — changez d'abord l'affectation ».
- On ne peut pas retirer une dimension affectée à la vectorisation des documents.
- Un nouveau tarif sert pour les estimations et les appels suivants. La consommation passée garde le tarif du jour de l'appel.

### 3.6.4 Désactiver, réactiver, supprimer un modèle

- **Désactiver** :
  - utilisez l'interrupteur **Actif** et confirmez ;
  - un modèle principal d'une fonction ne peut pas être désactivé : « Modèle principal de : … — changez d'abord l'affectation » ;
  - un modèle utilisé seulement en secours peut l'être.
- **Réactiver** : sans confirmation.
- **Supprimer** (dans la fiche du modèle) : refusé si le modèle est affecté à une fonction, choisi par une règle de notification ou présent dans la consommation. Dans ces cas, désactivez-le plutôt : son historique reste lisible.

## 3.7 Affectation des modèles

**À quoi sert la page.** Choisir, pour chaque fonction d'IA, le modèle qui répond (principal) et celui qui prend le relais (secours).

> [Capture] Page Affectation des modèles : cartes des fonctions et chaîne Documents.

**Les fonctions**

| Fonction | Catégorie | Usage |
|---|---|---|
| Insights | LLM | Analyses du Cockpit |
| Gestion des données | LLM | Aide à la saisie du Cockpit |
| Rapports | LLM | Rendus longs (sortie requise d'environ 38 000 jetons par défaut) |
| Guidage console | LLM | Jev dans la Console |
| Documents, étape 1 : Vectorisation | Embedding | Recherche dans les documents |
| Documents, étape 2 : Reclassement | Reranking | Recherche dans les documents |
| Documents, étape 3 : Synthèse | LLM | Réponse à partir des documents |

**Utilisation**

1. Sur chaque carte, choisissez le **principal** puis le **secours**. Seuls les modèles actifs de la bonne catégorie sont proposés.
2. Lisez les conseils de la carte :
   - « Aucun secours : la fonction est à l'arrêt si le principal est indisponible » ;
   - « Principal limité à N tokens : les rendus plus longs seraient tronqués » ;
   - …
3. Le bouton **Secours : {modèle} · {coût}** propose le secours utilisable le moins cher.
4. Cliquez sur **Enregistrer**, puis sur **Enregistrer l'affectation** dans la confirmation. La confirmation rappelle l'estimation mensuelle, avant et après.

**Règles**

- Le principal doit être actif et de la catégorie de la fonction.
- Le secours doit être différent du principal.
- Les nouveaux modèles répondent dès la requête suivante.
- **Une fonction est** :
  - **Opérationnelle** si son principal est disponible ;
  - **Secours en service** si seul le secours l'est ;
  - **Indisponible** sinon.
- **Un modèle est disponible** s'il est actif et si la clé de son fournisseur a réussi son dernier test.
- **Chaîne Documents** : une étape indisponible suspend les étapes suivantes (état « Suspendue »). Une étape sur son secours ne bloque rien.
- Changer le modèle ou la dimension de la vectorisation affiche un avertissement : les documents devront être réindexés. Ce changement est tracé en Critique. La réindexation n'est pas faite automatiquement.
- **Estimation mensuelle** : volume réel des 30 derniers jours × tarif actuel. Pour Guidage console sans historique, une estimation fixe est affichée, précédée de « ≈ ».

**Automatique**

- Si le principal ne répond pas au moment d'un appel, le secours est essayé.
- Si les deux échouent, la fonction répond « indisponible ».

**Aujourd'hui, seule la fonction Guidage console (Jev de la Console) interroge réellement le modèle choisi. Les règles de notification aussi, avec le modèle choisi dans chaque règle.** Les autres fonctions du Cockpit produisent pour l'instant un texte de démonstration, mais leur consommation est bien enregistrée.

**Vue réseau** (page Fournisseurs et modèles) : elle montre, pour chaque fonction, le modèle qui répond en ce moment. Un clic sur un modèle ouvre sa fiche.

**Exemple.** La clé Google est refusée : Gemini, principal de la Synthèse des documents, devient indisponible. Claude Sonnet, son secours, répond à sa place et la carte affiche « Secours en service ». Vous remplacez la clé Google : après un test réussi, Gemini répond de nouveau.

## 3.8 Vue générale des coûts

**À quoi sert la page.** Suivre la dépense d'IA du mois, anticiper la fin de mois et fixer des plafonds.

> [Capture] Vue générale des coûts : courbe, indicateurs, tableau des plafonds.

**Utilisation**

1. Choisissez la période : **7 j**, **Ce mois** ou **90 j**.
2. Pour « Ce mois », lisez :
   - la dépense depuis le 1er ;
   - la **projection de fin de mois** ;
   - le plafond ;
   - le rythme des 7 derniers jours ;
   - la comparaison avec le mois précédent à la même date.
3. Dans le tableau, cliquez sur une ligne (Budget global, Insights, Rapports, Guidage console, Documents, Gestion des données) pour isoler sa courbe.
4. Pour fixer un plafond :
   1. Saisissez le montant en euros entiers.
   2. Réglez le seuil d'alerte avec « − » et « + ».
   3. Cliquez sur **Enregistrer les plafonds**.
5. **Exporter en CSV** télécharge la consommation détaillée de la période.

**Règles**

- **Mois** : du 1er à aujourd'hui, à l'heure de Paris.
- **Rythme** : dépense des 7 derniers jours, divisée par 7.
- **Projection** : dépense du mois + rythme × jours restants.
- **Seuil d'alerte** : de 50 à 100 %, par pas de 5 ; 80 % par défaut.
- **Statut d'une ligne** :
  - **Sans plafond** : aucun plafond, ou plafond désactivé ;
  - **Dépassement** : la **projection** de fin de mois dépasse le plafond ;
  - **Alerte** : la dépense atteint le seuil d'alerte ;
  - **Sous le plafond** sinon.
- Une journée est dite « sur secours » si plus de la moitié de son coût vient d'un modèle de secours.
- **Un plafond ne bloque rien.** Les appels continuent au-delà. Le plafond sert à alerter : cloche, « À traiter » et signal du menu.
- Les modifications de plafond sont tracées (Sensible).

**Exemple.** Le plafond global est de 1 200 €, avec une alerte à 80 %. Le 20 du mois, la dépense atteint 980 € : la ligne passe en « Alerte » et la cloche affiche « Budget IA à 82 % ». Si la projection de fin de mois dépasse 1 200 €, le statut devient « Dépassement ».

## 3.9 Journal consommation et coûts

**À quoi sert la page.** Voir le détail de chaque appel à un modèle : date, fonction, fournisseur, modèle, jetons, coût.

> [Capture] Journal : graphique par jour et tableau des appels.

**Utilisation**

1. Filtrez par fonction.
2. Choisissez l'unité **Tokens** ou **Coûts**.
3. Survolez le graphique pour le détail d'un jour.
4. Dépliez une ligne pour voir :
   - l'identifiant de la requête ;
   - la durée ;
   - le calcul du coût ;
   - le passage éventuel sur le secours.
5. **Afficher 10 de plus** charge la suite. **CSV** exporte les appels du mois.

**Règles**

- Le tarif est enregistré sur chaque appel au moment de l'appel. Un changement de tarif ne modifie pas le passé.
- Le texte des questions et des réponses n'est pas conservé.
- Les données de consommation n'ont pas de durée de conservation limitée. Elles ne disparaissent que si les modèles d'IA sont réinitialisés.
- **Mise en cache des instructions.** Pour Jev et les notifications, une partie des instructions envoyées au modèle est mise en cache chez le fournisseur. Les jetons relus depuis ce cache coûtent 10 % du prix normal ; leur première écriture coûte 125 %. Le coût enregistré tient compte de cette remise. Le nombre de jetons affiché compte, lui, tous les jetons envoyés.

## 3.10 Jev, l'assistant de la Console

**À quoi il sert.** Répondre aux questions sur la Console et sur les données de la plateforme : expliquer un chiffre, une règle, un écran, et guider pas à pas. **Jev n'agit jamais à votre place** : il indique où faire chaque action.

> [Capture] Panneau de Jev ouvert, avec les suggestions et une réponse et ses sources.

**Utilisation**

1. Cliquez sur le bouton de Jev, en bas de la barre latérale.
2. Posez votre question, ou cliquez sur une suggestion adaptée à la page ouverte (par exemple « Où en est le budget IA ? »).
3. Lisez la réponse. Quand Jev a consulté des données, les **sources** (les tables lues) s'affichent sous la réponse.
4. Pour repartir de zéro, cliquez sur le crayon **Nouvelle conversation**.
5. Fermez avec **Fermer Jev** ou la touche Échap.

**Ce que Jev sait faire**

- Il connaît la page que vous regardez.
- Il lit en direct les données de la plateforme, dans un périmètre défini (33 tables de consultation) :
  - comptes, droits, sessions, journal d'audit ;
  - IA, consommation, plafonds ;
  - notifications, projets, snapshots, modules ;
  - cartes API, serveur d'e-mail, skills, persona.
- Il ne lit rien d'autre : ni le guide utilisateur et ses téléchargements, ni le contenu des snapshots, ni les conversations elles-mêmes.

**Règles**

- Une question fait 2 000 caractères au plus.
- Chaque lecture de données est limitée à 200 lignes et 5 secondes, en lecture seule.
- Si sa première lecture échoue, Jev la corrige une fois. En cas de nouvel échec, il répond : « Je n'ai pas pu lire les données de la plateforme pour répondre (…). Reformulez la question, ou consultez directement l'écran concerné de la Console. ».
- Jev répond avec le modèle affecté à la fonction **Guidage console**, ou son secours (voir 3.7).
- Sa personnalité suit le **Persona** (3.11) et la skill de guidage (3.12).

**Mémoire conversationnelle**

- Jev garde le fil de **votre** conversation, même après un rechargement de la page. Chaque administrateur a la sienne ; personne d'autre n'y accède.
- **Ce qui est retenu** :
  - les **10 derniers échanges** ;
  - un **résumé** des échanges plus anciens, mis à jour automatiquement à partir d'une douzaine d'échanges ;
  - les réponses très longues, retenues en abrégé.
- **Ce qui est conservé** : vos questions, les réponses de Jev et les sources consultées. Les données lues ne sont pas conservées.
- **Nouvelle conversation** : Jev oublie les échanges précédents.
- **Automatique** : chaque nuit à 3 h 25, les conversations sans échange depuis **30 jours** sont supprimées. Une conversation de plus de 30 jours n'est de toute façon plus reprise.

**Messages d'erreur**

| Message | Cause | Que faire |
|---|---|---|
| « Je ne peux pas répondre pour l'instant : Fonction Guidage console indisponible : aucun modèle affecté » | Aucun modèle affecté au guidage | Affectez un modèle (3.7) |
| « … ni le modèle principal ni le secours ne répondent » | Clés refusées ou fournisseurs indisponibles | Testez et remplacez les clés (3.6) |
| « Jev n'a pas pu répondre : Conversation introuvable. » | Conversation expirée ou supprimée | Cliquez sur **Nouvelle conversation** |
| « Jev n'a pas pu répondre : Données invalides. » | Question de plus de 2 000 caractères | Raccourcissez la question |

**Exemple.** Sur la page Utilisateurs, vous demandez : « Qui ne s'est pas connecté depuis 10 jours ? ». Jev lit la table des comptes et répond par une liste de noms avec leur dernière connexion, et la source « comptes ». Vous enchaînez : « Et parmi eux, lesquels sont PMO ? ». Jev comprend que « eux » renvoie à la liste précédente.

## 3.11 Persona

**À quoi sert la page.** Définir qui est Jev : son identité (ce que l'on voit) et sa personnalité (sa façon d'écrire et de penser).

> [Capture] Page Persona : tuiles Identity et Soul.

**Utilisation**

1. **Tuile Identity** :
   1. Choisissez un avatar prédéfini, ou **Importer une image** (PNG, JPEG ou WebP, 1 Mo au plus).
   2. Renseignez le nom (obligatoire, 30 caractères au plus), la créature (ce qu'il incarne, 40 au plus), le style (trois adjectifs, 60 au plus) et l'emoji.
   3. Cliquez sur **Enregistrer**.
2. **Tuile Soul** :
   1. Rédigez la personnalité : titres avec « ## », listes avec « - ». 20 000 caractères au plus.
   2. **Aperçu** montre le rendu.
   3. Cliquez sur **Enregistrer**.

**Règles**

- Chaque tuile s'enregistre séparément. **Annuler** revient à la dernière version enregistrée.
- Chaque enregistrement garde une copie de la version précédente et est tracé (Sensible), avec l'avant et l'après.
- Le Persona est relu à chaque réponse de Jev.
- Le nom, l'emoji et l'avatar s'affichent dans la Console : barre latérale et panneau de Jev.

**Messages** : « Le nom est obligatoire. », « Image trop lourde (1 Mo maximum). », « Format non accepté ».

## 3.12 Skills

**À quoi sert la page.** Gérer les consignes ajoutées aux instructions de Jev.

> [Capture] Page Skills : liste et éditeur.

**Utilisation**

1. **Nouvelle skill** crée une skill « Nouvelle skill », désactivée et vide.
2. Donnez-lui un nom (60 caractères au plus) et rédigez sa consigne (20 000 caractères au plus). **Aperçu** montre le rendu.
3. Cliquez sur **Enregistrer**.
4. L'interrupteur active ou désactive la skill. L'effet est immédiat.
5. **Supprimer**, puis **Confirmer la suppression**. La suppression est définitive.
6. Retrouvez une skill avec la recherche et le filtre **Toutes / Actives / Désactivées** (9 skills par page).

**Règles**

- Deux skills ne peuvent pas porter le même nom (sans tenir compte des majuscules) : « Une skill s'appelle déjà « … » ».
- **Le Jev de la Console n'utilise qu'une skill : la skill de guidage**, c'est-à-dire la première skill active nommée « Guidage console », « Répondre sur la Console d'administration » ou « Guider l'utilisateur ». Les autres skills actives servent au Jev du Cockpit.
- Les skills restent dans leur ordre de création. On ne peut pas les réordonner.
- Chaque création, modification, activation et suppression est tracée (Sensible).

## 3.13 Bibliothèque des projets

**À quoi sert la page.** Voir tous les projets de la plateforme, leur état et leur référentiel, et les ouvrir dans le Cockpit.

> [Capture] Bibliothèque : liste à gauche, fiche projet à droite.

**Utilisation**

1. Filtrez par statut (**Tous**, **Actifs**, **En préparation**, **Clos**), ou recherchez par code, nom ou client.
2. Choisissez un projet dans la liste. Les flèches ↑ ↓ du clavier déplacent la sélection, 7 projets sont affichés par page.
3. La fiche affiche :
   - la phase en cours ;
   - le pourcentage du calendrier écoulé ;
   - les dates ;
   - les nombres de lots, phases, chantiers et personnes ;
   - l'état du dernier snapshot.
4. **Ouvrir** ouvre le projet dans le Cockpit. Il faut une session du Cockpit.
5. **Initialiser un projet** mène à l'initialisation (3.14).

**Règles**

- **Badge « Nouveau »** : projet créé par initialisation il y a moins de 7 jours et encore en préparation.
- **Ordre d'affichage** : nouveaux projets, puis actifs, en préparation et clos, puis par date de début.
- **Phase affichée** : la phase qui contient la date du jour, sinon « Préparation » pour un projet en préparation.
- **Statut d'un projet** : la Console ne le modifie pas. On le change dans la fiche projet du Cockpit. Un projet clos est affiché « archivé ».

## 3.14 Initialisation d'un projet

**À quoi elle sert.** Créer un projet complet à partir du fichier Excel rempli par le PMO.

> [Capture] Initialisation : étape Contrôler avec les cinq contrôles.

**Utilisation, en quatre étapes**

1. **Importer**
   1. Si besoin, téléchargez le **Modèle Excel**.
   2. Glissez le fichier rempli dans la zone, ou cliquez sur **Choisir un fichier**. Seul le format `.xlsx` est accepté, 10 Mo au plus.
2. **Contrôler** : cinq contrôles sont faits, sans rien créer.
   - **Structure du fichier** : les 13 onglets attendus sont présents.
   - **Fiche projet** : le code projet est présent et libre.
   - **Champs obligatoires** : tous sont remplis.
   - **Contrôles de cohérence** : dates, doublons, références entre onglets…
   - **Avertissements** : points à vérifier, non bloquants.
   - Le détail liste au plus 12 points, avec leur onglet et leur ligne.
3. **Prévisualiser** : parcourez les 14 vues du futur référentiel (fiche projet, planning, puis une grille par onglet).
4. **Valider** : cliquez sur **Valider l'importation**. La création se fait en cinq phases :
   1. projet ;
   2. lots et phases ;
   3. chantiers et jalons ;
   4. personnes et habilitations ;
   5. instances de pilotage.

**Règles**

- Le serveur refait tous les contrôles à la validation. La création est « tout ou rien » : en cas d'erreur, rien n'est créé.
- **Code projet** : 2 à 20 caractères, lettres, chiffres, « - » ou « _ ». Il est mis en majuscules et doit être libre.
- **Dates acceptées** : JJ/MM/AAAA, ou une date Excel.
- **Ce qui est créé** :
  - le projet, **toujours au statut Préparation**, quel que soit le statut indiqué dans le fichier ;
  - son client ;
  - lots, phases, sous-phases ;
  - chantiers (codes C1, C2… réattribués) et jalons (J01, J02…) ;
  - livrables, équipes, rôles, personnes, affectations ;
  - instances et leurs membres ;
  - **une habilitation Responsable par chantier**, sur la personne responsable ;
  - une planification de snapshots (hebdomadaire, vendredi à 4 h, conservation 12 mois) ;
  - votre rattachement au projet.
- **Aucun compte utilisateur n'est créé.** Invitez ensuite les personnes (3.3).
- Une personne marquée « Actif : non » est créée inactive.
- Les signes d'alerte du fichier (⚠, ◔) deviennent de simples avertissements.
- L'initialisation est tracée au journal d'audit (Sensible).
- **Réinitialiser la session** revient à l'étape 1 et oublie le fichier déposé.

**Automatique** : un fichier refusé il y a moins de 7 jours est signalé dans la cloche (« Import refusé : {fichier} »).

**Messages d'erreur (exemples)**

| Message | Que faire |
|---|---|
| « Format attendu : .xlsx » | Enregistrez le fichier au format Excel .xlsx |
| « Onglet « X » manquant » | Repartez du modèle Excel |
| « Le code X existe déjà : choisissez un autre code. » | Changez le code projet dans l'onglet 05 Projet |
| « « Colonne » est obligatoire » | Complétez la cellule indiquée |
| « … : date invalide (JJ/MM/AAAA attendu) » | Corrigez la date |
| « Équipe « X » inconnue (onglet 01 Équipes) » | Ajoutez l'équipe ou corrigez le nom |
| « Fin avant début » | Corrigez les dates |
| « Fichier temporaire introuvable : importez de nouveau le fichier » | Déposez de nouveau le fichier |

**Exemple.** Le PMO d'ORION remplit le modèle. Vous le déposez : les cinq contrôles sont verts, avec 2 avertissements (jalons hors de leur phase). Vous prévisualisez, puis vous validez. ORION apparaît dans la bibliothèque avec le badge « Nouveau », au statut Préparation. Il reste à inviter son équipe.

## 3.15 Snapshots

**À quoi sert la page.** Garder l'historique des données de chaque projet : capturer un état, comparer deux états, restaurer un état passé.

> [Capture] Snapshots : chronologie, liste par mois, comparaison A/B.

### 3.15.1 Créer un snapshot

1. Choisissez l'onglet du projet.
2. Cliquez sur **Créer un snapshot**.
3. Saisissez un libellé (60 caractères au plus ; « Capture manuelle » par défaut).
4. Cliquez sur **Lancer la capture**. Une barre suit l'avancement.

**Ce que contient un snapshot** : toutes les données du référentiel et du pilotage du projet, soit 19 types d'objets et leurs liens :

- lots, phases, sous-phases, chantiers, jalons, livrables ;
- équipes, rôles, personnes, affectations, instances ;
- risques, problèmes, actions, décisions, séances, rapports, documents, avancement.

La liste affiche, pour chaque snapshot, les nombres de tâches, jalons, risques et livrables.

### 3.15.2 Planification automatique

- Réglages :
  - activez **Planification automatique** ;
  - choisissez la **fréquence** (Quotidienne, Hebdomadaire, Mensuelle) ;
  - le **jour** (en hebdomadaire) ;
  - l'**heure** (00:00, 02:00, 04:00, 06:00, 20:00 ou 22:00) ;
  - la **conservation** (3, 6, 12 ou 24 mois).
- Chaque changement est enregistré immédiatement. La prochaine capture prévue s'affiche dans la chronologie.

**Automatique**

- Chaque heure pile, la plateforme vérifie les planifications actives et capture les projets concernés :
  - chaque jour pour une fréquence quotidienne ;
  - le jour choisi pour une fréquence hebdomadaire ;
  - le 1er du mois pour une fréquence mensuelle.
- Ensuite, les snapshots plus anciens que la durée de conservation sont **supprimés**. Cela vaut aussi pour les snapshots manuels et les sauvegardes de sécurité.
- Les projets dont la planification est suspendue ne sont ni capturés ni purgés.

### 3.15.3 Comparer deux états

1. Sélectionnez deux snapshots, dans la liste ou dans la frise. A est toujours le plus ancien.
2. Ou cliquez sur **Comparer les deux plus récents**.
3. Lisez les écarts, regroupés en **Ajouts**, **Modifications** et **Suppressions** (chaque compteur est un filtre). Pour chaque écart, l'objet, le champ, et la valeur avant et après sont affichés en clair.

**Règles de lecture**

- Plusieurs modifications d'un même champ sont résumées : première valeur, puis dernière valeur.
- Un objet ajouté puis modifié reste un ajout.
- Un objet ajouté puis supprimé n'apparaît pas.
- Une valeur revenue à son point de départ n'est pas un écart.

### 3.15.4 Restaurer un état

1. Cliquez sur **Restaurer cet état** (sur une ligne) ou **Restaurer l'état A**.
2. Confirmez avec **Restaurer**.

**Règles**

- Avant toute restauration, un snapshot de sécurité de l'état actuel est créé : « Sécurité avant restauration ». S'il échoue, rien n'est restauré.
- La restauration est « tout ou rien ».
- Elle ne restaure pas la fiche du projet, les fichiers des documents, les commentaires ni les notifications.
- Elle est tracée au journal d'audit (Critique). Le message de réussite propose **Voir la sauvegarde**.

**Messages** : « Capture impossible : … », « Comparaison impossible : … », « Restauration impossible : … ». Une capture en échec est aussi signalée dans la cloche (« Échec du snapshot {projet} »).

**Exemple.** Avant le 20e COPIL, vous créez le snapshot « Avant le 20e COPIL ». Une semaine plus tard, vous le comparez au dernier snapshot automatique : 3 risques ajoutés, et le jalon J06 décalé du 12 au 19 novembre.

## 3.16 Modules

**À quoi sert la page.** Activer les fonctions optionnelles du Cockpit, pour toute la plateforme ou projet par projet. Deux modules existent : **Budget** et **Suivi des bénéfices**.

> [Capture] Page Modules : carte d'un module et bandeau de demande.

**Utilisation**

1. Pour chaque module, choisissez la portée :
   - **Désactivé** (confirmation) : le module disparaît du Cockpit pour tous. Les données saisies sont conservées et réapparaissent à la réactivation ;
   - **Tous les projets** (confirmation) : le module est actif partout, y compris sur les projets créés ensuite ;
   - **Par projet** : un interrupteur par projet. L'activation est immédiate, la désactivation demande une confirmation.
2. Traitez les demandes des PMO : **Activer sur {projet}** ou **Refuser**. Elles arrivent aussi dans la cloche (voir 3.2).

**Règles**

- Un utilisateur du Cockpit voit un module désactivé comme verrouillé, et peut en demander l'activation. Une même demande en attente n'est pas dupliquée.
- Approuver une demande active le module sur le seul projet demandé.
- Toutes les modifications sont tracées (Sensible).
- Aujourd'hui, seul le module **Budget** change quelque chose dans le Cockpit : sans lui, la saisie du budget est refusée.

## 3.17 Registre des cartes API

**À quoi sert la page.** Recenser les services externes qui alimentent les widgets du Cockpit (actualités, météo, trafic), et surveiller leur santé, leurs clés et leurs quotas.

> [Capture] Registre : état du registre par tag et fiche d'une carte.

### 3.17.1 Créer ou modifier une carte

1. Cliquez sur **Nouvelle carte**.
2. Renseignez les champs :
   - le **nom** (60 caractères au plus) ;
   - le **tag**, existant ou nouveau (40 caractères au plus) ;
   - l'**endpoint**, qui commence toujours par `https://`.
3. Précisez la **clé API** : **Sans clé**, ou **Clé requise**.
   - Collez la clé ; sa date d'expiration est facultative.
   - En modification, laissez le champ vide pour conserver la clé actuelle.
4. Choisissez l'**envoi de la clé** : en-tête X-Api-Key, ou Authorization: Bearer.
5. Choisissez la **requête** : **GET**, ou **POST** avec un corps JSON (4 096 caractères au plus).
6. Cliquez sur **Créer la carte** ou **Enregistrer**, puis sur **Tester l'appel**.

**Règles de sécurité**

- Seules les adresses `https://` publiques sont acceptées.
- Sont refusées les adresses locales ou privées, et une adresse qui contient un identifiant et un mot de passe.
- Les redirections ne sont pas suivies.
- La clé est chiffrée. Seuls ses 4 derniers caractères restent visibles.

### 3.17.2 États d'une carte

Du plus prioritaire au moins prioritaire :

| État | Condition |
|---|---|
| Désactivée | La carte n'est plus appelée ; les widgets ne sont plus mis à jour |
| Non vérifiée | Aucun appel encore fait |
| En erreur | Dernière réponse en erreur (clé refusée, quota dépassé, délai…) |
| À surveiller | Clé expirant dans moins de 60 jours, ou quota du jour à 80 % ou plus |
| Lente | Temps de réponse de 300 ms ou plus |
| Opérationnelle | Tout va bien |

### 3.17.3 Autres actions

- **Associer un widget**. Seuls les widgets qui utilisent une carte API sont proposés : Actualité, Météo, Trafic. Un widget du Cockpit s'associe aussi automatiquement à sa carte lors de son premier appel.
- **Désactiver / Réactiver** la carte.
- **Supprimer la carte** :
  1. La Console indique les widgets impactés.
  2. Cliquez sur **Supprimer définitivement**.
  3. Vous disposez de 5 secondes pour annuler.

**Automatique**

- Les cartes actives sont testées toutes les **15 minutes**.
  - Une carte GET n'est pas retestée si un vrai appel a réussi dans l'heure.
  - Une carte POST est testée une fois par 24 heures, sauf si elle est en erreur.
- **Cloche** :
  - carte en erreur ;
  - clé qui expire (30, 7 et 1 jour avant, puis expirée) ;
  - quota à 80 % ou plus.
- **Service en panne** : les widgets affichent la dernière réponse réussie de moins de 24 heures.
- **Quota journalier atteint** : les widgets reçoivent un refus jusqu'à minuit (heure de Paris).

**Messages d'erreur** : « Donnez un nom à la carte. », « Saisissez une adresse valide, sans espace : domaine puis chemin. », « Adresse privée ou locale interdite », « Collez la clé fournie par le service. », « JSON invalide ».

## 3.18 Notifications envoyées aux utilisateurs

**À quoi sert la page.** Programmer des messages envoyés aux utilisateurs **chaque jour ou chaque semaine, à heure fixe**. Un modèle d'IA rédige leur contenu à partir des données du projet. Depuis le 30 septembre 2026, il n'y a plus d'alertes déclenchées par un événement : toutes les règles partent à heure fixe.

> [Capture] Page Notifications : liste des règles, éditeur, aperçu, historique.

### 3.18.1 Créer et régler une règle

1. Cliquez sur **Nouvelle règle**. La règle est créée inactive, quotidienne à 7 h 00.
2. Cliquez sur le titre et renommez la règle (120 caractères au plus).
3. **Canal** : **Dans l'application** (cloche du Cockpit) et/ou **E-mail**. Il faut au moins un canal.
4. **Destinataires par profil** : Admin, PMO, Responsable, Lecteur. Le nombre de destinataires actifs s'affiche.
5. **Projets ciblés** : **Tous** (chaque projet ouvert) ou une sélection de projets.
6. **Fournisseur et modèle** : un modèle de langage actif, qui rédigera le contenu.
7. **Prompt envoyé au modèle** : la consigne de rédaction (4 000 caractères au plus).
8. **Fréquence d'envoi** : **Quotidienne** ou **Hebdomadaire** ; le jour (hebdomadaire) et l'heure (par pas de 30 minutes, heure de Paris).
9. **Message** : l'objet (300 caractères au plus) et le corps (4 000 au plus). Insérez les variables :
   - `{projet}` : code du projet ;
   - `{date}` : date du jour ;
   - `{reponse_llm}` : le texte rédigé par le modèle.
10. Cliquez sur **Enregistrer**, puis sur **Activer**.

La phrase en tête de l'éditeur résume la règle, par exemple : « Informer PMO et Responsable sur RISE, chaque semaine, lundi 07:00, dans l'application et par e-mail. Message rédigé par Claude Sonnet 4.5. ».

**Règles**

- `{reponse_llm}` n'est pas permise dans le prompt, seulement dans le message.
- Les anciennes variables `{jalon}`, `{risque}`, `{seuil}` et `{document}` sont refusées.
- **Cas bloquants** (bandeau rouge) : une règle sans modèle, ou sans destinataire, peut être enregistrée et activée, mais **n'envoie rien**.
- **Activer / Désactiver** a un effet immédiat. **Enregistrer** recalcule le prochain envoi.
- **Supprimer la règle** (deux clics) supprime la règle, mais garde son historique, affiché sous « Règle supprimée ».
- Création, modification et activation sont tracées (Info) ; la suppression aussi (Sensible).

### 3.18.2 Tester une règle

- **M'envoyer un test** envoie la règle telle qu'affichée, même non enregistrée, **à vous seul**, sur les canaux choisis.
- Le texte est rédigé pour le premier profil destinataire, sur le premier projet ciblé.
- Pour une règle « Tous les projets », le test est rédigé sans données de projet.
- Le bouton est inactif tant qu'un cas bloquant subsiste.

### 3.18.3 Comment un envoi est préparé

- **Un texte par profil.**
  - Chaque destinataire reçoit le texte de son profil le plus large parmi ceux visés : Admin, puis PMO, puis Responsable, puis Lecteur.
  - Ce texte est rédigé sur les seules données que **tous** les destinataires de ce profil ont le droit de voir.
  - Un Responsable ne reçoit donc que des informations sur les chantiers communs aux Responsables destinataires.
- **Rédaction.**
  - Le modèle lit les données du projet, puis rédige.
  - Le contenu suit une mise en forme légère : une phrase essentielle, 2 ou 3 rubriques, des puces qui commencent par le chiffre clé, des étapes numérotées.
  - Le Cockpit la met en page ; l'e-mail la reçoit en texte propre.
- **Garde-fous.**
  - Aucune requête technique n'est jamais envoyée à la place du texte.
  - Si les données ne peuvent pas être lues, le texte est rédigé sans chiffres, ou remplacé par : « Les données du projet n'ont pas pu être analysées pour cet envoi : consultez le détail dans le Cockpit. ».
- **Mémoire.** Le dernier envoi réussi de la règle, pour le même projet et le même profil, est transmis au modèle s'il date de moins de 35 jours. Le modèle dit alors ce qui a changé depuis, au lieu de tout répéter.
- **Canaux.**
  - Dans l'application : une notification par destinataire, dans la cloche du Cockpit.
  - E-mail : un e-mail par profil, avec tous les destinataires en copie visible.
- **« Tous les projets »** produit un envoi par projet ouvert.

### 3.18.4 Planification et règle de rattrapage

- Chaque règle active connaît son **prochain envoi**. La plateforme vérifie chaque minute les envois arrivés à échéance.
- Un même envoi (règle, projet, heure prévue) ne part **jamais deux fois**.
- Un envoi parti moins de 5 minutes après l'heure prévue est « à l'heure ».
- **Règle de rattrapage** (si la plateforme était arrêtée à l'heure prévue) :
  - l'envoi part au redémarrage s'il est encore dans la **limite de rattrapage** : le lendemain du jour prévu, 23 h 59, dans le fuseau du projet ;
  - si plusieurs envois d'une même règle ont été manqués pour un même projet, **seul le plus récent part**. Les autres sont notés « Remplacé » ;
  - au-delà de la limite, l'envoi est « **Abandonné** ». Il est compté comme un échec et apparaît dans « À traiter » ;
  - les rattrapages partent du plus ancien au plus récent, 10 par minute au plus, pour ne pas saturer les canaux.
- Une règle désactivée n'a pas de prochain envoi. À sa réactivation, rien n'est rattrapé pour la période d'inactivité.

**Exemple de rattrapage.** Une règle quotidienne part à 9 h 00. La plateforme s'arrête le mardi à 8 h et redémarre le jeudi à 10 h 12. Les envois du mardi et du mercredi sont manqués. Au redémarrage :

- l'envoi du mardi est « Remplacé » par celui du mercredi ;
- celui du mercredi est encore dans sa limite (jeudi 23 h 59) : il part aussitôt, noté « Rattrapé · prévu mer. 09:00, envoyé jeu. 10:12 ».

Si la plateforme n'avait redémarré que le vendredi, l'envoi du mercredi aurait été « Abandonné ».

### 3.18.5 Historique et « À traiter »

- **Historique des envois** : onglets **Cette règle** ou **Toutes les règles** ; les 200 derniers envois.
- **Statuts** :

| Statut | Signification |
|---|---|
| Distribué | Envoyé |
| Rattrapé | Envoyé après un arrêt, dans la limite de rattrapage |
| Remplacé | Non envoyé : un envoi plus récent de la même règle est parti à sa place |
| Abandonné | Non envoyé : la limite de rattrapage était dépassée |
| Échec | Erreur de rédaction ou d'envoi (modèle indisponible, serveur d'e-mail en erreur…) |

- **À traiter** : les échecs et abandons des 7 derniers jours apparaissent dans la Vue d'ensemble (« N échecs d'envoi de notification sur 7 jours », **Voir l'historique**).

**Messages d'erreur**

| Message | Cause |
|---|---|
| « Enregistrement impossible : vos modifications sont conservées. Réessayez. » | Refus ou serveur injoignable ; la saisie n'est pas perdue |
| « heure HH:MM par pas de 30 minutes » | Heure invalide |
| « {reponse_llm} n'est utilisable que dans le message » | Variable mal placée |
| « variable retirée : {jalon} » | Ancienne variable |
| « LLM inconnu ou inactif » | Modèle désactivé ou supprimé |
| « Aucun modèle choisi (modèles réinitialisés) : la règle ne pourra pas s'envoyer. » | Cas bloquant |
| « Aucun destinataire : la règle ne pourra pas s'envoyer. » | Cas bloquant |

**Exemple.** La règle « Synthèse hebdomadaire du projet » part chaque lundi à 7 h 00 vers les PMO et Responsables de RISE, dans l'application et par e-mail. Les PMO reçoivent une synthèse de tout le projet. Les Responsables reçoivent celle de leurs chantiers communs. Chaque synthèse commence par ce qui a changé depuis le lundi précédent.

## 3.19 Serveur d'envoi SMTP

**À quoi sert la page.** Régler le serveur qui envoie tous les e-mails de la plateforme : invitations, réinitialisations de mot de passe, notifications.

> [Capture] Page Serveur d'envoi SMTP : trois blocs et test de connexion.

**Utilisation**

1. **Serveur** : saisissez le nom du serveur, puis choisissez le chiffrement (TLS / STARTTLS, SSL/TLS ou Aucun) et le port.
2. **Authentification** : **Oui** / **Non**, puis l'identifiant et le mot de passe.
3. **Expéditeur** : l'adresse d'expédition. **Reprendre l'identifiant** la recopie depuis l'identifiant.
4. Cliquez sur **Tester la connexion**. Les quatre étapes (Connexion, Chiffrement, Authentification, Expédition) passent au vert. Aucun e-mail n'est envoyé.
5. Cliquez sur **Enregistrer**.
6. Après un test réussi, envoyez un **e-mail de test** à une adresse de votre choix.

**Règles**

- **Valeurs par défaut** : smtp.gmail.com, port 587, STARTTLS, avec authentification.
- **Port proposé** selon le chiffrement : 587, 465 ou 25.
- **Conseils affichés** :
  - « Le port 465 attend SSL/TLS dès la connexion. » ;
  - « Sans chiffrement, identifiant et mot de passe circulent en clair. » ;
  - pour Gmail, l'expéditeur est remplacé par l'identifiant, sauf s'il s'agit d'un alias vérifié.
- **Mot de passe** : chiffré, jamais réaffiché. Laissé vide, il est conservé. Gmail exige un **mot de passe d'application** de 16 caractères.
- **Délais** : 10 secondes pour la connexion et pour chaque réponse du serveur.
- **Enregistrement** : il est tracé (Sensible). Toute modification efface le résultat du dernier test.

**Messages d'erreur** : chaque étape en échec affiche le code du serveur et une aide. Par exemple :

- « Le nom du serveur est introuvable. Vérifiez l'orthographe. » ;
- « Gmail n'accepte que les mots de passe d'application (16 caractères)… ».

À l'enregistrement, la Console signale aussi « Saisissez un nom d'hôte… », « Le mot de passe est requis quand l'authentification est activée. » et « Saisissez une adresse e-mail valide. ».

## 3.20 Guide utilisateur

**À quoi sert la page.** Mettre ce guide à disposition des administrateurs, et savoir qui l'a téléchargé.

> [Capture] Page Guide utilisateur : version en vigueur et frise des événements.

**Utilisation**

- **Télécharger le guide** télécharge la version en vigueur, nommée « Guide utilisateur Console vX.Y.pdf ».
- **Déposer ou remplacer le guide** (icône) : choisissez un PDF. Il devient aussitôt la version en vigueur.

**Règles**

- Seuls les vrais fichiers PDF sont acceptés (le contenu est vérifié), 50 Mo au plus.
- **Numérotation** : la première version est 1.0. Chaque remplacement ajoute 1 au second chiffre (3.9 donne 3.10).
- Seule la version en vigueur est téléchargeable. Les anciennes restent dans la frise.
- Chaque téléchargement est enregistré avant l'envoi du fichier : qui, quand, quelle version. Ce registre ne peut pas être modifié.
- Chaque publication est tracée au journal d'audit (Sensible).

**Messages** : « Seuls les fichiers PDF sont acceptés. », « Le téléchargement a échoué. Réessayez. », « Le remplacement a échoué. Réessayez. ».

## 3.21 Mon profil

**À quoi sert la page.** Gérer vos informations personnelles, votre mot de passe et vos sessions.

> [Capture] Mon profil, onglet Sécurité.

**Utilisation**

- **Informations** :
  - modifiez vos coordonnées : prénom, nom, position, société, e-mail, téléphone, ville, pays, langue, fuseau ;
  - **Changer la photo** (une image de 2 Mo au plus) ;
  - cliquez sur **Enregistrer**.
- **Sécurité** :
  - **Modifier** le mot de passe : saisissez le mot de passe actuel, puis le nouveau deux fois. Vos autres sessions sont fermées ; celle-ci reste ouverte ;
  - **Sessions ouvertes** : **Déconnecter** ferme une session précise ; **Déconnecter les autres sessions** ferme toutes les autres.

**Règles**

- Prénom et nom sont obligatoires (60 caractères au plus).
- Une adresse e-mail déjà prise par un autre compte est refusée.
- Changer votre e-mail change aussi votre identifiant de connexion. Ce changement est tracé (Sensible).
- La session courante ne se ferme pas depuis la liste : utilisez la déconnexion.

**Messages** : « Le prénom et le nom sont requis », « Adresse e-mail invalide », « Mot de passe actuel incorrect ».

# 4. Rôles et droits

## 4.1 Qui accède à la Console

- **Seuls les administrateurs de la plateforme** accèdent à la Console.
- Un administrateur a accès à toutes les pages et à toutes les actions de la Console. Il n'existe qu'un seul niveau d'administrateur.
- Un compte sans ce droit, même PMO, ne peut pas ouvrir la Console. Sa tentative de connexion est tracée.

## 4.2 Ce que chaque profil voit et fait

| Profil | Console | Cockpit |
|---|---|---|
| Administrateur | Tout : comptes, droits, IA, projets, snapshots, plateforme, journal d'audit | Voit tous les projets et tous les chantiers, **en lecture seule** |
| PMO (par projet) | Aucun accès | Tous les droits sur le projet : référentiel et suivi. Peut demander l'invitation d'une personne et l'activation d'un module |
| Responsable (par chantier) | Aucun accès | Met à jour le suivi et les dates de ses chantiers. Peut demander l'activation d'un module |
| Lecteur (par chantier) | Aucun accès | Consulte ses chantiers |

**Règles**

- **Seule la Console attribue les droits.** Le Cockpit les lit et les combine.
- **Cumul** : un même compte peut être administrateur et, selon les projets, PMO, Responsable ou Lecteur. Le profil le plus large s'applique : Administrateur, puis PMO, puis Responsable, puis Lecteur.
- **Rattachement** : être rattaché à un projet ne donne aucun accès. Seules les habilitations comptent.
- **Pertes d'accès** :
  - un compte suspendu perd tout accès immédiatement ;
  - un administrateur retiré perd l'accès à la Console dès sa requête suivante.
- **Garde-fous** : au moins un administrateur doit toujours rester, et personne ne peut retirer ses propres droits d'administrateur.

# 5. Paramétrage

| Réglage | Où | Effet |
|---|---|---|
| Fournisseurs et clés d'IA | Fournisseurs et modèles | Autorisent l'appel aux modèles. Une clé en erreur rend ses modèles indisponibles |
| Modèles et tarifs | Fournisseurs et modèles | Définissent les modèles utilisables et le calcul des coûts |
| Affectation principal / secours | Affectation des modèles | Choisit le modèle de chaque fonction, dès la requête suivante |
| Plafonds et seuils d'alerte | Vue générale des coûts | Déclenchent les alertes budgétaires, sans bloquer les appels |
| Persona | Persona | Nom, avatar et personnalité de Jev |
| Skills | Skills | Consignes de Jev |
| Planification des snapshots | Snapshots | Captures automatiques et durée de conservation, par projet |
| Portée des modules | Modules | Fonctions optionnelles visibles dans le Cockpit |
| Cartes API | Registre des cartes API | Services externes des widgets |
| Règles de notification | Notifications | Messages programmés envoyés aux utilisateurs |
| Serveur d'envoi | Serveur d'envoi SMTP | Envoi de tous les e-mails |
| Guide utilisateur | Guide utilisateur | Version du guide proposée au téléchargement |
| Informations, mot de passe, sessions | Mon profil | Votre propre compte |
| Réduire / déplier la navigation | Barre latérale | Mémorisé par votre navigateur |

**Réglages fixes (non modifiables à l'écran)**

- **Sécurité** :
  - 15 minutes d'inactivité avant déconnexion ;
  - blocage de 15 minutes après 5 échecs de connexion ;
  - invitation valable 14 jours ;
  - lien de réinitialisation valable 30 minutes.
- **Données** :
  - journal d'audit conservé 24 mois ;
  - conversations de Jev conservées 30 jours.
- **Planifications** :
  - test des clés d'IA toutes les 2 heures ;
  - contrôle des cartes API toutes les 15 minutes ;
  - rattrapage des notifications jusqu'au lendemain 23 h 59.

# 6. FAQ et dépannage

**Un utilisateur n'a pas reçu son invitation.**

- Vérifiez l'adresse dans Utilisateurs.
- Vérifiez le serveur d'envoi : **Tester la connexion**, puis envoyez un e-mail de test.
- Faites **Relancer**. Un nouveau lien de 14 jours part, et l'ancien devient invalide.
- Demandez aussi à l'utilisateur de regarder ses courriers indésirables.

**Le lien d'invitation « n'est plus valide ».**
Il a expiré (14 jours), a déjà servi, ou une relance l'a remplacé. Relancez l'invitation.

**Un utilisateur ne peut pas se connecter.**

- Son compte est peut-être encore Invité, ou Suspendu. Le message est volontairement le même dans tous les cas.
- Après 5 échecs, la connexion est bloquée 15 minutes. Il peut utiliser « Mot de passe oublié ? ».

**Je veux supprimer un compte, mais la Console refuse.**
Le compte a laissé des traces : journal d'audit, responsabilités, décisions. Suspendez-le : l'accès est coupé et l'historique reste cohérent.

**Le PMO a corrigé l'e-mail d'une personne, mais le compte n'a pas changé.**
C'est voulu : l'e-mail est l'identifiant de connexion. Ouvrez le compte et cliquez sur **Appliquer** dans l'encart « E-mail du référentiel ».

**« Accès à retirer » apparaît en rouge.**
La personne a été désactivée dans le référentiel. Retirez ses droits sur le projet, ou suspendez son compte.

**Jev répond « Je ne peux pas répondre pour l'instant ».**
Aucun modèle n'est affecté à Guidage console, ou ses clés sont refusées. Vérifiez Affectation des modèles et Fournisseurs et modèles.

**Jev dit « Conversation introuvable ».**
La conversation a expiré (30 jours). Cliquez sur **Nouvelle conversation**.

**Une fonction affiche « Secours en service ».**
La clé du fournisseur principal est refusée, ou n'a jamais été testée. Testez ou remplacez la clé.

**Le budget est dépassé : les appels sont-ils bloqués ?**
Non. Les plafonds alertent sans bloquer. Pour réduire les coûts, affectez des modèles moins chers.

**Une notification programmée n'est pas partie.**

- La règle est-elle active ? A-t-elle un modèle et des destinataires ?
- Un projet ciblé a-t-il des comptes actifs avec les profils visés ?
- Consultez l'historique : « Remplacé », « Abandonné » ou « Échec » indiquent la cause.
- Si la plateforme était arrêtée plus longtemps que la limite de rattrapage, l'envoi est abandonné.

**Un e-mail de notification n'arrive pas, alors que l'historique indique « Distribué ».**
Vérifiez qu'un serveur d'envoi est configuré et testé. Sans serveur, l'e-mail n'est pas réellement envoyé.

**Un snapshot a échoué.**
La cloche le signale. Créez un nouveau snapshot manuel depuis la page Snapshots.

**L'initialisation refuse mon fichier.**
Corrigez les erreurs listées dans le détail (onglet, ligne, message), puis cliquez sur **Importer le fichier corrigé**. Rien n'a été créé entre-temps.

**Une carte API est « En erreur ».**

- Clé refusée : cliquez sur **Modifier** et remplacez la clé.
- Service injoignable : les widgets affichent leur dernière valeur connue. Réessayez **Tester l'appel** plus tard.

# 7. Annexes

## Annexe A. Récapitulatif des règles de gestion

Les références désignent les fichiers du code (dossier `backend/src` sauf mention contraire) et leurs lignes au 30/09/2026.

| Règle | Description | Fonctionnalité | Référence dans le code |
|---|---|---|---|
| Accès réservé | Toute la Console est réservée aux administrateurs | Accès | `core/auth/auth.ts:106` ; `@AdminOnly` sur chaque contrôleur |
| Échecs de connexion | 5 échecs par adresse, 20 par adresse IP, blocage 15 min, remise à zéro après 15 min | Connexion | `core/auth/policy.ts:11-17` |
| Message d'échec unique | Même message pour adresse inconnue, mauvais mot de passe, compte invité ou suspendu | Connexion | `core/auth/credentials.service.ts:82-101` |
| Mot de passe | 12 à 128 caractères, majuscule, minuscule, chiffre, spécial, différent du précédent, non compromis | Connexion | `core/auth/policy.ts:38-58` ; `core/auth/password.ts:70-75` |
| Inactivité | 15 min dans la Console (+ 2 min de marge côté serveur), avertissement 60 s avant | Session | `core/auth/policy.ts:22-24` ; `frontends/auth-api.js:216-310` |
| Lien de réinitialisation | Valable 30 min ; 1 envoi par minute, 5 par heure ; jamais pour un compte suspendu | Mot de passe oublié | `core/auth/policy.ts:29-33` ; `credentials.service.ts:140-163` |
| Invitation | Lien à usage unique, valable 14 jours ; un nouveau lien annule les précédents | Utilisateurs | `admin/accounts.controller.ts:18, 73-82` ; `credentials.service.ts:107-127` |
| Invitation sans réponse | Signalée après 7 jours | Utilisateurs, À traiter | `admin/accounts.controller.ts:20` ; `frontends/Console Admin.dc.html:1415` |
| Au moins un accès | Un compte invité a au moins un projet ou le rôle Administrateur | Utilisateurs | `admin/accounts.controller.ts:213` |
| Unicité de l'e-mail | Une adresse ne sert qu'à un compte | Utilisateurs | `admin/accounts.controller.ts:210` |
| Statuts de compte | Invité → Actif (mot de passe choisi) ; Suspendu → Actif ou Invité selon la connexion passée | Utilisateurs | `admin/accounts.controller.ts:226, 330, 343` ; `credentials.service.ts:178` |
| Suspension | Ferme toutes les sessions ; impossible sur soi-même | Utilisateurs | `admin/accounts.controller.ts:322-335` |
| Suppression | Refusée si le compte ou la personne liée a laissé une trace ; impossible sur soi-même | Utilisateurs | `admin/accounts.controller.ts:366-403` |
| E-mail du référentiel | Jamais recopié seul ; appliqué par l'administrateur ; invitation renvoyée pour un invité | Utilisateurs | `admin/profiles.service.ts:79` ; `admin/accounts.controller.ts:297-320` |
| Accès à retirer | Personne inactive dont le compte garde un droit | Utilisateurs, À traiter, cloche | `domain/habilitation-proposals.ts:46-52` ; `admin/console.controller.ts:138-149` |
| Compte à réactiver | Personne réactivée au référentiel après la suspension du compte | Utilisateurs, À traiter, cloche | `admin/profiles.service.ts:91-104` |
| Proposition de droits | Responsable des chantiers dont la personne est responsable, Lecteur des autres chantiers de rattachement | Utilisateurs | `domain/habilitation-proposals.ts:37-61` |
| Habilitations | Remplacement complet ; droits écrits sur la personne du référentiel si elle existe ; PMO prioritaire sur les chantiers | Droits | `admin/accounts.controller.ts:419-473` |
| Dernier administrateur | Il reste toujours au moins un administrateur ; pas de retrait de ses propres droits | Administrateurs | `admin/accounts.controller.ts:423, 447-450, 579-591` |
| Nouvel administrateur | Seul un compte actif peut le devenir | Administrateurs | `admin/accounts.controller.ts:566-577` |
| Journal d'audit | Ajout seul (trigger SQL), 24 mois de conservation, purge à 03:15 | Journal d'audit | `prisma/migrations/20260928000000_audit_append_only` ; `admin/console.controller.ts:22-62` |
| Export d'audit | 5 000 lignes au plus, séparateur « ; », export tracé | Journal d'audit | `admin/console.controller.ts:86-95` |
| Décision différée | 10 s pour annuler une décision sur une demande ; exécution ensuite | Cloche | `admin/inbox.service.ts:23, 305-367` |
| Réconciliation de la cloche | Une notification par cause ; fermée ou rouverte selon la cause ; lue pour tous | Cloche | `admin/inbox.service.ts:114-280` |
| Clés d'IA | Chiffrées ; seuls le préfixe et les 4 derniers caractères restent visibles | Fournisseurs | `core/crypto.ts:9-34` |
| Test des clés | Réel, 10 s au plus, toutes les 2 h ; « quota atteint » = clé valide | Fournisseurs | `core/provider-key-tester.ts:10, 71-92` ; `admin/ai.controller.ts:20, 89-92` |
| Disponibilité d'un modèle | Actif, de la bonne catégorie, fournisseur au statut OK | Affectation | `core/llm.service.ts:119-125` |
| Modèle principal protégé | Ni désactivation ni suppression d'un modèle affecté | Fournisseurs | `admin/ai.controller.ts:276-313` |
| Tarifs | LLM entrée + sortie ; Embedding entrée ; Reranking à la requête ou au jeton ; ≥ 0 | Modèles | `domain/ai-pricing.ts:51-68, 106-115` |
| Affectation | Principal actif de la bonne catégorie ; secours différent | Affectation | `admin/ai.controller.ts:438-484` |
| Chaîne Documents | Une étape indisponible suspend les suivantes | Affectation | `domain/ai-pricing.ts:87-94` ; `core/llm.service.ts:179-208` |
| Relais par le secours | Principal en échec à l'appel : le secours est essayé | IA | `core/llm.service.ts:137-149` |
| Limite de sortie | 1 024 jetons au plus par réponse réelle ; délai de 30 s | IA | `core/llm.service.ts:101, 166` ; `core/llm-client.ts:5` |
| Projection et statut budgétaire | Rythme sur 7 jours ; Dépassement si projection > plafond ; Alerte si dépense ≥ seuil | Coûts | `admin/usage.service.ts:89-137` |
| Seuil d'alerte | 50 à 100 %, par pas de 5 ; 80 % par défaut | Coûts | `admin/ai.controller.ts:567-581` ; `admin/usage.service.ts:148` |
| Plafond non bloquant | Aucun appel n'est refusé au-delà d'un plafond | Coûts | (aucune lecture des plafonds par la passerelle IA) |
| Tarifs figés | Le tarif de chaque appel est enregistré au moment de l'appel | Journal des appels | `core/llm.service.ts:215-228` |
| Cache des instructions | Lecture à 10 %, écriture à 125 % du prix d'entrée | IA | `core/llm-client.ts:43-44` ; `core/llm.service.ts:172-174` |
| Jev sans action | Jev explique et guide ; il ne produit aucune action | Jev | `admin/console.controller.ts:283-303` |
| Lecture de données par Jev | Lecture seule, 200 lignes, 5 s, une correction | Jev | `domain/jev-sql.ts:10-16` ; `admin/jev-sql.service.ts:45-113` |
| Mémoire de Jev | 10 derniers échanges, 16 000 caractères, résumé au-delà, isolée par administrateur | Jev | `admin/jev-memory.service.ts:17-37, 66-117` |
| Purge des conversations | 30 jours sans échange, purge à 03:25 | Jev | `admin/jev-memory.service.ts:26, 55-63` ; `admin/console.controller.ts:49-50` |
| Persona | Nom obligatoire, 30 caractères ; Soul 20 000 caractères ; image de 1 Mo ; versions conservées | Persona | `domain/jev-prompt.ts:19-52` ; `admin/persona.controller.ts:59-105` |
| Skill de guidage | Seule la skill de guidage s'applique au Jev de la Console | Skills | `domain/jev-prompt.ts:139-176` |
| Nom de skill unique | Unicité sans tenir compte des majuscules | Skills | `admin/skills.controller.ts:128-132` |
| Badge « Nouveau » | Projet initialisé depuis moins de 7 jours, en préparation | Bibliothèque | `admin/data.controller.ts:24, 270` |
| Contrôles d'initialisation | 13 onglets ; code libre de 2 à 20 caractères ; références et dates cohérentes | Initialisation | `import/referential-import.ts:129-474` ; `import/import-screen.ts:44-55` |
| Création tout ou rien | Contrôle refait, transaction unique, projet au statut Préparation | Initialisation | `admin/data.controller.ts:327-362` ; `import/referential-import.ts:510-709` |
| Taille du fichier d'initialisation | 10 Mo au plus, format .xlsx | Initialisation | `import/import.controller.ts:10` ; `admin/data.controller.ts:305-308` |
| Capture de snapshot | 19 types d'objets et leurs liens ; libellé de 120 caractères au plus côté serveur | Snapshots | `admin/snapshots.service.ts:12-44, 90-121` ; `admin/data.controller.ts:62-75` |
| Planification des snapshots | Vérification chaque heure ; quotidienne, hebdomadaire, mensuelle (le 1er) | Snapshots | `domain/snapshots.ts:170-189` ; `admin/snapshots.service.ts:248-256` |
| Purge des snapshots | Au-delà de la conservation, tous types confondus, pour les planifications actives | Snapshots | `admin/snapshots.service.ts:50-56, 259-267` |
| Restauration | Sauvegarde de sécurité d'abord, puis tout ou rien (120 s au plus) | Snapshots | `admin/snapshots.service.ts:209-245` |
| Portée des modules | Désactivé, tous les projets, ou par projet ; approbation limitée au projet demandé | Modules | `admin/data.controller.ts:185-228` |
| Sécurité des cartes API | https public seulement ; adresses privées refusées ; pas de redirection | Registre API | `domain/api-cards.ts:62-96` ; `admin/api-cards.service.ts:81-117` |
| Contrôle de santé des cartes | Toutes les 15 min ; POST une fois par 24 h | Registre API | `admin/api-cards.service.ts:36, 142-153` ; `domain/api-cards.ts:38-48` |
| Alertes des cartes | Clé à 30, 7 et 1 jour, puis expirée ; quota à 80 % | Registre API, cloche | `domain/api-cards.ts:17-19, 129-134` ; `admin/inbox.service.ts:242-264` |
| Fréquences de notification | Quotidienne ou hebdomadaire, heure par pas de 30 min, heure de Paris ; 07:00 et lundi par défaut | Notifications | `admin/rules.controller.ts:16-19` ; `domain/notification-rules.ts:74-86` |
| Cas bloquants | Sans modèle ou sans destinataire : enregistrable, rien n'est envoyé | Notifications | `domain/notification-rules.ts:193-194, blockingErrors` |
| Variables | `{reponse_llm}` interdite dans le prompt ; anciennes variables refusées | Notifications | `admin/rules.controller.ts:259-262` ; `domain/notification-rules.ts:184-188` |
| Un envoi unique | Unicité par règle, projet et heure prévue | Notifications | `prisma/schema.prisma` (`@@unique([ruleId, projectId, scheduledAt])`) |
| Vérification des envois | Chaque minute, sur le prochain envoi stocké | Notifications | `admin/notifications.service.ts:47-52, 154-173` |
| Rattrapage | Jusqu'au lendemain 23:59 (fuseau du projet) ; seul le plus récent ; 10 par minute ; « à l'heure » sous 5 min | Notifications | `domain/notification-rules.ts:100-106, 137-142` ; `admin/notifications.service.ts:176-223` |
| Texte par profil | Profil le plus large ; données communes à tous les destinataires du profil | Notifications | `admin/profiles.service.ts:140-162` ; `domain/notification-rules.ts:313-318` |
| Mémoire des notifications | Dernier envoi réussi de moins de 35 jours, même projet et même profil | Notifications | `domain/notification-rules.ts:106` ; `admin/notifications.service.ts:72-76` |
| Jamais de SQL envoyé | Requête coupée réécrite ; sinon texte de repli | Notifications | `domain/jev-sql.ts:23-38` ; `admin/notification-writer.service.ts` (`NO_DATA_TEXT`) |
| Mise en forme | Markdown léger mis en page dans le Cockpit ; texte propre par e-mail | Notifications | `admin/notification-writer.service.ts` (`NOTIFICATION_ANSWER_INSTRUCTIONS`) ; `domain/notification-rules.ts` (`mailText`) |
| Échecs dans « À traiter » | Échecs des 7 derniers jours (5 au plus) | Notifications, À traiter | `admin/console.controller.ts:109, 131` |
| SMTP | Mot de passe chiffré et jamais renvoyé ; test réel sans envoi ; 10 s par étape | Serveur SMTP | `core/smtp.service.ts:67-94` ; `core/smtp-probe.ts:156-217` ; `domain/smtp.ts:21-40` |
| Guide | PDF vérifié par son contenu, 50 Mo ; version 1.0 puis +0.1 ; téléchargements tracés en ajout seul | Guide | `domain/guide.ts:6-22` ; `admin/guide.controller.ts:57-85` |

## Annexe B. Points à clarifier et écarts constatés

Ces points viennent de la lecture du code. Ils décrivent un écart entre le code et un texte affiché ou une documentation, ou un comportement ambigu. Aucun n'a été tranché dans ce guide.

**Accès et comptes**

1. **Lien expiré** : l'écran annonce « durée de validité de 30 minutes », même pour un lien d'invitation, qui vaut 14 jours.
2. **Ajout d'un administrateur** : la fenêtre annonce « La personne est prévenue par e-mail », mais aucun e-mail n'est envoyé.
3. **Suppression d'un compte** : le texte annonce que les contributions restent visibles sous « Utilisateur supprimé ». En réalité, la suppression est refusée dès qu'une trace existe.
4. **Attribution des chantiers** : plusieurs textes disent que « le PMO choisit les chantiers ». Depuis le 29/09/2026, seule la Console les attribue.
5. **« Annuler » après une suspension** : il réactive le compte, sans rouvrir les sessions fermées, et l'audit enregistre une réactivation.
6. **Réactivation d'un compte activé mais jamais connecté** : il redevient Invité, sans nouveau lien.
7. **Liste des utilisateurs** : les chantiers affichés proviennent d'un fichier de démonstration (projet RISE uniquement). Seule la fenêtre « Modifier » lit les droits réels.
8. **Utilisateur courant** : la pastille « vous » et le masquage de certains boutons reposent sur un compte de démonstration fixe (`u1`). Le serveur, lui, protège correctement.
9. **« Il y a null j »** : ce libellé peut s'afficher pour un compte actif qui ne s'est jamais connecté.
10. **Journal d'audit** : l'écran se limite aux 500 dernières entrées, alors que l'export va jusqu'à 5 000.
11. **Demandes d'invitation** : le bouton « Examiner » de « À traiter » mène à Utilisateurs, où aucune zone n'affiche les demandes. La décision se prend dans la cloche.

**Vue d'ensemble et cloche**

12. **Deux calculs du budget** : « À traiter » suit la dépense, alors que la cloche et le statut « Dépassement » suivent la projection. Un dépassement projeté peut donc apparaître dans la cloche sans apparaître dans « À traiter ».
13. **Échecs d'envoi** : le compteur « N échecs … sur 7 jours » plafonne à 5.
14. **Rechargement pendant une décision** : si la page est rechargée pendant les 10 secondes d'annulation, la demande réapparaît sans bouton « Annuler ».
15. **Erreurs techniques** : après un redémarrage du serveur, une notification « Erreur technique » restée ouverte peut ne plus se fermer d'elle-même.

**IA et coûts**

16. **Désactivation d'un modèle** : la confirmation annonce une bascule sur le secours, mais le serveur refuse de désactiver un modèle principal.
17. **Bandeau de la Vue générale des coûts** : un bandeau « Clé Google révoquée » au texte figé s'affiche dès que le fournisseur Google n'est pas testé.
18. **Journal des appels** : la formule du « Calcul du coût » ne tombe pas juste quand le cache a servi.
19. **Consommation des notifications** : elle est rangée sous la fonction Insights.
20. **Fournisseur sans clé** : il passe en erreur au test automatique et génère une alerte critique (cas d'OpenRouter créé par le catalogue).
21. **Seuil d'alerte** : il ne peut pas être désactivé depuis l'écran, alors que le serveur le permet.
22. **Réponse coupée** : la bascule sur le secours n'est pas faite quand un modèle atteint sa limite de sortie.

**Jev, Persona, Skills**

23. **Raccourci ⌘J** : il est annoncé pour ouvrir Jev, mais n'existe pas.
24. **Nom du Persona** : l'aide dit « Affiché dans le Cockpit », alors que le Cockpit garde le nom « Jev ».
25. **« Une skill active s'applique à toutes ses réponses »** : c'est faux pour le Jev de la Console, qui n'utilise que la skill de guidage.
26. **Skill de guidage sur une base neuve** : c'est « Guider l'utilisateur », une skill écrite pour le Cockpit. Le texte de la skill « Guidage console » demande de proposer des liens d'action, ce qui contredit la règle « Jev n'agit pas ».
27. **Suggestions inadaptées** : certaines portent sur des données que Jev ne lit pas (téléchargements du guide, contenu des snapshots, « mes droits »).
28. **Mémoire** :
    - le résumé ne se déclenche qu'à partir de 13 échanges, alors que 10 seulement sont transmis : les 11e et 12e échanges sont provisoirement ni transmis ni résumés ;
    - après « Conversation introuvable », les questions suivantes échouent jusqu'à une nouvelle conversation.
29. **Registre** : l'accueil de Jev vouvoie, mais « Écris à… » et « Ton assistant IA » tutoient.

**Projets**

30. **Statut de l'initialisation** : le statut indiqué dans le fichier est contrôlé puis ignoré ; le projet est toujours créé en Préparation.
31. **Exemple ORION** : « Charger l'exemple » simule une création et affiche « ORION créé », alors que rien n'est créé.
32. **Libellé de snapshot** : 60 caractères à l'écran, 120 côté serveur.
33. **Contenu d'un snapshot** : le texte « tâches, jalons, risques, livrables » sous-estime le contenu réel (19 types d'objets).
34. **Projet vide** : le message « Le premier snapshot planifié aura lieu… » s'affiche même quand la planification est suspendue.
35. **Échec de snapshot** : la notification dit « Relancez-la depuis Snapshots », alors qu'il n'y a pas de relance, seulement une nouvelle capture.
36. **Purge des snapshots** : elle supprime aussi les snapshots manuels et les sauvegardes de sécurité.
37. **Capture interrompue** : une capture interrompue par un redémarrage du serveur n'est ni listée ni signalée.
38. **Fichiers abandonnés** : les fichiers d'initialisation abandonnés ne sont jamais purgés.

**Plateforme**

39. **Compteur de destinataires** : il additionne les profils (un compte à plusieurs profils est compté plusieurs fois) et ignore les projets ciblés.
40. **Aperçu e-mail** : il montre un bouton « Ouvrir dans le Cockpit » et l'expéditeur « notifications@rise.app », absents de l'e-mail réel.
41. **« Test envoyé sur votre compte »** : le message s'affiche avant la réponse du serveur.
42. **Modèle désactivé** : une règle dont le modèle a été désactivé est signalée comme bloquée à l'écran, mais la planification tente quand même l'envoi, qui finit en « Échec ».
43. **Règle incomplète acceptée** : une règle sans projet ciblé, ou avec un prompt vide, est acceptée. Sans projet, elle n'envoie rien et ne laisse aucune trace.
44. **E-mail de notification groupé** : tous les destinataires d'un profil figurent dans le champ « À ».
45. **E-mail sans serveur SMTP** : sans serveur configuré, un e-mail est marqué « Distribué » sans être envoyé.
46. **Décision de module depuis la page Modules** : le message annonce « {demandeur} est prévenu », mais seul le passage par la cloche prévient réellement.
47. **Registre API** :
    - l'état « Clé expirée » est « À surveiller » à l'écran et « en erreur » côté serveur ;
    - le quota et le délai d'une carte ne se règlent pas à l'écran.
48. **Pastille SMTP** : « Configuré » s'affiche même sans serveur enregistré. L'aperçu de l'expéditeur montre encore un e-mail « Jalon en retard ».
49. **Spécification des notifications** : `docs/specs/NOTIFICATIONS ET ALERTES - specification.md` décrit encore les alertes supprimées le 30/09/2026.

**Mon profil**

50. **Informations codées en dur** : plusieurs informations sont fixes (« Administratrice depuis 14 janv. 2025 », tableau des projets, dernière connexion, filtre « Julien Morel »).
51. **Changement d'e-mail** : la confirmation annonce un lien de vérification, mais l'adresse est changée immédiatement, sans lien.

## Annexe C. Fonctionnalités non documentées

Ces fonctionnalités existent dans le code mais sont désactivées, inaccessibles depuis l'écran, limitées à la démonstration ou sans effet. Elles ne sont pas décrites dans le corps du guide.

| Fonctionnalité | État |
|---|---|
| Page « Droits et habilitations » (matrice des droits, profils types, super-administrateur) | Absente du menu, code inactif |
| Préférences de notification de Mon profil (5 interrupteurs) | Enregistrées, sans aucun effet |
| Onglet Habilitations de Mon profil | Contenu fictif |
| Double authentification | Retirée |
| Palette de recherche | Prévue, sans bouton |
| Export d'un snapshot (fichier JSON) | Disponible côté serveur, sans bouton |
| Clôture ou archivage d'un projet | Absents de la Console (Cockpit seulement) |
| « Charger l'exemple » (ORION) de l'initialisation | Simulation, rien n'est créé |
| Relance d'un envoi de notification en échec | Disponible côté serveur, sans bouton |
| Aperçu serveur d'une règle de notification | Disponible côté serveur, non utilisé |
| Variable `{semaine}` des notifications | Remplacée côté serveur, non proposée à l'écran |
| Quota et délai d'une carte API ; rotation de clé dédiée | Réglables par l'API seulement |
| Restauration d'une version du Persona | Versions conservées, aucune restauration |
| Réordonnancement des skills | Inexistant |
| Consultation ou modification du dictionnaire de données de Jev | Ligne de commande seulement |
| Mémoire de Jev, étape 2 (faits mémorisés) | Non réalisée |
| Messages d'action de Jev (redirection, récapitulatif, confirmation) | Présents à l'écran, jamais produits |
| Catalogue des modèles et réinitialisation de l'IA | Ligne de commande seulement |
| Suppression ou renommage d'un fournisseur ; retrait d'une affectation | Inexistants |
| Filtres avancés des comptes et du journal d'audit (période, auteur, type) | Disponibles côté serveur, non exposés |
| Réinitialisation du mot de passe d'un autre utilisateur par l'administrateur | Inexistante |
| Mode démonstration (`?demo=1`) et mode développement (`?as=…`) | Réservés aux essais |
| Réponses des fonctions Insights, Gestion des données, Rapports et Documents | Texte de démonstration ; seule leur consommation est réelle |
| Module « Suivi des bénéfices » | Activable, sans effet constaté dans le Cockpit |
