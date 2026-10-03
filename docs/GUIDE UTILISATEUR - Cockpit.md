# Guide utilisateur du Cockpit RISE

Version du 1er octobre 2026. Ce guide décrit le comportement réel du Cockpit, établi à partir de son code. Les écarts et les points encore ouverts sont regroupés en annexe.

## Sommaire

1. Présentation générale
2. Prise en main
3. Fonctionnalités, une par une
4. Rôles et droits
5. Paramétrage et préférences
6. FAQ et dépannage
7. Annexes : règles de gestion, points à clarifier, fonctionnalités non documentées

# 1. Présentation générale

## 1.1 À quoi sert le Cockpit

RISE comprend deux espaces :

- **le Cockpit**, où les équipes projet pilotent leur projet ;
- **la Console d'administration**, qui règle la plateforme (comptes, droits, IA, modules…).

Le Cockpit sert à :

- voir en un coup d'œil où en est le projet, grâce au tableau de bord d'**Aujourd'hui** ;
- tenir le **Pilotage** : planning, jalons, livrables, risques et problèmes, actions, décisions et fiches d'arbitrage, baromètre des équipes, séances de comité, tâches personnelles ;
- préparer les **comités** : modèles de rapport (templates) et génération des rapports ;
- conserver les documents du projet dans la **Base de connaissance**, résumés et indexés automatiquement ;
- décrire le projet dans **Info projet** : fiche projet, dispositif (ressources, équipes, organigramme, gouvernance) et **Référentiel** (données de base du projet) ;
- se faire aider par **Jev**, l'assistant IA.

Le Cockpit n'attribue aucun droit. Les comptes et les habilitations se gèrent dans la Console.

## 1.2 À qui il s'adresse

| Profil | Rôle dans le Cockpit |
|---|---|
| PMO | Tient le projet : Référentiel, fiche projet, pilotage de tous les chantiers |
| Responsable de chantier | Met à jour le suivi de ses chantiers : risques, problèmes, actions, décisions, avancement et dates de ses chantiers |
| Lecteur | Consulte les chantiers auxquels il a accès |
| Administrateur de la plateforme | Voit tous les projets et tous les chantiers, en lecture seule |
| Directeur de programme | En plus de son profil, planifie et met à jour les séances de comité |

Le détail des droits figure au chapitre 4.

## 1.3 Principes à connaître

- **Enregistrement immédiat.** Il n'y a pas de bouton « Enregistrer » dans les tableaux : chaque modification part au serveur dès qu'elle est validée (Entrée, sortie du champ, choix dans une liste). Un toast « Modifié · {votre nom} · saisie directe » le confirme.
- **Le serveur fait foi.** Si le serveur refuse une modification (droit insuffisant, règle non respectée), son message s'affiche dans un toast et l'écran recharge les données : la modification est annulée.
- **Tout est tracé.** Chaque création, modification ou suppression est inscrite au journal d'audit, champ par champ, avec son auteur.
- **Chacun voit son périmètre.** Un Responsable ou un Lecteur ne voit que les données de ses chantiers. Les jalons sans chantier restent visibles de tous.
- **Date du jour du projet.** Les retards, écarts et comptes à rebours se calculent avec la date du jour dans le fuseau horaire du projet.
- **Une valeur inconnue n'est ni zéro ni verte.** Un indicateur qui manque de données affiche « non calculé » ou un état vide, jamais une valeur inventée.

## 1.4 Glossaire

| Terme | Définition |
|---|---|
| Projet | Le programme piloté, identifié par un code (par exemple RISE) |
| Chantier | Sous-ensemble du projet avec un responsable (codes C1, C2…) |
| Lot | Périmètre de déploiement (vague) |
| Phase, sous-phase | Découpage du planning. Une sous-phase a un code de la forme « {phase}.n » (par exemple 4.5) |
| Jalon | Événement daté du planning (codes J01, J02…), avec une date prévue et une date de référence |
| Date de référence | Date du jalon dans la référence du planning. L'écart compare la date prévue à cette référence |
| Confirmation métier | Date à laquelle un métier a confirmé un jalon. Au-delà de 7 jours, elle est jugée ancienne |
| Livrable | Production attendue, rattachée à une sous-phase, avec un responsable et une échéance |
| Risque | Événement possible, noté en probabilité (P) et impact (I) de 1 à 5. Criticité = P × I |
| Problème | Difficulté avérée, notée en sévérité de 1 à 5 (codes P01…) |
| Action | Tâche de traitement avec un porteur et une échéance (codes A-01…) |
| Décision | Point à trancher par une instance (codes D-001…) |
| Fiche d'arbitrage | Dossier d'une décision : question, options, grille de critères, recommandation |
| Instance de pilotage | Comité (COPIL, comité projet…) avec ses membres et sa fréquence |
| Séance | Réunion datée d'une instance (« COPIL n°21 ») |
| Template | Modèle de rapport de comité, composé de sections |
| Base de connaissance | Bibliothèque des documents du projet, résumés et indexés |
| Référentiel | Données de base du projet : client, projet, lots, phases, chantiers, jalons, équipes, rôles, personnes, instances, livrables |
| Baromètre | Relevé mensuel du ressenti des équipes |
| Widget | Tuile du tableau de bord d'Aujourd'hui |
| Jev | L'assistant IA de la plateforme |
| Toast | Message bref qui apparaît en bas de l'écran pour confirmer ou signaler une action |

# 2. Prise en main

## 2.1 Accéder au Cockpit

- Adresse de connexion : `…/connexion`. Adresse du Cockpit : `…/`.
- Sans session valide, l'adresse du Cockpit renvoie vers la page de connexion, puis, après connexion, vers la page demandée.
- Se connecter au Cockpit n'ouvre pas la Console, et inversement : chaque espace a sa propre session.
- Il n'existe pas d'inscription libre : « Pas de compte ? Il est créé par l'administrateur de la plateforme. ».

> [Capture] Page de connexion au Cockpit.

## 2.2 Se connecter

1. Saisissez votre adresse e-mail (format `prenom.nom@entreprise.com`).
2. Saisissez votre mot de passe. L'icône en forme d'œil l'affiche ou le masque. Si la touche Verr. Maj est active, l'écran affiche « Verrouillage majuscule activé ».
3. Cliquez sur **Se connecter** (le bouton affiche « Vérification… » pendant l'appel).
4. En cas de succès, l'écran affiche « Bonjour {prénom}. » et « Connexion réussie · {vos rôles} », puis ouvre le Cockpit.

**Règles**

- Le message d'échec est toujours le même : « Identifiant ou mot de passe incorrect. ». Il ne dit pas si l'adresse existe, ni si le compte est invité ou suspendu.
- À partir du 3e échec, l'écran indique « Encore {n} tentatives avant blocage temporaire de 15 minutes. », puis « Dernière tentative avant blocage temporaire de 15 minutes. ».
- **Blocage temporaire :**
  - 5 échecs sur une même adresse e-mail bloquent la connexion 15 minutes ;
  - 20 échecs depuis un même poste (adresse IP), toutes adresses confondues, ont le même effet ;
  - sans nouvel échec, le compteur revient à zéro au bout de 15 minutes ;
  - une connexion réussie remet le compteur de l'adresse à zéro.
- Pendant un blocage, l'écran affiche « Connexion suspendue. » avec un compte à rebours et le bouton **Réinitialiser mon mot de passe**. Le formulaire revient de lui-même à la fin du compte à rebours. Définir un nouveau mot de passe lève le blocage lié à l'adresse e-mail, pas celui lié au poste.

**Messages possibles**

| Message | Cause | Que faire |
|---|---|---|
| « Saisissez votre adresse e-mail. » | Champ vide | Saisissez l'adresse |
| « Format attendu : prenom.nom@entreprise.com » | Adresse mal formée | Corrigez la saisie |
| « Saisissez votre mot de passe. » | Champ vide | Saisissez le mot de passe |
| « Identifiant ou mot de passe incorrect. » | Adresse ou mot de passe erroné, compte invité (mot de passe pas encore choisi) ou suspendu | Vérifiez la saisie ; utilisez « Mot de passe oublié ? » ; sinon, contactez l'administrateur |
| « Connexion suspendue. » | Trop d'échecs | Attendez la fin du compte à rebours, ou réinitialisez votre mot de passe |
| « Service indisponible. Réessayez dans un instant. » | Serveur injoignable | Réessayez plus tard |

## 2.3 Première connexion et invitation

- **Invitation.** Votre compte est créé par l'administrateur de la plateforme, souvent à la demande du PMO. Vous recevez l'e-mail « Invitation à RISE Cockpit » avec un lien valable **14 jours**, utilisable une seule fois.
  1. Ouvrez le lien. L'écran indique « Lien valable encore {durée} ».
  2. Saisissez un **Nouveau mot de passe**, puis la **Confirmation**.
  3. Cliquez sur **Enregistrer le mot de passe**.
  4. Le compte devient actif. L'écran affiche « Mot de passe modifié. » et vous renvoie à la connexion au bout de 6 secondes.
- Un lien déjà utilisé, expiré, ou envoyé à un compte suspendu affiche « Ce lien n'est plus valide. ». Demandez une nouvelle invitation à votre PMO ou à l'administrateur.

## 2.4 Règles du mot de passe

L'écran affiche une jauge à quatre crans et les règles suivantes :

- « 12 caractères minimum » ;
- « Majuscule et minuscule » ;
- « Au moins un chiffre » ;
- « Un caractère spécial ».

Le serveur vérifie en plus :

- 128 caractères au plus ;
- un mot de passe différent du précédent : « Le nouveau mot de passe doit être différent du précédent » ;
- un mot de passe absent des listes de mots de passe compromis : « Ce mot de passe figure dans une liste de mots de passe compromis ; choisissez-en un autre ».

Le bouton reste grisé tant qu'une règle manque ou que la confirmation diffère (« Les deux saisies ne correspondent pas. »).

## 2.5 Mot de passe oublié

1. Sur la page de connexion, cliquez sur **Mot de passe oublié ?**.
2. Saisissez l'adresse e-mail de votre compte, puis cliquez sur **Envoyer le lien**.
3. L'écran affiche toujours « Vérifiez votre messagerie. » et « Si un compte existe pour cette adresse, un e-mail vous a été envoyé. ».
4. Ouvrez le lien de l'e-mail « RISE · Réinitialisation de votre mot de passe » et choisissez un nouveau mot de passe.

**Règles**

- Le lien est valable **30 minutes** et utilisable une seule fois. Un nouveau lien annule les précédents.
- Au plus 1 envoi par minute et 5 par heure pour un même compte. Le bouton **Renvoyer** devient actif après 60 secondes.
- Rien n'est envoyé à une adresse inconnue ni à un compte suspendu, et l'écran ne le signale pas.
- Après la réinitialisation, toutes vos sessions ouvertes sont fermées.
- Pensez à vérifier vos courriers indésirables.

## 2.6 Session, inactivité et déconnexion

- **Inactivité.** Le Cockpit ferme la session après **30 minutes** sans activité (clic, frappe, défilement…). L'activité dans un autre onglet du Cockpit compte aussi.
- **Avertissement « Toujours là ? »** 60 secondes avant la fermeture, avec un compte à rebours :
  - **Rester connecté** (ou Échap) prolonge la session ;
  - **Se déconnecter** ferme la session.
- **À l'échéance**, l'écran de connexion affiche « Session expirée après 30 minutes d'inactivité. Reconnectez-vous pour continuer. ». Après reconnexion, vous revenez sur la page ouverte.
- **Se déconnecter** : survolez votre carte en bas de la barre latérale (barre dépliée) et cliquez sur l'icône **Déconnexion**. L'écran de connexion affiche « Vous êtes déconnecté. ».
- Une session peut aussi être fermée par le serveur (compte suspendu, mot de passe changé ailleurs) : le Cockpit renvoie alors à la page de connexion.

## 2.7 Se repérer dans le Cockpit

> [Capture] Cockpit complet : barre latérale, bandeau, tableau de bord d'Aujourd'hui.

**La barre latérale** (à gauche)

- **En-tête** : le logo et le bouton **Replier / déplier** la barre (68 px repliée, 272 px dépliée).
- **Projet** : le cartouche « Projet · {code} » rappelle le projet ouvert.
- **Mettre à jour mes tâches** : le bouton orange ouvre Pilotage › Mes tâches.
- **Navigation** :

| Entrée | Ouvre | Contenu |
|---|---|---|
| Aujourd'hui | Tableau de bord | Widgets, écarts, échéances |
| Pilotage | Planning | Planning, Jalons, Livrables, Risques et problèmes, Actions, Décisions, Baromètre, Comités, Budget, Bénéfices, Mes tâches |
| Comités et rapports | Générer un rapport | Générer un rapport, Créer un template, Bibliothèque, Historique |
| Base de connaissance | Bibliothèque | Documents du projet |
| Info projet | Fiche projet | Fiche projet, Dispositif, Référentiel (PMO et Administrateur) |

- **Pied de la barre** :
  - la **cloche** des notifications, avec le nombre de non lues (« 99+ » au-delà) ;
  - le bouton **Jev**, l'assistant ;
  - votre **carte** (initiales, nom, profil principal), qui ouvre **Mon profil**.

**Le bandeau de page**

- La date du jour en toutes lettres, le titre de l'espace et une phrase qui en résume l'usage.
- Les **onglets** de l'espace, sous forme de pastilles. Changer d'onglet remonte en haut de la page.
- Selon l'espace, un bouton d'action : **Personnaliser** (Aujourd'hui), **Créer un template** (Comités et rapports), **Déposer un document** (Base de connaissance).

**Recherche.** Il n'y a pas de recherche globale. Les registres (jalons, risques, problèmes, actions, décisions, mes tâches) et certaines listes du Référentiel ont leur propre champ « Rechercher ».

**Clavier**

- Entrée valide une cellule ou un petit formulaire ; Échap annule.
- Échap ferme les fenêtres flottantes, le panneau de détail et les aperçus.
- Ctrl+Entrée (Cmd+Entrée sur Mac) enregistre un commentaire de cellule.

**Affichage.** Le Cockpit est conçu pour un écran d'ordinateur (largeur minimale d'environ 1 280 pixels). Il n'a pas de version mobile.

**Changer de projet.** Le projet ouvert est indiqué dans l'adresse (`?project={code}`). Si vous avez accès à plusieurs projets, ouvrez l'adresse du projet voulu. Un projet auquel vous n'avez pas accès répond « Projet introuvable ».

# 3. Fonctionnalités, une par une

## 3.1 Aujourd'hui : le tableau de bord

**À quoi il sert.** Voir en trente secondes où en est le projet et ce qui demande votre attention. C'est l'espace ouvert à la connexion. Aujourd'hui est un **reporting** : il lit les données du Pilotage, il ne les modifie pas.

> [Capture] Aujourd'hui : bandeau d'accueil et tableau de bord.

**Le bandeau d'accueil**

- La date du jour, le titre « Aujourd'hui » et un **message d'accueil rédigé par Jev**, une fois par jour, avec le ton de sa personnalité. Il met en avant la priorité du jour, par ordre d'importance :
  - le COPIL d'aujourd'hui ou de demain ;
  - vos actions en retard ;
  - les décisions qui attendent votre arbitrage ;
  - les risques critiques qui ont changé depuis hier ;
  - le prochain COPIL, vos échéances de la semaine, les jalons de la semaine, les actions terminées hier.
- La salutation (« Bonsoir Robin, ») s'affiche sur sa propre ligne, le message en dessous ; les chiffres et les dates sont mis en relief, et la mention **Jev** signe le message qu'il a rédigé.
- Jev n'utilise que les données de vos chantiers, et aucun chiffre qui n'y figure pas ; un titre long (risque, action) est raccourci. Le message est rédigé à la première ouverture de la journée, puis reste le même jusqu'au lendemain.
- En attendant le message de Jev, ou s'il n'est pas disponible (module désactivé par l'administrateur, modèle d'IA indisponible), un message calculé s'affiche : « Bonjour {prénom}, {la priorité du jour}. », par exemple « Bonjour Cédric, 1 décision attend votre arbitrage avant le COPIL du 26 oct. »
- Le bouton **Personnaliser** (voir 3.3).

**La grille**

- Quatre colonnes de tuiles (widgets). Chaque widget a une taille fixe : 1 × 1, 2 × 1, 1 × 2 ou 2 × 2.
- Un clic sur un widget ouvre l'écran où agir. Par exemple :

| Widget | Ouvre |
|---|---|
| L'essentiel par Jev, Avancement vs référence, Chemin critique, Météo des chantiers | Pilotage › Planning |
| Compte à rebours Go-Live, Prochains jalons | Pilotage › Jalons |
| Risques critiques, Tendance des risques, Problèmes ouverts | Pilotage › Risques et problèmes |
| Décisions en attente, Fiches d'arbitrage | Pilotage › Décisions |
| Prochain COPIL | Comités et rapports › Générer un rapport |
| Actions en retard | Pilotage › Actions |
| Mes tâches | Pilotage › Mes tâches |
| Livrables sous 30 jours | Pilotage › Livrables |
| Baromètre des équipes | Pilotage › Baromètre |
| Incohérences à traiter | Aujourd'hui › Écarts |
| Échéances des 15 prochains jours | Aujourd'hui › Échéances |
| Documents récents | Base de connaissance |

- Météo, Trafic et Actualité n'ouvrent pas d'autre écran ; un titre d'actualité ouvre l'article dans un nouvel onglet.

**Disposition par défaut.** L'essentiel par Jev, Compte à rebours Go-Live, Avancement vs référence, Prochain COPIL, Fiches d'arbitrage, Décisions en attente, Tendance des risques, Baromètre des équipes, Incohérences à traiter, Météo, Trafic.

## 3.2 Les widgets, un par un

Chaque widget répond à une question. La couleur ne porte qu'un statut : bleu nuit neutre, vert sarcelle en avance ou à l'heure, ambre en léger retard, rouge en décrochage.

| Widget | Question | Ce qu'il affiche |
|---|---|---|
| L'essentiel, par Jev (2 × 2) | Où en est le projet, en trente secondes ? | Trois chiffres (J-n avant le Go-Live, avancement réel, écart au prévu), puis cinq rubriques : Avancement, Retards, Risques, Décisions, Échéances |
| Compte à rebours Go-Live (1 × 1) | Combien de temps reste-t-il avant la bascule ? | J-n, semaines et jours ouvrés restants, frise du début du projet au Go-Live avec la part du temps écoulé |
| Avancement vs référence (1 × 1) | Le projet avance-t-il au rythme prévu ? | Avancement réel moyen et écart en points au prévu, sur un anneau |
| Prochains jalons (2 × 1) | Quelles sont les prochaines échéances et glissent-elles ? | Les 3 prochains jalons sur une ligne : jours entre deux étapes, date, nom, « à l'heure » ou « +n j de glissement » |
| Chemin critique (2 × 1) | Quelles tâches conditionnent la date de fin ? | Les 4 premières sous-phases critiques en barres : grises si terminées, rouges en cours, bleu nuit à venir |
| Météo des chantiers (2 × 1) | Quels chantiers décrochent ? | Par chantier : pictogramme (soleil à l'heure, éclaircie jusqu'à −10 pts, pluie au-delà), barre du réel, retard hachuré jusqu'au prévu, écart en points |
| Risques critiques (1 × 2) | Quels risques menacent le projet maintenant ? | Matrice probabilité × impact des risques ouverts, puis les 4 plus exposés |
| Tendance des risques (1 × 1) | L'exposition au risque augmente-t-elle ? | Courbe des risques ouverts sur 8 semaines, dont critiques |
| Problèmes ouverts (1 × 1) | Quels problèmes bloquent aujourd'hui ? | Nombre de problèmes ouverts, histogramme des sévérités S1 à S5, les plus graves |
| Décisions en attente (2 × 1) | Que doit trancher le prochain comité ? | Nombre de décisions à trancher, les 3 plus anciennes avec leur durée d'attente (ambre dès 14 jours, rouge dès 30), prochaine instance |
| Fiches d'arbitrage (1 × 1) | Combien d'arbitrages restent à instruire ? | Fiches ouvertes, réparties entre « à arbitrer » et « en instruction » |
| Prochain COPIL (1 × 1) | Le support du prochain comité est-il prêt ? | Page de calendrier, « dans n j », instance, heure, lieu, état du support |
| Actions en retard (1 × 1) | Quelles actions ont dépassé leur échéance ? | « n en retard sur m actions ouvertes », les 2 plus en retard |
| Mes tâches (1 × 1) | Qu'ai-je à faire aujourd'hui ? | Nombre de tâches, validations et retards, les 2 prochaines tâches |
| Livrables sous 30 jours (1 × 1) | Quels livrables doivent être remis ce mois-ci ? | Livrables à remettre sous 30 jours, en retard, part livrée |
| Baromètre des équipes (1 × 1) | Comment les équipes vivent-elles le projet ? | Courbe du ressenti moyen, nombre de répondants du dernier relevé |
| Incohérences à traiter (2 × 1) | Quelles informations manquent ou se contredisent ? | Nombre de blocages et d'avertissements, les 3 premières incohérences avec l'action proposée |
| Échéances des 15 prochains jours (2 × 1) | Qu'est-ce qui tombe dans les quinze jours ? | Ruban de 15 jours : ● comité, ◆ jalon, ■ arbitrage ; les deux prochaines journées chargées en clair |
| Documents récents (1 × 2) | Quelles nouvelles pièces sont arrivées ? | Les 5 derniers documents (format, titre, type, version, date, pages), répartition par format |
| Météo · {ville} (1 × 1) | Quel temps fait-il sur le site du projet ? | Température, ciel, minimum et maximum, lever et coucher du soleil |
| Trafic · {ville} (1 × 1) | Combien de temps pour rejoindre le site ? | Durée du trajet en voiture avec le trafic, retard éventuel, bouton **Inverser le sens** |
| Actualité (2 × 2) | Quels sont les faits marquants de l'actualité ? | Un titre à la une et les 5 suivants, source et âge |

**Règles de calcul utiles**

- **Go-Live** : date prévue du projet, sinon date du jalon de Go-Live. Sans date : « date non définie ».
- **Écart d'avancement** : vert à 0 ou au-dessus, ambre jusqu'à −10 points, rouge au-delà.
- **Risque critique** : criticité P × I d'au moins 20. Dans la matrice, la zone rouge commence à 15 et la zone ambre à 8.
- **Action en retard** : action non terminée dont l'échéance est passée.
- **Support du prochain COPIL** : « Support vX publié », « Support vX · {statut} », ou « Support à préparer » (rouge à 7 jours ou moins de la séance).
- **Météo et trafic** : la ville du projet vient du Référentiel (objet Projet), sinon Paris. Le départ du trajet est la **Ville de résidence** de Mon profil, sinon Paris.
- **Actualité** : titres des sources d'actualité actives du Registre des cartes API (réglées dans la Console), du plus récent au plus ancien, sans doublon. Une source en panne n'empêche pas les autres.
- **Données externes** : les réponses sont gardées 2 minutes (météo, trafic) à 30 minutes (actualité). En cas de panne, la dernière réponse valable (24 h au plus) est affichée ; sinon « Météo indisponible », « Trafic indisponible » ou « Actualité indisponible (connexion requise) ».

## 3.3 Personnaliser le tableau de bord

1. Cliquez sur **Personnaliser**. Le bouton devient **Terminer** et la grille passe en mode édition : « Glissez pour réorganiser · × pour retirer ».
2. Selon le besoin :
   - **déplacer** un widget : glissez-le par sa poignée ; un emplacement en pointillés indique « Relâchez pour déposer » ;
   - **retirer** un widget : cliquez sur × (« Widget retiré · il retourne dans la bibliothèque ») ;
   - **ajouter** un widget : dans l'onglet **Widgets à l'unité** du panneau du bas, glissez-le sur la grille ou double-cliquez dessus (« Widget ajouté · {nom} ») ;
   - **appliquer un mode** : dans l'onglet **Modes de pilotage**, choisissez une disposition toute prête (« Un mode remplace la disposition · annulable 5 s ») ;
   - **revenir à la disposition par défaut** : lien **Disposition par défaut**.
3. Cliquez sur **Terminer** (« Disposition enregistrée »).

**Les modes de pilotage**

| Mode | Public | Widgets |
|---|---|---|
| Pilotage stratégique | Direction, sponsor | L'essentiel, Go-Live, Avancement, Prochain COPIL, Fiches d'arbitrage, Décisions, Tendance des risques, Baromètre |
| Trajectoire et planning | PMO, direction de projet | Chemin critique, Jalons, Météo des chantiers, Go-Live, Avancement, Livrables, Actions en retard, Problèmes, Mes tâches |
| Maîtrise des risques | PMO, responsables de chantier | Risques critiques, L'essentiel, Tendance, Problèmes, Actions en retard, Décisions, Fiches d'arbitrage |
| Préparation du comité | Direction de projet, secrétariat COPIL | Prochain COPIL, L'essentiel, Risques critiques, Fiches d'arbitrage, Décisions, Jalons |
| Mon quotidien | Responsables de chantier, key users | Mes tâches, Actions en retard, Livrables, Go-Live, Jalons, Météo des chantiers, Problèmes, Avancement, Chemin critique |

**Couleurs d'une tuile.** Au survol d'un widget, l'icône demi-cercle bascule la tuile entre thème clair et thème sombre. Par défaut, Go-Live et Avancement sont en sombre, Météo et Trafic en clair.

**Widgets et modes réservés aux modules.** « Consommé vs budget », « Atterrissage financier », « Bénéfices attendus », « Trajectoire des bénéfices » et les modes « Pilotage par les coûts » et « Pilotage par la valeur » sont verrouillés tant que le module Budget ou Bénéfices n'est pas activé. Un clic propose **Demander l'activation** (voir 3.13).

**Règles**

- La disposition et les couleurs sont enregistrées pour votre compte, sur le serveur, à chaque changement. Vous les retrouvez sur un autre poste.
- La taille d'un widget n'est pas modifiable.

## 3.4 Aujourd'hui : écarts et échéances

Ces deux vues s'ouvrent depuis les widgets **Incohérences à traiter** et **Échéances des 15 prochains jours**. Pour revenir au tableau de bord, cliquez sur **Aujourd'hui** dans la barre latérale.

**Écarts**

- **Écarts planning — prévu − référence** : un jalon par ligne, écart en jours (positif = retard). Couleur : vert à 0, ambre au-delà, rouge foncé au-delà de 30 jours. Un clic ouvre la fiche du jalon.
- **Écarts d'avancement — réalisé − attendu à ce stade** : par ligne de suivi, réel − prévu en points. Couleur : vert à 0 ou plus, ambre en dessous, rouge foncé sous −20.

**Échéances**

- Les 10 prochaines échéances, de 7 jours en arrière à 45 jours en avant, triées par date :
  - **jalon** : « À revoir » si sa dernière confirmation date de plus de 14 jours, sinon « +n j » de glissement ou « Conforme » ;
  - **action** non terminée : son statut (« À faire », « En cours », « Bloquée ») ;
  - **séance du COPIL** : « Aujourd'hui » ou « J-n ».
- Un clic ouvre la fiche de l'objet, ou Pilotage › Comités pour une séance.

**Les incohérences**

Le serveur contrôle le projet à chaque chargement. Rien n'est stocké : une incohérence disparaît dès que sa cause est corrigée. Vous ne voyez que celles de vos chantiers.

| Incohérence | Niveau | Quand | Action proposée |
|---|---|---|---|
| « Risque {code} (critique, {score}) sans plan de mitigation » | Blocage | Risque ouvert de criticité ≥ 20 sans plan | Qualifier |
| « Jalon « {nom} » non confirmé depuis {n} jours » | Avertissement au-delà de 7 jours, Blocage au-delà de 14 | Jalon à venir dont la confirmation métier est ancienne | Confirmer |
| « Budget programme non renseigné : la slide « Budget » affichera « non évalué » » | Avertissement | Module Budget sans budget programme | Renseigner |
| « {n} modifications du projet depuis la capture du {date} » | Avertissement | Le projet a changé depuis le dernier rapport de comité | Régénérer |
| « Action {code} échue le {date} : {titre} » | Blocage | Action non terminée, échéance passée | Relancer |

**Exemple.** Le risque R03 passe à P = 4, I = 5 (criticité 20) sans plan. Le widget Incohérences affiche un blocage « Risque R03 (critique, 20) sans plan de mitigation ». Le Responsable du chantier saisit le plan dans Pilotage › Risques : le blocage disparaît au chargement suivant.

## 3.5 Pilotage : principes communs

**À quoi il sert.** Tenir le suivi du projet. Pilotage compte onze onglets : Planning, Jalons, Livrables, Risques et problèmes, Actions, Décisions, Baromètre, Comités, Budget, Bénéfices, Mes tâches.

**Modifier une donnée existante**

- Directement dans le tableau : texte modifiable au clic, listes déroulantes, calendrier pour les dates.
- Entrée valide, Échap annule. Le toast « Modifié · {nom} · saisie directe » confirme l'enregistrement.
- Clic droit sur une cellule modifiable : ajouter un commentaire (Ctrl+Entrée pour l'enregistrer).

**Créer un élément**

1. Cliquez sur l'icône **Demander à Jev** du bloc concerné (par exemple le registre des risques).
2. Dans le panneau de Jev, décrivez ce que vous voulez faire, ou cliquez sur **Saisir sans Jev** pour ouvrir le formulaire.
3. Remplissez le formulaire latéral et cliquez sur **Créer le / la …** (ou **Enregistrer** pour une modification).

Le formulaire dépend de l'onglet : jalon, livrable, risque, problème, action, fiche décision ou fiche d'arbitrage, élément de planning ou ligne d'avancement, relevé du baromètre, séance, tâche. Sur une ligne existante, **Modifier sans Jev** ouvre le même formulaire prérempli.

**Règles communes**

- Un titre vide est refusé : « Ce champ est obligatoire. ».
- Les codes (R01, A-01, D-001, J01…) sont attribués par le serveur.
- Le pied du formulaire rappelle que la saisie est tracée : « Créé(e) par {nom} · tracé(e) » ou « Modification tracée · {nom} ».
- Un Responsable ne crée que sur ses chantiers : « Donnée à rattacher à l'un de vos chantiers » (avec la liste des chantiers autorisés).
- Sans droit sur la donnée, l'écran affiche « Droit insuffisant : seul le PMO ou le Responsable du chantier peut modifier cette donnée ».
- Le Pilotage ne propose pas de suppression. Une action se termine, un risque se clôt, une décision s'annule.

## 3.6 Planning

**À quoi il sert.** Voir le planning des phases, sous-phases et chantiers, et suivre leur avancement.

**Bandeau « Temps restant au {date} »** : jours avant la fin du projet, avant la fin de chaque phase en cours, avant la fin de chaque chantier en cours (mis en évidence sous 30 jours). Le bouton **Indicateurs affichés** choisit ceux qui apparaissent.

**Gantt**

- Lecture seule : il est alimenté par le Référentiel.
- Niveau : Phases (par défaut), Phases et sous-phases, Sous-phases, Tous les chantiers, ou un chantier.
- Options : Jalons, Date du jour, Chemin critique, % prévu, % réel, Atterrissage au rythme actuel, Atterrissage au rythme prévu. Par défaut : Jalons, Date du jour, % prévu et % réel.
- Un losange de jalon est orange si l'un des jalons regroupés glisse.

**Tableau « Suivi d'avancement »**

- Colonnes : Phase, Sous-phase, Chantier, Responsable, Début, Fin, Prévu, Réel, Retard, Atterr. rythme actuel, Atterr. rythme prévu.
- Vous pouvez modifier les dates (calendrier), le % réel (de 0 à 100) et le responsable.

**Calculs**

| Valeur | Calcul |
|---|---|
| % prévu | Temps écoulé ÷ durée × 100, borné entre 0 et 100, sauf valeur forcée |
| Statut | Terminé si réel ≥ 100 ; à venir si le début est après aujourd'hui ; sinon en cours |
| Retard (j) | (prévu − réel) / 100 × durée, pour un élément en cours. « À l'heure » si 0 ; ambre au-delà ; rouge au-delà de 30 jours |
| Atterrissage au rythme actuel | Aujourd'hui + jours écoulés × (100 − réel) / réel |
| Atterrissage au rythme prévu | Aujourd'hui + (100 − réel) / 100 × durée |

À côté de chaque atterrissage : « +n j vs fin » ou « dans les temps ».

**Droits.** Le PMO modifie tout. Le Responsable modifie les dates et le % réel de son chantier. Seul le PMO change le responsable.

**Créer un élément de planning** (PMO) : type (Phase, Sous-phase, Chantier), nom, phase de rattachement pour une sous-phase, dates, % prévu (vide = calculé), % réel, responsable. L'élément est ajouté au Référentiel.

| Message | Cause |
|---|---|
| « Renseignez la date de début et la date de fin » | Date manquante |
| « La date de fin précède la date de début » | Période inversée |
| « Seul le PMO peut modifier ces dates ; le Responsable d'un chantier modifie celles de son chantier » | Droit insuffisant |
| « Seul le PMO modifie le porteur et la criticité » | Changement de responsable par un non-PMO |
| « Le Référentiel est modifiable par le PMO uniquement » | Création par un non-PMO |

## 3.7 Jalons

**À quoi il sert.** Suivre les jalons et leur glissement par rapport à la référence.

**Frise « Ordonnancement des jalons »** : « N jalons · X passés · Y en glissement · prochain dans Z j ». Le prochain jalon est marqué « Prochain jalon » avec « J−n ».

**Tableau « Jalons — prévision vs référence »**

- Colonnes : Jalon, Prévu, Référence, Écart, Porteur, Chantier, Confirmation métier. 5 lignes, puis **Voir plus**.
- Filtres : chantier, porteur, « En retard sur la référence ». Tris : date prévue, écart, porteur, chantier. Recherche sur le libellé.

**Calculs**

- **Écart** = date prévue − date de référence, en jours (« +n j », « −n j », « 0 j »). Vert à 0, ambre au-delà, rouge au-delà de 30 jours.
- **Confirmation métier** : « aujourd'hui », « il y a n j », ou « non confirmé · n j » au-delà de 7 jours. Au-delà de 7 jours, le jalon à venir devient un avertissement des incohérences ; au-delà de 14, un blocage.
- **Modifier la date prévue vaut confirmation** : la confirmation métier passe à aujourd'hui.

**Créer un jalon** (PMO) : libellé, **phase** (obligatoire), sous-phase, chantier, porteur, date prévue, date de référence (identique à la date prévue si vide). L'écran affiche l'« Écart calculé ».

| Message | Effet |
|---|---|
| « Rattachez le jalon à une phase (obligatoire) » | Bloquant |
| « La sous-phase n'appartient pas à la phase choisie » | Bloquant |
| « La date prévue sort de la période de la phase X (début → fin). Enregistrement possible. » | Simple avertissement |

**Droits.** Les jalons appartiennent au Référentiel : seul le PMO les crée et les modifie.

## 3.8 Livrables

**À quoi il sert.** Suivre la production des livrables et leur risque de délai.

**En-tête** : part livrée, livrables validés, en production, en retard, à venir, et « N à livrer sous 30 jours ».

**Plan de livraison** (lecture seule) : regroupé par phases, sous-phases ou chantiers. Filtres : À produire (par défaut), Critiques, Validés, Tous.

**Suivi d'avancement** : Livrable, Responsable, Début, Fin, Retard, Avancement (%), Risque délai.

**Statut d'un livrable**

| Statut | Condition |
|---|---|
| Validé | Avancement ≥ 100 % |
| En retard | Échéance dépassée |
| En production | Commencé, ou avancement > 0 |
| À venir | Sinon |

**Risque délai automatique**

- En retard : Critique.
- En production : écart = part du temps écoulé − avancement. Au-delà de 18 points : Critique ; au-delà de 6 : Sous tension ; sinon Maîtrisé.
- Vous pouvez forcer le risque (Maîtrisé, Sous tension, Critique) : un badge « manuel » l'indique. Revenez à « Automatique » pour reprendre le calcul.
- Sans dates propres, un livrable prend celles de sa sous-phase.

**Créer un livrable** (PMO) : nom, sous-phase (les dates en découlent), chantier ou « Non rattaché (transverse) », équipe, avancement, risque délai, responsable de production. Toast : « Livrable créé · {code} · ajouté au Référentiel ».

## 3.9 Risques et problèmes

**Registre des risques**

- Colonnes : #, Risque, P, I, Crit., Plan de mitigation, Porteur et chantier, Échéance.
- Filtres : niveau (Critique, Élevé, Modéré), chantier, « Sans plan ». Un plan vide s'affiche « Aucun plan approuvé — à qualifier ».

**Criticité = P × I**

| Niveau | Score | Suivi recommandé |
|---|---|---|
| Critique | ≥ 20 | Revue COPIL, plan sous 5 jours |
| Élevé | 12 à 19 | Suivi hebdomadaire en comité projet |
| Modéré | 6 à 11 | Suivi en comité de chantier |
| Faible | < 6 | Suivi en comité de chantier |

L'onglet affiche aussi la **matrice P × I** et l'**évolution sur 8 semaines** (risques ouverts et critiques en fin de semaine).

**Créer un risque** : libellé, probabilité et impact (1 à 5, 3 par défaut, criticité calculée), plan de mitigation, porteur, chantier, échéance. Le risque est créé au statut Ouvert. Statuts possibles : Ouvert, En mitigation, Clos.

**Problèmes ouverts**

- Filtres : sévérité 5, 4, 3 et moins, chantier, « Échéance dépassée ». Tris : sévérité, résolution, porteur, chantier.
- Créer un problème : libellé, sévérité (1 à 5), détail, porteur, chantier, résolution visée. Statuts : Ouvert, En résolution, Résolu.

**Droits.** PMO, et Responsable pour ses chantiers. Seul le PMO change le porteur et la criticité d'un objet existant.

**Clore un risque ou un problème.** Demandez-le à Jev (par exemple « R03 est mitigé » ou « clore P02 »), puis validez sa proposition (voir 3.19).

## 3.10 Actions

**Registre des actions**

- Colonnes : #, Action, Porteur, Échéance, Statut, Origine.
- Filtres : statut (À faire, En cours, Bloquée, Terminée), porteur, « Échues ».
- Statut modifiable par le menu de la ligne : toast « {id} · statut « X » enregistré ».

**Règles**

- Une action est **en retard** si elle n'est pas terminée et que son échéance est passée. Elle apparaît alors dans les incohérences (« Relancer ») et dans le widget Actions en retard.
- Passer à « Terminée » enregistre la date de clôture ; rouvrir l'action l'efface.

**Créer une action** : libellé, statut, porteur, échéance, origine (« Aucune (saisie directe) » ou un risque, un problème, une décision, un jalon). Une action liée à une origine prend le chantier de celle-ci ; sinon, le chantier transverse « Pilotage et transverse ».

## 3.11 Décisions et fiches d'arbitrage

**Registre des décisions**

- Vues : Ouvertes (par défaut), Clôturées (Arbitrée, Annulée, Remplacée), Toutes.
- Par défaut, les 5 fiches ouvertes les plus prioritaires, puis « Afficher N autres fiches ouvertes ».
- Filtres : priorité, instance, chantier ; recherche ; **Réinitialiser**.
- Colonnes : ID, Point de décision, Priorité (Critique, Haute, Moyenne, Basse), Fiche d'arbitrage, Statut, Option choisie, Date de décision (« En attente » tant que la fiche est ouverte), Chantier, Instance, Date de création.

**Cycle de vie**

| Statut | Signification |
|---|---|
| Brouillon | Fiche en cours de rédaction |
| En instruction | Analyse en cours |
| À arbitrer | Prête pour l'instance |
| Arbitrée | Décision prise : la fiche passe en lecture seule |
| Annulée | Décision abandonnée |
| Remplacée | Décision remplacée par une autre, arbitrée depuis |

**Règles**

- Clôturer (Arbitrée, Annulée) sans date pose la date du jour ; rouvrir l'efface.
- Une décision arbitrée doit porter son texte : « Une décision arbitrée doit porter le texte de la décision ».
- Une fiche arbitrée ne se modifie plus : « Fiche arbitrée : lecture seule ».
- Quand une décision qui en remplace une autre est arbitrée, l'ancienne passe à « Remplacée ».

**La fiche d'arbitrage**

- Titre, question, contexte, options A et B.
- **Grille de critères** : poids de chaque critère, note de 1 à 4 et constat pour chaque option. Score pondéré = Σ poids / 100 × note, sur 4. La somme des poids doit faire 100 % ; sinon l'écran affiche « Total des poids : X % ».
- **Recommandation PMO** et **Décision attendue**, compte à rebours avant la prochaine séance.
- Une fiche arbitrée porte le sceau « ARBITRÉE · date · OPTION RETENUE ».

**Créer une fiche** : libellé du point de décision, priorité, référence de la fiche, statut, chantier, instance (sa description et sa fréquence s'affichent). Pour une fiche d'arbitrage complète, ajoutez au moins un critère : « Ajoutez au moins un critère à la grille d'analyse ». Toast : « Fiche d'arbitrage créée · FA-0xx · D-0yy ». Une fiche compte au plus 6 options et 20 critères.

## 3.12 Baromètre

**À quoi il sert.** Suivre chaque mois le ressenti des équipes.

**Ce qui est affiché**

- « Ressenti · {mois} » : note moyenne sur 10, écart avec le mois de comparaison, nombre de répondants.
- Courbe des 7 derniers mois ; vous choisissez les deux mois comparés (A et B). Un commentaire automatique qualifie l'évolution (« repli après … », « reprise, sans retrouver le niveau de … »).
- **Comparateur par domaine** : « Un domaine à moins de 3 répondants est signalé : sa moyenne n'est pas représentative. »
- Répartition du ressenti négatif / neutre / positif, autres questions, thèmes des verbatims (positif, vigilance, alerte).

**Saisir un relevé mensuel** : mois (après le dernier relevé), moyenne de 1 à 10, répondants, répartition en %, notes par domaine, questions, thèmes.

| Message | Cause |
|---|---|
| « Choisissez un mois. » | Mois manquant |
| « Renseignez la moyenne du ressenti » | Moyenne manquante |
| « La répartition doit totaliser 100 % » | Somme des pourcentages ≠ 100 |
| « Renseignez la valeur de chaque question » | Question sans valeur |

Modifier un pourcentage de la répartition réajuste les deux autres pour garder 100 %.

**Droits.** PMO, ou Responsable du chantier transverse : « Baromètre : PMO ou Responsable du chantier transverse ».

## 3.13 Comités (séances), Budget et Bénéfices

**Calendrier des séances**

- Calendrier mensuel, une couleur par instance.
- Une séance planifiée dont la date est passée est entourée en orange : elle est à confirmer.
- Un clic sur un jour liste ses séances : heure, lieu, statut, participants, rapport (« Générer le rapport » ou « Rapport vN · statut ») et bouton **Confirmer**.
- Glissez une séance planifiée vers un autre jour pour la déplacer (« Seule une séance planifiée peut être déplacée »).

**Planifier une séance** : instance, date, heure, lieu. Le numéro et les participants sont attribués automatiquement (« Numéro attribué : n°N · participants : X membres de l'instance »). Toast : « Séance planifiée · {instance} n°N ».

**Règles**

- Droits : PMO et directeur de programme (« Séances : PMO et directeur de programme »).
- « Une séance tenue ne peut plus changer de statut ».
- « Une séance future ne peut pas être confirmée ».
- « Une séance annulée doit d'abord être rétablie ».
- « Seules les séances planifiées peuvent changer de date ».

**Budget et Bénéfices**

Ce sont des **modules optionnels**, activés projet par projet par l'administrateur de la plateforme.

1. Ouvrez l'onglet Budget ou Bénéfices : « Le module … n'est pas activé pour votre projet ».
2. Cliquez sur **Demander l'activation** (PMO ou Responsable).
3. Toast : « Demande d'activation envoyée à l'administrateur du projet ». L'écran affiche « Demande enregistrée ».
4. La réponse de l'administrateur arrive dans la cloche des notifications : « Demande de module acceptée » ou refus.

Une seule demande par module peut être en attente.

## 3.14 Mes tâches

**À quoi il sert.** Réunir ce que vous avez personnellement à faire.

**Ce que la liste contient**

| Source | Libellé | Action attendue |
|---|---|---|
| Vos actions non terminées | Titre de l'action, « Action A-xx · en retard » si échue | Ouvrir |
| Les décisions dont vous êtes le décideur, en instruction ou à arbitrer | « Arbitrer D-xxx · … » | Valider |
| Vos jalons des 45 prochains jours | « Confirmer le jalon Jxx · … » | Mettre à jour |
| Vos tâches personnelles | Titre saisi | Au choix |

**Ce que vous pouvez faire**

- **Créer une tâche** : titre (obligatoire, 300 caractères au plus), détail, échéance, action attendue. Toast « Tâche créée · … ». Une tâche personnelle n'est visible que de vous.
- **Modifier** le titre, le détail, l'échéance et l'action attendue (Ouvrir, Relancer, Qualifier, Renseigner, Mettre à jour, Valider). Ces modifications sont personnelles : elles ne changent pas l'action, la décision ou le jalon d'origine.
- **Archiver** une tâche : bandeau « « {titre} » archivée » avec **Annuler** pendant 5 secondes. Les archives se consultent et se restaurent (« Tâche restaurée »).
- Le bloc **validations attendues** liste les décisions à arbitrer par priorité, avec **Créer une tâche de préparation** et **Demander à Jev**.

Le bouton orange **Mettre à jour mes tâches** de la barre latérale ouvre directement cet onglet.

## 3.15 Comités et rapports

**À quoi il sert.** Préparer les rapports de comité à partir de modèles (templates). Quatre onglets : Générer un rapport, Créer un template, Bibliothèque, Historique.

**Droits.** PMO et Responsables créent des templates et génèrent des rapports. Les Lecteurs et l'administrateur consultent.

### 3.15.1 Générer un rapport

1. Dans **Séance du rapport**, choisissez la séance (séances planifiées à venir, 30 au plus). L'écran indique « Le rapport généré sera rattaché à cette séance ({instance}, N participants). ».
2. Dans **Templates actifs**, regroupés par comité, sélectionnez un template. La **Prévisualisation** montre ses sections numérotées et leur nombre de pages.
3. Cliquez sur **Télécharger le rapport** (ou **Générer et télécharger le rapport** sur la ligne du template).
4. La fenêtre « Rapport généré » propose de le verser dans la Base de connaissance :
   - **Oui, verser** : le rapport est enregistré et rattaché à la séance, au statut Brouillon, avec une version (v1, v2… selon les rapports déjà rattachés à la séance) ;
   - **Non, télécharger seulement** : rien n'est enregistré.

**Règles**

- Seuls les templates publiés et actifs sont proposés.
- Sans séance planifiée : « Aucune séance planifiée : planifiez-en une dans Pilotage › Comités. ».
- Par défaut, le relecteur est vous, et le validateur est le directeur de programme.
- Un rapport passe de Brouillon à En relecture, puis Publiée. « Un rapport publié ne revient pas en arrière ».
- Un template désactivé ne se génère plus : « Template inactif ».
- La génération est tracée et inscrite à l'historique.

Le téléchargement contrôle d'abord les données (voir « Contrôle avant génération » en 3.15.2), puis enregistre sur votre poste le PowerPoint du template rempli avec les données du jour : couverture, une page intercalaire par section, une page par composant, page de clôture. Un template sans format utilise la présentation par défaut de RISE.

### 3.15.2 Créer un template

Le bouton **Créer un template** du bandeau ouvre un assistant en six étapes.

1. **Fiche d'identité** : nom (obligatoire, 200 caractères), comité de rattachement, numéro de version (1.0 par défaut), auteur, description. Sans nom : « Renseignez au moins le nom du template. ».
2. **Format du rapport** : chargez un modèle pour chacun des 4 types de page : **page de couverture** (première diapositive), **page intercalaire** (transition entre deux sections), **page standard** (contenu : texte, tableaux, graphiques) et **page de clôture** (dernière diapositive). Les 4 pages sont obligatoires.
   - Format recommandé : **.pptx**. Chargez un fichier pour chaque page depuis la zone de chargement de son panneau (ou glissez-déposez-le sur la vignette ou l'aperçu). Un même fichier peut servir aux 4 pages : s'il compte 4 diapositives ou plus, la diapositive de chaque type est proposée (1, 2, 3 et la dernière) ; changez-la dans sa liste si besoin. L'icône corbeille en haut à droite d'une vignette retire la page chargée ; **Remplacer** et **Supprimer** restent disponibles dans le panneau de la page.
   - PDF, PNG et JPEG sont acceptés en complément, avec une extraction moins précise : depuis un PDF, les fonds, aplats et textes sont repris, pas les images ; une image sert de fond plein écran et les zones de texte sont estimées.
   - **Séquence des 4 pages** : chaque vignette montre la page et son statut, « À vérifier » ou « Vérifiée ». Un clic ouvre la page dans l'espace de travail.
   - **Espace de travail** : l'aperçu de la diapositive porte ses zones — contour vert plein : zone de données, qui reçoit le texte du rapport avec sa mise en forme ; hachuré rouge : contenu d'exemple, retiré de chaque rapport (sur la page standard, sa place reçoit les tableaux et graphiques) ; design fixe : visible au survol. Le survol d'une zone met en évidence sa ligne dans « Zones de la page », et inversement ; une étiquette affiche son rôle. La légende compte les zones de chaque catégorie.
   - **Zones de la page** (pages PowerPoint) : un rôle par forme, proposé par l'IA (sinon par règles) : **Design fixe (gardé)**, **Contenu d'exemple (retiré)**, **Titre**, **Sous-titre**, **Nom** ou **Numéro de la section**, **Date du rapport**, **Période des données**, **Nom du projet**, **Client**, **Comité**, **Numéro de page**, **Mention de bas de page (gardée)**. Dès qu'un rôle diffère de la proposition, **Rétablir la proposition de l'IA** remet les rôles proposés pour la page. Une couverture, une intercalaire ou une page standard sans zone de titre est refusée (« désignez la zone de titre »).
   - Sous l'aperçu : le fichier (Remplacer, Supprimer ; liste des diapositives quand le fichier en a plusieurs), la fiche technique (format, fond, éléments, zones, polices, titres, texte, marges) et les couleurs détectées (code au survol).
   - **Marquer comme vérifiée** valide la page ; le bandeau compte les pages vérifiées. **Valider le format** passe à l'étape suivante quand les 4 pages sont chargées, sans erreur et vérifiées ; sinon il ouvre la page à reprendre. **Étape précédente** revient à la Fiche d'identité.
   - **Remplacer** charge un autre fichier ; **Supprimer** vide la carte.
   - Messages d'erreur (en rouge, la page n'est pas retenue) : « Format non pris en charge », « Ancien format PowerPoint (.ppt) », « Le contenu ne correspond pas à l'extension », « Fichier PowerPoint illisible ou endommagé », « Ce fichier est protégé par un mot de passe », « Image trop petite », et, si les dimensions diffèrent entre les pages PowerPoint, « Les 4 pages doivent avoir le même format ».
   - Alertes (en orange, la page est retenue) : « Police introuvable » (police ni standard d'Office, ni incorporée au fichier : à installer sur les postes, ou à incorporer), zone de titre, de contenu ou de pagination absente, extraction partielle d'un PDF ou d'une image.
3. **Composants** : choisissez parmi Synthèse de situation, Planning, Jalons, Risques et problèmes, Actions, Décisions, Baromètre du projet, Tableau de bord, Budget. Chaque carte indique la nature du composant (Gantt, Frise, Matrice et tableau, Échéancier, Arbitrages, Tableau de bord, Indicateurs, Indicateurs et texte…). Chaque composant devient une page du rapport. Sans composant : « Sélectionnez au moins un composant. ». Le composant **Budget** n'est disponible que si le module Budget est activé pour le projet dans la Console : sinon sa carte porte un cadenas et la mention « Module Gestion du budget non activé ».
4. **Ordre, sections et données** :
   - **Ordre** : boutons Monter / Descendre.
   - **Sections** : le rail à gauche de la liste matérialise les chapitres. Chaque section commence par un repère numéroté, « SECTION n · INTERCALAIRE » et son titre (facultatif ; par défaut, le nom de son premier composant). Entre deux composants, survolez le point du rail : **+ Nouvelle section à partir d'ici** fait commencer une section au composant suivant. Un clic sur le repère numéroté d'une section (à partir de la section 2) la rattache à la section précédente.
   - **Ordre** : saisissez un composant par sa poignée (six points, devant son numéro) et déposez-le au-dessus ou au-dessous d'un autre ; un trait vert indique l'emplacement. Les numéros sont recalculés ; les coupures de section restent à leur place.
   - **Données** : pour chaque composant, les **indicateurs** (pastilles à activer, compteur « actifs / total »), le **périmètre** (Projet, Vague, Phase ou Chantier) et sa **cible** (« Projet entier », ou la liste des vagues, phases ou chantiers du projet), la **période** proposée pour ce composant (par exemple 3, 6 ou 12 derniers mois pour le baromètre) ou « Situation du jour ». La période est recalculée à chaque publication.
   - Le panneau **Déroulé du rapport** montre en temps réel la couverture, chaque section avec ses composants numérotés, puis la clôture.
5. **Prévisualisation** : dès l'arrivée, l'écran montre le nombre de pages, leurs numéros et libellés et la structure du document ; une carte suit la construction (format de l'étape B appliqué, données du jour collectées, pages générées · n / N, contrôle des données) et chaque page apparaît dès qu'elle est prête. Survolez une page pour la retrouver dans la structure ; cliquez-la pour l'agrandir (‹ ›, flèches du clavier, Échap pour fermer). Une alerte du contrôle marque sa page d'un point ambre ; « Voir la page NN » l'ouvre. « Suivant › » s'active à la fin de la construction. Le rapport complet est construit avec le format de l'étape 2, les données du jour et les textes rédigés par l'IA (titre-message de chaque page, synthèse) : couverture, intercalaires, une page par composant, clôture, en vignettes. L'encadré **Contrôle des données** liste les anomalies : en orange, une donnée manquante ou incohérente (ex. « Budget : budget du programme non connu », « Jalons : date de référence manquante »), en rouge une anomalie bloquante (ex. périmètre qui n'existe plus). Le contrôle visuel automatique signale aussi un élément qui recouvre un texte du modèle, un texte trop long pour sa zone ou un élément qui sort de la page. Revenez aux étapes précédentes pour corriger le design, les composants, l'ordre ou les données : l'aperçu se reconstruit à votre retour.
6. **Publication** : le récapitulatif indique le format, les sections, le nombre exact de pages et le contrôle des données. **Valider et publier** génère le **PowerPoint de référence** du template (version 1) : structure figée, design de l'étape 2 et zones de données. Le template devient actif, rejoint la Bibliothèque et devient sélectionnable dans « Générer un rapport ». La publication est impossible tant qu'une anomalie bloquante subsiste. Toast : « Template publié · {nom} v{version} — PowerPoint de référence généré, actif dans {comité} ».

**Publications suivantes.** Chaque rapport généré rouvre le PowerPoint de référence et n'en change que les valeurs : textes, chiffres, lignes des tableaux, données des graphiques (graphiques PowerPoint natifs, modifiables), date et périodes. Les titres-messages et la synthèse sont rédigés à chaque publication par l'IA (fonction « Génération de rapports », Claude Opus 5.5), à partir des seules données du Cockpit : un texte qui cite un chiffre absent des données, ou trop long pour sa zone, est redemandé une fois puis remplacé par le texte par défaut (intitulé du composant), avec un point d'attention. La mise en page et le design ne bougent pas. Un tableau garde sa hauteur de ligne : un texte trop long est abrégé « … », et au-delà du nombre de lignes que la page peut contenir, la dernière ligne indique « … et N autres ».

**Contrôle avant génération.** Avant chaque génération, Cockpit contrôle les données. S'il y a des points d'attention, une fenêtre les liste : **Générer quand même** ou **Annuler**. S'il y a une anomalie bloquante, la génération est impossible (**Fermer**).

**Planning et baromètre.** Le planning est un diagramme de Gantt : une barre par phase (gris : terminée ; bleu : avancement de la phase en cours, dans sa barre ; rouge : en retard ; contour : à venir), la phase en cours mise en avant, un repère « Aujourd'hui », les jalons sur leur couloir et, en bas, la phase en cours, le prochain jalon et la fin du planning. Avec l'indicateur « Sous-phases », au-delà de 25 lignes, le planning passe en tableau et les sous-phases des phases terminées y sont regroupées. Le baromètre est un tableau de bord : score global et écart au relevé précédent, évolution du score, avis des répondants, score par domaine et points clés ; chaque bloc suit un indicateur de l'étape 4. Couleurs, polices et hiérarchie des textes viennent des pages modèles de l'étape 2.

**Actions, décisions et tableau de bord.** La page **Actions** est un échéancier : les actions ouvertes, les plus en retard d'abord, avec leur responsable, leur chantier et leur origine (« issue de R01 ») ; un axe « Aujourd'hui » montre le retard en rouge à gauche et le délai à droite (ambre sous 14 jours) ; un panneau sombre donne le nombre d'actions en retard et leur répartition par échéance. La page **Décisions** montre à gauche les décisions en attente, quelle que soit la période (étape : brouillon, en revue, à arbitrer ; durée d'attente, en rouge à partir de 30 jours ; séance attendue), et à droite les décisions prises sur la période, avec ce qui a été décidé ; sans décision prise sur la période, les trois dernières sont rappelées. Le **Tableau de bord** présente la phase en cours (avancement réel en grand, prévu à date et écart en points, fin prévue), le go-live prévu, le prochain jalon et le chemin des phases, puis la santé du projet en quatre tuiles (risques dont critiques, actions dont en retard, jalons glissés, décisions dont à arbitrer).

**Jalons et risques.** Les jalons forment une frise : un cercle par jalon (plein : date passée ; foncé : prochain jalon, avec son délai ; contour rouge : glissé après sa date de référence), son nom, sa date et l'écart à la référence quand la date a bougé ; quatre indicateurs en bas (jalons franchis, glissés, prochain jalon, glissement moyen). Les risques sont présentés en tableau (criticité en pastille colorée, plan de mitigation sous l'intitulé, porteur et chantier, échéance) à côté de la matrice probabilité × impact, où chaque risque apparaît par son code.

**Brouillon.** Le template en cours de création est enregistré automatiquement à chaque modification : en revenant sur « Créer un template », vous le retrouvez à l'étape où vous l'aviez laissé.

**Générer un rapport.** En haut, la séance à laquelle le rapport sera rattaché (date, comité, participants) ; dessous, deux tuiles : à gauche les templates actifs, regroupés par comité (recherche sur le nom, l'auteur, les composants ou le comité, filtre par comité, « Tout déplier / Tout replier ») ; à droite la prévisualisation du template sélectionné. Chaque ligne propose le téléchargement du rapport et un interrupteur : un template désactivé reste visible, atténué, jusqu'au prochain affichage de l'écran (un clic le réactive), et reste consultable dans la Bibliothèque.

**Publication et mise en service.** L'étape 6 récapitule le template (nom, version, comité, auteur, format et ses fichiers, composants, sections, pages, contrôle des données, description) ; au survol d'une ligne, « Étape X › » ramène à l'étape concernée. En cas de point bloquant au contrôle des données, la publication est impossible (« Voir l'étape E › »). « Valider et publier » ouvre aussitôt « Générer un rapport » : la carte du nouveau template, en tête de son comité, indique « Mise en service » et sa progression ; il n'est pas encore utilisable (les autres templates le restent). Quand il est prêt, il porte l'étiquette « Nouveau » jusqu'à la première génération d'un rapport (24 h au plus) et une notification l'annonce. En cas d'échec, « Relancer la mise en service » reprend la mise en service.\n\n**Versions.** Le template publié est enregistré et versionné. Toute modification de sa structure ou de son design (nom, comité, composants, format) publie une nouvelle version (1.0 → 1.1) ; activer ou désactiver le template n'en crée pas. Les versions précédentes restent conservées.

Une section limitée à une vague, une phase ou un chantier doit avoir sa cible : « Composant incomplet ».

### 3.15.3 Bibliothèque et historique

**Bibliothèque**

- Filtre État : Tous, Actifs, Inactifs. Résumé : « N templates · N actifs · N inactifs ».
- Colonnes : Template, Auteur, Version, Composants, Pages, Publié le, Comité, État.
- Interrupteur d'état : « Template désactivé · {nom} » ou « Template réactivé · {nom} — disponible dans Générer un rapport ». Un template inactif reste conservé et consultable.
- **Visualiser** ouvre l'aperçu du template ; **Télécharger** enregistre le PowerPoint du template avec les données du jour ; **Supprimer définitivement** le supprime.
- Un template utilisé par un rapport ne peut pas être supprimé : « Suppression impossible : objet utilisé ailleurs ». Désactivez-le plutôt.

**Historique**

- « Historique des générations » : Rapport, Comité, Version, Généré le, Par, et colonne Base de connaissance (« Versé » / « Non versé »).

## 3.16 Base de connaissance

**À quoi elle sert.** Conserver les documents du projet. Chaque document déposé est lu, résumé et indexé automatiquement.

> [Capture] Base de connaissance : liste des documents et fenêtre de résumé.

**Ce qu'elle affiche**

- Filtre Type : Tous, Référence, Support de comité, Compte rendu, Contractuel, Livrable.
- Résumé : « N documents · N à signaler · N restreint ».
- Colonnes : Document (« Déposé par X le … »), Type, Date, Version, Confidentialité, Extraction · indexation, Actions (Résumé, Télécharger, Supprimer).

**États d'un document**

| État | Signification |
|---|---|
| En cours · N % | Résumé et indexation en cours (l'écran se met à jour seul) |
| Extrait · indexé | Prêt ; l'info-bulle donne le nombre d'extraits indexés |
| Partiel · {note} | Indexé, mais une partie n'a pas pu être lue (pages en images, classeur tronqué…) |
| En échec · {motif} | Traitement échoué ; le fichier reste téléchargeable |

### 3.16.1 Déposer un document

1. Cliquez sur **Déposer un document** et choisissez un ou plusieurs fichiers.
2. Dans la fenêtre, vérifiez le nom de chaque fichier, choisissez le **Type** (Livrable par défaut) et la **Confidentialité** :
   - **Interne** : visible de tous les membres du projet ;
   - **Restreint** : visible du PMO et de vous seulement, y compris dans la recherche.
3. Cliquez sur **Déposer**. Toast : « Document déposé · résumé et indexation en cours ».

**Règles**

- Formats acceptés : PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx). **25 Mo** au plus.
- Droits : PMO ou Responsable (« Dépôt de documents : profil PMO ou Responsable »).
- Les fichiers sont traités un par un : résumé, puis vectorisation des extraits, puis enregistrement de l'index.
- Un classeur Excel est lu jusqu'à 20 000 lignes.

**Messages de refus**

| Message | Que faire |
|---|---|
| « Le fichier est vide. » | Vérifiez le fichier |
| « Fichier trop volumineux : 25 Mo au plus. » | Allégez ou découpez le fichier |
| « Ancien format .doc non accepté : ouvrez le fichier dans Word, enregistrez-le au format .docx, puis déposez-le à nouveau. » (de même pour .ppt et .xls) | Convertissez le fichier |
| « Format non accepté : déposez un fichier PDF, Word (.docx), PowerPoint (.pptx) ou Excel (.xlsx). » | Changez de format |
| « Le contenu du fichier ne correspond pas à un fichier .xxx : il est peut-être endommagé ou renommé. » | Réexportez le fichier |
| « Fichier protégé par mot de passe : retirez la protection, puis déposez-le à nouveau. » | Retirez la protection |
| « PDF scanné (pages en images, sans texte) : la reconnaissance de caractères n'est pas prise en charge. … » | Déposez un PDF qui contient du texte |
| « Aucun texte exploitable dans ce document. » | Le document ne contient pas de texte lisible |

**Doublons**

- **Même contenu** : « Ce document est déjà dans la Base de connaissance : « {nom} », déposé le {date}. ». Le dépôt est refusé.
- **Même nom** : la fenêtre « Ce document existe déjà » propose :
  - **Remplacer (vN+1)** : la nouvelle version prend la place de l'ancienne une fois indexée ; les liens sont conservés (PMO et auteur du dépôt) ;
  - **Garder les deux** : le nouveau document reçoit un nom distinct, « Nom (2) », « Nom (3) »… ;
  - **Annuler**.

### 3.16.2 Consulter le résumé, télécharger, supprimer

- **Résumé** ouvre la fenêtre du document :
  - pendant le traitement : « TRAITEMENT EN COURS · N % » et l'étape en cours ;
  - en échec : le motif, et « Le fichier reste téléchargeable. Supprimez-le puis déposez-le à nouveau une fois le problème réglé. » ;
  - une fois indexé : **En bref** (deux phrases), jusqu'à 4 chiffres clés, puis 3 à 5 rubriques de points clés. Le pied indique le nombre d'extraits, de pages ou de diapositives, et le modèle utilisé.
- **Télécharger** récupère le fichier d'origine.
- **Supprimer** : « Le fichier, son résumé et son index de recherche seront supprimés définitivement. La suppression est tracée dans l'historique. ». Droits : PMO, administrateur, ou auteur du dépôt.
- Un document en cours de traitement ne peut être ni supprimé ni remplacé : « Le document est en cours de traitement : attendez la fin avant de le supprimer. ».

**Automatique**

- Si le serveur redémarre pendant un traitement, le document passe en échec : « Traitement interrompu (redémarrage du serveur) : déposez le document à nouveau. ».
- Si aucun modèle d'IA n'est affecté au résumé ou à la vectorisation, le traitement échoue avec un message du type « Vectorisation indisponible : aucun modèle affecté ». Prévenez l'administrateur.

## 3.17 Info projet : fiche projet et dispositif

**Fiche projet**

- **Contexte client et enjeux** : le client (raison sociale et informations clés), les marques du groupe, le programme en une phrase, les enjeux stratégiques.
- **Projet** : les lots, les périmètres fonctionnel, applicatif, géographique (« N pays ») et juridique (« N entités »).
- Ces rubriques viennent de l'objet **Info projet** du Référentiel (voir 3.18).
- Le PMO peut corriger un texte directement dans la fiche : clic sur le texte, Entrée pour valider, Échap pour annuler. Vider un champ le masque (« Champ vidé · masqué »).

**Dispositif** (lecture seule ; « Ces données sont alimentées par le Référentiel ; modifiez-les dans Info projet › Référentiel. »)

| Vue | Contenu |
|---|---|
| Ressources | Personnes regroupées par équipe : rôles, chantiers (« Transverse » si aucun), e-mail, statut Actif / Inactif. Filtres : équipe, rôle, chantier, statut. « Historique des rôles » (affectations datées). Encadré « Porteur sans affectation active » |
| Équipe | Une carte par équipe : description et nombre de personnes actives |
| Organigramme | Le directeur de programme, puis une branche par chantier avec son responsable (« Responsable à désigner » sinon) |
| Gouvernance | Une ligne par instance : fréquence, membres actifs. « Membres gérés dans Référentiel › Instances de pilotage » |

## 3.18 Référentiel

**À quoi il sert.** Tenir les données de base du projet, dont dépendent tous les autres écrans. Visible du PMO et de l'administrateur ; **modifiable par le PMO uniquement** (« Le Référentiel est modifiable par le PMO uniquement »).

> [Capture] Référentiel : liste des objets du modèle et tableau des personnes.

**Les objets du modèle** : Client, Projet, Info projet, Lots, Phases, Sous-phases, Chantiers, Jalons, Équipes, Rôles sur le projet, Personnes, Instances de pilotage, Livrables. Chaque objet affiche son nombre d'éléments.

**Gestes communs**

- **Modifier** : cliquez dans une cellule, saisissez, sortez du champ. Toast « Enregistré — {objet} · {valeur} ». Une cellule vide affiche « non renseigné ».
- **Rechercher et trier** : champ « Rechercher dans {objet} » ; clic sur un en-tête de colonne pour trier.
- **Ajouter** : bouton **+**. Le formulaire signale les champs obligatoires (*) et propose un numéro. Le bouton **Ajouter** reste inactif tant qu'une contrainte n'est pas respectée. Toast « Ajouté — {objet} · {numéro} {nom} ».
- **Supprimer** : icône corbeille, sans confirmation. Toast « Supprimé — {objet} · {libellé} ». Client et Projet ne se suppriment pas.

**Suppression d'un objet utilisé.** Un objet utilisé ailleurs ne peut pas être supprimé : « Suppression impossible : objet utilisé par {liste}. Réaffectez-les d'abord. ».

| Objet | Bloqué par |
|---|---|
| Lot | Phases, chantiers, jalons, templates qui le ciblent |
| Phase | Sous-phases, jalons, livrables, chantiers, templates |
| Sous-phase | Livrables, jalons |
| Chantier | Risques, problèmes, actions, décisions, jalons, livrables, suivi d'avancement, chantiers dépendants, habilitations, templates |
| Équipe | Personnes ; projet (équipe éditeur ou intégrateur) |
| Rôle | Toute affectation, même terminée |
| Personne | Tout objet dont elle est porteuse ou responsable, instances, séances, affectations, habilitations, rapports, templates, tâches, compte applicatif |
| Instance | Séances, décisions, templates |
| Jalon | Actions issues du jalon, documents liés |

**Règles par objet**

| Objet | Règles |
|---|---|
| Projet | Code non modifiable. Nom obligatoire (200 caractères). Date de fin après la date de début. Devise (EUR, USD, GBP…), fuseau horaire, ville et pays du projet. La ville sert aux widgets Météo et Trafic |
| Info projet | Une ligne par élément : rubrique, libellé, valeur. 8 rubriques (Le client, Marques du groupe, Programme en une phrase, Enjeux stratégiques, Périmètres fonctionnel, applicatif, géographique, juridique). 60 lignes par rubrique, libellé 120 caractères, valeur 2 000 caractères |
| Lot | Numéro et nom obligatoires ; fin après début |
| Phase | Numéro, nom, dates de début et de fin, responsable obligatoires ; une phase peut couvrir plusieurs lots |
| Sous-phase | Code de la forme « {phase}.n » (« Le numéro doit commencer par {P}. … ») ; avertissement si elle sort de la période de sa phase |
| Chantier | Nom et responsable obligatoires ; code C1, C2… attribué automatiquement ; un chantier ne peut pas dépendre de lui-même |
| Jalon | Nom, phase et date prévue obligatoires ; code J01… automatique ; référence = date prévue par défaut |
| Équipe | Nom unique (« L'équipe « X » existe déjà ») |
| Rôle | Libellé unique (« Le rôle « X » existe déjà ») ; 4 niveaux : Gouvernance, Métiers, Maîtrise d'ouvrage, Maîtrise d'œuvre |
| Personne | Prénom, e-mail valide et unique dans le projet, équipe obligatoires |
| Instance | Nom, nom court unique, couleur, fréquence (quotidienne à semestrielle, ou à la demande) ; membres : président, membre, secrétaire, invité |
| Livrable | Nom, sous-phase, responsable et échéance obligatoires ; échéance = fin de la sous-phase par défaut |

### 3.18.1 Personnes, comptes et invitations

- **Rôles d'une personne** : ajouter un rôle crée une affectation datée du jour. Retirer un rôle clôture l'affectation à la veille (ou la supprime si elle commence aujourd'hui).
- **E-mail** : modifiable, enregistré en minuscules. Changer l'e-mail d'une personne ne change pas l'identifiant de son compte : la Console signale l'écart à l'administrateur, qui l'applique.
- **Désactiver une personne** : interrupteur « Actif · cliquer pour désactiver ». La ligne s'estompe ; la personne disparaît des listes de choix, des compteurs et du Dispositif. Son compte n'est pas suspendu automatiquement : la Console signale « Accès à retirer » à l'administrateur.
- **Colonne « App »** (compte applicatif) :
  - coche : « Compte activé » ;
  - horloge : demande transmise ou invitation envoyée, en attente d'activation ;
  - avion : **Inviter à activer son compte**.
  - Résumé : « N comptes actifs · N invitations en attente · N à inviter ».

**Demander l'invitation d'une personne** (PMO)

1. Vérifiez que la personne a un e-mail valide.
2. Cliquez sur l'avion de sa ligne. Toast : « Demande d'invitation transmise à l'administrateur — {nom} ».
3. L'administrateur reçoit la demande dans la Console, avec les droits proposés d'après le Référentiel (Responsable des chantiers dont la personne est responsable, Lecteur de ses chantiers de rattachement).
4. La réponse arrive dans votre cloche : « Demande d'invitation acceptée : {nom} » (la personne a reçu son invitation) ou refus.

Un nouveau clic sur l'horloge rappelle « Demande déjà transmise à l'administrateur — {nom} ». Si la personne a déjà un compte : « Cette personne a déjà un compte … ».

**Exemple.** Vous ajoutez Hugo Lambert (équipe Intégrateur, e-mail hugo.lambert@…), lui attribuez le rôle « Responsable de chantier » et le désignez responsable du chantier C3. Vous cliquez sur l'avion. L'administrateur voit « Inviter Hugo Lambert · Responsable de C3 » et l'invite : vous recevez « Demande d'invitation acceptée : Hugo Lambert ».

## 3.19 Jev, l'assistant du Cockpit

**À quoi il sert.** Répondre à vos questions sur l'utilisation du Cockpit et vous aider à mettre à jour le Pilotage.

> [Capture] Panneau de Jev ouvert sur le registre des risques, avec une proposition à valider.

**Ouvrir Jev**

- Bouton **Jev** de la barre latérale : contexte général.
- Icône **Demander à Jev** d'un bloc ou d'une ligne : Jev connaît le contexte (« Contexte : … »).
- Le panneau se ferme par la croix ou par un clic en dehors.

**Deux modes**

- **Explication et action** en Pilotage et dans Info projet (hors Référentiel) : Jev explique et peut proposer des modifications.
- **Explication** ailleurs : Aujourd'hui (« Ce menu est un reporting de Pilotage : j'explique les données, je ne les modifie pas. »), Comités et rapports, Base de connaissance, Référentiel.

**Poser une question**

1. Saisissez votre question dans « Écris à Jev… » (4 000 caractères au plus), ou choisissez une suggestion (« Résumer ce bloc », « Expliquer cette ligne », « D'où vient cette donnée ? »…).
2. Appuyez sur Entrée ou cliquez sur **Envoyer**.

**Comment Jev répond**

- Chaque question est d'abord classée : question d'usage, question sur les données, question ambiguë ou hors sujet.
- **Question d'usage** (« Comment créer un risque ? ») : Jev répond à partir du seul **guide utilisateur du Cockpit**, et cite ses sources (« Sources : Guide utilisateur · {section} · p. N »). S'il ne trouve rien : « Je n'ai pas trouvé cette information dans le guide utilisateur du Cockpit. Reformulez la question, ou posez-la sur les données du projet. ».
- **Autres questions** : Jev reconnaît les codes cités (A-01, R03, P01, D-005, J07) et les rattache à la réponse, dans la limite des chantiers que vous voyez. Ses réponses sur les données ne sont pas encore calculées à partir de vos données (voir annexe B) : vérifiez-les dans les écrans.

**Faire modifier une donnée par Jev** (Pilotage)

Jev sait proposer trois types de modifications, sur les risques, problèmes, actions et décisions :

| Demande | Exemple |
|---|---|
| Créer une action | « crée une action : relancer l'éditeur sur le correctif » |
| Changer un statut | « A-41 est terminée », « R03 est mitigé », « rouvrir P02 » |
| Reporter une échéance | « reporter A-41 au 15/10 » |

1. Jev affiche « Voici la modification que je propose. Rien n'est enregistré avant votre validation » et le bloc « À valider · N modification(s) proposée(s) ».
2. Cliquez sur **Valider et enregistrer** (toast « Modifications enregistrées ») ou sur **Refuser**.

La validation applique vos droits habituels : Jev ne peut pas faire ce que vous ne pouvez pas faire à la main. Jev ne modifie ni le Référentiel, ni les Comités et rapports, ni la Base de connaissance.

**Autres gestes**

- **Saisir sans Jev** / **Modifier sans Jev** : ouvre le formulaire manuel (voir 3.5).
- **Effacer tous les messages** (icône en haut du panneau) : revient au message d'accueil, sans confirmation.

**Mémoire.** Jev ne garde pas la conversation : rouvrir le panneau repart d'un nouveau message d'accueil, et chaque question est traitée seule.

## 3.20 Notifications

**À quoi elles servent.** Recevoir dans le Cockpit les messages qui vous concernent :

- les notifications planifiées par l'administrateur (points quotidiens ou hebdomadaires sur vos projets, rédigés par l'IA à partir des données que vous pouvez voir) ;
- les réponses de l'administrateur à vos demandes (invitation d'une personne, activation d'un module).

**La cloche** (pied de la barre latérale) affiche le nombre de notifications non lues. La liste est relue au démarrage, toutes les 60 secondes, au retour sur l'onglet et à l'ouverture du tiroir.

**Le tiroir**

1. Cliquez sur la cloche.
2. Filtrez avec **Toutes** ou **Non lues**.
3. Cliquez sur une notification pour la déplier : elle est marquée comme lue. Les chiffres clés s'affichent en rangée, en rouge s'ils signalent un retard, un dépassement, un échec ou un point critique.
4. **Tout lire** marque toutes les notifications comme lues.
5. Fermez avec la croix, Échap ou un clic en dehors.

**Effacer toutes les notifications** : la liste se vide aussitôt, avec « N notifications effacées » et **Annuler** pendant 5 secondes. Ensuite, l'effacement est définitif. Il ne touche que vos notifications.

**Règles.** Le tiroir montre les 50 notifications les plus récentes. Chacun ne voit que les siennes. Les dates sont relatives : « à l'instant », « il y a N min », « il y a N h », « hier », « il y a N j ».

## 3.21 Mon profil

Votre carte, en bas de la barre latérale, ouvre **Mon profil**. Quatre onglets :

| Onglet | Contenu |
|---|---|
| Informations | Prénom, nom, position, société, e-mail, téléphone, **ville de résidence**, pays, langue, fuseau horaire ; photo (**Changer la photo**) |
| Projet | Vos projets, rôles et droits |
| Notifications | Quatre préférences d'envoi (quotidien du matin, rapport hebdomadaire, actions échues, rappel la veille d'un comité) |
| Sécurité | Mot de passe et dernière connexion |

**Règles**

- Le prénom, la ville de résidence, la photo et les préférences de notification sont enregistrés automatiquement, sans bouton.
- La **ville de résidence** sert de point de départ au widget Trafic.

**Changer son mot de passe**

1. Onglet **Sécurité**, ligne « Mot de passe » (« Modifié il y a N jours »), lien **Modifier**.
2. Saisissez le **Mot de passe actuel**, le **Nouveau mot de passe** et la **Confirmation**.
3. Cliquez sur **Enregistrer**. Toast : « Mot de passe modifié · vos autres sessions ont été fermées ». La session en cours reste ouverte.
4. Mot de passe actuel erroné : « Mot de passe actuel incorrect ».

# 4. Rôles et droits

## 4.1 Qui accède à un projet

- Seules les **habilitations** attribuées dans la Console donnent accès à un projet. Le Cockpit les lit et les combine ; il ne les modifie jamais.
- Un projet auquel vous n'avez aucun droit répond « Projet introuvable », sans révéler son existence.
- L'administrateur de la plateforme voit tous les projets, en lecture seule.

## 4.2 Ce que chaque profil voit et fait

| Action | PMO | Responsable | Lecteur | Administrateur |
|---|---|---|---|---|
| Voir les données | Tous les chantiers | Ses chantiers | Ses chantiers | Tous les chantiers |
| Risques, problèmes, actions, décisions | Tous | Ses chantiers | — | — |
| Dates et % réel du planning | Tous | Son chantier | — | — |
| Porteur et criticité | Oui | — | — | — |
| Jalons, livrables, éléments de planning | Oui | — | — | — |
| Baromètre | Oui | Responsable du chantier transverse | — | — |
| Séances de comité | Oui | Si directeur de programme | Si directeur de programme | — |
| Templates et rapports de comité | Oui | Oui | — | — |
| Déposer un document | Oui | Oui | — | — |
| Supprimer un document | Oui | Ses dépôts | — | Oui |
| Voir l'onglet Référentiel | Oui | — | — | Oui (lecture) |
| Modifier le Référentiel, la fiche projet, Info projet | Oui | — | — | — |
| Demander une invitation | Oui | — | — | — |
| Demander un module | Oui | Oui | — | — |

**Règles**

- **Cumul** : un même compte peut être PMO d'un projet et Responsable ou Lecteur d'un autre ; sur un projet, le profil le plus large s'applique. Être Responsable d'un chantier retire ce chantier de la liste Lecteur.
- **Directeur de programme** : la personne désignée comme responsable du projet planifie et met à jour les séances, quel que soit son profil.
- **Documents restreints** : visibles du PMO, de l'administrateur et de l'auteur du dépôt.
- **Messages de refus** : chaque écriture interdite est refusée par le serveur avec un message explicite (« Action non autorisée pour votre profil », « Budget : PMO uniquement », « Templates : profil non Lecteur (PMO, Responsable) »…). L'écran annule alors la modification.

# 5. Paramétrage et préférences

| Réglage | Où | Effet |
|---|---|---|
| Disposition du tableau de bord | Aujourd'hui › Personnaliser | Widgets affichés et ordre, mémorisés pour votre compte |
| Couleurs d'une tuile | Survol d'un widget | Thème clair ou sombre de la tuile, mémorisé |
| Ville de résidence | Mon profil › Informations | Point de départ du widget Trafic |
| Photo, prénom | Mon profil › Informations | Affichés dans le Cockpit |
| Préférences de notification | Mon profil › Notifications | Enregistrées pour votre compte |
| Ville et pays du projet | Référentiel › Projet (PMO) | Widgets Météo et Trafic |
| Fuseau horaire du projet | Référentiel › Projet (PMO) | Date du jour du projet |
| Contenu de la fiche projet | Référentiel › Info projet (PMO) | Onglet Fiche projet |
| Membres des instances | Référentiel › Instances de pilotage (PMO) | Participants des séances, onglet Gouvernance |

Ce qui se règle dans la Console, par l'administrateur : comptes et droits, modules Budget et Bénéfices, sources d'actualité, météo et trafic (Registre des cartes API), modèles d'IA utilisés par la Base de connaissance et par Jev, guide utilisateur du Cockpit, notifications planifiées.

# 6. FAQ et dépannage

**Je ne peux pas me connecter.**
Le message est toujours « Identifiant ou mot de passe incorrect. ». Vérifiez l'adresse et le mot de passe, puis utilisez « Mot de passe oublié ? ». Si votre invitation n'a jamais été activée, ou si votre compte est suspendu, demandez à votre PMO de solliciter l'administrateur.

**L'écran affiche « Connexion suspendue. ».**
Trop d'échecs. Attendez la fin du compte à rebours (15 minutes) ou réinitialisez votre mot de passe.

**Le lien d'invitation ne fonctionne plus.**
Il est valable 14 jours et utilisable une seule fois. Demandez une nouvelle invitation.

**Ma modification a disparu.**
Le serveur l'a refusée : lisez le toast. Causes fréquentes : droit insuffisant (« Droit insuffisant : seul le PMO ou le Responsable du chantier peut modifier cette donnée »), donnée hors de vos chantiers, règle non respectée (période inversée, fiche arbitrée…).

**Je ne vois pas certains risques ou actions.**
Un Responsable ou un Lecteur ne voit que ses chantiers. Demandez au PMO de vérifier vos habilitations auprès de l'administrateur.

**Je ne vois pas l'onglet Référentiel.**
Il est réservé au PMO et à l'administrateur.

**Je ne peux pas supprimer un élément du Référentiel.**
Il est utilisé ailleurs : le message liste les objets concernés. Réaffectez-les d'abord, ou désactivez l'élément (personne).

**Mon document reste « En cours ».**
Le traitement se fait un document à la fois ; un gros document peut prendre plusieurs minutes. S'il passe « En échec », lisez le motif dans la fenêtre Résumé, supprimez-le, corrigez le fichier et déposez-le à nouveau. Un échec du type « aucun modèle affecté » relève de l'administrateur.

**Mon document est refusé comme doublon.**
Un document au contenu identique existe déjà : le message donne son nom et sa date de dépôt.

**Les widgets Météo, Trafic ou Actualité affichent « indisponible ».**
La source externe ne répond pas, ou sa carte est désactivée dans la Console. Le widget affiche la dernière réponse valable quand elle a moins de 24 heures.

**Le widget Trafic part de Paris.**
Renseignez votre ville de résidence dans Mon profil, puis rechargez la page.

**Jev répond qu'il ne trouve pas l'information.**
Reformulez la question avec les mots de l'écran (« registre des risques », « fiche d'arbitrage »…). Pour une question sur une donnée précise, citez son code (R03, A-41, D-005).

**Les onglets Budget et Bénéfices indiquent « module non activé ».**
Cliquez sur **Demander l'activation** ; la réponse de l'administrateur arrive dans la cloche.

**Ma session s'est fermée.**
Après 30 minutes d'inactivité, la session se ferme. Reconnectez-vous : vous revenez sur la page ouverte.

# 7. Annexes

## Annexe A. Récapitulatif des règles de gestion

Les références désignent les fichiers du code (dossier `backend/src` sauf mention contraire) au 1er octobre 2026.

| Règle | Description | Fonctionnalité | Référence dans le code |
|---|---|---|---|
| Échecs de connexion | 5 échecs par adresse, 20 par adresse IP, blocage 15 min, remise à zéro après 15 min | Connexion | `core/auth/policy.ts:11-17` |
| Message d'échec unique | Même message pour adresse inconnue, mauvais mot de passe, compte invité ou suspendu | Connexion | `core/auth/credentials.service.ts:78-102` |
| Mot de passe | 12 à 128 caractères, majuscule, minuscule, chiffre, spécial, différent du précédent, non compromis | Connexion | `core/auth/policy.ts:51-58` ; `core/auth/password.ts:70-77` |
| Inactivité | 30 min dans le Cockpit (+ 2 min côté serveur), avertissement 60 s avant | Session | `core/auth/policy.ts:22-26` ; `frontends/auth-api.js:209-310` |
| Lien de réinitialisation | 30 min ; 1 envoi par minute, 5 par heure | Mot de passe oublié | `core/auth/policy.ts:29-33` |
| Invitation | Lien à usage unique, 14 jours | Accès | `admin/accounts.controller.ts:18, 73-82` |
| Droits combinés | Admin et PMO globaux, Responsable et Lecteur par chantier, le plus fort l'emporte | Droits | `domain/rights.ts:26-67` |
| Écriture du suivi | PMO, ou Responsable du chantier | Pilotage | `domain/rights.ts:86-89` |
| Création hors périmètre | « Donnée à rattacher à l'un de vos chantiers » | Pilotage | `cockpit/pilotage/transactional.ts:268-275` |
| Référentiel | Écriture PMO uniquement ; onglet visible PMO et Admin | Référentiel | `domain/rights.ts:76-83` |
| Séances | PMO et directeur de programme | Comités | `domain/rights.ts:92-94` |
| Outils | Documents, templates, rapports, demandes de module : PMO et Responsable | Comités, documents | `domain/rights.ts:96-99` |
| Criticité d'un risque | P × I : ≥ 20 critique, ≥ 12 élevé, ≥ 6 modéré | Risques | `domain/rules.ts:63-74` |
| Action en retard | Non terminée, échéance passée | Actions | `domain/rules.ts:77-79` |
| Écart d'un jalon | Date prévue − date de référence | Jalons | `domain/rules.ts:26-28` |
| Fraîcheur d'un jalon | Vigilance au-delà de 7 j, alerte au-delà de 14 j | Jalons, incohérences | `domain/rules.ts:8-23` |
| Date prévue = confirmation | Modifier la date prévue confirme le jalon | Jalons | `cockpit/referential/entities.ts:527-531` |
| Statut d'un livrable | Validé ≥ 100 %, en retard après l'échéance, en production si commencé | Livrables | `domain/rules.ts:82-119` |
| Risque délai | Écart temps écoulé − avancement : > 18 critique, > 6 sous tension | Livrables | `domain/rules.ts:82-119` |
| % prévu | Temps écoulé ÷ durée, borné 0-100 | Planning | `domain/rules.ts:163-168` |
| Fiche arbitrée | Lecture seule ; texte de la décision obligatoire | Décisions | `cockpit/pilotage/transactional.ts:209-235` |
| Remplacement | La décision remplacée passe à « Remplacée » | Décisions | `cockpit/pilotage/transactional.ts:344-358` |
| Grille d'arbitrage | 6 options et 20 critères au plus ; somme des poids attendue à 100 % | Décisions | `cockpit/pilotage/pilotage.controller.ts:22-42, 107-124` |
| Baromètre | Répartition = 100 % ; mois postérieur au dernier relevé | Baromètre | `cockpit/pilotage/pilotage.controller.ts:249-388` |
| Séances | Numéro = max + 1 ; transitions contrôlées | Comités | `cockpit/committees/committees.controller.ts:21-148` ; `domain/rules.ts:133-148` |
| Rapport | Version vN par séance, Brouillon à la création, publié irréversible | Comités et rapports | `cockpit/committees/committees.controller.ts:151-190, 306-319` |
| Incohérences | 5 contrôles recalculés à chaque chargement | Aujourd'hui | `cockpit/pilotage/anomalies.service.ts:34-94` |
| Dépôt de document | 4 formats, 25 Mo, contrôle du contenu réel, doublons par empreinte et par nom | Base de connaissance | `domain/kb-documents.ts:26-64` ; `cockpit/documents/kb.service.ts:87-170` |
| Confidentialité | Restreint : PMO, administrateur, auteur | Base de connaissance | `cockpit/documents/kb.service.ts:276-278` |
| Suppression d'un document | PMO, administrateur, auteur ; jamais pendant un traitement | Base de connaissance | `cockpit/documents/kb.service.ts:255-264` |
| Usages bloquants | Suppression refusée si l'objet est utilisé | Référentiel | `cockpit/referential/usages.service.ts:17-135` |
| Info projet | 8 rubriques, 60 lignes, libellé 120, valeur 2 000 caractères | Référentiel | `domain/project-info.ts:11-56` |
| Aiguillage de Jev | Question classée usage / données / ambiguë / hors sujet par la carte JEV | Jev | `domain/jev-router.ts` ; `admin/jev-router.service.ts` |
| Réponses d'usage | Guide du Cockpit seul, 8 extraits cherchés, 4 gardés, seuil 0,58 | Jev | `domain/jev-rag.ts:25` ; `admin/guide-answer.service.ts` |
| Propositions de Jev | Risques, problèmes, actions, décisions ; validation explicite, droits habituels | Jev | `cockpit/assistant/assistant.controller.ts:21-38, 122-173` |
| Notifications | 50 plus récentes ; effacement annulable 5 s | Notifications | `cockpit/my-notifications.controller.ts:8-56` ; `frontends/Notifications Cockpit.dc.html` |
| Préférences | Disposition, couleurs, prénom, ville, photo, notifications, envoyées 600 ms après le changement | Préférences | `frontends/api.js:160, 197, 464-467` |

## Annexe B. Points à clarifier et écarts constatés

Ces points viennent de la lecture du code. Ils décrivent un écart entre le code et un texte affiché, ou un comportement ambigu. Aucun n'a été tranché dans ce guide.

**Accès et profil**

1. **Lien expiré** : l'écran annonce « durée de validité de 30 minutes », même pour un lien d'invitation (14 jours).
2. **Activation d'une invitation** : l'écran final dit « Mot de passe modifié. … vos autres sessions ont été fermées », alors qu'il s'agit d'une première activation.
3. **Blocage par poste** (20 échecs) : l'écran parle du compte, et réinitialiser le mot de passe ne lève pas ce blocage.
4. **« Toujours là ? »** s'ouvre après 29 minutes et annonce « Sans activité depuis 30 minutes ».
5. **Mon profil** : société, équipe, ligne de l'onglet Projet, dernière connexion et date de modification sont des valeurs fixes ; Nom, Position, Société, E-mail, Téléphone, Pays, Langue et Fuseau ne sont pas enregistrés ; le bouton **Enregistrer** n'enregistre rien de plus (toast seul).
6. **Préférences de notification** de Mon profil : enregistrées, mais aucun envoi ne les lit.
7. **Carte de la barre latérale** : affiche « PMO projet » avant « Administrateur » pour un compte qui cumule les deux.
8. **Tutoiement** : « Ton assistant IA », « Écris à Jev… » détonnent avec le vouvoiement du reste.

**Aujourd'hui**

9. **Message d'accueil** : il compte toutes les décisions à arbitrer du projet (pas seulement les vôtres) et seulement vos actions comme tâches ; le serveur prévoit un autre calcul, non utilisé.
10. **Échéances** : le titre annonce « 50 prochains jours » ; le calcul couvre 7 jours en arrière à 45 jours en avant, 10 éléments au plus.
11. **Écarts planning** : le titre cite la « référence v4 », le widget de Jev la « référence v5 » ; un écart négatif s'affiche « +-n j » ; sans date de référence, l'écart vaut 0.
12. **Seuils de criticité** : matrice du widget à 15 / 8, règles du projet à 20 / 12 / 6.
13. **Météo des chantiers** : ignore la première ligne du suivi d'avancement ; seuil −10 points, contre 0 / −20 côté serveur.
14. **Fiches d'arbitrage** (widget) : compte en réalité les décisions non arbitrées, brouillons compris.
15. **Incohérences** : la description annonce « actions sans porteur, dates incohérentes », contrôles qui n'existent pas ; la tuile ouvre Écarts, qui ne liste pas les incohérences ; libellés d'action différents d'un écran à l'autre (« Confirmer » / « Relancer »).
16. **« L'essentiel, par Jev »** : présenté comme rédigé par l'IA, il est calculé sans appel à l'IA.
17. **« Disposition enregistrée »** : la disposition est enregistrée à chaque changement, pas seulement sur **Terminer**.

**Pilotage**

18. **Registre des risques** : le titre annonce « top 6 par criticité », l'écran affiche 4 risques dans l'ordre des codes ; « 14 cartographiés dont 3 critiques · +3 depuis janvier » est un texte fixe.
19. **Liste des chantiers** des formulaires risque, problème et décision : liste figée ; les choix qui ne correspondent pas à un chantier du projet sont rattachés au chantier transverse.
20. **Statut « Bloquée »** d'une action : enregistré « À faire » à la création, affiché « Ouverte » quand il vient du serveur.
21. **« Mes actions »** : filtre une personne fixe, pas l'utilisateur connecté.
22. **Jalons et livrables** : l'écran laisse un Responsable modifier, le serveur refuse (PMO uniquement).
23. **Confirmation métier** : la date choisie dans le formulaire est ignorée ; le serveur enregistre la date du jour.
24. **Fiche arbitrée** : option et date restent saisissables à l'écran, le serveur refuse.
25. **Problèmes ouverts** : le bloc affiche aussi les problèmes résolus.
26. **Baromètre** : notes bornées de 1 à 10 à l'écran, de 0 à 10 au serveur.
27. **Mes tâches** : « COPIL n°20 · 26 sept. » est un texte fixe ; jalons à 45 jours inclus à l'écran, exclus au serveur.

**Comités, documents, Jev**

28. **« Oui, verser »** n'ajoute pas le rapport à la Base de connaissance : il crée un rapport rattaché à la séance. Les messages « versé dans la Base de connaissance… versionné et indexé » sont inexacts.
29. ~~**Téléchargements** de rapports et de modèles~~ (corrigé le 02/10/2026) : le téléchargement produit un vrai PowerPoint au format du template. Le PDF du rapport rattaché à une séance (serveur) reste minimal et n'est appelé par aucun écran.
30. **Nombre de pages** d'un template : trois calculs différents (publication, serveur, aperçu).
31. **Publication d'un template** : l'historique affiché revient à des entrées de démonstration jusqu'au rechargement.
32. **Suppression d'un template** : sans confirmation ; le toast s'affiche avant un éventuel refus du serveur.
33. **Erreurs de dépôt** : le message est répété entre parenthèses.
34. **Réponses de Jev sur les données** : elles passent encore par un service bouchon, sans lecture réelle des données ; les questions ambiguës ou hors sujet reçoivent le même traitement.
35. **Jev et la Base de connaissance** : l'accueil annonce « Chaque réponse cite le document et le passage », mais Jev ne cherche pas encore dans les documents.
36. **« Charger » de Jev** annonce « Comptes rendus », mais le document est déposé en Livrable, Interne.
37. **« Annuler » d'un récapitulatif de Jev** : toast seul, sans effet sur les données.

**Info projet et Référentiel**

38. **Jev** dit que « le référentiel est géré par l'administrateur du projet » : c'est le PMO.
39. **Saisie directe de la Fiche projet** : elle n'alimente pas l'objet Info projet, que lisent la Console et les notifications ; les deux peuvent diverger. L'écran ne contrôle pas les droits.
40. **Lots et tuiles chiffrées de la Fiche projet** : contenu statique, distinct des Lots du Référentiel ; titres « RISE — AMC Corp » et « Projet RISE » fixes.
41. **Contrôle des usages** : l'écran vérifie moins de cas que le serveur ; une suppression permise à l'écran peut être refusée ensuite.
42. **Rôle déjà porté par le passé** : sa suppression clôt les affectations, puis échoue côté serveur.
43. **Ajout d'une personne** : l'écran n'exige que le nom, le serveur exige un e-mail valide. **Ajout d'une phase** : dates facultatives à l'écran, obligatoires au serveur.
44. **Compte suspendu** affiché « Compte activé » ; une demande refusée réaffiche « Inviter » sans mention du refus.
45. **Client** : objet partagé par tous les projets, modifiable par le PMO de n'importe quel projet.
46. **Lecture des listes du Référentiel** (dont les e-mails des personnes) : ouverte à tout profil du projet par l'API.
47. **Verrouillage optimiste** : prévu côté serveur, jamais utilisé par l'écran ; le dernier qui enregistre l'emporte.

## Annexe C. Fonctionnalités non documentées

Ces fonctionnalités existent dans le code mais sont désactivées, inaccessibles depuis l'écran, limitées à la démonstration ou sans effet. Elles ne sont pas décrites dans le corps du guide.

| Fonctionnalité | État |
|---|---|
| Sélecteur de projet de la barre latérale | Cartouche statique ; le projet change par l'adresse |
| Onglets d'Aujourd'hui (Dashboard, Écarts, Échéances) | Définis, non affichés ; Écarts et Échéances s'ouvrent depuis les widgets |
| Onglet Qualité d'Aujourd'hui (complétude, fraîcheur, à confirmer) | Inaccessible ; contenu en partie fixe |
| Bloc « Santé calculée vs appréciation » (Écarts) | Contenu fixe |
| Ancienne vue Situation | Désactivée |
| Point d'accès serveur « Aujourd'hui » | Non appelé par l'écran |
| Onglets Périmètre, Contrat, Chronologie, WBS et vue RACI d'Info projet | Calculés, sans écran |
| Panneau « Modèle du projet » | Aucun accès |
| Écran du module Budget ; module Bénéfices | Les onglets affichent toujours « non activé » ; aucun écran Budget, aucun code Bénéfices |
| Suppression de risques, problèmes, actions, décisions, séances | Disponible côté serveur, sans bouton |
| Participants d'une séance, remplacement d'une décision, séance cible d'un problème | Disponibles côté serveur, sans écran |
| Saisie de la criticité (chemin critique) | Acceptée par le serveur, sans écran |
| Statut, sponsor, équipes éditeur et intégrateur, Go-Live prévu, santé forcée du projet | Acceptés par le serveur, sans écran |
| Clôture et archivage d'un projet | Sans écran |
| Import Excel du Référentiel | Console seulement |
| Statut des rapports, relecteur, validateur, audience ; PDF de rapport | Sans écran |
| Historique, recherche, retraitement et métadonnées des documents | Disponibles côté serveur, sans écran |
| Mode d'édition groupée des titres de Mes tâches | Inaccessible |
| Signal « porteurs sans affectation active » complet (serveur) | Non appelé ; l'écran fait un calcul réduit |
| Liste des projets accessibles | Disponible côté serveur, non utilisée |
| Réponses locales de Jev, notifications et états de compte d'exemple | Démonstration, sans serveur |
| Mode développement (`?as=…`) et mode test (`?e2e=1`) | Réservés aux essais |
