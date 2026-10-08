# Guide utilisateur de la Console d'administration RISE

Version du 8 octobre 2026. Ce guide décrit le comportement réel de la Console, établi à partir de son code. Les écarts et les points encore ouverts sont regroupés en annexe.

## Sommaire

1. Présentation générale
2. Prise en main
3. Fonctionnalités, une par une
   - Vue d'ensemble et cloche : 3.1 à 3.2
   - Accès : 3.3 Utilisateurs, 3.4 Administrateurs, 3.5 Journal d'audit, 3.6 Consommation et coûts (usage de la plateforme)
   - IA : 3.7 Fournisseurs et modèles, 3.8 Consommation et coûts de l'IA, 3.9 Analyse des temps de réponse
   - Assistant : 3.10 Jev, 3.11 Persona, 3.12 Skills
   - Projets : 3.13 Bibliothèque des projets, 3.14 Initialisation d'un projet, 3.15 Snapshots
   - Plateforme : 3.16 Modules, 3.17 Registre des cartes API, 3.18 Notifications, 3.19 Serveur d'envoi SMTP, 3.20 Partager Cockpit, 3.21 Guide utilisateur
   - 3.22 Mon profil
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
- suivre l'usage de la plateforme : temps passé, activité et dépenses d'IA, du global à l'utilisateur ;
- régler l'intelligence artificielle : fournisseurs, clés, modèles, affectation aux fonctions, budgets, temps de réponse ;
- créer des projets à partir d'une proposition commerciale ou d'un fichier Excel, en garder l'historique (snapshots) et les restaurer ;
- régler les services de la plateforme : modules, cartes API, notifications envoyées aux utilisateurs, serveur d'e-mail, guides utilisateur ;
- préparer un paquet d'installation de Cockpit pour une autre personne ;
- surveiller l'ensemble : points à traiter, notifications de l'administrateur, journal d'audit.

La Console ne modifie pas les données métier des projets (actions, risques, jalons…). Ces données se gèrent dans le Cockpit.

## 1.2 À qui elle s'adresse

La Console est réservée aux **administrateurs de la plateforme**. Un compte sans droit d'administration ne peut pas l'ouvrir, même s'il est PMO d'un projet.

## 1.3 Principes à connaître

- **Tout est tracé.** Chaque action de la Console est inscrite dans le journal d'audit. Ce journal ne peut être ni modifié ni effacé.
- **Le référentiel du projet fait foi pour les personnes.** Le PMO tient la liste des personnes dans le Cockpit. La Console crée les comptes et les droits, et signale les écarts avec ce référentiel. Elle ne corrige jamais un compte d'elle-même.
- **Heure de Paris.** Les dates et heures affichées, les envois planifiés et les tâches automatiques suivent l'heure de Paris, sauf mention contraire.
- **La Console se tient à jour, sans rechargement.**
  - Chaque modification faite ailleurs (autre administrateur, autre onglet, Cockpit, tâche automatique) fait relire la page affichée, la Vue d'ensemble et la cloche, en moins d'une seconde.
  - Si l'onglet est masqué, la relecture a lieu au retour sur l'onglet.
  - Les points « À traiter » et les notifications de l'administrateur sont recalculés à chaque lecture. Ils disparaissent d'eux-mêmes quand leur cause n'existe plus.

## 1.4 Glossaire

| Terme | Définition |
|---|---|
| Administrateur | Compte qui a accès à la Console. Il voit tous les projets du Cockpit en lecture seule. |
| PMO | Profil qui gère un projet dans le Cockpit : référentiel et suivi. |
| Responsable | Profil qui gère un ou plusieurs chantiers d'un projet. |
| Lecteur | Profil qui consulte un ou plusieurs chantiers d'un projet. |
| Habilitation | Droit d'un compte sur un projet : PMO, ou Responsable / Lecteur d'un chantier. |
| Référentiel | Données de base d'un projet dans le Cockpit : équipes, personnes, lots, phases, sous-phases, chantiers, jalons, instances. |
| Chantier | Sous-ensemble d'un projet, avec un responsable. |
| Sous-phase | Subdivision d'une phase. Un chantier peut être rattaché à des sous-phases de ses phases. |
| Invitation | E-mail qui permet à une nouvelle personne de choisir son mot de passe et d'activer son compte. |
| À traiter | Liste des points qui demandent une action, sur la Vue d'ensemble. |
| Cloche | Tiroir des notifications de l'administrateur : incidents, alertes et demandes. |
| Temps actif | Temps pendant lequel un utilisateur interagit réellement avec la plateforme (clics, saisie, défilement). |
| Temps connecté | Durée des sessions ouvertes, de la connexion à la fin de la session. |
| Fournisseur IA | Société qui fournit des modèles d'IA (Anthropic, OpenAI, Google, Mistral, OpenRouter…). Il faut sa clé API. |
| Clé API | Code secret qui autorise la plateforme à appeler un service externe. |
| Modèle | Un modèle d'IA d'un fournisseur. Trois catégories : LLM (génère du texte), Embedding (vectorise des textes), Reranking (reclasse des résultats). |
| Fonction IA | Usage de l'IA dans la plateforme : Insights, Gestion des données, Rapports, Guidage console, Initialisation projet, et la chaîne Documents (Vectorisation, Reclassement, Synthèse). |
| Principal / secours | Modèle qui répond normalement à une fonction, et modèle qui prend le relais s'il est indisponible. |
| Plafond, seuil d'alerte | Budget mensuel d'IA, et pourcentage de ce budget à partir duquel la Console alerte. |
| Plafond mensuel d'une clé | Limite de dépense fixée chez le fournisseur, reportée dans la Console pour information (utilisée par Partager Cockpit). |
| Jeton (token) | Unité de mesure du texte traité par un modèle ; la facturation en dépend. |
| Jev | L'assistant IA de la plateforme. Dans la Console, il explique et guide, sans agir. |
| Aiguillage | Classement de chaque question posée à Jev (usage, données, ambiguë, hors sujet) avant d'y répondre. |
| Persona | Identité (nom, style, avatar…) et personnalité de Jev. |
| Skill | Consigne ajoutée aux instructions de Jev ou d'un traitement d'IA. |
| Préremplissage | Lecture d'une proposition commerciale par l'IA pour remplir le fichier Excel d'initialisation d'un projet. |
| Snapshot | Copie de l'état des données d'un projet à un instant donné. Elle permet de comparer et de restaurer. |
| Module | Fonction optionnelle du Cockpit (Budget, Suivi des bénéfices, Message d'accueil de Jev), activable par projet. |
| Carte API | Service externe appelé par la plateforme : widgets du Cockpit (météo, trafic, actualités…) et aiguillage de Jev. |
| Règle de notification | Message envoyé automatiquement aux utilisateurs, chaque jour ou chaque semaine, rédigé par un modèle d'IA à partir des données du projet. |
| Rattrapage | Envoi d'une notification prévue pendant un arrêt de la plateforme, fait au redémarrage. |
| Paquet d'installation | Fichier ZIP qui installe Cockpit et la Console sur le poste Windows d'une autre personne. |
| Code de déverrouillage | Code de 12 caractères qui protège les secrets d'un paquet d'installation. |
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
  - le bouton **Ouvrir le Cockpit**, qui ouvre le Cockpit dans un nouvel onglet ;
  - le bouton **Réduire la navigation** ;
  - la **cloche** des notifications de l'administrateur.
- **Vue d'ensemble**, puis cinq domaines en accordéon (un seul ouvert à la fois) :

| Domaine | Pages |
|---|---|
| Accès | Utilisateurs, Administrateurs, Consommation et coûts |
| IA | Fournisseurs et modèles, Consommation et coûts, Analyse des temps de réponse |
| Assistant | Persona, Skills |
| Projets | Bibliothèque des projets, Initialisation d'un projet, Snapshots |
| Plateforme | Modules, Registre des cartes API, Notifications, Serveur d'envoi SMTP, Partager Cockpit, Guide utilisateur |

- Deux pages portent le nom « Consommation et coûts » :
  - celle du domaine **Accès** suit l'usage de la plateforme (temps, activité, dépense d'IA par équipe et par utilisateur) : voir 3.6 ;
  - celle du domaine **IA** suit le budget d'IA et le détail de chaque appel aux modèles : voir 3.8.
- **Pied de la barre** :
  - le bouton de **Jev**, l'assistant ;
  - votre carte de profil, avec votre photo (ou vos initiales), qui ouvre **Mon profil**.
- **Signaux** : un point ou un compteur signale un problème sur une page.
  - Utilisateurs : compteur des demandes d'invitation en attente.
  - Fournisseurs et modèles : point rouge si une clé est en erreur ou si une fonction d'IA est à l'arrêt ; point orange si une fonction tourne sur son secours.
  - Registre des cartes API : point rouge pour une carte en erreur ou une clé expirée ; point orange pour une clé qui expire dans moins de 60 jours ou un quota utilisé à 80 % ou plus.
  - Un domaine replié affiche le total des compteurs ou le signal le plus grave de ses pages.
- **Affichage** :
  - la barre est dépliée sur un grand écran, réduite aux icônes entre 760 et 1 180 pixels de large, et devient un tiroir sur mobile ;
  - votre choix « Réduire / Déplier » est mémorisé par le navigateur.

**L'en-tête de page**

- Le fil d'Ariane indique le domaine et la page.
- La pastille d'état affiche « N incident(s) » ou « Opérationnelle ». Un clic ouvre la Vue d'ensemble.
- Chaque page a un titre et une phrase qui en résume l'usage. Certaines pages (Fournisseurs et modèles, Consommation et coûts, Initialisation d'un projet, Partager Cockpit, Guide utilisateur…) ont leur propre en-tête.

**Enregistrement des modifications.** Selon la page, il est immédiat (interrupteurs, décisions, choix d'un modèle) ou se fait par un bouton **Enregistrer** : une barre « non enregistré » le rappelle.

**Mises à jour en direct.** Vous n'avez pas besoin de recharger la page : une modification faite par un autre administrateur, dans un autre onglet ou par une tâche automatique apparaît d'elle-même. Les traitements longs (indexation d'un guide, génération d'un paquet, préremplissage) ont leur propre suivi à l'écran.

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
| Coût IA du mois | Dépense du mois et part du budget consommée | Consommation et coûts (IA) |
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
5. L'icône **Effacer toutes les notifications** efface les incidents et les alertes :
   - le tiroir affiche « N notifications effacées » avec un bouton **Annuler** pendant 5 secondes ; l'effacement a lieu à la fin du délai ;
   - les demandes (invitation, module) ne sont jamais effacées : « Les demandes à traiter restent affichées. » ;
   - l'icône est inactive s'il n'y a ni incident ni alerte.

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
| Revectorisation des documents en cours / terminée / en échec | Le modèle ou la dimension de la Vectorisation a changé (voir 3.7.4) |
| Erreur technique · « IA · fonction {nom} » | Le modèle principal d'une fonction d'IA a échoué : le secours a répondu, ou la fonction est indisponible. Fermée à la réussite suivante du principal |
| Erreur technique · « JEV {Console / Cockpit} · recherche dans le guide » | La recherche de Jev dans un guide utilisateur a échoué deux fois de suite. Fermée à la recherche réussie suivante |
| Erreur technique | Une autre opération du serveur a échoué de façon inattendue |

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
- **Rafraîchissement** : la liste se recharge à l'ouverture et à chaque changement sur la plateforme (mises à jour en direct).

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

**À quoi sert la page.** Voir qui administre la plateforme, accorder ou retirer ce rôle, régler ce que chaque administrateur voit de la consommation, et consulter le journal d'audit (onglet **Journal d'audit**, voir 3.5).

> [Capture] Onglet Administrateurs, avec le sélecteur des droits de consommation.

**Ajouter un administrateur**

1. Cliquez sur **Ajouter un administrateur**.
2. Choisissez un utilisateur actif dans la liste.
3. Cliquez sur **Accorder les droits**.

**Retirer un administrateur**

1. Cliquez sur **Retirer**.
2. Saisissez **RETIRER** pour confirmer.
3. Cliquez sur **Retirer les droits**. Le compte est conservé, mais perd l'accès à la Console dès sa prochaine action.

**Régler les droits « Consommation et coûts » d'un administrateur**

Sur la ligne de chaque **autre** administrateur, un sélecteur à trois choix règle ce qu'il voit dans Accès › Consommation et coûts (3.6) :

| Choix | Coûts | Données individuelles | Effet |
|---|---|---|---|
| **Complet** (par défaut) | Visibles | Visibles | Tout est affiché |
| **Sans coûts** | Masqués | Visibles | Montants remplacés par « — », barres et hausses de coût masquées, pas de tri sur le coût, export sans colonnes de coût |
| **Anonymisé** | Visibles | Masquées | Noms remplacés par « Utilisateur 01 », « Utilisateur 02 »… ; niveau Utilisateur et filtre Utilisateurs désactivés ; export pseudonymisé |

- Le sélecteur n'apparaît pas sur votre propre ligne : on ne modifie jamais ses propres droits.
- L'effet est immédiat. Le message « Droits de consommation mis à jour · {nom} » confirme le changement.
- Le changement est tracé au journal d'audit (Sensible) : « Modification des droits de consommation », avec l'avant et l'après.

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
| « Vous ne pouvez pas modifier vos propres droits » | Droits de consommation modifiés sur vous-même |

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
  - Les exports (journal d'audit, journal des appels d'IA, consommation de la plateforme) sont tracés eux aussi.
- Niveaux :
  - **Critique** : ajout ou retrait d'administrateur, suppression de compte, clés API, revectorisation, restauration…
  - **Sensible** : suspension, droits, réglages, plafonds, paquets d'installation…
  - **Info** : invitations, modifications courantes.
- Aucune entrée ne peut être modifiée ni supprimée.
- **Conservation 24 mois** : une tâche automatique supprime chaque nuit, à 3 h 15, les entrées plus anciennes.
- L'écran affiche les 500 entrées les plus récentes. L'export en contient 5 000 au plus, au format CSV (séparateur « ; »), et l'export lui-même est tracé.

**Exemple.** Vous voulez savoir qui a modifié le plafond budgétaire. Filtrez **Sensible**, recherchez « plafond » : l'entrée « Modification d'un plafond budgétaire IA » indique l'auteur, la date et les valeurs avant et après.

## 3.6 Consommation et coûts (usage de la plateforme)

**À quoi sert la page.** Suivre l'usage de la plateforme et les dépenses d'IA, du global à l'utilisateur : qui utilise quoi, combien de temps, et pour quel coût. La page se trouve dans le domaine **Accès**, après Administrateurs. Son sous-titre : « Usage de la plateforme et dépenses d'IA, du global à l'utilisateur. »

> [Capture] Consommation et coûts (Accès) : barre de filtres, bandeau de synthèse, graphique miroir, « Où va le temps, où va la dépense », « Détail par utilisateur ».

Ce que vous voyez dépend de vos droits (« Complet », « Sans coûts » ou « Anonymisé »), réglés par un autre administrateur dans la page Administrateurs (3.4).

### 3.6.1 Choisir la période

- Choisissez la granularité : **Jour**, **Semaine** ou **Mois** (par défaut **Mois**).
- Les flèches « Période précédente » et « Période suivante » changent de période. Une période à venir n'a pas de données (« Période à venir : pas encore de données »).
- L'interrupteur **Comparer à …** (activé par défaut) compare à la période précédente de même durée : « Comparer à septembre 2026 », « Comparer à la semaine 40 », « Comparer à mercredi 7 ».
  - Les écarts s'affichent en %, avec un signe + ou −.
  - Une hausse du temps actif est en vert ; une hausse de coût en ambre ; les compteurs neutres en gris.
  - Sans valeur de comparaison, aucun écart n'est affiché.
  - Sur les graphiques, des traits clairs marquent la période précédente.

| Granularité | Points du graphique | Jours « ouvrés » pris en compte |
|---|---|---|
| Mois | Un point par jour | Du lundi au vendredi |
| Semaine | Un point par jour, du lundi au dimanche | Du lundi au vendredi |
| Jour | Un point par heure | Les heures de 7 h à 19 h |

### 3.6.2 Niveaux et filtres

**Niveaux**

- **Plateforme** (par défaut) : toute la plateforme. Il vide les filtres Équipes et Utilisateurs.
- **Équipe** : une ou plusieurs équipes. Sans choix, la page prend l'équipe qui a le plus de temps actif sur la période.
- **Utilisateur** : un ou plusieurs utilisateurs. Sans choix, la page prend le premier du tableau. Ce niveau est désactivé pour un administrateur « Anonymisé ».

**Filtres**

| Filtre | Choix | Effet |
|---|---|---|
| Projet | Plusieurs projets ; « Tous » par défaut | Temps actif et IA du ou des projets choisis. Seuls les utilisateurs qui ont accès à ces projets sont gardés. Leur temps connecté reste entier. L'activité dans la Console n'a pas de projet |
| Équipes | Plusieurs équipes ; « Toutes » par défaut | Équipe de la personne du référentiel liée au compte (même e-mail), sinon « Sans équipe » |
| Utilisateurs | Plusieurs utilisateurs, avec recherche ; « Tous » par défaut | Désactivé pour un administrateur « Anonymisé » |
| Fonctionnalité | Une seule : « Projets et saisie », « Jev · assistant », « Rapports », « Documents », « Baromètre et insights », « Console » | Filtre le temps actif et l'IA |
| Fournisseur (IA) | Un seul ; « Tous » par défaut | Ne touche que les indicateurs d'IA |
| Modèle (IA) | Un seul, parmi ceux du fournisseur choisi | Ne touche que les indicateurs d'IA |

- Le **temps connecté** ne peut être attribué ni à une fonctionnalité ni à un projet : les filtres Fonctionnalité et Projet ne le réduisent pas.
- Dans les menus : « Rechercher », « Effacer », « OK » ; « Aucune sélection : tout » quand rien n'est choisi.
- Les filtres sont gardés dans l'adresse de la page : un lien copié rouvre la même sélection.

### 3.6.3 Bandeau de synthèse et graphique miroir

**Bandeau de synthèse**

- **Utilisation · temps actif**, comparé au temps de connexion, avec le **taux d'activité**.
- **Intelligence artificielle · coût**, avec « N requêtes · X tokens en entrée · Y en sortie ».
- Huit indicateurs :

| Indicateur | Contenu |
|---|---|
| Session moyenne | Temps actif moyen par connexion, en minutes |
| Connexions | Nombre de sessions ouvertes |
| Utilisateurs actifs | Utilisateurs avec du temps actif sur la période (non comparé) |
| Événements journalisés | Nombre d'interactions enregistrées pour le temps actif (ce ne sont pas des entrées du journal d'audit) |
| Tokens | Entrée + sortie |
| Coût / heure active | Coût IA divisé par le temps actif, en € par heure |
| Fournisseurs | Nombre de fournisseurs d'IA utilisés |
| Modèle principal | Modèle qui a coûté le plus (ou fait le plus de requêtes si les coûts sont masqués) |

**Graphique miroir**

- Temps actif en haut (turquoise), coût d'IA en bas (ambre), sur le même axe du temps.
- Le survol (ou le clavier) affiche une info-bulle : date, « Temps actif », « Coût IA », puis « Précédent : … » si la comparaison est active.
- **Hausses inhabituelles** : un point est signalé en corail quand son coût dépasse **1,6 fois la moyenne** des points ouvrés de la période (jours du lundi au vendredi ; heures de 7 h à 19 h en vue Jour). La plus forte est annotée « Hausse inhabituelle · {date} », avec « X € · ×N la moyenne ».
  - La détection porte sur le coût seulement.
  - Rien n'est signalé si la moyenne est nulle, ni pour un administrateur « Sans coûts » (« Coûts masqués selon vos droits »).
- Période vide : « Aucune donnée sur cette période ».

### 3.6.4 « Où va le temps, où va la dépense »

- Découpage au choix : **Fonctionnalités** (par défaut), **Équipes** ou **Utilisateurs**.
- Pour chaque ligne : temps actif à gauche, coût d'IA à droite, et **coût par heure active** au centre.
- Le coût par heure active est en **ambre** quand il dépasse la moyenne de plus de 15 % (moyenne × 1,15).
- Les lignes sont triées par temps actif décroissant. Toutes les fonctionnalités sont affichées ; 8 équipes ou utilisateurs au plus.
- Des étiquettes repèrent « le plus utilisé », le « 1er poste de coût », ou « 1er usage · 1er coût ».

### 3.6.5 « Détail par utilisateur »

- **Colonnes**, toutes triables : Utilisateur (et son équipe), Temps actif / connecté (avec la barre du taux d'activité), Sessions, Durée moy., Requêtes IA, Tokens E / S, Coût, Évol. coût, Tendance (petite courbe sur la période).
- **Tri** : par défaut sur le coût, décroissant.
- **Filtre** « Filtrer par nom ou équipe ».
- **Pagination** : 20 lignes par page.
- Un **point rouge** signale une hausse de coût de 30 % ou plus par rapport à la période précédente (« point rouge : hausse de coût ≥ 30 % »).
- Les appels d'IA faits sans utilisateur (tâches automatiques, notifications planifiées…) apparaissent sur la ligne **« Tâches automatiques »**.
- Le pied du tableau rappelle vos droits : « Données individuelles et coûts visibles · droits Administrateur complet », « Coûts masqués : … » ou « Noms masqués : … ».

### 3.6.6 Exporter la sélection

1. Cliquez sur **Exporter la sélection**.
2. Le fichier CSV contient exactement la sélection affichée (période, filtres, filtre texte, tri), avec **toutes les lignes**, pas seulement la page affichée.
3. Le message « Export CSV · N lignes · {période} » confirme l'export.

**Règles**

- Format : séparateur « ; », virgule décimale, encodage UTF-8.
- Colonnes : Utilisateur, Équipe, Temps actif (h), Temps connecté (h), Sessions, Durée moyenne (min), Requêtes, Tokens entrée, Tokens sortie ; et, si vous voyez les coûts, Coût (€) et Évolution du coût (%).
- Vos droits s'appliquent aussi à l'export : sans coûts, pas de colonne de coût ; anonymisé, noms pseudonymisés.
- Chaque export est tracé au journal d'audit (« Export de la consommation (Accès) »), avec la période, le nombre de lignes et les filtres utilisés : niveau Sensible si vous voyez les données individuelles, Info sinon.

### 3.6.7 Définitions des indicateurs

| Indicateur | Définition |
|---|---|
| Temps actif | Chaque interaction (clic, saisie, défilement) compte jusqu'à la suivante, au plus **5 minutes**. Sans interaction, rien n'est compté. Deux onglets ouverts ne comptent pas deux fois |
| Temps connecté | De l'ouverture de la session à sa fin : déconnexion, ou expiration après inactivité. Les sessions simultanées d'un même utilisateur sont fusionnées |
| Taux d'activité | Temps actif ÷ temps connecté (« — » sans temps connecté) |
| Coût IA | Coût enregistré pour chaque appel d'IA, au tarif du modèle en vigueur à la date de l'appel, attribué au compte qui a fait la demande |
| Coût par heure active | Coût IA ÷ temps actif |
| Session moyenne / Durée moy. | Temps actif ÷ nombre de connexions |

**Automatique**

- Les données sont consolidées toutes les 5 minutes ; la page se met à jour d'elle-même.
- Les interactions brutes sont conservées **400 jours** (purge chaque nuit).

**Messages** : « Les données n'ont pas pu être chargées » (avec **Réessayer**), « Aucune donnée sur cette période », « Niveau Utilisateur : droit « Voir les données individuelles » requis », « Tri sur les coûts : droit « Voir les coûts » requis ».

**Exemple.** Vous ouvrez le mois d'octobre, niveau Équipe, équipe « PMO ». Le graphique miroir signale une hausse inhabituelle le 14 : 3,20 €, ×2,4 la moyenne. Dans « Où va le temps, où va la dépense », la fonctionnalité « Rapports » a un coût par heure active en ambre. Le tableau montre que deux personnes ont généré plusieurs rapports ce jour-là. Vous exportez la sélection pour la partager avec le PMO.

## 3.7 Fournisseurs et modèles

**À quoi sert la page.** Déclarer les fournisseurs d'IA et leurs clés, vérifier que les clés fonctionnent, choisir le modèle de chaque fonction d'IA (affectation), et tenir le catalogue des modèles avec leurs tarifs et leurs mesures. Sous-titre : « Clés API, tests de connexion et catalogue des modèles avec leur coût. »

La page a trois blocs : le bandeau **Fournisseurs**, la section **Affectation des modèles** et le catalogue **Modèles**.

> [Capture] Fournisseurs et modèles : bandeau des fournisseurs, affectation avec la chaîne Documents, catalogue.

### 3.7.1 Le bandeau des fournisseurs et l'ajout d'un fournisseur

- **En-tête du bandeau** : « N connecté(s) » et, en rouge, « N clé(s) invalide(s) » ; boutons **Tester toutes les clés** et **Ajouter un fournisseur**.
- **Une carte par fournisseur** :
  - le nom et l'état : « Connecté », « Clé invalide » ou « Test en cours… » (l'info-bulle donne la date du dernier test, ou « Jamais testée ») ;
  - la clé masquée : préfixe et 4 derniers caractères ;
  - le plafond mensuel : « Plafond N € / mois », ou « Sans plafond mensuel » en ambre ;
  - les boutons **Tester**, **Remplacer la clé** et **Plafond**.

**Ajouter un fournisseur**

1. Cliquez sur **Ajouter un fournisseur**.
2. Saisissez le **Nom du fournisseur** et la **Clé API**.
3. Cliquez sur **Ajouter et tester**.

**Règles**

- Nom : 2 à 60 caractères. Clé : 20 à 400 caractères.
- Un fournisseur déjà déclaré est refusé : « Le fournisseur « X » existe déjà ».
- La clé est chiffrée. Elle n'est plus jamais affichée en entier : seuls son préfixe et ses 4 derniers caractères restent visibles.
- La clé est testée immédiatement. Ajout tracé au journal d'audit (Critique).
- Aucun bouton ne permet de supprimer ou de renommer un fournisseur.

### 3.7.2 Tester et remplacer une clé

- **Tester** :
  - **Tester** (sur une carte) ou **Tester toutes les clés** ;
  - le test lit la liste des modèles chez le fournisseur : il ne coûte rien ;
  - délai maximal : 10 secondes ;
  - messages : « X : connexion réussie. », « X : clé invalide. Les routes concernées basculent sur leur secours. », « N clés testées · toutes valides ».
- **Remplacer la clé** :
  1. Collez la nouvelle clé dans **Nouvelle clé API** (la clé actuelle est rappelée, barrée).
  2. Cliquez sur **Remplacer et tester**.
  3. L'ancienne clé cesse d'être utilisée immédiatement. Le remplacement est tracé (Critique).

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

### 3.7.3 Plafond mensuel d'une clé

**À quoi il sert.** Reporter dans la Console la limite de dépense que vous avez fixée chez le fournisseur. **Partager Cockpit** (3.20) s'en sert pour annoncer la dépense possible d'un paquet d'installation.

1. Cliquez sur **Plafond** sur la carte du fournisseur.
2. Dans la fenêtre « Plafond mensuel {fournisseur} », saisissez un montant entier en euros dans **Plafond (€ par mois)**, ou laissez vide pour « sans plafond ».
3. Cliquez sur **Enregistrer** : « X : plafond de N € par mois » ou « X : sans plafond. ».

**Règles**

- Montant entier, de 1 à 100 000 €. Erreur : « Montant entier en euros, sans décimale. ».
- Sans plafond, la dépense possible d'un paquet qui contient cette clé s'affiche « Illimitée ».
- **Ce plafond ne bloque aucun appel.** Il ne remplace pas les plafonds budgétaires de Consommation et coûts (3.8), qui alertent.
- Modification tracée (Sensible) : « Plafond mensuel d'une clé API ».

### 3.7.4 Affectation des modèles

**À quoi elle sert.** Choisir, pour chaque fonction d'IA, le modèle qui répond (**principal**) et celui qui prend le relais (**secours**). Cette section remplace l'ancienne page « Affectation des modèles ».

**Les fonctions**

| Fonction (à l'écran) | Catégorie | Usage |
|---|---|---|
| Insights | LLM | Analyses des données du Cockpit, réponses de Jev du Cockpit sur les données, message d'accueil |
| Gestion des données | LLM | Modifications des données demandées à Jev dans le Cockpit |
| Rapports | LLM | Rédaction des rapports de comité |
| Guidage console / Cockpit | LLM | Jev de la Console et du Cockpit : reformulation, clarification, réponses sur les données de la Console |
| Initialisation projet | LLM | Préremplissage du fichier d'initialisation à partir d'une proposition commerciale (3.14) |
| Documents, étape 1 : Vectorisation | Embedding | Recherche dans les documents et les guides |
| Documents, étape 2 : Reclassement | Reranking | Recherche dans les documents et les guides |
| Documents, étape 3 : Synthèse | LLM | Réponse à partir des documents et des guides |

**Utilisation**

1. Sous chaque fonction, lisez son état (« Opérationnel », « Secours en service » ou « À l'arrêt ») et son volume des 30 derniers jours.
2. Cliquez sur le sélecteur **Principal** ou **Secours**. La liste « Modèles LLM actifs · coût estimé » (ou Embedding, Reranking) ne propose que les modèles actifs de la bonne catégorie, triés par coût estimé. Un fournisseur à clé invalide porte la mention « · clé invalide ».
3. Choisissez un modèle. **Le choix est enregistré aussitôt**, sans confirmation (sauf pour la Vectorisation) : « {Fonction} : {modèle} en principal. ».
4. Lisez le **coût mensuel estimé** de chaque fonction, et sous le secours « Si le secours prend le relais : ≈ X € / mois ».
5. Pour **Rapports**, la jauge « Sortie maximale » compare la longueur maximale de réponse du principal et du secours à la sortie requise (la plus longue mesurée sur 30 jours, sinon 38 000 jetons) : vert si elle suffit, rouge sinon.

**La chaîne Documents**

- « 3 étapes en série · le texte extrait suit la ligne de haut en bas. Une étape à l'arrêt suspend la suite. »
- La chaîne part du « Texte extrait » et finit par la « Réponse ». Le total s'affiche : « Total chaîne X par mois ».
- Une étape indisponible suspend les étapes suivantes (« Suspendu en amont »). Une étape sur son secours ne bloque rien.
- **La Vectorisation n'a pas de secours** : « Pas de modèle de secours : un autre modèle imposerait de revectoriser tous les documents. »
- Le sélecteur de **dimensions** de la Vectorisation ne propose que les dimensions du modèle choisi.

**Revectorisation automatique**

1. Changer le modèle ou la dimension de la Vectorisation ouvre la fenêtre « Revectoriser tous les documents ? ».
2. La fenêtre explique que les vecteurs actuels deviennent inutilisables : tous les extraits de la Base de connaissance des projets et des guides utilisateur seront revectorisés en tâche de fond.
3. Cliquez sur **Changer et revectoriser**, ou **Annuler**.
4. La cloche suit l'avancement : « Revectorisation des documents en cours », puis « … terminée » ou « … en échec ».
5. La recherche dans les documents reprend à la fin. Le changement est tracé (Critique).

**Règles**

- Le principal doit être actif et de la catégorie de la fonction : « Cette fonction n'accepte qu'un modèle LLM » (ou Embedding, Reranking).
- Le secours doit être différent du principal (« Le secours doit différer du principal ») et actif.
- Les nouveaux modèles répondent dès la requête suivante. Chaque changement est tracé (Sensible).
- **Une fonction est** :
  - **Opérationnelle** si son principal est disponible ;
  - **Secours en service** si seul le secours l'est ;
  - **À l'arrêt** sinon.
- **Un modèle est disponible** s'il est actif et si la clé de son fournisseur a réussi son dernier test.
- **Coût mensuel estimé** : volume réel des 30 derniers jours × tarif actuel du modèle. Pour une fonction sans historique (Guidage, Initialisation projet), une estimation fixe est affichée.

**Automatique**

- Si le principal ne répond pas au moment d'un appel, le secours est essayé. Un incident « IA · fonction {nom} » s'ouvre dans la cloche.
- Si les deux échouent, la fonction répond « indisponible ».
- **Toutes les fonctions appellent réellement les modèles choisis.** Les règles de notification utilisent, elles, le modèle choisi dans chaque règle.

**Exemple.** La clé Google est refusée : Gemini, principal de la Synthèse des documents, devient indisponible. Claude Sonnet, son secours, répond à sa place et la ligne affiche « Secours en service ». Vous remplacez la clé Google : après un test réussi, Gemini répond de nouveau.

### 3.7.5 Le catalogue des modèles

- **En-tête** : « Coûts en euros par million de tokens · mesures OpenRouter du {date} » ; bouton **Actualiser** ; filtres **Tous** puis un onglet par fournisseur ; bouton **Ajouter un modèle**.
- **Colonnes**, toutes triables : Modèle, Fournisseur, Entrée, Sortie, Score, Session, Tok/s, Utilisé par, Actif, et le crayon **Modifier**.
- **Badges** :
  - catégorie : LLM, Embedding ou Reranking ;
  - ancienneté d'après la date de sortie : « À surveiller · N mois » de 12 à 23 mois, « Ancien · N mois » à partir de 24 mois.
- **Utilisé par** : les fonctions qui utilisent le modèle, en principal ou en secours.

**Mesures OpenRouter**

| Colonne | Mesure |
|---|---|
| Score | Intelligence Index (sur 100), publié par OpenRouter |
| Session | Coût médian d'une session de 10 à 49 tours dans l'agent Hermes, converti en euros |
| Tok/s | Débit médian du fournisseur le plus rapide, en tokens par seconde |

- Les mesures sont relevées chaque jour à 4 h 30, ou à la demande avec **Actualiser** (« N modèles mesurés sur M LLM. »).
- Elles ne concernent que les LLM. Une mesure absente s'affiche « — ». Un relevé n'efface jamais une valeur existante.
- Dans la fiche d'un modèle, le bloc « Mesures OpenRouter » permet de corriger les trois valeurs et l'**Identifiant OpenRouter** (« Retrouvé automatiquement ; à corriger si le relevé ne trouve pas le modèle »).

### 3.7.6 Ajouter ou modifier un modèle

1. Cliquez sur **Ajouter un modèle**, ou sur le crayon d'un modèle existant.
2. Choisissez **Que fait ce modèle ?** : **Génère du texte** (LLM), **Vectorise des textes** (Embedding) ou **Reclasse des résultats** (Reranking).
3. Renseignez les champs :
   - le fournisseur ;
   - le nom, et une description ;
   - l'**Identifiant chez le fournisseur** ;
   - la **Longueur de contexte** (facultative) ;
   - la **Date de sortie** ;
   - pour un LLM, le **Max output tokens** (longueur maximale d'une réponse) ;
   - pour un Embedding, les **Dimensions acceptées** (séparées par des virgules) et la **Dimension par défaut**.
4. Renseignez la **Tarification** en euros par million de tokens : entrée, et sortie pour un LLM.
5. Vérifiez l'**Aperçu en direct** : fonctions possibles (« Proposé pour »), coût sur le volume actuel, continuité (existe-t-il un secours ?).
6. Cliquez sur **Ajouter** ou **Enregistrer**.

**Règles**

- Nom : 1 à 80 caractères, unique chez un même fournisseur : « {Fournisseur} a déjà un modèle « X » ».
- La date de sortie est obligatoire à la création et ne peut pas être dans le futur.
- Un LLM doit avoir un max output tokens ; un Embedding, des dimensions.
- Tous les tarifs sont positifs ou nuls.
- Un nouveau modèle est créé actif.
- On ne peut pas changer la catégorie d'un modèle déjà affecté à une fonction d'une autre catégorie.
- On ne peut pas retirer une dimension affectée à la Vectorisation.
- « Un changement de tarif met à jour les estimations de l'affectation. L'historique de consommation n'est pas recalculé. »

### 3.7.7 Désactiver, réactiver, supprimer un modèle

- **Désactiver** : interrupteur **Actif**. Un modèle **affecté**, en principal ou en secours, ne peut pas être désactivé : « X est affecté (…). Réaffectez-le avant de le désactiver. ».
- **Réactiver** : sans confirmation.
- **Supprimer** (dans la fiche du modèle, en deux clics : **Supprimer** puis **Confirmer la suppression**) : refusé si le modèle est affecté à une fonction, choisi par une règle de notification ou présent dans la consommation. Dans ces cas, désactivez-le plutôt : son historique reste lisible.

## 3.8 Consommation et coûts de l'IA

**À quoi sert la page.** Suivre la dépense d'IA du mois, anticiper la fin de mois, fixer des plafonds par fonction et voir le détail de chaque appel à un modèle. La page se trouve dans le domaine **IA**. Sous-titre : « Tokens et dépenses par fonction, fournisseur et modèle, seuils d'alerte et détail de chaque appel LLM. »

> [Capture] Consommation et coûts (IA) : bandeau du budget et graphique, six tuiles des fonctions, journal des appels.

### 3.8.1 Budget, graphique et plafonds

**Utilisation**

1. Choisissez la période : **Jour**, **7 j**, **Ce mois**, **30 j** (par défaut), **3 mois** ou **6 mois**. Elle s'applique au graphique Tokens et Coûts, aux compteurs et au journal. **Le budget reste celui du mois civil en cours.**
2. Dans le bandeau, lisez :
   - la **projection de fin de mois** et la note « Reste … sous le plafond en fin de mois. », « Dépassement projeté de … en fin de mois. » ou « Aucun plafond global : fixez-le sous les fonctions. » ;
   - la dépense depuis le 1er et le plafond global ;
   - le rythme des 7 derniers jours, la dépense du mois précédent à la même date, les tokens du mois.
3. Choisissez la lecture du graphique :
   - **Budget** : dépense cumulée, plafond, seuil d'alerte et projection ;
   - **Tokens** : tokens d'entrée et de sortie par jour (par heure pour **Jour**) ;
   - **Coûts** : dépense par jour (par heure pour **Jour**).
4. Six tuiles, en deux rangées de trois, présentent les lignes budgétaires : **Insights**, **Rapports**, **Guidage console**, **Documents**, **Gestion des données**, **Initialisation projet**. Chaque tuile montre le modèle principal, la dépense, la part du mois, la projection et le statut.
5. Cliquez sur une tuile pour filtrer le graphique, les compteurs et le journal. Un second clic, ou « × », retire le filtre.
6. Pour fixer un plafond, saisissez le montant dans la tuile, ou dans « Budget global ». Réglez le seuil d'alerte avec « − » et « + ». L'enregistrement est automatique ; vider le champ supprime le plafond.

**Règles**

- **Mois** : du 1er à aujourd'hui, à l'heure de Paris.
- **Rythme** : dépense des 7 derniers jours, divisée par 7.
- **Projection** : dépense du mois + rythme × jours restants.
- **Seuil d'alerte** : de 50 à 100 %, par pas de 5 ; 80 % par défaut.
- **Statut d'une ligne**, calculé sur la projection :
  - **Sans plafond** : aucun plafond, ou plafond désactivé ;
  - **Dépassement projeté** : la projection atteint ou dépasse le plafond ;
  - **Alerte projetée** : la projection dépasse le seuil d'alerte ;
  - **Sous le plafond** sinon.
- **Moyenne par jour ouvré** : du lundi au vendredi ; le pic est le jour (ou l'heure) le plus élevé.
- **Un plafond ne bloque rien.** Les appels continuent au-delà. Le plafond sert à alerter : cloche, « À traiter » et signal du menu.
- Les modifications de plafond et de seuil sont tracées (Sensible).
- La page se met à jour d'elle-même : un nouvel appel à un modèle apparaît en moins d'une seconde.

**Exemple.** Le plafond global est de 100 €, avec une alerte à 80 %. Au 2 du mois, 0,88 € sont dépensés au rythme de 0,31 € par jour : la projection est de 9,74 €, la note indique « Reste 90,26 € sous le plafond ». Si le plafond passe à 9 €, la note devient « Dépassement projeté de 0,74 € » et le statut « Dépassement projeté ».

### 3.8.2 Journal des appels

**À quoi il sert.** Voir le détail de chaque appel à un modèle, en bas de la page : date et heure, fonction, fournisseur et modèle, tokens (entrée → sortie, total), coût.

**Utilisation**

1. Le journal suit la période et la fonction choisies en haut de la page.
2. Faites défiler : les appels suivants se chargent d'eux-mêmes (« Chargement des appels suivants… »).
3. Cliquez sur une ligne pour voir :
   - l'identifiant de la requête ;
   - la durée ;
   - le calcul du coût, dont le résultat est le coût de la ligne.
4. **Exporter en CSV** télécharge exactement le journal affiché (période et fonction) : « N appels exportés en CSV. ».

**Règles**

- **Coût d'un appel** : tokens d'entrée × prix d'entrée par million + tokens de sortie × prix de sortie par million (ou nombre de requêtes × prix pour 1 000 requêtes), au tarif en vigueur au moment de l'appel, enregistré avec l'appel. Un changement de tarif ne modifie pas le passé.
- Le journal contient aussi les appels de Vectorisation et de Reclassement (ligne Documents).
- Le texte des questions et des réponses n'est pas conservé.
- Les données de consommation n'ont pas de durée de conservation limitée.
- **Mise en cache des instructions.** Pour Jev, les notifications et d'autres traitements, une partie des instructions envoyées au modèle est mise en cache chez le fournisseur. Les tokens relus depuis ce cache coûtent 10 % du prix normal ; leur première écriture coûte 125 %. Le calcul affiché le détaille ; le nombre de tokens affiché compte, lui, tous les tokens envoyés.
- L'export CSV (séparateur « ; ») contient : Date, Heure, Fonction, Fournisseur, Modèle, Secours, Tokens, Tokens entrée, Tokens sortie, Tarif entrée (€/M), Tarif sortie (€/M), Coût (€), Requête, Durée (ms). Il est tracé au journal d'audit.

**Message** : « Aucun appel sur cette période pour cette fonction. ».

## 3.9 Analyse des temps de réponse

**À quoi sert la page.** Mesurer le temps que met Jev à répondre, de bout en bout et étape par étape, pour repérer ce qui ralentit. Sous-titre : « Durée de traitement des prompts, de bout en bout et par étape, par catégorie de prompt ou par modèle. »

> [Capture] Analyse des temps de réponse : vignettes des catégories, cascade des étapes, courbe d'évolution.

**Utilisation**

1. Choisissez l'axe : **Par catégorie de prompt** ou **Par modèle**.
2. Choisissez la période : **Jour**, **7 jours** (par défaut), **1 mois**, **3 mois** ou **6 mois**. En vue Jour, « Jour précédent » et « Jour suivant » parcourent les jours, jusqu'à 182 jours en arrière. Les périodes se terminent aujourd'hui, journée en cours comprise.
3. Cliquez sur une vignette (catégorie ou modèle). Chaque vignette affiche la durée médiane de bout en bout, l'écart « min – max » et le nombre d'erreurs.
4. Lisez la **cascade** : une ligne par étape, chacune commençant à la fin de la précédente, avec « Médiane · min – max », puis la ligne « Bout en bout ».
5. Lisez la courbe **Évolution sur la période** : médiane et bande min – max, par heure, par jour ou par semaine ; les erreurs sont marquées en corail.

**Les six catégories de prompt**

| Vignette | Signification |
|---|---|
| Guide Console | Question sur l'utilisation de la Console |
| Données Console | Question sur les données de la Console |
| Guide Cockpit | Question sur l'utilisation du Cockpit |
| Données Cockpit | Question sur les données d'un projet du Cockpit |
| Actualisation Cockpit | Demande de création, modification ou suppression de données dans le Cockpit |
| Base de connaissance | Question sur un document de la Base de connaissance |

**Les étapes**

| Étape | Ce qu'elle mesure |
|---|---|
| Routage | Aiguillage de la question par la carte JEV |
| Vectorisation | Transformation de la question en vecteur |
| Reclassement | Reclassement des extraits trouvés |
| Formulation de la requête | Requête sur les données, reformulation d'une question de suite, extraction des champs |
| Exécution | Lecture ou écriture en base (« Service RISE · Traitement interne ») |
| Génération | Rédaction de la réponse |

**Règles**

- Seuls les prompts de Jev (Console et Cockpit) sont mesurés. Les clarifications, les questions hors sujet et les aiguillages en échec ne sont pas comptés.
- Statistiques : médiane exacte, minimum et maximum.
- Une étape servie par le secours apparaît avec la part des appels qu'il a pris (« secours X (N %) »).
- Types d'erreur affichés : « Délai dépassé », « Réponse vide », « Réponse illisible », « Service injoignable », « Erreur HTTP NNN », « Requête invalide », « Carte non configurée ».
- Les mesures sont conservées **190 jours** (purge chaque nuit à 3 h 40).

**Message** : « Aucun traitement sur la période ».

## 3.10 Jev, l'assistant de la Console

**À quoi il sert.** Répondre aux questions sur la Console et sur les données de la plateforme : expliquer un chiffre, une règle, un écran, et guider pas à pas. **Jev n'agit jamais à votre place** : il indique où faire chaque action.

> [Capture] Panneau de Jev ouvert, avec les suggestions et une réponse et ses sources.

**Utilisation**

1. Cliquez sur le bouton de Jev, en bas de la barre latérale.
2. Posez votre question, ou cliquez sur une suggestion adaptée à la page ouverte (par exemple « Où en est le budget IA ? »).
   - Le champ de saisie s'agrandit avec le texte, jusqu'à environ 8 lignes, puis défile.
   - **Entrée** envoie la question ; **Maj+Entrée** va à la ligne.
3. Lisez la réponse et ses **sources**, affichées sous la réponse.
4. Pour repartir de zéro, cliquez sur l'icône **Effacer tous les messages** : Jev repart d'une nouvelle conversation.
5. Fermez avec **Fermer Jev** ou la touche Échap.

**Comment Jev répond : l'aiguillage**

Avant de répondre, Jev classe chaque question avec l'API de la carte « JEV » du Registre des cartes API (3.17). Il tient compte de la page ouverte et des 3 questions précédentes.

| Type de question | Ce que fait Jev | Sources affichées |
|---|---|---|
| **Usage** (« Comment inviter un utilisateur ? ») | Il cherche les passages les plus proches dans le **guide utilisateur de la Console** (3.21), les reclasse, puis rédige sa réponse à partir des seuls extraits retenus. Une question de suite est d'abord reformulée en question autonome | « Guide · {section} · p. N » |
| **Données** (« Qui ne s'est pas connecté depuis 10 jours ? ») | Il lit en direct les données de la plateforme, en lecture seule, puis répond | Les tables lues (par exemple « comptes ») |
| **Ambiguë** ou **hors sujet** | Il demande une précision, en quelques lignes, avec 2 ou 3 reformulations ou options | — |

- Si l'aiguillage est indisponible (carte JEV absente, désactivée ou en erreur), Jev traite la question comme ambiguë : il explique et peut lire les données.
- Si aucun extrait du guide n'est assez proche, si le guide n'est pas indexé ou si la recherche est indisponible, Jev demande une précision.
- Les réglages de la recherche dans le guide (nombre d'extraits, seuil, délais) se font dans la page Guide utilisateur (3.21).

**Ce que Jev sait lire**

- Il connaît la page que vous regardez.
- Il lit en direct les données de la plateforme, dans un périmètre défini (34 tables de consultation) :
  - comptes, droits, sessions, journal d'audit ;
  - IA, consommation, budget, plafonds ;
  - notifications, projets, clients, informations projet, chantiers, personnes, phases, snapshots, modules, imports ;
  - cartes API, serveur d'e-mail, skills, persona.
- Il lit le guide utilisateur de la Console pour les questions d'usage.
- Il ne lit rien d'autre : ni le contenu des snapshots, ni les conversations elles-mêmes.

**Modèles utilisés**

- Aiguillage : la carte « JEV » du Registre des cartes API.
- Données, reformulation et clarification : la fonction **Guidage console**.
- Recherche dans le guide : le modèle de vectorisation de l'index du guide, puis la fonction **Reclassement**.
- Réponse à partir du guide : la fonction **Synthèse** (Documents, étape 3).
- Sa personnalité suit le **Persona** (3.11) et la skill de guidage (3.12).

**Règles**

- Une question fait 2 000 caractères au plus.
- Chaque lecture de données est limitée à 200 lignes et 5 secondes, en lecture seule.
- Si sa première lecture échoue, Jev la corrige une fois. En cas de nouvel échec, il répond : « Je n'ai pas pu lire les données de la plateforme pour répondre (…). Reformulez la question, ou consultez directement l'écran concerné de la Console. ».
- Si la vectorisation de la question échoue, Jev fait une seconde tentative avec un délai plus long. En cas de nouvel échec, la cloche signale une erreur technique.

**Mémoire conversationnelle**

- Jev garde le fil de **votre** conversation, même après un rechargement de la page. Chaque administrateur a la sienne ; personne d'autre n'y accède.
- **Ce qui est retenu** :
  - les **10 derniers échanges** ;
  - un **résumé** des échanges plus anciens, mis à jour automatiquement ;
  - les réponses très longues, retenues en abrégé.
- **Ce qui est conservé** : vos questions, les réponses de Jev, le type de question, la reformulation éventuelle et les sources consultées. Les données lues ne sont pas conservées. Une question restée sans réponse n'est pas gardée.
- **Effacer tous les messages** : Jev oublie les échanges précédents.
- **Automatique** : chaque nuit à 3 h 25, les conversations sans échange depuis **30 jours** sont supprimées.

**Messages d'erreur**

| Message | Cause | Que faire |
|---|---|---|
| « Je ne peux pas répondre pour l'instant : … aucun modèle affecté » | Aucun modèle affecté à la fonction utilisée | Affectez un modèle (3.7.4) |
| « Je ne peux pas répondre pour l'instant : … ni le modèle principal ni le secours ne répondent » | Clés refusées ou fournisseurs indisponibles | Testez et remplacez les clés (3.7.2) |
| « Le guide utilisateur de la Console n'est pas encore publié : … » | Aucun guide de la Console | Déposez le guide (3.21) |
| « La recherche dans le guide utilisateur de la Console est momentanément indisponible. Réessayez dans un instant. » | Vectorisation de la question impossible | Réessayez ; vérifiez la clé du fournisseur de vectorisation |
| « Je n'ai pas trouvé cette information dans le guide utilisateur de la Console. … » | Aucun extrait assez proche | Reformulez la question |
| « Jev n'a pas pu répondre : Conversation introuvable. » | Conversation expirée ou supprimée | Cliquez sur **Effacer tous les messages** |
| « Jev n'a pas pu répondre : Données invalides. » | Question de plus de 2 000 caractères | Raccourcissez la question |

**Exemple.** Sur la page Utilisateurs, vous demandez : « Qui ne s'est pas connecté depuis 10 jours ? ». Jev lit la table des comptes et répond par une liste de noms avec leur dernière connexion, et la source « comptes ». Vous enchaînez : « Comment relancer leur invitation ? ». Jev comprend qu'il s'agit d'une question d'usage, cherche dans le guide et répond en citant « Guide · 3.3.4 Relancer une invitation ».

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
- Le Persona est relu à chaque réponse de Jev, dans la Console comme dans le Cockpit, et pour le message d'accueil de l'écran Aujourd'hui.
- Le nom, l'emoji et l'avatar s'affichent dans la Console : barre latérale et panneau de Jev.

**Messages** : « Le nom est obligatoire. », « Image trop lourde (1 Mo maximum). », « Format non accepté ».

## 3.12 Skills

**À quoi sert la page.** Gérer les consignes ajoutées aux instructions de Jev et de certains traitements d'IA.

> [Capture] Page Skills : liste et éditeur.

**Utilisation**

1. **Nouvelle skill** crée une skill « Nouvelle skill », désactivée et vide.
2. Donnez-lui un nom (60 caractères au plus) et rédigez sa consigne (20 000 caractères au plus). **Aperçu** montre le rendu.
3. Cliquez sur **Enregistrer**.
4. L'interrupteur active ou désactive la skill. L'effet est immédiat.
5. **Supprimer**, puis **Confirmer la suppression**. La suppression est définitive.
6. Retrouvez une skill avec la recherche et le filtre **Toutes / Actives / Désactivées** (9 skills par page). Au-delà de 200 skills, la recherche se fait sur le serveur.

**Qui utilise quelle skill**

- **Jev de la Console** : une seule skill, **la skill de guidage**. C'est la première skill active nommée « Guidage console », « Répondre sur la Console d'administration » ou « Guider l'utilisateur » (sans tenir compte des majuscules).
- **Jev du Cockpit** : pour chaque type de question, la seule skill active qui correspond à ce type (par exemple « Insights » pour les données du projet, « Guidage Cockpit » pour l'usage).
- **Skills dédiées** : la skill « **Préremplissage d'un projet** » sert uniquement au préremplissage de l'Initialisation d'un projet (3.14). Elle est lue, **active ou non**, à chaque analyse d'une proposition commerciale. Elle n'est **jamais envoyée à Jev**. Modifiez-la pour ajuster la façon dont l'IA lit les propositions.

**Règles**

- Deux skills ne peuvent pas porter le même nom (sans tenir compte des majuscules) : « Une skill s'appelle déjà « … » ».
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
4. **Ouvrir** (ou la touche Entrée) ouvre le projet dans le Cockpit. Il faut une session du Cockpit.
5. **Initialiser un projet** mène à l'initialisation (3.14).

**Règles**

- **Badge « Nouveau »** : projet créé par initialisation il y a moins de 7 jours et encore en préparation.
- **Ordre d'affichage** : nouveaux projets, puis actifs, en préparation et clos, puis par date de début.
- **Phase affichée** : la phase qui contient la date du jour, sinon « Préparation » pour un projet en préparation.
- **Statut d'un projet** : la Console ne le modifie pas. On le change dans la fiche projet du Cockpit. Un projet clos est affiché « archivé ».
- La liste se met à jour d'elle-même quand un projet est créé ou modifié.

## 3.14 Initialisation d'un projet

**À quoi elle sert.** Créer un projet complet dans la plateforme. Un seul point d'entrée accepte deux sortes de fichiers, et le format décide du traitement :

- une **proposition commerciale** (PDF, DOCX ou PPTX) : l'IA **préremplit** le fichier Excel d'initialisation ;
- le **fichier Excel d'initialisation rempli** (XLSX) : la Console le **contrôle** onglet par onglet, puis le projet est prévisualisé et créé.

> [Capture] Initialisation d'un projet : zone de dépôt avec les deux encarts « Proposition commerciale » et « Excel d'initialisation rempli ».

Le parcours affiché en haut de l'écran compte cinq étapes : **Préremplir** (facultatif), **Importer**, **Contrôler**, **Prévisualiser**, **Publier**. Avec un Excel, l'étape Préremplir est grisée.

### 3.14.1 Déposer un fichier

1. Glissez le fichier dans la zone « Déposez votre fichier. », ou cliquez sur **Choisir un fichier**. Pendant le glisser, l'écran annonce « Proposition détectée » ou « Excel détecté ».
2. Une barre suit l'import (« Import du fichier · N % ») ; **Annuler** l'interrompt.
3. L'analyse ou le contrôle démarre dès la fin de l'import.

**Règles**

- Formats acceptés : PDF, DOCX, PPTX et XLSX. **25 Mo au plus par fichier.**
- Une proposition peut être accompagnée de ses **annexes** : jusqu'à **10 fichiers** par dépôt, lus comme un seul document. La ligne du fichier affiche « {premier fichier} + N fichiers ».
- Un Excel d'initialisation se dépose **seul** : « Un Excel d'initialisation se dépose seul ».
- Le format réel est vérifié à partir du contenu du fichier, pas seulement de son extension.
- Un seul fichier refusé fait refuser tout le dépôt.
- Le lien **Modèle Excel vierge**, sous la zone, télécharge le modèle sous le nom « {votre nom} - Init projet Cockpit AAMMJJ.xlsx ».
- L'icône **Réinitialiser**, en fin de ligne du fichier, revient à l'état initial sans confirmation. Les fichiers, le texte, les résultats et l'Excel produit sont aussitôt supprimés du serveur (« Préremplissage réinitialisé » ou « Contrôle réinitialisé »).

### 3.14.2 Préremplir à partir d'une proposition commerciale

1. Déposez la proposition (et ses annexes).
2. L'IA lit le document et répartit son contenu dans les **14 onglets** du fichier d'initialisation. L'écran affiche :
   - « Analyse en cours », l'onglet en cours (« Onglet NN · Libellé ») et « N onglets sur 14 terminés · N champs extraits. » ;
   - les tuiles des onglets en cours de lecture (« lecture… »), plusieurs à la fois ;
   - le temps restant estimé (« NN s restantes, environ »).
3. À la fin, « Préremplissage terminé » :
   - « Les 14 onglets sont remplis. » s'il n'y a rien à vérifier ;
   - sinon « N champs demandent votre regard. ».
4. Consultez la liste **À vérifier** : valeurs incertaines ou absentes de la proposition, avec l'onglet, le champ, la valeur proposée, la confiance et la page source. Filtrez par **Tous**, **Incertains** ou **Manquants**, ou cliquez sur une tuile d'onglet.
5. Cliquez sur **Télécharger l'Excel**. Le fichier s'appelle « {nom de la proposition} · prérempli.xlsx ».
6. Faites relire le fichier par le PMO, puis déposez-le avec **Déposer l'Excel vérifié** pour le contrôle (3.14.3).

**Règles**

- L'analyse utilise la fonction d'IA **Initialisation projet** : son modèle principal et son secours se règlent dans Fournisseurs et modèles (3.7.4), sa dépense apparaît dans la tuile « Initialisation projet » de Consommation et coûts (3.8).
- Les consignes de lecture sont complétées par la skill **Préremplissage d'un projet** (3.12), lue qu'elle soit active ou non.
- Une valeur est **incertaine** quand la confiance de l'IA est inférieure à **70 %**. Un champ obligatoire absent est **manquant**. Un onglet sans aucune donnée est marqué « non trouvé ».
- Dans l'Excel prérempli, chaque cellule à vérifier est **surlignée en ambre** et porte un **commentaire** : motif, confiance et source (page, et nom du fichier quand il y en a plusieurs).
- Le champ « Permission » des personnes n'est jamais rempli par l'IA.
- L'analyse est **un préremplissage** : rien n'est créé dans la plateforme.
- **Annuler** pendant l'analyse arrête la tâche et supprime le document.
- Si l'analyse s'interrompt (« Erreur · Analyse »), les onglets déjà traités sont conservés : **Reprendre l'analyse** repart de l'onglet interrompu.
- Le document déposé et son texte sont supprimés dès que l'Excel est produit. Le reste (résultats, Excel prérempli) est supprimé **24 heures** après.

**Messages d'erreur**

| Message | Cause | Que faire |
|---|---|---|
| « Format non pris en charge. » | Extension ou contenu non reconnu, ou fichier de plus de 25 Mo | Déposez un PDF, DOCX, PPTX ou XLSX de 25 Mo au plus |
| « Fichier illisible. » — « Le document est protégé ou ne contient que des images. » | Document protégé, scanné ou sans texte | Exportez-le en PDF texte, ou cliquez sur **Remplir le modèle manuellement** |
| « Analyse interrompue à l'onglet NN · Libellé. » | Modèle indisponible, délai dépassé, redémarrage du serveur | **Reprendre l'analyse** |
| « 10 fichiers au plus par dépôt » | Trop de fichiers | Regroupez les annexes |
| « Excel prérempli supprimé (durée de conservation dépassée) : relancez l'analyse. » | Plus de 24 heures écoulées | Déposez de nouveau la proposition |

### 3.14.3 Contrôler l'Excel rempli

1. Déposez le fichier Excel rempli.
2. Les 14 onglets sont contrôlés un par un (« Contrôle en cours », « N onglets sur 14 contrôlés. »).
3. Résultat :
   - **« Fichier conforme. »** : « 14 onglets et N champs contrôlés. Le référentiel peut être prévisualisé. » Cliquez sur **Prévisualiser le référentiel**. Des avertissements peuvent subsister ; ils ne bloquent pas ;
   - **« N anomalies bloquantes. »** : « Corrigez-les dans l'Excel, puis déposez-le à nouveau. » Boutons **Déposer le fichier corrigé** et **Télécharger le rapport**.
4. Consultez la liste **À corriger** : onglet, champ, valeur lue, gravité (« Bloquant » ou « Avertissement ») et **cellule exacte** (par exemple « C14 »). Filtrez par **Toutes**, **Bloquantes** ou **Avertissements**.
5. Le **rapport de contrôle** (« {fichier} · rapport de contrôle.xlsx ») liste chaque anomalie avec sa cellule, et une synthèse par onglet.

**Règles**

- Seules les anomalies bloquantes rendent le fichier non conforme.
- Le code projet doit être libre : sinon « Code déjà utilisé dans la bibliothèque des projets. ».
- Un fichier conforme est gardé pour la prévisualisation pendant 24 heures ; un fichier non conforme ne l'est pas.

### 3.14.4 Le modèle Excel

Le modèle compte **14 onglets de saisie numérotés de 01 à 14**, précédés des onglets « Complétude », « Glossaire » et « Références » :

| Onglet | Contenu (* = obligatoire) |
|---|---|
| 01 Équipes | Nom*, Description |
| 02 Rôles | Libellé*, Description |
| 03 Personnes | Nom complet*, Email*, Équipe*, Fonction, Permission*, Actif |
| 04 Affectations | Personne*, Rôle*, Début*, Fin |
| 05 Projet | Client, secteur, pays, code et nom du projet, dates, fuseau horaire, statut, directeur de programme, sponsor… |
| 06 Info projet | Rubrique*, Libellé, Valeur* |
| 07 Lots | N°*, Périmètre*, Début*, Fin*, Statut, Responsable |
| 08 Phases | N°*, Nom*, Lot*, Début*, Fin*, Statut, Description |
| 09 Sous-phases | Phase*, N°*, Nom*, Début, Fin, Statut, Description |
| 10 Chantiers | Nom*, Responsable*, Lot, Statut, Début, Fin, Description, Phases, Sous-phases, Dépendances |
| 11 Instances | Nom*, Nom court*, Couleur*, Fréquence*, Niveau, Rôle de l'instance |
| 12 Membres | Instance*, Personne*, Rôle dans l'instance |
| 13 Jalons | Libellé*, Phase*, Sous-phase, Chantier, Lot, Responsable, Date prévue* |
| 14 Livrables | Nom*, Sous-phase*, Chantier, Responsable*, Début, Échéance* |

**Règles de saisie**

- **06 Info projet** : rubriques Le client, Marques du groupe, Programme en une phrase, Enjeux stratégiques, Périmètres fonctionnel, applicatif, géographique et juridique. « Programme en une phrase » (une ligne) et « Enjeux stratégiques » (au moins une ligne) sont obligatoires.
- **Sous-phases** : la numérotation est **libre** (par exemple 3.1, 3.2a). Un numéro ne contient ni espace, ni « ; », ni « · », et n'apparaît pas deux fois dans une même phase.
- **10 Chantiers** :
  - **Début** et **Fin** sont facultatifs. Vides, ils sont calculés à partir des sous-phases du chantier, sinon de ses phases, sinon du projet ;
  - **Phases**, **Sous-phases** et **Dépendances** acceptent plusieurs valeurs séparées par « ; » ;
  - une sous-phase choisie doit appartenir à l'une des phases du chantier ;
  - Dépendances : noms ou codes (C1…) des chantiers, ou « Tous » seul. Un chantier ne peut pas dépendre de lui-même. **Deux chantiers peuvent dépendre l'un de l'autre.**
- **Dates** : JJ/MM/AAAA, ou une date Excel.
- **Code projet** : 2 à 20 caractères, lettres, chiffres, « - » ou « _ ». Il est mis en majuscules et doit être libre.
- **Anciens fichiers refusés** : un fichier sans l'onglet « 06 Info projet » ou sans les colonnes Phases, Sous-phases, Dépendances de « 10 Chantiers » est refusé : « Ancien modèle de fichier : téléchargez le modèle à jour (bouton « Modèle Excel ») et reportez-y vos données ».

### 3.14.5 Prévisualiser puis créer le projet

1. **Prévisualiser** : parcourez le futur référentiel (bandeau du projet, planning des phases, puis une vue par onglet ; compteur « n / 15 vus »).
2. Lisez le résumé : « Valider crée le projet CODE avec N lots, N phases, N sous-phases, N chantiers, N jalons, N personnes. Il rejoint la bibliothèque des projets, au statut Préparation. »
3. Cliquez sur **Valider l'importation**. La création se fait en cinq phases :
   1. création du projet ;
   2. lots et phases ;
   3. chantiers et jalons ;
   4. personnes et habilitations ;
   5. instances de pilotage.
4. À la fin, « CODE a rejoint la bibliothèque des projets ». Boutons **Importer un autre projet** et **Ouvrir la bibliothèque**.

**Ce qui est créé**

- le projet, **toujours au statut Préparation**, quel que soit le statut indiqué dans le fichier ;
- son client et ses informations projet ;
- lots, phases, sous-phases ;
- chantiers (codes C1, C2… réattribués), avec leurs phases, sous-phases et dépendances, et jalons (J01, J02…) ;
- livrables, équipes, rôles, personnes, affectations ;
- instances et leurs membres ;
- **une habilitation Responsable par chantier**, sur la personne responsable ;
- une planification de snapshots (hebdomadaire, vendredi à 4 h, conservation 12 mois) ;
- votre rattachement au projet.

**Règles**

- Le serveur refait tous les contrôles à la validation. La création est « tout ou rien » : en cas d'erreur, rien n'est créé.
- **Aucun compte utilisateur n'est créé.** Invitez ensuite les personnes (3.3).
- Une personne marquée « Actif : non » est créée inactive.
- L'initialisation est tracée au journal d'audit (Sensible).
- **Automatique** : un fichier refusé il y a moins de 7 jours est signalé dans la cloche (« Import refusé : {fichier} »).

**Messages d'erreur (exemples)**

| Message | Que faire |
|---|---|
| « Onglet « X » manquant » | Repartez du modèle Excel |
| « Le code X existe déjà » | Changez le code projet dans l'onglet 05 Projet |
| « « Colonne » est obligatoire » | Complétez la cellule indiquée |
| « … : date invalide (JJ/MM/AAAA attendu) » | Corrigez la date |
| « Équipe « X » inconnue (onglet 01 Équipes) » | Ajoutez l'équipe ou corrigez le nom |
| « Fin avant début » | Corrigez les dates |
| « Sous-phase X hors des phases du chantier : … » | Ajoutez la phase au chantier, ou retirez la sous-phase |
| « Le chantier « X » dépend de lui-même » | Retirez cette dépendance |
| « Fichier non conforme : corrigez les anomalies bloquantes avant la prévisualisation. » | Corrigez puis déposez le fichier |
| « Fichier supprimé (durée de conservation dépassée) : déposez-le de nouveau. » | Déposez de nouveau le fichier |

**Exemple.** Vous déposez la proposition commerciale d'ORION et son annexe financière. Après l'analyse, 12 champs sont à vérifier, dont la date de fin du projet. Vous téléchargez l'Excel prérempli et le confiez au PMO. Il corrige les cellules en ambre et vous renvoie le fichier. Vous le déposez : le contrôle trouve 1 anomalie bloquante en « 10 Chantiers », cellule I12 (sous-phase hors des phases du chantier). Le PMO corrige, vous redéposez : le fichier est conforme. Vous prévisualisez, puis validez. ORION apparaît dans la bibliothèque avec le badge « Nouveau », au statut Préparation. Il reste à inviter son équipe.

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

**À quoi sert la page.** Activer les fonctions optionnelles du Cockpit, pour toute la plateforme ou projet par projet. Trois modules existent : **Budget**, **Suivi des bénéfices** et **Message d'accueil de Jev**.

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
- Le module **Budget** : sans lui, la saisie du budget est refusée, et le composant « Budget » des templates de rapport n'est pas proposé (« Budget : le module n'est pas activé pour ce projet (Console › Modules). »).
- Le module **Message d'accueil de Jev** (actif sur tous les projets par défaut) : Jev rédige chaque jour le message de l'écran Aujourd'hui de chaque utilisateur, avec le ton de sa Personnalité ; désactivé, le message est calculé par règles. Sa consommation s'inscrit sur la ligne Insights de Consommation et coûts.

## 3.17 Registre des cartes API

**À quoi sert la page.** Recenser les services externes appelés par la plateforme (actualités, météo, trafic pour les widgets du Cockpit, et la carte « JEV » qui aiguille les questions posées à Jev), et surveiller leur santé, leurs clés et leurs quotas.

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

**La carte « JEV »** sert à l'aiguillage des questions posées à Jev (3.10). Son endpoint, sa clé et son modèle se règlent ici. Sans elle, ou si elle est désactivée, Jev reste utilisable mais traite chaque question comme ambiguë.

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

**Messages d'erreur** : « Donnez un nom à la carte. », « Saisissez une adresse valide, sans espace : domaine puis chemin. », « Adresse privée ou locale interdite », « Collez la clé fournie par le service. », « JSON invalide », « Saisissez le corps JSON de l'appel ».

## 3.18 Notifications envoyées aux utilisateurs

**À quoi sert la page.** Programmer des messages envoyés aux utilisateurs **chaque jour ou chaque semaine, à heure fixe**. Un modèle d'IA rédige leur contenu à partir des données du projet. Il n'y a pas d'alertes déclenchées par un événement : toutes les règles partent à heure fixe.

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
- Si l'enregistrement échoue, votre saisie est conservée : « Enregistrement impossible : vos modifications sont conservées. Réessayez. ».
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
  - Le message complet compte **moins de 100 mots**.
  - Le contenu suit une mise en forme légère : une phrase essentielle, 2 ou 3 rubriques, des puces qui commencent par le chiffre clé, des étapes numérotées.
- **Mise en page.**
  - Dans le Cockpit, le tiroir des notifications met le texte en page.
  - Par e-mail, le message est mis en page : en-tête « RISE Cockpit · projet · date », nom de la règle, titre, chiffres clés, points « À surveiller », bloc « À faire », lien « Ouvrir RISE Cockpit », et en pied l'adresse d'expédition et la raison de l'envoi (profil, projet). Une version texte est jointe pour les messageries qui n'affichent pas la mise en page.
- **Garde-fous.**
  - Aucune requête technique n'est jamais envoyée à la place du texte.
  - Si les données ne peuvent pas être lues, le texte est rédigé sans chiffres, ou remplacé par : « Les données du projet n'ont pas pu être analysées pour cet envoi : consultez le détail dans le Cockpit. ».
- **Mémoire.** Le dernier envoi réussi de la règle, pour le même projet et le même profil, est transmis au modèle s'il date de moins de 35 jours. Le modèle dit alors ce qui a changé depuis, au lieu de tout répéter.
- **Canaux.**
  - Dans l'application : une notification par destinataire, dans la cloche du Cockpit.
  - E-mail : un e-mail par profil, avec tous les destinataires dans le champ « À ».
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

- **Historique des envois** : onglets **Cette règle** ou **Toutes les règles** ; les 200 derniers envois. Sous le nom de la règle, une ligne grise indique l'heure prévue et l'heure réelle.
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
- L'adresse d'expédition est aussi rappelée en pied des e-mails de notification.

**Messages d'erreur** : chaque étape en échec affiche le code du serveur et une aide. Par exemple :

- « Le nom du serveur est introuvable. Vérifiez l'orthographe. » ;
- « Gmail n'accepte que les mots de passe d'application (16 caractères)… ».

À l'enregistrement, la Console signale aussi « Saisissez un nom d'hôte… », « Le mot de passe est requis quand l'authentification est activée. » et « Saisissez une adresse e-mail valide. ».

## 3.20 Partager Cockpit

**À quoi sert la page.** Préparer, pour une personne précise, un **paquet d'installation Windows** de Cockpit et de la Console : un fichier ZIP qu'elle décompresse avant de lancer l'installateur. Vous choisissez les données et les secrets (clés d'IA, serveur d'e-mail) qu'il contient, et vous les protégez par un code.

> [Capture] Partager Cockpit : bandeau (taille, dépense IA possible, secrets), six tuiles, historique des paquets.

### 3.20.1 Préparer un paquet

Le bandeau rappelle en permanence la **taille estimée**, la **dépense IA possible**, le nombre de **secrets** inclus et ce qui se passe **si Cockpit est déjà installé**. Renseignez ensuite les six tuiles :

1. **01 Données** :
   - **Base actuelle** : une copie de la base telle qu'elle est aujourd'hui, limitée aux projets choisis (tous cochés par défaut) ;
   - **Jeu de démonstration** : deux projets fictifs, des équipes et des snapshots pour découvrir Cockpit ;
   - **Cockpit vide** : aucun projet ni utilisateur.
2. **02 Clés d'IA** : cochez les clés à inclure. Chaque clé affiche son masque et son plafond mensuel (« sans plafond » en rouge). Les cartes du Registre des cartes API qui ont une clé sont aussi proposées (« Carte API · {nom} »). Aucune clé n'est cochée par défaut.
3. **03 SMTP et fichiers** :
   - **Serveur SMTP** : inclus, les e-mails de la personne partiront de votre adresse ; exclu, elle configurera son propre serveur ;
   - **Fichiers déposés** : Base de connaissance et guides utilisateur. Les **formats et templates de rapport sont toujours inclus**.
4. **04 Sécurité** : la tuile résume ce que la personne pourra faire en votre nom (« Dépenser jusqu'à N € par mois sur … », « Envoyer des e-mails depuis … »). L'interrupteur **Code de déverrouillage** (activé par défaut, « Fortement recommandé ») chiffre les secrets par un code. Étiquette : « Protégé », « Exposé » (secrets lisibles dans le ZIP) ou « Aucun secret ».
5. **05 Destinataire** : nom et e-mail de la personne (« Pour l'historique. Cockpit n'envoie rien à cette adresse. »). **Préremplir son compte** crée son compte à l'avance avec les profils choisis (Administrateur, PMO, Responsable, Lecteur) : « Elle ne saisira que son mot de passe. ».
6. **06 Version** : numéro de version et nouveautés depuis le dernier paquet. Sous « Si Cockpit est déjà installé chez elle », choisissez **Conserver ses données** (seule l'application est mise à jour) ou **Remplacer ses données** (sa base est remplacée, après une sauvegarde sur son poste).

Cliquez ensuite sur **Générer le paquet**.

**Règles**

- Le bouton reste inactif tant que le destinataire ou les projets manquent : « Renseignez le destinataire (05). », « Choisissez au moins un projet (01). ».
- **Dépense IA possible** : somme des plafonds mensuels des clés incluses. Elle vaut « Illimitée » si une clé n'a pas de plafond. Fixez les plafonds dans Fournisseurs et modèles (3.7.3) : « Une clé sans plafond peut être facturée sans limite. Fixez un plafond ou décochez-la. ».
- Votre propre compte, les sessions et les clés non retenues ne sont jamais copiés dans le paquet.

### 3.20.2 Générer et transmettre le paquet

1. La génération suit quatre étapes : **Compilation**, **Copie de la base**, **Rechiffrement** (« Ignoré » sans secret), **Archive**.
2. « Vous pouvez quitter cet écran : la génération continue sur le serveur. » Après un rechargement, l'écran reprend à l'étape en cours.
3. À la fin, l'écran affiche :
   - le **fichier** (nom et taille) et son **empreinte SHA-256** ;
   - le **code de déverrouillage**, « Code · affiché une seule fois », au format XXXX-XXXX-XXXX ;
   - le bouton **Code noté, le masquer** : le code n'est plus jamais affichable (« Masqué. Il ne pourra plus être affiché. »).
4. Cliquez sur **Télécharger le ZIP**.
5. Ouvrez **Message pour {prénom}**, puis **Copier le message** : il explique l'installation pas à pas. Envoyez le ZIP et le message.
6. Transmettez le code **par un autre canal** (SMS ou téléphone), jamais avec le ZIP.

**Règles**

- Une seule génération à la fois : « Un paquet est déjà en cours de génération. ».
- Le paquet reprend l'application telle qu'elle est installée sur le serveur.
- Le **code** compte 12 caractères. Il n'existe que si le paquet contient au moins un secret. Il n'est jamais enregistré, ni dans la base ni au journal d'audit.
- Le **lien de téléchargement** est valable **15 minutes** ; au-delà, relancez le téléchargement depuis la Console.
- Les secrets sont rechiffrés pour le paquet. La clé de chiffrement du serveur n'est jamais exportée.
- La génération (réussie ou en échec) est tracée au journal d'audit (Sensible), sans le code.

### 3.20.3 Historique et suppression du fichier

- **Historique des paquets** : date, auteur, destinataire, données, secrets (« protégés par code » ou « sans code »), version, taille, empreinte, et les clés à révoquer pour couper l'accès.
- **Sur le serveur · Supprimer** supprime le ZIP du serveur. L'info-bulle donne la date de suppression automatique.
- **Automatique** : chaque ZIP est supprimé **2 jours** après sa génération. La ligne de l'historique reste, avec « Fichier supprimé le … ». La suppression est tracée (Sensible).
- **Une installation déjà faite ne peut pas être désactivée à distance.** Pour couper l'accès, révoquez les clés chez les fournisseurs et changez le mot de passe SMTP s'il était inclus.

### 3.20.4 Installation chez la personne

1. Elle décompresse le ZIP (« Extraire tout »), puis lance `installer_cockpit.cmd`. Aucun droit d'administrateur Windows n'est nécessaire.
2. L'installateur demande le **code de déverrouillage** (3 essais). Sans code valide, Cockpit s'installe sans clés d'IA, sans clés de cartes API et sans serveur d'e-mail.
3. Si son compte a été prérempli, elle ne choisit que son mot de passe. Sinon, elle crée son compte administrateur.
4. Des raccourcis « Démarrer Cockpit » et « Arrêter Cockpit » sont créés. Cockpit s'ouvre ensuite à l'adresse `http://localhost:3000`.

**Exemple.** Vous préparez un paquet pour Claire Dumas, consultante qui reprend le projet RISE : base actuelle limitée à RISE, clé Anthropic plafonnée à 50 € par mois, SMTP exclu, code de déverrouillage activé, compte prérempli en PMO. Vous téléchargez le ZIP, copiez le message et l'envoyez par e-mail, puis lui dictez le code par téléphone. Deux jours plus tard, le ZIP disparaît du serveur.

## 3.21 Guide utilisateur

**À quoi sert la page.** Mettre à disposition le guide utilisateur de chaque application (Console et Cockpit), savoir qui l'a téléchargé, et régler la façon dont Jev y cherche ses réponses.

> [Capture] Page Guide utilisateur : onglets Console | Cockpit, version en vigueur, traçabilité, réglages de la recherche de Jev.

### 3.21.1 Un guide par application

- Les onglets **Console** et **Cockpit** (flèches gauche et droite du clavier) affichent chacun leur guide, avec sa version (« vN.N » ou « Aucun guide »).
- Rien n'est partagé entre les deux : versions, téléchargements, index et réglages sont séparés.
- Le guide de la Console sert au Jev de la Console ; le guide du Cockpit, au Jev du Cockpit.

### 3.21.2 Télécharger, déposer ou remplacer le guide

- **Télécharger le guide** télécharge la version en vigueur, nommée « Guide utilisateur Console vX.Y.pdf » (ou Cockpit).
- **Déposer le guide** (premier dépôt) ou l'icône **Remplacer le guide** : choisissez un PDF. Il devient aussitôt la version en vigueur.

**Règles**

- Seuls les vrais fichiers PDF sont acceptés (le contenu est vérifié), **10 Mo au plus**.
- **Numérotation** : la première version est 1.0. Chaque remplacement ajoute 1 au second chiffre (3.9 donne 3.10).
- Seule la version en vigueur est téléchargeable. Les anciennes restent dans la traçabilité.
- Un seul dépôt à la fois par application.
- Chaque téléchargement est enregistré avant l'envoi du fichier : qui, quand, quelle version. Ce registre ne peut pas être modifié.
- Chaque publication est tracée au journal d'audit (Sensible).

**Messages** : « Seuls les fichiers PDF sont acceptés. », « Fichier trop lourd (10 Mo maximum). », « Ce PDF ne contient pas de texte (document scanné) : déposez un PDF exporté depuis un traitement de texte. », « Aucun texte exploitable dans ce PDF. », « Indexation en cours : attendez la fin avant un nouveau dépôt. », « Le téléchargement a échoué. Réessayez. », « Le dépôt a échoué. Réessayez. ».

### 3.21.3 Indexation pour Jev

- Après un dépôt, le guide est **indexé** en tâche de fond : découpé en extraits, puis vectorisé avec le modèle de la fonction Vectorisation.
- La ligne d'état indique « Non indexé », « Indexation en cours · {modèle} » ou « Indexé · N pages · N extraits · {modèle} ({dimension} dim.) ».
- Une notification annonce la fin : « Guide Console indexé · N extraits » ou « Guide Console non indexé : {motif} ».
- Pendant l'indexation, Jev continue d'utiliser l'ancien index. Le nouveau le remplace d'un coup quand il est prêt. En cas d'échec, Jev garde le dernier index valide.
- Un changement de modèle ou de dimension de la Vectorisation réindexe automatiquement les guides (3.7.4).
- Si le serveur redémarre pendant l'indexation : « Indexation interrompue : le serveur a redémarré pendant le traitement. Déposez le guide de nouveau. ».

### 3.21.4 Traçabilité

- Sous « Traçabilité · Téléchargements, dépôts et remplacements » : chaque publication (« Version N.N publiée ») et chaque téléchargement (nom de la personne, version), avec les compteurs « N téléchargements » et « N personnes ».
- 8 événements par page.

### 3.21.5 Réglages de la recherche de Jev dans le guide

Quand une question porte sur l'utilisation de l'application, Jev cherche les passages les plus proches dans le guide, garde ceux qui dépassent le seuil, les reclasse, puis rédige sa réponse à partir des seuls extraits retenus. Ces réglages se font par application :

| Réglage | Par défaut | Limites | Rôle |
|---|---|---|---|
| Extraits recherchés | 8 | 1 à 30 | Nombre de passages les plus proches cherchés dans le guide |
| Extraits conservés | 4 | 1 à 10, et au plus les extraits recherchés | Passages gardés après le reclassement |
| Seuil de similarité | 0,58 | 0 à 0,95 | Écarte les passages trop éloignés de la question |
| Délai · vectorisation | 10 s | 1 à 60 s | Temps accordé pour transformer la question en vecteur |
| Délai · reclassement | 8 s | 1 à 60 s | Au-delà, l'ordre de la recherche est gardé |
| Délai · rédaction | 30 s | 5 à 120 s | Temps accordé au modèle pour rédiger |

- **Valeurs par défaut** rétablit ces valeurs ; **Enregistrer** n'est actif que si une valeur a changé.
- Une valeur hors limites est signalée en rouge sous le champ.
- La modification est tracée au journal d'audit (Sensible).
- Tant qu'aucun guide n'est publié, Jev ne répond pas aux questions d'usage de cette application.

## 3.22 Mon profil

**À quoi sert la page.** Gérer vos informations personnelles, votre photo, votre mot de passe et vos sessions, et voir vos habilitations. Sous-titre : « Vos informations, vos habilitations et la sécurité de votre compte. »

> [Capture] Mon profil, onglet Habilitations.

**La carte de gauche** affiche votre photo (ou vos initiales), votre nom, votre position, le badge « Administrateur », votre société, votre équipe (celle de la personne du référentiel qui a votre e-mail) et la date « Administrateur depuis ». Elle porte les liens **Changer la photo** et **Se déconnecter**.

**Utilisation**

- **Changer la photo** : choisissez une image. Elle est recadrée au carré et réduite automatiquement, puis s'affiche dans votre profil **et dans la barre latérale** (« Photo mise à jour »).
- **Onglet Informations** :
  - modifiez vos coordonnées : prénom, nom, position, société, e-mail de connexion, téléphone, ville, pays, langue, fuseau horaire ;
  - cliquez sur **Enregistrer** ;
  - le pied indique « Dernière modification le {date} ».
- **Onglet Habilitations** :
  - « Niveau d'administration » : Administrateur, « Accordé le {date}. Seul un autre administrateur peut retirer ce droit. » ;
  - le bouton **Mes N actions tracées · M critiques** ouvre le journal d'audit filtré sur votre nom ;
  - le tableau de vos projets : projet, rôle, affectation (dates) et droits (PMO, Responsable ou Lecteur et leurs chantiers, ou « Aucun droit »). Les rôles et affectations viennent du référentiel du projet ; les droits, de la page Utilisateurs.
- **Onglet Sécurité** :
  - **Modifier** le mot de passe : saisissez le mot de passe actuel, puis le nouveau deux fois. Vos autres sessions sont fermées ; celle-ci reste ouverte ;
  - **Sessions ouvertes** : **Déconnecter** ferme une session précise ; **Déconnecter les autres sessions** ferme toutes les autres ;
  - **Dernière connexion** : date et heure de votre dernière connexion.

**Règles**

- Prénom et nom sont obligatoires (60 caractères au plus).
- Une adresse e-mail déjà prise par un autre compte est refusée.
- Changer votre e-mail change aussi votre identifiant de connexion. Ce changement est tracé (Sensible).
- La photo est limitée à environ 2 Mo après réduction ; un fichier qui n'est pas une image est refusé (« Choisissez une image »). Le changement de photo est tracé (Info).
- La session courante ne se ferme pas depuis la liste : utilisez la déconnexion.

**Messages** : « Le prénom et le nom sont requis », « Adresse e-mail invalide », « Mot de passe actuel incorrect », « Choisissez une image », « Image illisible ».

# 4. Rôles et droits

## 4.1 Qui accède à la Console

- **Seuls les administrateurs de la plateforme** accèdent à la Console.
- Un administrateur a accès à toutes les pages et à toutes les actions de la Console. Il n'existe qu'un seul niveau d'administrateur.
- Seule exception : dans Accès › Consommation et coûts (3.6), un autre administrateur peut limiter ce que vous voyez (« Sans coûts » ou « Anonymisé »).
- Un compte sans ce droit, même PMO, ne peut pas ouvrir la Console. Sa tentative de connexion est tracée.

## 4.2 Ce que chaque profil voit et fait

| Profil | Console | Cockpit |
|---|---|---|
| Administrateur | Tout : comptes, droits, consommation, IA, projets, snapshots, plateforme, journal d'audit | Voit tous les projets et tous les chantiers, **en lecture seule** |
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
- **Garde-fous** : au moins un administrateur doit toujours rester, et personne ne peut retirer ses propres droits d'administrateur ni modifier ses propres droits de consommation.

# 5. Paramétrage

| Réglage | Où | Effet |
|---|---|---|
| Droits de consommation de chaque administrateur | Administrateurs | Complet, Sans coûts ou Anonymisé dans Accès › Consommation et coûts |
| Fournisseurs et clés d'IA | Fournisseurs et modèles | Autorisent l'appel aux modèles. Une clé en erreur rend ses modèles indisponibles |
| Plafond mensuel d'une clé | Fournisseurs et modèles (bouton « Plafond ») | Information reprise par Partager Cockpit ; ne bloque rien |
| Affectation principal / secours | Fournisseurs et modèles, section Affectation | Choisit le modèle de chaque fonction, dès la requête suivante |
| Modèle et dimension de la Vectorisation | Fournisseurs et modèles, section Affectation | Déclenchent la revectorisation des documents et des guides |
| Modèles et tarifs | Fournisseurs et modèles, catalogue | Définissent les modèles utilisables et le calcul des coûts |
| Plafonds et seuils d'alerte | Consommation et coûts (IA) | Déclenchent les alertes budgétaires, sans bloquer les appels |
| Persona | Persona | Nom, avatar et personnalité de Jev |
| Skills | Skills | Consignes de Jev et du préremplissage |
| Recherche de Jev dans le guide | Guide utilisateur | Nombre d'extraits, seuil de similarité, délais, par application |
| Carte JEV | Registre des cartes API | Aiguillage des questions posées à Jev |
| Planification des snapshots | Snapshots | Captures automatiques et durée de conservation, par projet |
| Portée des modules | Modules | Fonctions optionnelles visibles dans le Cockpit |
| Cartes API | Registre des cartes API | Services externes des widgets et de Jev |
| Règles de notification | Notifications | Messages programmés envoyés aux utilisateurs |
| Serveur d'envoi | Serveur d'envoi SMTP | Envoi de tous les e-mails |
| Guides utilisateur | Guide utilisateur | Version de chaque guide proposée au téléchargement et indexée pour Jev |
| Informations, photo, mot de passe, sessions | Mon profil | Votre propre compte |
| Réduire / déplier la navigation | Barre latérale | Mémorisé par votre navigateur |

**Réglages fixes (non modifiables à l'écran)**

- **Sécurité** :
  - 15 minutes d'inactivité avant déconnexion ;
  - blocage de 15 minutes après 5 échecs de connexion ;
  - invitation valable 14 jours ;
  - lien de réinitialisation valable 30 minutes ;
  - lien de téléchargement d'un paquet valable 15 minutes.
- **Données** :
  - journal d'audit conservé 24 mois ;
  - conversations de Jev conservées 30 jours ;
  - mesures des temps de réponse conservées 190 jours ;
  - interactions de la consommation de la plateforme conservées 400 jours ;
  - fichiers du préremplissage et de l'initialisation conservés 24 heures ;
  - paquets d'installation conservés 2 jours.
- **Consommation de la plateforme** : 5 minutes d'inactivité au plus par interaction ; hausse inhabituelle au-delà de 1,6 fois la moyenne ; point rouge à partir de 30 % de hausse de coût.
- **Planifications** :
  - test des clés d'IA toutes les 2 heures ;
  - relevé des mesures OpenRouter chaque jour à 4 h 30 ;
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

**Dans Accès › Consommation et coûts, le niveau Utilisateur est grisé, ou les montants affichent « — ».**
Vos droits de consommation sont « Anonymisé » ou « Sans coûts ». Seul un autre administrateur peut les changer, dans la page Administrateurs.

**Le taux d'activité paraît très faible avec un filtre Projet ou Fonctionnalité.**
C'est normal : ces filtres réduisent le temps actif, mais pas le temps connecté, qui ne peut être attribué ni à un projet ni à une fonctionnalité.

**Jev répond « Je ne peux pas répondre pour l'instant ».**
Aucun modèle n'est affecté à la fonction utilisée (Guidage console ou Synthèse), ou ses clés sont refusées. Vérifiez la section Affectation et les clés dans Fournisseurs et modèles.

**Jev ne trouve rien dans le guide, ou dit que la recherche est indisponible.**

- Vérifiez dans Guide utilisateur que le guide de la Console est publié et « Indexé ».
- Vérifiez la clé du fournisseur du modèle de vectorisation.
- Si les réponses sont trop souvent « non trouvées », baissez légèrement le seuil de similarité.

**Jev demande toujours une précision, même pour des questions claires.**
L'aiguillage est peut-être indisponible. Vérifiez la carte « JEV » dans le Registre des cartes API (état, clé).

**Jev dit « Conversation introuvable ».**
La conversation a expiré (30 jours). Cliquez sur **Effacer tous les messages** pour en ouvrir une nouvelle.

**Une fonction affiche « Secours en service ».**
La clé du fournisseur principal est refusée, ou n'a jamais été testée. Testez ou remplacez la clé.

**Le budget est dépassé : les appels sont-ils bloqués ?**
Non. Les plafonds alertent sans bloquer, de même que le plafond mensuel d'une clé. Pour réduire les coûts, affectez des modèles moins chers.

**J'ai changé le modèle de Vectorisation : la recherche dans les documents ne répond plus.**
Les documents et les guides sont en cours de revectorisation. Suivez l'avancement dans la cloche ; la recherche reprend à la fin.

**Une notification programmée n'est pas partie.**

- La règle est-elle active ? A-t-elle un modèle et des destinataires ?
- Un projet ciblé a-t-il des comptes actifs avec les profils visés ?
- Consultez l'historique : « Remplacé », « Abandonné » ou « Échec » indiquent la cause.
- Si la plateforme était arrêtée plus longtemps que la limite de rattrapage, l'envoi est abandonné.

**Un e-mail de notification n'arrive pas, alors que l'historique indique « Distribué ».**
Vérifiez qu'un serveur d'envoi est configuré et testé. Sans serveur, l'e-mail n'est pas réellement envoyé.

**Un snapshot a échoué.**
La cloche le signale. Créez un nouveau snapshot manuel depuis la page Snapshots.

**Le préremplissage refuse ma proposition (« Fichier illisible »).**
Le document est protégé, scanné ou ne contient que des images. Exportez-le en PDF texte depuis l'outil d'origine, ou remplissez le modèle Excel à la main.

**Le préremplissage s'est arrêté en cours de route.**
Cliquez sur **Reprendre l'analyse** : les onglets déjà traités sont gardés. Si l'erreur revient, vérifiez le modèle affecté à la fonction Initialisation projet.

**L'initialisation refuse mon fichier Excel.**
Consultez la liste « À corriger » ou téléchargez le rapport : chaque anomalie indique son onglet et sa cellule. Corrigez, puis cliquez sur **Déposer le fichier corrigé**. Rien n'a été créé entre-temps. Si le message parle d'un « ancien modèle de fichier », téléchargez le modèle Excel vierge et reportez-y vos données.

**La personne qui a reçu un paquet n'a pas de clés d'IA.**
Elle n'a pas saisi le bon code de déverrouillage (3 essais), ou aucune clé n'avait été cochée. Générez un nouveau paquet si besoin.

**Je veux couper l'accès d'une personne à qui j'ai envoyé un paquet.**
Ce n'est pas possible à distance. Révoquez chez les fournisseurs les clés indiquées dans l'historique des paquets, et changez le mot de passe SMTP s'il était inclus.

**Une carte API est « En erreur ».**

- Clé refusée : cliquez sur **Modifier** et remplacez la clé.
- Service injoignable : les widgets affichent leur dernière valeur connue. Réessayez **Tester l'appel** plus tard.

# 7. Annexes

## Annexe A. Récapitulatif des règles de gestion

Les références désignent les fichiers du code (dossier `backend/src` sauf mention contraire). Les numéros de ligne datent du 30/09/2026 pour les règles inchangées ; les règles ajoutées depuis citent le fichier et la constante.

| Règle | Description | Fonctionnalité | Référence dans le code |
|---|---|---|---|
| Accès réservé | Toute la Console est réservée aux administrateurs | Accès | `core/auth/auth.ts:106` ; `@AdminOnly` sur chaque contrôleur |
| Échecs de connexion | 5 échecs par adresse, 20 par adresse IP, blocage 15 min, remise à zéro après 15 min | Connexion | `core/auth/policy.ts:11-17` |
| Message d'échec unique | Même message pour adresse inconnue, mauvais mot de passe, compte invité ou suspendu | Connexion | `core/auth/credentials.service.ts:82-101` |
| Mot de passe | 12 à 128 caractères, majuscule, minuscule, chiffre, spécial, différent du précédent, non compromis | Connexion | `core/auth/policy.ts:38-58` ; `core/auth/password.ts:70-75` |
| Inactivité | 15 min dans la Console (+ 2 min de marge côté serveur), avertissement 60 s avant | Session | `core/auth/policy.ts:22-24` ; `frontends/auth-api.js` |
| Lien de réinitialisation | Valable 30 min ; 1 envoi par minute, 5 par heure ; jamais pour un compte suspendu | Mot de passe oublié | `core/auth/policy.ts:29-33` ; `credentials.service.ts` |
| Invitation | Lien à usage unique, valable 14 jours ; un nouveau lien annule les précédents | Utilisateurs | `admin/accounts.controller.ts` ; `credentials.service.ts` |
| Invitation sans réponse | Signalée après 7 jours | Utilisateurs, À traiter | `admin/accounts.controller.ts` (`INVITE_STALE_DAYS`) |
| Au moins un accès | Un compte invité a au moins un projet ou le rôle Administrateur | Utilisateurs | `admin/accounts.controller.ts` |
| Unicité de l'e-mail | Une adresse ne sert qu'à un compte | Utilisateurs | `admin/accounts.controller.ts` |
| Statuts de compte | Invité → Actif (mot de passe choisi) ; Suspendu → Actif ou Invité selon la connexion passée | Utilisateurs | `admin/accounts.controller.ts` ; `credentials.service.ts` |
| Suspension | Ferme toutes les sessions ; impossible sur soi-même | Utilisateurs | `admin/accounts.controller.ts` |
| Suppression | Refusée si le compte ou la personne liée a laissé une trace ; impossible sur soi-même | Utilisateurs | `admin/accounts.controller.ts` |
| E-mail du référentiel | Jamais recopié seul ; appliqué par l'administrateur ; invitation renvoyée pour un invité | Utilisateurs | `admin/profiles.service.ts` ; `admin/accounts.controller.ts` |
| Accès à retirer | Personne inactive dont le compte garde un droit | Utilisateurs, À traiter, cloche | `domain/habilitation-proposals.ts` ; `admin/console.controller.ts` |
| Compte à réactiver | Personne réactivée au référentiel après la suspension du compte | Utilisateurs, À traiter, cloche | `admin/profiles.service.ts` (`toReactivate`) |
| Proposition de droits | Responsable des chantiers dont la personne est responsable, Lecteur des autres chantiers de rattachement | Utilisateurs | `domain/habilitation-proposals.ts` |
| Habilitations | Remplacement complet ; droits écrits sur la personne du référentiel si elle existe ; PMO prioritaire sur les chantiers | Droits | `admin/accounts.controller.ts` |
| Dernier administrateur | Il reste toujours au moins un administrateur ; pas de retrait de ses propres droits | Administrateurs | `admin/accounts.controller.ts` |
| Nouvel administrateur | Seul un compte actif peut le devenir | Administrateurs | `admin/accounts.controller.ts` |
| Droits de consommation | Complet / Sans coûts / Anonymisé ; jamais sur soi-même ; Complet par défaut ; tracé Sensible | Administrateurs, Consommation (Accès) | `admin/platform-usage.controller.ts` ; `prisma/schema.prisma` (`seeCosts`, `seeIndividual`) |
| Journal d'audit | Ajout seul (trigger SQL), 24 mois de conservation, purge à 03:15 | Journal d'audit | `prisma/migrations/20260928000000_audit_append_only` ; `admin/console.controller.ts` |
| Export d'audit | 5 000 lignes au plus, séparateur « ; », export tracé | Journal d'audit | `admin/console.controller.ts` |
| Décision différée | 10 s pour annuler une décision sur une demande ; exécution ensuite | Cloche | `admin/inbox.service.ts` |
| Réconciliation de la cloche | Une notification par cause ; fermée ou rouverte selon la cause ; lue pour tous | Cloche | `admin/inbox.service.ts` |
| Incidents d'IA | Un incident par fonction quand le principal échoue ; fermé à sa réussite suivante | Cloche | `core/llm.service.ts` (`aiIncidentKey`) ; `core/tech-errors.ts` |
| Mises à jour en direct | Chaque écriture annoncée par un flux ; la Console relit la page affichée, la Vue d'ensemble et la cloche ; ses propres écritures ignorées | Toutes les pages | `core/changes.ts` ; `frontends/admin-api.js` (`liveStart`) |
| Temps actif | Chaque interaction compte jusqu'à la suivante, au plus 5 min ; une suite par utilisateur | Consommation (Accès) | `domain/platform-usage.ts` ; `admin/platform-usage.service.ts` |
| Hausse inhabituelle | Coût > 1,6 × moyenne des points ouvrés (heures 7 h–19 h en vue Jour) ; point rouge si hausse de coût ≥ 30 % ; ambre si coût / heure active > moyenne × 1,15 | Consommation (Accès) | `domain/platform-usage.ts` |
| Export de la consommation | Sélection affichée, toutes les lignes, droits appliqués ; tracé Sensible ou Info | Consommation (Accès) | `admin/platform-usage.controller.ts` |
| Conservation des interactions | 400 jours, purge chaque nuit | Consommation (Accès) | `domain/platform-usage.ts` |
| Clés d'IA | Chiffrées ; seuls le préfixe et les 4 derniers caractères restent visibles | Fournisseurs | `core/crypto.ts` |
| Test des clés | Réel, 10 s au plus, toutes les 2 h ; « quota atteint » = clé valide | Fournisseurs | `core/provider-key-tester.ts` ; `admin/ai.controller.ts` (`KEY_TEST_CRON`) |
| Plafond mensuel d'une clé | Entier de 1 à 100 000 €, ou sans plafond ; informatif ; tracé Sensible | Fournisseurs, Partager Cockpit | `admin/ai.controller.ts` (`PROVIDER_CAP_MAX_EUR`) ; `domain/share.ts` (`possibleSpend`) |
| Disponibilité d'un modèle | Actif, de la bonne catégorie, fournisseur au statut OK | Affectation | `core/llm.service.ts` |
| Modèle affecté protégé | Ni désactivation ni suppression d'un modèle affecté (principal ou secours) ; suppression refusée s'il a de la consommation | Fournisseurs | `admin/ai.controller.ts` (`MODEL_IN_USE`, `IN_USE`) |
| Tarifs | LLM entrée + sortie ; Embedding entrée ; Reranking à la requête ou au jeton ; ≥ 0 | Modèles | `domain/ai-pricing.ts` |
| Affectation | Principal actif de la bonne catégorie ; secours différent et actif ; enregistrement immédiat | Affectation | `admin/ai.controller.ts` |
| Chaîne Documents | Une étape indisponible suspend les suivantes ; Vectorisation sans secours | Affectation | `core/llm.service.ts` (`AI_FUNCTIONS`, `noFallback`) |
| Revectorisation | Changement du modèle ou de la dimension de la Vectorisation : tous les extraits (Base de connaissance et guides) revectorisés ; tracé Critique | Affectation | `admin/revectorize.service.ts` |
| Génération réelle | Toutes les fonctions LLM génèrent réellement ; Vectorisation et Reclassement aussi | IA | `core/llm.service.ts` (`LIVE_FUNCTIONS`) |
| Relais par le secours | Principal en échec à l'appel : le secours est essayé | IA | `core/llm.service.ts` |
| Limite de sortie | 1 024 jetons par réponse réelle par défaut, sauf traitement qui en demande davantage ; plafonnée au max output du modèle | IA | `core/llm.service.ts` (`LIVE_MAX_OUTPUT_TOKENS`) |
| Mesures OpenRouter | Intelligence Index, coût d'une session Hermes Agent, débit ; LLM seulement ; relevé à 4 h 30 et à la demande ; jamais d'effacement | Fournisseurs | `admin/model-stats.service.ts` ; `domain/model-stats.ts` (`MODEL_STATS_CRON`) |
| Projection et statut budgétaire | Rythme sur 7 jours ; Dépassement si projection ≥ plafond ; Alerte si projection > seuil | Coûts | `admin/usage.service.ts` |
| Seuil d'alerte | 50 à 100 %, par pas de 5 ; 80 % par défaut | Coûts | `admin/ai.controller.ts` ; `admin/usage.service.ts` |
| Plafond non bloquant | Aucun appel n'est refusé au-delà d'un plafond | Coûts | (aucune lecture des plafonds par la passerelle IA) |
| Lignes budgétaires | Insights, Gestion des données, Rapports, Guidage console, Initialisation projet, Documents | Coûts | `core/llm.service.ts` (`AI_BUDGET_LINES`) |
| Tarifs figés | Le tarif de chaque appel est enregistré au moment de l'appel | Journal des appels | `core/llm.service.ts` |
| Cache des instructions | Lecture à 10 %, écriture à 125 % du prix d'entrée | IA | `core/llm-client.ts` |
| Temps de réponse | Médiane exacte, min, max ; 6 catégories ; clarifications non comptées ; conservation 190 jours, purge à 03:40 | Analyse des temps de réponse | `domain/latency.ts` ; `core/latency.ts` ; `admin/latency.service.ts` |
| Jev sans action | Jev explique et guide ; il ne produit aucune action | Jev | `admin/console.controller.ts` |
| Aiguillage de Jev | Carte JEV du Registre ; USAGE, DONNEES, AMBIGU, HORS_SUJET ; confiance < 0,5 → AMBIGU ; échec → AMBIGU | Jev | `domain/jev-router.ts` ; `admin/jev-router.service.ts` |
| Réponse à partir du guide | Recherche vectorielle, seuil, reclassement, rédaction par Synthèse à partir des seuls extraits ; sources par section | Jev | `admin/jev-assistant.service.ts` ; `admin/guide-search.service.ts` ; `domain/jev-rag.ts` |
| Réglages de la recherche | 8 / 4 extraits, seuil 0,58, délais 10 / 8 / 30 s ; bornes contrôlées ; tracé Sensible | Guide utilisateur, Jev | `domain/jev-rag.ts` (`RAG_DEFAULTS`, `RAG_LIMITS`) |
| Lecture de données par Jev | Lecture seule, 200 lignes, 5 s, une correction ; 34 tables | Jev | `domain/jev-sql.ts` ; `admin/jev-sql.service.ts` ; `domain/jev-dictionnaire.ts` |
| Mémoire de Jev | 10 derniers échanges, 16 000 caractères, résumé au-delà, isolée par administrateur | Jev | `admin/jev-memory.service.ts` |
| Purge des conversations | 30 jours sans échange, purge à 03:25 | Jev | `admin/jev-memory.service.ts` ; `admin/console.controller.ts` |
| Persona | Nom obligatoire, 30 caractères ; Soul 20 000 caractères ; image de 1 Mo ; versions conservées | Persona | `domain/jev-prompt.ts` ; `admin/persona.controller.ts` |
| Skill de guidage | Seule la skill de guidage s'applique au Jev de la Console | Skills | `domain/jev-prompt.ts` (`CONSOLE_GUIDANCE_SKILLS`) |
| Skills dédiées | « Préremplissage d'un projet » lue par le préremplissage, active ou non ; jamais envoyée à Jev | Skills, Initialisation | `domain/jev-prompt.ts` (`DEDICATED_SKILLS`) ; `domain/prefill-skill.ts` |
| Nom de skill unique | Unicité sans tenir compte des majuscules | Skills | `admin/skills.controller.ts` |
| Badge « Nouveau » | Projet initialisé depuis moins de 7 jours, en préparation | Bibliothèque | `admin/data.controller.ts` |
| Dépôt d'initialisation | PDF, DOCX, PPTX ou XLSX ; 25 Mo par fichier ; 10 fichiers au plus ; Excel seul ; type réel par signature | Initialisation | `domain/prefill.ts` (`PREFILL_MAX_BYTES`, `PREFILL_MAX_FILES`) ; `domain/kb-documents.ts` (`detectFormat`) |
| Préremplissage | Un appel par onglet, en vagues parallèles ; incertain sous 70 % ; cellules ambre commentées ; reprise après échec | Initialisation | `admin/prefill.service.ts` ; `domain/prefill.ts` (`PREFILL_UNCERTAIN_BELOW`) ; `core/prefill-excel.ts` |
| Conservation du préremplissage | 24 heures ; document supprimé dès l'Excel produit | Initialisation | `domain/prefill.ts` (`PREFILL_RETENTION_HOURS`) |
| Contrôles d'initialisation | 14 onglets 01 à 14 ; code libre de 2 à 20 caractères ; anomalies à leur cellule ; anciens modèles refusés | Initialisation | `import/referential-import.ts` (`OLD_MODEL_MESSAGE`) ; `domain/init-check.ts` |
| Chantiers | Début et fin facultatifs (calculés sinon) ; Phases, Sous-phases, Dépendances séparées par « ; » ; dépendances réciproques admises ; auto-dépendance refusée | Initialisation | `import/referential-import.ts` ; `domain/workstream-links.ts` (`multiValues`) |
| Sous-phases | Numérotation libre, sans espace, « ; » ni « · », unique dans la phase | Initialisation | `domain/workstream-links.ts` |
| Création tout ou rien | Contrôle refait, transaction unique, projet au statut Préparation | Initialisation | `admin/data.controller.ts` ; `import/referential-import.ts` |
| Capture de snapshot | 19 types d'objets et leurs liens ; libellé de 120 caractères au plus côté serveur | Snapshots | `admin/snapshots.service.ts` ; `admin/data.controller.ts` |
| Planification des snapshots | Vérification chaque heure ; quotidienne, hebdomadaire, mensuelle (le 1er) | Snapshots | `domain/snapshots.ts` ; `admin/snapshots.service.ts` |
| Purge des snapshots | Au-delà de la conservation, tous types confondus, pour les planifications actives | Snapshots | `admin/snapshots.service.ts` |
| Restauration | Sauvegarde de sécurité d'abord, puis tout ou rien (120 s au plus) | Snapshots | `admin/snapshots.service.ts` |
| Portée des modules | Désactivé, tous les projets, ou par projet ; approbation limitée au projet demandé | Modules | `admin/data.controller.ts` |
| Sécurité des cartes API | https public seulement ; adresses privées refusées ; pas de redirection | Registre API | `domain/api-cards.ts` ; `admin/api-cards.service.ts` |
| Contrôle de santé des cartes | Toutes les 15 min ; POST une fois par 24 h | Registre API | `admin/api-cards.service.ts` ; `domain/api-cards.ts` |
| Alertes des cartes | Clé à 30, 7 et 1 jour, puis expirée ; quota à 80 % | Registre API, cloche | `domain/api-cards.ts` ; `admin/inbox.service.ts` |
| Fréquences de notification | Quotidienne ou hebdomadaire, heure par pas de 30 min, heure de Paris ; 07:00 et lundi par défaut | Notifications | `admin/rules.controller.ts` ; `domain/notification-rules.ts` |
| Cas bloquants | Sans modèle ou sans destinataire : enregistrable, rien n'est envoyé | Notifications | `domain/notification-rules.ts` (`blockingErrors`) |
| Variables | `{reponse_llm}` interdite dans le prompt ; anciennes variables refusées | Notifications | `admin/rules.controller.ts` ; `domain/notification-rules.ts` |
| Un envoi unique | Unicité par règle, projet et heure prévue | Notifications | `prisma/schema.prisma` (`@@unique([ruleId, projectId, scheduledAt])`) |
| Vérification des envois | Chaque minute, sur le prochain envoi stocké | Notifications | `admin/notifications.service.ts` |
| Rattrapage | Jusqu'au lendemain 23:59 (fuseau du projet) ; seul le plus récent ; 10 par minute ; « à l'heure » sous 5 min | Notifications | `domain/notification-rules.ts` ; `admin/notifications.service.ts` |
| Texte par profil | Profil le plus large ; données communes à tous les destinataires du profil | Notifications | `admin/profiles.service.ts` ; `domain/notification-rules.ts` |
| Longueur des notifications | Message complet de moins de 100 mots | Notifications | `domain/notification-rules.ts` ; `admin/notifications.service.ts` |
| E-mail mis en page | HTML (titre, chiffres, « À surveiller », « À faire »), texte brut joint | Notifications | `domain/notification-email.ts` (`notificationHtml`) |
| Mémoire des notifications | Dernier envoi réussi de moins de 35 jours, même projet et même profil | Notifications | `domain/notification-rules.ts` ; `admin/notifications.service.ts` |
| Jamais de SQL envoyé | Requête coupée réécrite ; sinon texte de repli | Notifications | `domain/jev-sql.ts` ; `admin/notification-writer.service.ts` (`NO_DATA_TEXT`) |
| Échecs dans « À traiter » | Échecs des 7 derniers jours (5 au plus) | Notifications, À traiter | `admin/console.controller.ts` |
| SMTP | Mot de passe chiffré et jamais renvoyé ; test réel sans envoi ; 10 s par étape | Serveur SMTP | `core/smtp.service.ts` ; `core/smtp-probe.ts` ; `domain/smtp.ts` |
| Paquet d'installation | 4 étapes ; une génération à la fois ; code de 12 caractères jamais stocké ; lien signé 15 min ; ZIP supprimé après 2 jours ; tracé Sensible | Partager Cockpit | `admin/share.service.ts` ; `admin/share-builder.ts` ; `domain/share.ts` (`SHARE_FILE_TTL_MS`) |
| Guide | Un guide par application ; PDF vérifié par son contenu, 10 Mo ; version 1.0 puis +0.1 ; téléchargements tracés en ajout seul ; indexation en tâche de fond, ancien index gardé jusqu'au nouveau | Guide | `domain/guide.ts` ; `admin/guide.controller.ts` ; `admin/guide-index.service.ts` |
| Dictionnaire des données | Rechargé automatiquement au démarrage de l'application quand il diffère du code ; modifiable par aucun écran | Jev (Console et Cockpit), notifications | `core/dictionary-sync.ts` |

## Annexe B. Points à clarifier et écarts constatés

Ces points viennent de la lecture du code. Ils décrivent un écart entre le code et un texte affiché ou une documentation, ou un comportement ambigu. Aucun n'a été tranché dans ce guide.

**Accès et comptes**

1. **Lien expiré** : l'écran annonce « durée de validité de 30 minutes », même pour un lien d'invitation, qui vaut 14 jours.
2. **Ajout d'un administrateur** : la fenêtre annonce « La personne est prévenue par e-mail », mais aucun e-mail n'est envoyé.
3. **Suppression d'un compte** : le texte annonce que les contributions restent visibles sous « Utilisateur supprimé ». En réalité, la suppression est refusée dès qu'une trace existe.
4. **Attribution des chantiers** : plusieurs textes disent que « le PMO choisit les chantiers ». Depuis le 29/09/2026, seule la Console les attribue.
5. **« Annuler » après une suspension** : il réactive le compte, sans rouvrir les sessions fermées, et l'audit enregistre une réactivation.
6. **Réactivation d'un compte activé mais jamais connecté** : il redevient Invité, sans nouveau lien.
7. **Liste des utilisateurs** : les chantiers affichés proviennent d'un fichier de démonstration (projet RISE uniquement). Seule la fenêtre « Modifier » lit les droits réels. À revérifier.
8. **Utilisateur courant** : la pastille « vous » et le masquage de certains boutons reposent sur un compte de démonstration fixe. Le serveur, lui, protège correctement. À revérifier.
9. **« Il y a null j »** : ce libellé peut s'afficher pour un compte actif qui ne s'est jamais connecté.
10. **Journal d'audit** : l'écran se limite aux 500 dernières entrées, alors que l'export va jusqu'à 5 000.
11. **Demandes d'invitation** : le bouton « Examiner » de « À traiter » mène à Utilisateurs, où aucune zone n'affiche les demandes. La décision se prend dans la cloche.

**Consommation et coûts (Accès)**

12. **Deux pages du même nom** : « Consommation et coûts » existe dans Accès et dans IA. Un renommage de l'une d'elles est en question.
13. **« Session moyenne » et « Durée moy. »** : elles divisent le **temps actif** par le nombre de connexions, et non le temps connecté, alors que le libellé évoque une durée de session.
14. **« Événements journalisés »** : ce sont les interactions enregistrées pour le temps actif, pas les entrées du journal d'audit.
15. **Définitions** : la page n'affiche pas de bloc de définitions des indicateurs ; elles ne figurent que dans ce guide.
16. **Réglages sans écran** : le délai d'inactivité (5 min), le facteur des hausses inhabituelles (1,6) et le seuil du point rouge (30 %) ne se modifient que par l'API.
17. **Droits combinés** : la combinaison « sans coûts et anonymisé » est acceptée par le serveur mais ne peut pas être choisie à l'écran.

**Vue d'ensemble et cloche**

18. **Deux calculs du budget** : « À traiter » suit la dépense, alors que la cloche et le statut « Dépassement » suivent la projection. Le titre « Budget IA à N % » affiche le pourcentage dépensé, alors que son déclenchement suit le statut projeté.
19. **Échecs d'envoi** : le compteur « N échecs … sur 7 jours » plafonne à 5.
20. **Rechargement pendant une décision** : si la page est rechargée pendant les 10 secondes d'annulation, la demande réapparaît sans bouton « Annuler ».
21. **Erreurs techniques** : après un redémarrage du serveur, une notification « Erreur technique » restée ouverte peut ne plus se fermer d'elle-même.

**IA et coûts**

22. **Libellé du guidage** : l'affectation affiche « Guidage console / Cockpit », les tuiles et le journal « Guidage console ».
23. **Clé non testée** : l'écran peut afficher « Connecté » pour une clé encore jamais testée, que le serveur traite comme indisponible.
24. **Plafond d'une clé** : l'écran accepte jusqu'à 6 chiffres ; le serveur refuse au-delà de 100 000 €.
25. **Sortie requise** : la jauge « Sortie maximale » n'est affichée que pour Rapports, alors qu'Initialisation projet a aussi une sortie requise (16 000 jetons).
26. **Reranking à la requête** : la colonne Entrée du catalogue affiche alors un prix pour 1 000 requêtes sous l'en-tête « € par million de tokens » ; le formulaire ne permet pas de créer un modèle facturé à la requête.
27. **« Chaque appel LLM »** : le journal contient aussi les appels de Vectorisation et de Reclassement.
28. **Nom du fichier CSV du journal** : le nom proposé par l'écran et celui envoyé par le serveur diffèrent.
29. **Consommation des notifications** : elle est rangée sous la fonction Insights.
30. **Fournisseur sans clé** : il passe en erreur au test automatique et génère une alerte critique.
31. **Seuil d'alerte** : il ne peut pas être désactivé depuis l'écran, alors que le serveur le permet.
32. **Réponse coupée** : la bascule sur le secours n'est pas faite quand un modèle atteint sa limite de sortie.

**Jev, Persona, Skills**

33. **Raccourcis** : ⌘J (Jev) et ⇧⌘C (Cockpit) sont annoncés dans la barre latérale ; leur fonctionnement n'est pas confirmé.
34. **Nom du Persona** : l'aide dit « Affiché dans le Cockpit », alors que le Cockpit garde le nom « Jev ».
35. ~~**« Une skill active s'applique à toutes ses réponses »**~~ : corrigé le 08/10/2026. Le sous-titre de la page Skills indique désormais l'usage de chaque skill, désigné par son nom (« Guidage console » pour le Jev de la Console ; « Insights », « Guidage Cockpit », « Gestion des données » pour le Jev du Cockpit ; « Rapports », « Rédiger les slides PowerPoint » ; « Préremplissage d'un projet »).
36. **Skill de guidage sur une base neuve** : c'est « Guider l'utilisateur », une skill écrite pour le Cockpit. Le texte de la skill « Guidage console » demande de proposer des liens d'action, ce qui contredit la règle « Jev n'agit pas ».
37. **Suggestions inadaptées** : certaines portent sur des données que Jev ne lit pas (téléchargements du guide, contenu des snapshots, « mes droits »).
38. ~~**Nouvelles pages mal connues de Jev**~~ : corrigé le 08/10/2026. Consommation et coûts (Accès), Partager Cockpit et Guide utilisateur figurent dans la liste des pages transmise à Jev et dans le périmètre décrit à l'aiguillage (avec l'analyse des temps de réponse et l'initialisation par proposition commerciale).
39. **Mémoire** : après « Conversation introuvable », les questions suivantes échouent jusqu'à une nouvelle conversation.
40. **Registre** : l'accueil de Jev vouvoie, mais « Écris à Jev… » et « Ton assistant IA » tutoient.

**Projets**

41. **Statut de l'initialisation** : le statut indiqué dans le fichier est contrôlé puis ignoré ; le projet est toujours créé en Préparation.
42. **Quitter pendant un préremplissage** : la tâche continue sur le serveur, mais l'écran ne la retrouve pas si l'on quitte la page puis revient ; « Reprendre l'analyse » n'existe qu'après un échec, sans avoir quitté l'écran.
43. **Bouton cité** : le message « Ancien modèle de fichier » renvoie au bouton « Modèle Excel », alors que l'écran affiche « Modèle Excel vierge ».
44. **Dernière étape** : le parcours de l'écran unique dit « Publier », la prévisualisation « Valider l'importation ».
45. **Spécification périmée** : la spécification de l'initialisation décrit encore 13 onglets, 4 étapes et « Charger l'exemple ».
46. **Libellé de snapshot** : 60 caractères à l'écran, 120 côté serveur.
47. **Contenu d'un snapshot** : le texte « tâches, jalons, risques, livrables » sous-estime le contenu réel (19 types d'objets).
48. **Projet vide** : le message « Le premier snapshot planifié aura lieu… » s'affiche même quand la planification est suspendue.
49. **Échec de snapshot** : la notification dit « Relancez-la depuis Snapshots », alors qu'il n'y a pas de relance, seulement une nouvelle capture.
50. **Purge des snapshots** : elle supprime aussi les snapshots manuels et les sauvegardes de sécurité.
51. **Capture interrompue** : une capture interrompue par un redémarrage du serveur n'est ni listée ni signalée.

**Plateforme**

52. **Modules Budget et Suivi des bénéfices** : leurs onglets ont été retirés du menu Pilotage du Cockpit le 05/10/2026. Leur effet visible se limite au composant « Budget » des rapports et à la saisie du budget ; « Suivi des bénéfices » n'a pas d'effet constaté.
53. **Compteur de destinataires** : il additionne les profils (un compte à plusieurs profils est compté plusieurs fois) et ignore les projets ciblés.
54. **Aperçu e-mail** : l'aperçu de l'éditeur ne reflète pas exactement l'e-mail mis en page réellement envoyé.
55. **« Test envoyé sur votre compte »** : le message s'affiche avant la réponse du serveur.
56. **Modèle désactivé** : une règle dont le modèle a été désactivé est signalée comme bloquée à l'écran, mais la planification tente quand même l'envoi, qui finit en « Échec ».
57. **Règle incomplète acceptée** : une règle sans projet ciblé, ou avec un prompt vide, est acceptée. Sans projet, elle n'envoie rien et ne laisse aucune trace.
58. **E-mail sans serveur SMTP** : sans serveur configuré, un e-mail est marqué « Distribué » sans être envoyé.
59. **Décision de module depuis la page Modules** : le message annonce « {demandeur} est prévenu », mais seul le passage par la cloche prévient réellement.
60. **Registre API** :
    - l'état « Clé expirée » est « À surveiller » à l'écran et « en erreur » côté serveur ;
    - le quota et le délai d'une carte ne se règlent pas à l'écran.
61. **Pastille SMTP** : « Configuré » s'affiche même sans serveur enregistré.
62. **Spécification des notifications** : elle décrit encore les alertes supprimées le 30/09/2026.
63. **Guide utilisateur** : l'écran n'affiche ni pourcentage ni étape d'indexation ; les dépôts refusés n'apparaissent pas dans la traçabilité.
64. **Partager Cockpit** : sans serveur, l'écran de démonstration propose d'autres profils (« Chef de projet », « Contributeur ») que ceux réellement créés.

**Mon profil**

65. **Préférences de notification** : les cinq interrupteurs de l'onglet Notifications sont enregistrés, mais aucun traitement ne les lit ; le verrou de la première préférence n'existe qu'à l'écran.
66. **Périmètre de la console** : la liste affichée dans l'onglet Habilitations est fixe.
67. **Changement d'e-mail** : la confirmation annonce un lien de vérification, mais l'adresse est changée immédiatement, sans lien.

## Annexe C. Fonctionnalités non documentées

Ces fonctionnalités existent dans le code mais sont désactivées, inaccessibles depuis l'écran, limitées à la démonstration ou sans effet. Elles ne sont pas décrites dans le corps du guide.

| Fonctionnalité | État |
|---|---|
| Page « Droits et habilitations » (matrice des droits, profils types, super-administrateur) | Absente du menu, code inactif |
| Préférences de notification de Mon profil (5 interrupteurs) | Enregistrées, sans aucun effet |
| Double authentification | Retirée |
| Palette de recherche | Prévue, sans bouton |
| Export d'un snapshot (fichier JSON) | Disponible côté serveur, sans bouton |
| Clôture ou archivage d'un projet | Absents de la Console (Cockpit seulement) |
| Exemple de proposition (ORION) pour le préremplissage | Disponible côté serveur, sans bouton depuis l'écran du 07/10/2026 |
| « Réinitialiser la session » de l'ancien import | Disponible côté serveur, sans bouton |
| Relance d'un envoi de notification en échec | Disponible côté serveur, sans bouton |
| Aperçu serveur d'une règle de notification | Disponible côté serveur, non utilisé |
| Variable `{semaine}` des notifications | Remplacée côté serveur, non proposée à l'écran |
| Quota et délai d'une carte API ; rotation de clé dédiée | Réglables par l'API seulement |
| Réglages de la consommation de la plateforme (délai d'inactivité, facteur et seuil des hausses) | Réglables par l'API seulement |
| Restauration d'une version du Persona | Versions conservées, aucune restauration |
| Réordonnancement des skills | Inexistant |
| Consultation ou modification du dictionnaire de données de Jev | Ligne de commande seulement ; rechargé automatiquement au démarrage |
| Mémoire de Jev, étape 2 (faits mémorisés) | Non réalisée |
| Messages d'action de Jev (redirection, récapitulatif, confirmation) | Présents à l'écran, jamais produits dans la Console |
| Catalogue des modèles et réinitialisation de l'IA | Ligne de commande seulement |
| Suppression ou renommage d'un fournisseur ; retrait d'une affectation | Inexistants |
| Filtres avancés des comptes et du journal d'audit (période, auteur, type) | Disponibles côté serveur, non exposés |
| Réinitialisation du mot de passe d'un autre utilisateur par l'administrateur | Inexistante |
| Mode démonstration (`?demo=1`), barre « États » de l'initialisation et mode développement (`?as=…`) | Réservés aux essais |
| Module « Suivi des bénéfices » | Activable, sans effet constaté dans le Cockpit |
