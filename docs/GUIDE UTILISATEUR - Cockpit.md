# Guide utilisateur du Cockpit RISE

Version du 8 octobre 2026. Ce guide décrit le comportement réel du Cockpit, établi à partir de son code. Les écarts et les points encore ouverts sont regroupés en annexe.

## Sommaire

1. Présentation générale
2. Prise en main
3. Fonctionnalités, une par une
   - 3.1 à 3.4 : Aujourd'hui (tableau de bord, widgets, personnalisation, écarts et échéances)
   - 3.5 à 3.14 : Pilotage (principes communs, Planning, Jalons, Livrables, Risques et problèmes, Actions, Décisions, Baromètre, Comités, Mes tâches)
   - 3.15 : Comités et rapports (générer un rapport, créer un template, contenu des pages, bibliothèque et historique)
   - 3.16 : Base de connaissance
   - 3.17 et 3.18 : Info projet et Référentiel
   - 3.19 : Jev, l'assistant du Cockpit
   - 3.20 : Notifications
   - 3.21 : Mon profil
   - 3.22 : Changer de projet
   - 3.23 : Mises à jour en direct
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
- tenir le **Pilotage** : planning, jalons, livrables, risques et problèmes, actions, décisions et fiches d'arbitrage, baromètre des équipes, calendrier des comités, tâches personnelles ;
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
| Directeur de programme | En plus de son profil, planifie, met à jour et supprime les séances de comité |

Le détail des droits figure au chapitre 4.

## 1.3 Principes à connaître

- **Enregistrement immédiat.** Il n'y a pas de bouton « Enregistrer » dans les tableaux : chaque modification part au serveur dès qu'elle est validée (Entrée, sortie du champ, choix dans une liste). Un toast « Modifié · {votre nom} · saisie directe » le confirme.
- **Le serveur fait foi.** Si le serveur refuse une modification (droit insuffisant, règle non respectée), son message s'affiche dans un toast et l'écran recharge les données : la modification est annulée.
- **Tout est tracé.** Chaque création, modification ou suppression est inscrite au journal d'audit, champ par champ, avec son auteur.
- **Chacun voit son périmètre.** Un Responsable ou un Lecteur ne voit que les données de ses chantiers. Les jalons sans chantier restent visibles de tous. Un risque qui concerne plusieurs chantiers est visible dès que l'un d'eux l'est ; un risque transverse (« Tous les chantiers ») est visible de toute personne qui voit au moins un chantier.
- **Mises à jour en direct.** Une modification faite ailleurs (par un collègue, par Jev, depuis la Console) apparaît sans recharger la page (voir 3.23).
- **Date du jour du projet.** Les retards, écarts et comptes à rebours se calculent avec la date du jour dans le fuseau horaire du projet.
- **Une valeur inconnue n'est ni zéro ni verte.** Un indicateur qui manque de données affiche « non calculé » ou un état vide, jamais une valeur inventée.

## 1.4 Glossaire

| Terme | Définition |
|---|---|
| Projet | Le programme piloté, identifié par un code (par exemple RISE) |
| Chantier | Sous-ensemble du projet avec un responsable (codes C1, C2…), des dates de début et de fin, ses phases et, s'il y a lieu, ses sous-phases |
| Lot | Périmètre de déploiement (vague) |
| Phase, sous-phase | Découpage du planning. Une sous-phase appartient à une phase ; son numéro est libre (par exemple 4.5, 4.2.1 ou C2.1) |
| Risque transverse | Risque qui concerne tous les chantiers du projet, y compris ceux créés ensuite |
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
- **Projet** : le menu « Projet » affiche le code du projet ouvert. Si vous avez accès à plusieurs projets, un clic ouvre la liste de vos projets (voir 3.22).
- **Mettre à jour mes tâches** : le bouton orange ouvre Pilotage › Mes tâches.
- **Navigation** :

| Entrée | Ouvre | Contenu |
|---|---|---|
| Aujourd'hui | Tableau de bord | Widgets, écarts, échéances |
| Pilotage | Planning | Planning, Jalons, Livrables, Risques et problèmes, Actions, Décisions, Baromètre, Comités, Mes tâches |
| Comités et rapports | Générer un rapport | Générer un rapport, Créer un template, Bibliothèque, Historique |
| Base de connaissance | Bibliothèque | Documents du projet |
| Info projet | Fiche projet | Fiche projet, Dispositif, Référentiel (PMO et Administrateur) |

- **Pied de la barre** :
  - la **cloche** des notifications, avec le nombre de non lues (« 99+ » au-delà) ;
  - le bouton **Jev**, l'assistant ;
  - votre **carte** (photo ou initiales, nom, profil principal), qui ouvre **Mon profil**.

**Le bandeau de page**

- La date du jour en toutes lettres, le titre de l'espace et une phrase qui en résume l'usage.
- Les **onglets** de l'espace, sous forme de pastilles. Changer d'onglet remonte en haut de la page.
- Selon l'espace, un bouton d'action : **Personnaliser** (Aujourd'hui), **Créer un template** (Comités et rapports), **Déposer un document** (Base de connaissance).

**Recherche.** Il n'y a pas de recherche globale. Les registres (jalons, risques, problèmes, actions, décisions, mes tâches) et certaines listes du Référentiel ont leur propre champ « Rechercher ».

**Clavier**

- Entrée valide une cellule ou un petit formulaire ; Échap annule.
- Échap ferme les fenêtres flottantes, le panneau de détail et les aperçus.
- Ctrl+Entrée (Cmd+Entrée sur Mac) enregistre un commentaire de cellule.
- Dans le champ de saisie de Jev, Entrée envoie le message et Maj+Entrée va à la ligne.
- Dans le Planning et le plan de livraison des Livrables, Alt+clic sur un groupe replie ou déplie tous les groupes du même niveau.

**Affichage.** Le Cockpit est conçu pour un écran d'ordinateur (largeur minimale d'environ 1 280 pixels). Il n'a pas de version mobile.

**Changer de projet.** Utilisez le menu « Projet » de la barre latérale (voir 3.22).

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
- En attendant le message de Jev, ou s'il n'est pas disponible (module « Message d'accueil de Jev » désactivé par l'administrateur dans la Console, modèle d'IA indisponible, texte refusé par le contrôle), un message calculé s'affiche, sans animation ni signature : « Bonjour {prénom}, {la priorité du jour}. », par exemple « Bonjour Cédric, 1 décision attend votre arbitrage avant le COPIL du 26 oct. »
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

**Widgets et modes réservés aux modules.** « Consommé vs budget », « Atterrissage financier », « Bénéfices attendus », « Trajectoire des bénéfices » et les modes « Pilotage par les coûts » et « Pilotage par la valeur » sont verrouillés tant que le module Budget ou Bénéfices n'est pas activé. Un clic propose **Demander l'activation** (voir 3.13.2).

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
| « Budget programme non renseigné : la slide « Budget » affichera « non évalué » » | Avertissement | Budget programme existant mais non connu. Il n'existe plus d'écran pour le renseigner (onglet Budget retiré du Pilotage) | Renseigner |
| « {n} modifications du projet depuis la capture du {date} » | Avertissement | Le projet a changé depuis le dernier rapport de comité | Régénérer |
| « Action {code} échue le {date} : {titre} » | Blocage | Action non terminée, échéance passée | Relancer |

**Exemple.** Le risque R03 passe à P = 4, I = 5 (criticité 20) sans plan. Le widget Incohérences affiche un blocage « Risque R03 (critique, 20) sans plan de mitigation ». Le Responsable du chantier saisit le plan dans Pilotage › Risques : le blocage disparaît au chargement suivant.

## 3.5 Pilotage : principes communs

**À quoi il sert.** Tenir le suivi du projet. Pilotage compte neuf onglets : Planning, Jalons, Livrables, Risques et problèmes, Actions, Décisions, Baromètre, Comités, Mes tâches. Les onglets Budget et Bénéfices ont été retirés le 5 octobre 2026 (voir 3.13.2).

### 3.5.1 Modifier une donnée existante

- Directement dans le tableau : texte modifiable au clic, listes déroulantes, calendrier pour les dates.
- Entrée valide, Échap annule. Le toast « Modifié · {nom} · saisie directe » confirme l'enregistrement.
- Clic droit sur une cellule modifiable : ajouter un commentaire (Ctrl+Entrée pour l'enregistrer).
- Vous pouvez aussi demander la modification à Jev (voir 3.19.4).

### 3.5.2 Créer un élément

1. Ouvrez l'onglet concerné (par exemple Risques et problèmes).
2. Cliquez sur le bouton **Jev** de la barre latérale. Le panneau de Jev s'ouvre dans le contexte de l'onglet.
3. Décrivez à Jev ce que vous voulez créer : il prépare l'enregistrement, pose les questions utiles et vous présente un récapitulatif « À valider » (voir 3.19.4). Rien n'est enregistré avant votre validation.

Jev crée les risques, les problèmes, les actions et les fiches décision. Les autres éléments se créent ailleurs : phases, sous-phases, chantiers, jalons et livrables dans le Référentiel (Info projet, bouton **+** de l'objet, PMO) ; séances depuis le calendrier des comités (bouton **+** d'un jour, voir 3.13.1). Les icônes « Demander à Jev » des blocs et des lignes du Pilotage ont été retirées le 1er octobre 2026 : Jev s'ouvre par son bouton de la barre latérale.

### 3.5.3 Règles communes

- Les codes (R01, A-01, D-001, J01…) sont attribués par le serveur.
- Chaque création ou modification est tracée au nom de son auteur.
- Un Responsable ne crée que sur ses chantiers : « Donnée à rattacher à vos chantiers » (avec la liste des chantiers autorisés).
- Sans droit sur la donnée, l'écran affiche « Droit insuffisant : seul le PMO ou le Responsable du chantier peut modifier cette donnée ».
- Les tableaux du Pilotage n'ont pas de bouton de suppression. Une action se termine, un risque se clôt, une décision s'annule. Un risque, un problème, une action ou une décision peut toutefois être supprimé par Jev, après confirmation renforcée (voir 3.19.4). Une séance de comité se supprime depuis son calendrier (voir 3.13).

## 3.6 Planning

**À quoi il sert.** Voir le planning des phases, sous-phases et chantiers, et suivre leur avancement.

**Bandeau « Temps restant au {date} »** : jours avant la fin du projet, avant la fin de chaque phase en cours, avant la fin de chaque chantier en cours (mis en évidence sous 30 jours). Le bouton **Indicateurs affichés** choisit ceux qui apparaissent.

### 3.6.1 Le Gantt et ses niveaux

Le Gantt est en lecture seule : il est alimenté par le Référentiel (phases, sous-phases, chantiers et leurs dates) et par le suivi d'avancement.

Le bandeau **Niveau** choisit ce que montre le Gantt :

| Niveau | Lignes affichées |
|---|---|
| « Phases » (par défaut) | Une ligne par phase |
| « Phase > Sous-phase » | Chaque phase, puis ses sous-phases |
| « Phase > Chantier » | Chaque phase, puis les chantiers qui y participent |
| « Phase > Chantier > Sous-phase » | Chaque phase, ses chantiers, puis, sous chaque chantier, ses sous-phases de la phase |
| « Sous-phases » | Toutes les sous-phases |
| « Tous les chantiers » | Un chantier par ligne, sur ses dates de début et de fin |
| « Un chantier… » (liste) | Le chantier choisi, puis ses sous-phases. Un chantier sans sous-phase rattachée montre les sous-phases de ses phases comprises dans sa période |

- Les chantiers sont rangés par code croissant (C1, C2, C3…) dans toutes les vues ; les sous-phases par numéro.
- Dans les vues « Phase > Chantier », un chantier qui couvre plusieurs phases apparaît sous chacune, réduit à son **segment** dans la phase : de sa première à sa dernière sous-phase de la phase, sinon l'intersection des dates du chantier et de la phase. Son avancement est la moyenne de ses sous-phases de la phase, pondérée par leur durée (sans sous-phase dans la phase : celui de la phase). Ces lignes sont calculées : leurs dates et leur avancement ne se modifient pas sur la ligne.
- Les trois niveaux se distinguent par la forme, la couleur restant réservée à l'état (avancement, retard) : la **phase** est une barre récapitulative fine, avec son numéro dans une pastille ; le **chantier** est une capsule, avec son code dans une puce à sa teinte ; la **sous-phase** est un filet fin. Des filets d'arborescence relient chaque ligne à son parent. La légende rappelle les trois niveaux avant les états.
- « prévu X % » n'est affiché que s'il diffère du réel.

**Options d'affichage** : Jalons, Date du jour, Chemin critique, % prévu, % réel, Atterr. rythme actuel, Atterr. rythme prévu. Par défaut : Jalons, Date du jour, % prévu et % réel. Un losange de jalon est orange si l'un des jalons regroupés glisse.

### 3.6.2 Grouper et dégrouper à la souris

Dans les vues hiérarchiques (« Phase > Sous-phase », « Phase > Chantier », « Phase > Chantier > Sous-phase », « Un chantier… ») :

- **clic** sur une phase (ou sur un chantier dans « Phase > Chantier > Sous-phase », ou sur le chantier de « Un chantier… ») : replie ou déplie ses enfants. Une fois replié, le chevron tourne et le nombre d'enfants s'affiche (par exemple « 5 chantiers ») ;
- **Alt+clic** : replie ou déplie tous les groupes du même niveau ;
- boutons **Tout replier** et **Tout déplier**, au bout du bandeau Niveau.

Le tableau « Suivi d'avancement » suit le même repli. L'état replié est gardé tant que l'écran reste ouvert.

### 3.6.3 Tableau « Suivi d'avancement »

- Colonnes : Phase, Sous-phase, Chantier, Responsable, Début, Fin, Prévu, Réel, Retard, Atterr. rythme actuel, Atterr. rythme prévu. Les lignes suivent le niveau choisi pour le Gantt.
- Vous pouvez modifier les dates (calendrier), le % réel (de 0 à 100) et le responsable.
- **L'avancement d'une phase qui a des sous-phases n'est pas modifiable** : il est calculé. Une saisie est annulée avec le message « Avancement de la phase : moyenne de ses sous-phases pondérée par leur durée. Modifiez celui des sous-phases. ».
- Sur une ligne de chantier dans une phase (vues « Phase > Chantier ») : « Dates du chantier dans cette phase : calculées à partir de ses sous-phases. Modifiez les sous-phases ou le chantier. » et « Avancement du chantier dans cette phase : moyenne de ses sous-phases pondérée par leur durée. ».

### 3.6.4 Calculs

| Valeur | Calcul |
|---|---|
| % prévu | Temps écoulé ÷ durée × 100, borné entre 0 et 100, sauf valeur forcée |
| Avancement d'une phase avec sous-phases | Σ (avancement × durée) ÷ Σ durée de ses sous-phases, arrondi à l'entier. Durée en jours calendaires, début et fin inclus ; une sous-phase sans dates complètes compte pour 1 jour. Recalculé à chaque modification d'une sous-phase (planning ou Référentiel) |
| Statut | Terminé si réel ≥ 100 ; à venir si le début est après aujourd'hui ; sinon en cours |
| Retard (j) | (prévu − réel) / 100 × durée, pour un élément en cours. « À l'heure » si 0 ; ambre au-delà ; rouge au-delà de 30 jours |
| Atterrissage au rythme actuel | Aujourd'hui + jours écoulés × (100 − réel) / réel |
| Atterrissage au rythme prévu | Aujourd'hui + (100 − réel) / 100 × durée |

À côté de chaque atterrissage : « +n j vs fin » ou « dans les temps ».

**Exemple d'avancement pondéré.** Une phase a trois sous-phases avancées à 10 %, 30 % et 20 %, qui durent 1, 2 et 3 mois. Son avancement vaut 22 % (la moyenne simple donnerait 20 %). Une phase sans sous-phase garde l'avancement saisi.

### 3.6.5 Droits et création

**Droits.** Le PMO modifie tout. Le Responsable modifie les dates et le % réel de son chantier. Seul le PMO change le responsable.

**Créer un élément de planning** (PMO) : dans le Référentiel (Info projet), objets Phases, Sous-phases ou Chantiers, bouton **+**.

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

**En-tête** : part livrée (« % de livraison »), livrables validés, en production, en retard, à venir, le périmètre affiché et « N à livrer sous 30 jours ». Ces compteurs suivent le niveau et le filtre choisis.

### 3.8.1 Plan de livraison

Le plan de livraison est une frise en lecture seule, alimentée par l'objet Livrables du Référentiel (dates issues des sous-phases) et par le tableau de suivi.

- **Niveau** : le même bandeau que le Planning, avec les mêmes sept niveaux : « Phases », « Phase > Sous-phase », « Phase > Chantier », « Phase > Chantier > Sous-phase », « Sous-phases » (par défaut), « Tous les chantiers » et la liste « Un chantier… ». Les livrables sont regroupés selon ce niveau ; dans les vues par phase, chaque phase porte un en-tête au-dessus de ses groupes. Les livrables sans chantier sont regroupés sous « Non rattachés à un chantier » ou « Sans chantier ».
- **Afficher** : une ligne de filtres sous le bandeau Niveau, avec le nombre de livrables de chacun :
  - « À produire » (par défaut) : livrables non validés ;
  - « Critiques » : livrables en retard ou au risque délai critique ;
  - « Validés » ;
  - « Tous ».
- Les flèches **Période précédente** et **Période suivante** font défiler la frise ; un repère montre « Aujourd'hui ».

### 3.8.2 Grouper et dégrouper le plan de livraison

- **Clic** sur l'en-tête d'un groupe (sous-phase, phase ou chantier selon le niveau) : replie ou déplie ses livrables.
- Dans les vues par phase, **clic** sur la phase : replie ou déplie tous ses groupes.
- **Alt+clic** : replie ou déplie tous les groupes du niveau (« Alt+clic : tous les groupes », « Alt+clic : toutes les phases »).
- Boutons **Tout replier** et **Tout déplier**, au bout du bandeau Niveau.
- Un groupe replié garde sa **synthèse sur la frise** : une barre sur sa période (du premier début à la dernière échéance), l'avancement moyen (un livrable validé compte pour 100 %), la couleur du pire état (rouge pour un retard ou un risque critique, ambre pour « sous tension ») et le libellé « N livrables · X % ». Une phase repliée rappelle aussi cette synthèse à côté de son nom.
- Le repli est gardé tant que l'écran reste ouvert. Il ne change pas le tableau de suivi situé en dessous.

### 3.8.3 Suivi d'avancement

Colonnes : Livrable, Responsable, Début, Fin, Retard, Avancement (%), Risque délai.

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

### 3.8.4 Créer un livrable

PMO uniquement, dans le Référentiel (Info projet), objet Livrables, bouton **+** : nom, sous-phase (les dates en découlent), chantier ou « Non rattaché (transverse) », équipe, responsable de production.

Si la sous-phase choisie n'est pas parmi celles du chantier, ou si sa phase n'est pas une phase du chantier, un avertissement s'affiche (« Avertissement : la sous-phase … n'est pas parmi celles du chantier … Enregistrement possible. »). Il ne bloque pas l'enregistrement. Le même avertissement existe dans le formulaire d'un jalon.

## 3.9 Risques et problèmes

### 3.9.1 Registre des risques

- Colonnes : #, Risque, P, I, Crit., Plan de mitigation, Porteur et chantier, Échéance. La colonne chantier liste les chantiers du risque, séparés par des virgules, ou « Tous les chantiers » pour un risque transverse.
- Filtres : niveau (Critique, Élevé, Modéré), chantier (« Tous chantiers » ou un chantier), « Sans plan ». Un plan vide s'affiche « Aucun plan approuvé — à qualifier ».
- **Filtre par chantier** : un risque apparaît pour chacun de ses chantiers ; un risque transverse apparaît quel que soit le chantier choisi.

**Criticité = P × I**

| Niveau | Score | Suivi recommandé |
|---|---|---|
| Critique | ≥ 20 | Revue COPIL, plan sous 5 jours |
| Élevé | 12 à 19 | Suivi hebdomadaire en comité projet |
| Modéré | 6 à 11 | Suivi en comité de chantier |
| Faible | < 6 | Suivi en comité de chantier |

L'onglet affiche aussi la **matrice P × I** et l'**évolution sur 8 semaines** (risques ouverts et critiques en fin de semaine). L'en-tête de l'évolution donne les compteurs du registre : « N cartographiés dont X critiques », et la variation sur les semaines affichées (« · +n sur 8 semaines »). Sans risque : « Aucun risque cartographié. ».

### 3.9.2 Un risque sur un, plusieurs ou tous les chantiers

Un risque peut concerner un chantier, plusieurs chantiers, ou tous les chantiers (risque **transverse**).

- Avec Jev, citez les chantiers (« sur C1 et C3 ») ou « tous les chantiers ». Si vous ne les précisez pas, Jev propose les chantiers où vous pouvez écrire en pastilles à cocher, et **Tous les chantiers (transverse)** si vous êtes PMO.
- Cochez un ou plusieurs chantiers, puis cliquez sur **Valider la sélection**.
- Ou choisissez **Tous les chantiers (transverse)** : le risque concerne tous les chantiers, y compris ceux créés ensuite. Le récapitulatif affiche « Chantiers : Tous les chantiers ».
- Un risque a toujours au moins un chantier, ou est transverse.

**Droits sur un risque à plusieurs chantiers**

- **Lecture** : le risque est visible dès que l'un de ses chantiers l'est. Un risque transverse est visible de toute personne qui voit au moins un chantier.
- **Écriture** : il faut le droit d'écriture sur **chacun** des chantiers du risque.
- **Risque transverse** : seul le PMO le crée et le modifie. Un Responsable qui tente d'en créer un reçoit « Risque transverse (tous les chantiers) : réservé au PMO ».

### 3.9.3 Créer un risque

Demandez-le à Jev (voir 3.19.4) : libellé, probabilité et impact (1 à 5, criticité calculée), plan de mitigation, porteur, chantiers concernés, échéance. Le risque est créé au statut Ouvert. Statuts possibles : Ouvert, En mitigation, Clos.

**Exemple.** Le PMO crée le risque « Retard de livraison de l'éditeur » sur les chantiers C2 et C4. Le Responsable de C2 le voit et peut le lire ; il ne peut le modifier que s'il est aussi Responsable de C4.

### 3.9.4 Problèmes ouverts

- Filtres : sévérité 5, 4, 3 et moins, chantier, « Échéance dépassée ». Tris : sévérité, résolution, porteur, chantier.
- Créer un problème : demandez-le à Jev (voir 3.19.4). Champs : libellé, sévérité (1 à 5), détail, porteur, chantier (un seul), résolution visée. Statuts : Ouvert, En résolution, Résolu.

### 3.9.5 Droits et clôture

**Droits.** PMO, et Responsable pour ses chantiers. Seul le PMO change le porteur et la criticité d'un objet existant.

**Clore un risque ou un problème.** Demandez-le à Jev (par exemple « R03 est mitigé » ou « clore P02 »), puis validez sa proposition (voir 3.19.4).

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

**Sans relevé.** Le baromètre n'affiche aucune donnée de démonstration. Tant qu'aucun relevé n'est saisi, la répartition du ressenti et les écarts affichent « — », et la courbe n'a pas de tracé.

**Droits.** PMO, ou Responsable du chantier transverse : « Baromètre : PMO ou Responsable du chantier transverse ».

## 3.13 Comités : calendrier des séances

### 3.13.1 Calendrier des séances

- Calendrier mensuel, une couleur par instance. La légende rappelle : « Cliquez sur + pour planifier un comité ; glissez une séance vers un autre jour pour la déplacer. ».
- Une séance planifiée dont la date est passée est entourée en orange : elle est à confirmer.
- Un clic sur un jour ouvre, dans le panneau latéral, la fiche de chaque séance du jour : date, heure, lieu, statut (Planifiée, Tenue, Annulée), participants, rapport (« Générer le rapport » ou « Rapport vN · statut ») et bouton **Confirmer**. Le panneau n'affiche pas d'infobulles.
- Glissez une séance planifiée vers un autre jour pour la déplacer (« Seule une séance planifiée peut être déplacée »).

**Planifier un comité depuis le calendrier**

1. Survolez un jour (aujourd'hui ou à venir) et cliquez sur le **+** qui apparaît (un double-clic sur le jour a le même effet).
2. Le formulaire « Nouveau comité » s'ouvre dans le panneau latéral : choisissez l'instance parmi les pastilles, à sa couleur. Le titre et le numéro (« COPIL n°24 ») sont calculés ; les participants sont les membres de l'instance.
3. L'heure et le lieu sont repris de la dernière séance non annulée de l'instance. Modifiez-les si besoin.
4. Cliquez sur **Planifier** (ou **Annuler**). Toast : « Comité planifié · {instance} n°N ».


**Supprimer un comité**

1. Dans la fiche de la séance, cliquez sur la corbeille, en pied de fiche, à droite de « Générer le rapport ».
2. La fiche demande « Supprimer {séance} ? ». Cliquez sur **Supprimer** (en rouge) ou **Annuler**.
3. Une séance à laquelle un rapport est rattaché ne peut pas être supprimée : la corbeille est grisée et le message indique « Un rapport est rattaché à {séance} : suppression impossible ».

La suppression est tracée au journal d'audit.

**Règles**

- Droits : PMO et directeur de programme (« Séances : PMO et directeur de programme »). Le **+** et la corbeille n'apparaissent que pour eux.
- « Une séance tenue ne peut plus changer de statut ».
- « Une séance future ne peut pas être confirmée ».
- « Une séance annulée doit d'abord être rétablie ».
- « Seules les séances planifiées peuvent changer de date ».

### 3.13.2 Modules Budget et Bénéfices

Budget et Bénéfices sont des **modules optionnels**, activés projet par projet par l'administrateur de la plateforme. Leurs onglets ont été retirés du Pilotage le 5 octobre 2026. Ils restent visibles à deux endroits :

- dans **Aujourd'hui › Personnaliser**, les widgets et modes réservés aux modules portent un cadenas ;
- dans **Créer un template**, la carte du composant **Budget** porte un cadenas et la mention « Module Gestion du budget non activé ».

**Demander l'activation d'un module**

1. Dans Aujourd'hui › Personnaliser, cliquez sur un widget ou un mode verrouillé : « Le module … n'est pas activé pour votre projet ».
2. Cliquez sur **Demander l'activation** (PMO ou Responsable).
3. Toast : « Demande d'activation envoyée à l'administrateur du projet ». L'écran affiche « Demande envoyée à l'administrateur ».
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

L'écran présente deux tuiles.

- À gauche, **TEMPLATES ACTIFS · N** : les templates publiés et actifs, regroupés par comité.
  - Recherche « Rechercher un template, un auteur, un composant » : elle porte sur le nom, l'auteur, les composants et le comité, sans tenir compte des accents ni des majuscules.
  - Filtre par comité (« Tous les comités » par défaut).
  - Groupes repliables : seul le groupe du template sélectionné est ouvert au départ. Le bouton du pied déplie ou replie tous les groupes.
- À droite, **PRÉVISUALISATION** : les sections numérotées du template sélectionné et leur nombre de pages.

Chaque ligne de template porte :

- le bouton **Télécharger**, qui génère le rapport ;
- un interrupteur d'activation. Un template désactivé reste visible, atténué, jusqu'au prochain affichage de l'écran (un clic le réactive). Il reste consultable dans la Bibliothèque ;
- l'étiquette **Nouveau** pour un template tout juste mis en service, jusqu'à la première génération d'un rapport (24 heures au plus) ;
- pendant la mise en service d'un template publié : « Mise en service » et sa progression. Le template n'est pas encore utilisable. En cas d'échec : « Mise en service interrompue » et le lien **Relancer la mise en service**.

**Générer un rapport, pas à pas**

1. Cliquez sur **Télécharger** sur la ligne du template.
2. Cockpit contrôle d'abord les données (voir « Contrôle avant génération » plus bas).
3. Une fenêtre demande : « Souhaitez-vous verser ce rapport dans la Base de connaissance du projet ? Il y sera conservé comme support de comité, versionné et indexé. »
   - **Oui, verser** : le rapport est généré, téléchargé et déposé dans la Base de connaissance ;
   - **Non, télécharger seulement** : le rapport est généré et téléchargé, rien n'est enregistré dans la Base de connaissance.
4. La ligne du template suit chaque étape, avec « n / 5 » et une barre de progression : Contrôle des données, Collecte des données du jour, Rédaction des titres et de la synthèse, Mise en page au format du template, Téléchargement du fichier. Puis « Rapport téléchargé ».
5. En cas d'échec : « Génération interrompue », la cause et le lien **Réessayer**.

Le fichier est un PowerPoint (.pptx) au format du template, rempli avec les données du jour : couverture, une page intercalaire par section, une page par composant, page de clôture. Un template sans format utilise la présentation par défaut de RISE.

**Verser le rapport dans la Base de connaissance**

- Le PowerPoint produit est déposé comme un dépôt manuel : mêmes contrôles, résumé et indexation (voir 3.16). Il prend le nom « {template} v{version} » et le type « Support de comité ».
- Le même rapport versé à nouveau devient la version suivante du document. Un contenu identique est refusé comme doublon.
- Si le versement échoue, le fichier est quand même téléchargé, et un message l'indique : « Rapport généré, mais non versé dans la Base de connaissance : {motif} ».
- Toast en cas de succès : « Rapport généré et versé dans la Base de connaissance · {nom} ».
- Le rapport versé est aussi rattaché à la prochaine séance planifiée du comité du template, au statut Brouillon, avec une version (v1, v2… selon les rapports déjà rattachés à la séance). Sans séance planifiée : « Rapport non enregistré : template ou séance introuvable ».

**Règles**

- Seuls les templates publiés et actifs sont listés ; un template en cours de mise en service ne peut pas encore être généré.
- Par défaut, le relecteur d'un rapport rattaché à une séance est vous, et le validateur est le directeur de programme.
- Un rapport passe de Brouillon à En relecture, puis Publiée. « Un rapport publié ne revient pas en arrière ».
- Un template désactivé ne se génère plus : « Template inactif ».
- La génération est tracée et inscrite à l'historique.

**Contrôle avant génération.** Avant chaque génération, Cockpit contrôle les données. S'il y a des points d'attention, une fenêtre les liste : **Générer quand même** ou **Annuler**. S'il y a une anomalie bloquante, la génération est impossible (**Fermer**).

**Publications successives.** Chaque rapport généré rouvre le PowerPoint de référence du template et n'en change que les valeurs : textes, chiffres, lignes des tableaux, données des graphiques (graphiques PowerPoint natifs, modifiables), date et périodes. Les titres-messages et la synthèse sont rédigés à chaque génération par l'IA (fonction « Génération de rapports »), à partir des seules données du Cockpit : un texte qui cite un chiffre absent des données, ou trop long pour sa zone, est redemandé une fois, puis remplacé par le texte par défaut (intitulé du composant), avec un point d'attention. La mise en page et le design ne bougent pas. Un tableau garde sa hauteur de ligne : un texte trop long est abrégé « … », et au-delà du nombre de lignes que la page peut contenir, la dernière ligne indique « … et N autres ».

### 3.15.2 Créer un template : principes et étape A

Le bouton **Créer un template** du bandeau ouvre un assistant en six étapes. Un bandeau unique, en haut de l'assistant, montre les étapes avec leur lettre : A · Fiche d'identité, B · Format du rapport, C · Composants, D · Ordre et données, E · Prévisualisation, F · Publication. L'étape en cours est en bleu nuit. Un clic sur une étape accessible y mène ; ce n'est plus possible pendant la publication.

**Session de création.** Le template en cours de création n'est pas conservé : changer d'onglet ou de menu, publier ou recharger Cockpit ramène « Créer un template » à l'étape A, vierge.

**Étape A · Fiche d'identité** : nom (obligatoire, 200 caractères), comité de rattachement, numéro de version (1.0 par défaut), auteur (vous, par défaut), description. Sans nom : « Renseignez au moins le nom du template. ».

### 3.15.3 Étape B · Format du rapport

« Chargez un modèle pour chacun des 4 types de page : le PowerPoint généré reprendra leurs fonds, logos, couleurs, polices et positions. » Les 4 pages sont obligatoires : **page de couverture** (première diapositive), **page intercalaire** (transition entre deux sections), **page standard** (contenu : texte, tableaux, graphiques) et **page de clôture** (dernière diapositive).

**Charger une page**

- Format recommandé : **.pptx**. PDF, PNG et JPEG sont acceptés en complément, avec une extraction moins précise : depuis un PDF, les fonds, aplats et textes sont repris, pas les images ; une image sert de fond plein écran et les zones de texte sont estimées.
- Sélectionnez la page dans la séquence, puis chargez son fichier depuis la zone de l'aperçu (« Charger un fichier », ou glissez-déposez le fichier sur l'aperçu ou sur la vignette). « Analyse en cours… » s'affiche pendant la lecture.
- Un fichier de plusieurs diapositives propose la liste de ses diapositives ; s'il en compte 4 ou plus, la diapositive du type de page est proposée (1, 2, 3 et la dernière). Changez-la dans la liste si besoin.
- **Retirer une page** : icône corbeille en haut à droite de sa vignette (« Retirer la page de … »). La page vidée est sélectionnée : chargez le nouveau fichier. Il n'y a plus de bouton « Remplacer » ni « Supprimer » sous l'aperçu.

**Séquence des 4 pages.** Chaque vignette montre la page et son statut, « À vérifier » ou « Vérifiée ». Un clic ouvre la page dans l'espace de travail. Le compteur indique le nombre de pages chargées.

**Espace de travail**

- L'aperçu de la diapositive porte ses zones : contour vert plein, **zone de données**, qui reçoit le texte du rapport avec sa mise en forme ; hachuré rouge, **contenu d'exemple**, retiré de chaque rapport (sur la page standard, sa place reçoit les tableaux et graphiques) ; **design fixe**, visible au survol. La légende compte les zones de chaque catégorie.
- Le survol d'une zone met en évidence sa ligne dans « Zones de la page », et inversement ; une étiquette affiche son rôle.
- Sous l'aperçu : le nom du fichier (et la liste des diapositives), la fiche technique (format, fond, éléments, zones, polices, titres, texte, marges) et les couleurs détectées (code au survol).

**Zones de la page** (pages PowerPoint) : un rôle par forme, proposé par l'IA (sinon par règles) : **Design fixe (gardé)**, **Contenu d'exemple (retiré)**, **Titre**, **Sous-titre**, **Nom** ou **Numéro de la section**, **Date du rapport**, **Période des données**, **Nom du projet**, **Client**, **Comité**, **Numéro de page**, **Mention de bas de page (gardée)**. Dès qu'un rôle diffère de la proposition, **Rétablir la proposition de l'IA** apparaît et remet les rôles proposés pour la page. Une couverture, une intercalaire ou une page standard sans zone de titre est refusée (« désignez la zone de titre »).

**Valider le format**

- **Marquer comme vérifiée** valide la page ; le pied compte les pages vérifiées.
- **Valider le format** passe à l'étape suivante quand les 4 pages sont chargées, sans erreur et vérifiées ; sinon il ouvre la page à reprendre.
- **Étape précédente** revient à la Fiche d'identité.

**Messages**

- Erreurs (en rouge, la page n'est pas retenue) : « Format non pris en charge », « Ancien format PowerPoint (.ppt) », « Le contenu ne correspond pas à l'extension », « Fichier PowerPoint illisible ou endommagé », « Ce fichier est protégé par un mot de passe », « Image trop petite », et, si les dimensions diffèrent entre les pages PowerPoint, « Les 4 pages doivent avoir le même format ».
- Alertes (en orange, la page est retenue) : « Police introuvable » (police ni standard d'Office, ni incorporée au fichier : à installer sur les postes, ou à incorporer), zone de titre, de contenu ou de pagination absente, extraction partielle d'un PDF ou d'une image.

### 3.15.4 Étapes C et D · Composants, ordre et données

**Étape C · Composants.** Choisissez parmi Synthèse de situation, Planning, Jalons, Risques et problèmes, Actions, Décisions, Baromètre du projet, Tableau de bord, Budget. Chaque carte indique la nature du composant (Gantt, Frise, Matrice et tableau, Échéancier, Arbitrages, Tableau de bord, Indicateurs, Indicateurs et texte…). Chaque composant devient une page du rapport. Sans composant : « Sélectionnez au moins un composant. ». Le composant **Budget** n'est disponible que si le module Budget est activé pour le projet dans la Console : sinon sa carte porte un cadenas et la mention « Module Gestion du budget non activé ».

**Étape D · Ordre, sections et données**

- **Ordre** : saisissez un composant par sa poignée (six points, devant son numéro) et déposez-le au-dessus ou au-dessous d'un autre ; un trait vert indique l'emplacement. Les numéros sont recalculés ; les coupures de section restent à leur place.
- **Sections** : le rail à gauche de la liste matérialise les chapitres. Chaque section commence par un repère numéroté, « SECTION n · INTERCALAIRE » et son titre (facultatif ; par défaut, le nom de son premier composant). Entre deux composants, survolez le point du rail : **+ Nouvelle section à partir d'ici** fait commencer une section au composant suivant. Un clic sur le repère numéroté d'une section (à partir de la section 2) la rattache à la section précédente. Chaque section reçoit une page intercalaire.
- **Données** : pour chaque composant, les **indicateurs** (pastilles à activer, compteur « actifs / total »), le **périmètre** (Projet, Vague, Phase ou Chantier) et sa **cible** (« Projet entier », ou la liste des vagues, phases ou chantiers du projet), la **période** proposée pour ce composant (par exemple 3, 6 ou 12 derniers mois pour le baromètre) ou « Situation du jour ». Les données sont recalculées à chaque publication.
- Le panneau **Déroulé du rapport** montre en temps réel la couverture, chaque section avec ses composants numérotés, puis la clôture.
- Une section limitée à une vague, une phase ou un chantier doit avoir sa cible : « Composant incomplet ».

### 3.15.5 Étape E · Prévisualisation

- Dès l'arrivée, l'écran montre le nombre de pages, leurs numéros et libellés et la structure du document.
- Une carte suit la construction : format de l'étape B appliqué, données du jour collectées, pages générées · n / N, contrôle des données. Chaque page apparaît dès qu'elle est prête.
- Survolez une page pour la retrouver dans la structure ; cliquez-la pour l'agrandir (‹ ›, flèches du clavier, Échap pour fermer).
- Le rapport complet est construit avec le format de l'étape B, les données du jour et les textes rédigés par l'IA (titre-message de chaque page, synthèse) : couverture, intercalaires, une page par composant, clôture.
- L'encadré **Contrôle des données** liste les anomalies : en orange, une donnée manquante ou incohérente (par exemple « Budget : budget du programme non connu », « Jalons : date de référence manquante ») ; en rouge, une anomalie bloquante (par exemple un périmètre qui n'existe plus). Le contrôle visuel automatique signale aussi un élément qui recouvre un texte du modèle, un texte trop long pour sa zone ou un élément qui sort de la page. Une alerte marque sa page d'un point ambre ; « Voir la page NN » l'ouvre.
- « Suivant › » s'active à la fin de la construction.
- Pour corriger, revenez aux étapes précédentes (design, composants, ordre, données) : l'aperçu se reconstruit à votre retour.

### 3.15.6 Étape F · Publication et mise en service

- Le récapitulatif reprend le template : nom, version, comité, auteur, format et ses fichiers, composants, sections, nombre exact de pages, contrôle des données, description. Au survol d'une ligne, « Étape X › » ramène à l'étape concernée.
- La publication est impossible tant qu'une anomalie bloquante subsiste au contrôle des données (« Voir l'étape E › »).
- **Valider et publier** génère le **PowerPoint de référence** du template (version 1.0) : structure figée, design de l'étape B et zones de données. Pendant l'enregistrement, le bouton affiche « Publication… ». En cas d'échec : « Publication interrompue », la cause et **Relancer la publication**.
- Une fois le template enregistré, Cockpit ouvre « Générer un rapport » : la ligne du nouveau template, en tête de son comité, indique « Mise en service » et sa progression. Il n'est pas encore utilisable (les autres templates le restent).
- Quand il est prêt, il porte l'étiquette « Nouveau » et une notification l'annonce. Il rejoint aussi la Bibliothèque.

**Versions.** Le template publié est enregistré et versionné. Toute modification de sa structure ou de son design (nom, comité, composants, format) publie une nouvelle version (1.0 → 1.1) ; activer ou désactiver le template n'en crée pas. Les versions précédentes restent conservées.

### 3.15.7 Contenu des pages du rapport

Couleurs, polices et hiérarchie des textes viennent des pages modèles de l'étape B. Chaque bloc d'une page suit un indicateur choisi à l'étape D.

**Planning (Gantt).** Une barre par phase : gris, terminée ; bleu, avancement de la phase en cours, dans sa barre ; rouge, en retard ; contour, à venir. La phase en cours est mise en avant ; un repère « Aujourd'hui » et les jalons sur leur couloir complètent le diagramme ; en bas, la phase en cours, le prochain jalon et la fin du planning. Avec l'indicateur « Sous-phases », au-delà de 25 lignes, le planning passe en tableau et les sous-phases des phases terminées y sont regroupées. Pour un composant limité à un chantier : les phases du chantier et, s'il en a, ses seules sous-phases.

**Planning : chemin critique et atterrissages.** Trois indicateurs facultatifs : **Chemin critique** (contour rouge autour des phases critiques), **Atterrissage rythme actuel** (cercle ambre : date de fin projetée au rythme observé) et **Atterrissage rythme prévu** (losange gris : date de fin si le reste avance au rythme prévu) ; l'écart à la fin prévue s'affiche en jours. En tableau, une colonne « Atterrissage » reprend ces dates.

**Baromètre (tableau de bord).** Score global et écart au relevé précédent, évolution du score, avis des répondants, score par domaine et points clés.

**Jalons (frise).** Un cercle par jalon (plein : date passée ; foncé : prochain jalon, avec son délai ; contour rouge : glissé après sa date de référence), son nom, sa date et l'écart à la référence quand la date a bougé ; quatre indicateurs en bas (jalons franchis, glissés, prochain jalon, glissement moyen).

**Risques (matrice et tableau).** Tableau des risques (criticité en pastille colorée, plan de mitigation sous l'intitulé, porteur et chantier, échéance) à côté de la matrice probabilité × impact, où chaque risque apparaît par son code. Pour un composant limité à un chantier : les risques qui citent ce chantier et les risques transverses. La colonne chantier donne les noms des chantiers, ou « Tous les chantiers ».

**Actions (échéancier).** Les actions ouvertes, les plus en retard d'abord, avec leur responsable, leur chantier et leur origine (« issue de R01 ») ; un axe « Aujourd'hui » montre le retard en rouge à gauche et le délai à droite (ambre sous 14 jours) ; un panneau sombre donne le nombre d'actions en retard et leur répartition par échéance.

**Décisions (arbitrages).** À gauche, les décisions en attente, quelle que soit la période (étape : brouillon, en revue, à arbitrer ; durée d'attente, en rouge à partir de 30 jours ; séance attendue) ; à droite, les décisions prises sur la période, avec ce qui a été décidé. Sans décision prise sur la période, les trois dernières sont rappelées.

**Tableau de bord.** La phase en cours (avancement réel en grand, prévu à date et écart en points, fin prévue), le go-live prévu, le prochain jalon et le chemin des phases, puis la santé du projet en quatre tuiles : risques dont critiques, actions dont en retard, jalons glissés, décisions dont à arbitrer.

### 3.15.8 Bibliothèque et historique

**Bibliothèque**

- Filtre État : Tous, Actifs, Inactifs. Résumé : « N templates · N actifs · N inactifs ».
- Colonnes : Template, Auteur, Version, Composants, Pages, Publié le, Comité, État.
- Interrupteur d'état : « Template désactivé · {nom} » ou « Template réactivé · {nom} — disponible dans Générer un rapport ». Un template inactif reste conservé et consultable.
- **Visualiser** ouvre l'aperçu du template ; **Télécharger** enregistre le PowerPoint du template avec les données du jour ; **Supprimer définitivement** le supprime.
- Un template utilisé par un rapport ne peut pas être supprimé : « Suppression impossible : objet utilisé ailleurs ». Désactivez-le plutôt.

**Historique**

- « Historique des générations » : Rapport, Comité, Version, Généré le, Par, et colonne Base de connaissance (« Versé » / « Non versé »). Un clic sur « Versé » ouvre la Base de connaissance.

## 3.16 Base de connaissance

**À quoi elle sert.** Conserver les documents du projet. Chaque document déposé est lu, résumé et indexé automatiquement. Jev s'en sert pour répondre aux questions sur les documents (voir 3.19.3).

Les documents y arrivent de deux façons : par un dépôt manuel (voir 3.16.1), ou par le versement d'un rapport de comité depuis Comités et rapports (type « Support de comité », voir 3.15.1).

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

- L'en-tête d'Info projet affiche le code et le client du projet ouvert.
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
| Chantier | Risques (dont ceux à plusieurs chantiers qui le citent), problèmes, actions, décisions, jalons, livrables, suivi d'avancement, chantiers dépendants, habilitations, templates |
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
| Sous-phase | Rattachement à une phase obligatoire. **Numérotation libre**, choisie par le directeur de projet (« 5.1 », « 4.2.1 », « C2.1 »…) : le numéro n'a plus à commencer par celui de la phase. Il doit être unique dans le projet (« Numéro … déjà utilisé par une autre sous-phase — modification annulée ») et ne contenir ni espace, ni « ; », ni « · » (« Le numéro ne peut contenir ni espace, ni « ; », ni « · ». »). Avertissement si elle sort de la période de sa phase. Changer sa phase est refusé si un chantier qui la cite n'a pas la nouvelle phase. Supprimer une sous-phase la retire des chantiers qui la citaient (le message précise de combien de chantiers) |
| Chantier | Nom et responsable obligatoires ; code C1, C2… attribué automatiquement. Colonnes : n°, nom, responsable, statut, dépendances, phases, sous-phases, **début** et **fin** (voir ci-dessous) |
| Jalon | Nom, phase et date prévue obligatoires ; code J01… automatique ; référence = date prévue par défaut |
| Équipe | Nom unique (« L'équipe « X » existe déjà ») |
| Rôle | Libellé unique (« Le rôle « X » existe déjà ») ; 4 niveaux : Gouvernance, Métiers, Maîtrise d'ouvrage, Maîtrise d'œuvre |
| Personne | Prénom, e-mail valide et unique dans le projet, équipe obligatoires |
| Instance | Nom, nom court unique, couleur, fréquence (quotidienne à semestrielle, ou à la demande) ; membres : président, membre, secrétaire, invité |
| Livrable | Nom, sous-phase, responsable et échéance obligatoires ; échéance = fin de la sous-phase par défaut |

### 3.18.1 Chantiers : dates, phases, sous-phases et dépendances

**Dates de début et de fin.** Chaque chantier a ses propres dates, saisies dans les colonnes « Début » et « Fin » (calendrier). Le Planning les utilise dans la vue « Tous les chantiers » : un chantier ne paraît plus durer jusqu'à la fin du projet. À l'import d'un projet, des dates absentes sont calculées : première date de début et dernière date de fin des sous-phases du chantier, sinon de ses phases, sinon du projet.

**Phases et sous-phases.** La colonne « phases » liste les phases auxquelles le chantier participe. La colonne « sous-phases » ouvre un sélecteur à cases limité aux sous-phases des phases cochées :

- « Aucune phase cochée » : cochez d'abord une phase ;
- « Non précisées » : aucune sous-phase choisie. Le Planning et les rapports utilisent alors les sous-phases des phases du chantier comprises dans sa période ;
- une sous-phase choisie doit appartenir à l'une des phases du chantier (« Sous-phase hors des phases du chantier ») ;
- retirer une phase du chantier retire ses sous-phases, avec un avertissement (« Sous-phases retirées avec leur phase : … »).

**Dépendances.** La colonne « dépendances » liste les chantiers dont celui-ci dépend, ou « Tous ».

- Deux chantiers peuvent dépendre l'un de l'autre : les **dépendances réciproques sont autorisées** (un chantier en alimente un autre sur certaines phases, et inversement).
- Un chantier ne peut pas dépendre de lui-même : « Dépendance invalide ».

### 3.18.2 Personnes, comptes et invitations

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

**À quoi il sert.** Répondre à vos questions sur les données du projet, sur les documents de la Base de connaissance et sur l'utilisation du Cockpit, et mettre à jour le suivi du Pilotage à votre demande.

> [Capture] Panneau de Jev ouvert sur le registre des risques, avec une proposition à valider.

### 3.19.1 Ouvrir Jev et écrire un message

**Ouvrir Jev**

- Bouton **Jev** de la barre latérale : Jev s'ouvre dans le contexte de l'écran affiché (« Contexte : … »).
- Dans Aujourd'hui et la Base de connaissance, certains blocs gardent leur icône **Demander à Jev** : Jev connaît alors le bloc ou la ligne. Dans le Pilotage, ces icônes ont été retirées.
- Le panneau se ferme par la croix ou par un clic en dehors.

**Deux modes**, affichés sous le titre du panneau :

- **Explication et action** dans le Pilotage et dans Info projet (hors Référentiel) : Jev explique et peut préparer des modifications.
- **Explication** ailleurs : Aujourd'hui (« Ce menu est un reporting de Pilotage : j'explique les données, je ne les modifie pas. »), Comités et rapports, Base de connaissance, Référentiel.

**Écrire un message**

1. Saisissez votre question dans le champ « Écris à Jev… » (4 000 caractères au plus), ou cliquez sur une suggestion (« Résumer ce bloc », « Expliquer cette ligne », « D'où vient cette donnée ? »…).
2. Le champ s'agrandit avec le texte, jusqu'à 8 lignes environ ; au-delà, il défile.
3. **Entrée** envoie le message ; **Maj+Entrée** va à la ligne. Le bouton **Envoyer** envoie aussi.
4. Trois points animés indiquent que Jev réfléchit.

### 3.19.2 Comment Jev classe et traite une question

Chaque question est d'abord classée, puis traitée selon son cas :

| Cas | Exemple | Ce que fait Jev |
|---|---|---|
| Question sur les données du projet | « Quels risques critiques sont ouverts sur C2 ? » | Lit les données du projet, dans la limite de vos droits, et répond à partir des seuls résultats |
| Question d'usage | « Comment créer un risque ? » | Répond à partir du seul guide utilisateur du Cockpit |
| Question sur les documents | « Que dit le compte rendu du dernier COPIL sur la recette ? » | Cherche dans les documents de la Base de connaissance |
| Question mêlant données et documents | « Le planning présenté au COPIL est-il encore à jour ? » | Répond en deux parties : « D'après les données du projet », puis « D'après les documents », et signale les écarts |
| Demande de modification | « Crée une action : relancer l'éditeur sur le correctif » | Prépare l'enregistrement et le soumet à votre validation (voir 3.19.4) |
| Question ambiguë, hors sujet ou incertaine | « Et pour l'autre ? » | Demande une précision et propose 2 ou 3 reformulations, sans rien modifier |

Une demande de modification n'est retenue que si Jev en est très sûr ; sinon, il demande confirmation. Jev vouvoie toujours dans le Cockpit.

**Sources.** Sous une réponse, la mention « SOURCES » et leur nombre se déplient d'un clic : sections et pages du guide (« {section} · p. N »), documents et repères (« {nom} · Diapositive 4 », « {nom} · p. 12 »), ou données consultées (« Données · risques »).

### 3.19.3 Ce que Jev sait lire

**Les données du projet.** Jev interroge les données en lecture seule, sous vos droits : un Responsable ou un Lecteur n'obtient que les données de ses chantiers, et Jev le signale quand le périmètre est limité. Il cite les codes, traduit les statuts et n'invente aucune valeur. Sans résultat : il indique qu'il n'y a aucune donnée dans votre périmètre. S'il ne peut pas lire les données : « Je n'ai pas pu lire les données du projet pour répondre (…). Reformulez la question, ou consultez directement l'écran concerné du Cockpit. ». Chaque question sur les données donne lieu à une nouvelle lecture : Jev ne répond pas de mémoire.

**Le guide utilisateur.** Pour une question d'usage, Jev répond à partir du guide utilisateur du Cockpit déposé par l'administrateur. S'il ne trouve rien : « Je n'ai pas trouvé cette information dans le guide utilisateur du Cockpit. Reformulez la question, ou posez-la sur les données du projet. ».

**Les documents.** Jev identifie les documents visés (3 au plus) parmi ceux que vous pouvez consulter, cherche les passages utiles et cite le document et le passage. Les documents restreints ne sont lus que pour le PMO, l'administrateur et l'auteur du dépôt. Messages possibles :

- « La Base de connaissance du projet ne contient aucun document indexé que vous puissiez consulter : je ne peux pas répondre à partir des documents. … » ;
- « Je n'ai pas trouvé cette information dans les documents de la Base de connaissance. Précisez le document (nom, séance, date) ou reformulez la question. ».

### 3.19.4 Faire modifier une donnée par Jev

Jev peut **créer**, **modifier** ou **supprimer** un risque, un problème, une action ou une décision. Il ne modifie ni le Référentiel, ni les Comités et rapports, ni la Base de connaissance.

| Demande | Exemple |
|---|---|
| Créer | « crée un risque : retard de l'éditeur, probabilité élevée, impact 4, porteur moi » |
| Changer un statut | « A-41 est terminée », « R03 est mitigé », « rouvrir P02 » |
| Reporter une échéance | « reporter A-41 au 15/10 » |
| Supprimer | « supprime l'action A-12 » |

**Questions à choix.** S'il manque une information, ou si une valeur est ambiguë (une personne, un chantier, « moyen à élevé »…), Jev pose une question à la fois, avec au plus 6 choix en pastilles, plus « Annuler la demande ». Cliquez sur une pastille, ou répondez librement. Une demande compte 8 questions au plus.

- Le chantier n'est proposé que parmi ceux où vous pouvez écrire ; si vous n'en avez qu'un, il est retenu d'office.
- « moi » désigne l'utilisateur connecté. Les dates s'écrivent AAAA-MM-JJ, JJ/MM/AAAA ou JJ/MM.

**Chantiers d'un risque.** Pour un risque, Jev propose les chantiers en pastilles à cocher, avec « Tous les chantiers (transverse) » (PMO seulement), puis **Valider la sélection**. Vous pouvez aussi répondre librement, par exemple « C1, C3 » ou « tous ».

**Le récapitulatif « À valider »**

1. Jev affiche un récapitulatif « À valider · … » : une ligne par champ, avec les valeurs telles qu'elles seront écrites (« avant → après » pour une modification). Rien n'est enregistré à ce stade.
2. Cliquez sur **Valider et enregistrer** (toast « Modifications enregistrées ») ou sur **Refuser** (« Proposition refusée »).
3. Après validation, Jev confirme « Enregistré : R07. » avec un bouton **Ouvrir R07 · {onglet}** qui ouvre l'écran du Pilotage concerné.

**Actions liées à un risque.** À la création d'un risque, chaque action de mitigation que vous citez devient une action liée, proposée dans un second récapitulatif « … à valider après le risque » : même chantier (le premier du risque), porteur du risque par défaut. Validez d'abord le risque, sinon : « Validez d'abord le risque : cette action lui est liée ».

**Suppression.** Une suppression est définitive. Le récapitulatif affiche le champ « Retapez R06 pour confirmer » et le bouton rouge **Supprimer définitivement**, actif seulement quand le code saisi est juste. Jev confirme « Supprimé : R06. ».

**Droits.** La validation applique vos droits habituels : Jev ne peut pas faire ce que vous ne pouvez pas faire à la main. Pour un objet hors de votre périmètre, Jev répond « Je ne trouve pas … dans votre périmètre. » ; une fiche arbitrée reste en lecture seule.

### 3.19.5 Conversation, mémoire et autres gestes

- **Mémoire.** Jev suit la conversation : il tient compte des 10 derniers échanges et d'un résumé des plus anciens. Vous pouvez donc enchaîner (« et pour C3 ? »). La conversation est propre à vous et au projet ouvert.
- **Fermer et rouvrir le panneau** ne vide pas la conversation. Le contexte suit l'écran ouvert.
- **Effacer tous les messages** (icône en haut du panneau) : revient au message d'accueil et démarre une nouvelle conversation, sans confirmation. Recharger le Cockpit démarre aussi une nouvelle conversation.

## 3.20 Notifications

**À quoi elles servent.** Recevoir dans le Cockpit les messages qui vous concernent :

- les notifications planifiées par l'administrateur (points quotidiens ou hebdomadaires sur vos projets, rédigés par l'IA à partir des données que vous pouvez voir) ;
- les réponses de l'administrateur à vos demandes (invitation d'une personne, activation d'un module).

**La cloche** (pied de la barre latérale) affiche le nombre de notifications non lues (« 99+ » au-delà). La liste est relue au démarrage, toutes les 60 secondes, au retour sur l'onglet, à l'ouverture du tiroir, et dès qu'une notification vous est envoyée (mise à jour en direct, voir 3.23).

**Mise en forme d'une notification.** Repliée : l'essentiel sur deux lignes, puis les chiffres clés sur une ligne. Dépliée : l'essentiel en titre avec un liseré de gravité (rouge, ambre ou sarcelle), les chiffres clés en grands chiffres, puis les rubriques « À surveiller » (code en pastille colorée selon l'état, puis le constat) et « À faire » (actions en cases à cocher). Une notification planifiée compte moins de 100 mots.

**Le tiroir**

1. Cliquez sur la cloche.
2. Filtrez avec **Toutes** ou **Non lues**.
3. Cliquez sur une notification pour la déplier : elle est marquée comme lue. Les chiffres clés s'affichent en rangée, en rouge s'ils signalent un retard, un dépassement, un échec ou un point critique.
4. **Tout lire** marque toutes les notifications comme lues.
5. Fermez avec la croix, Échap ou un clic en dehors.

**Effacer toutes les notifications** : la liste se vide aussitôt, avec « N notifications effacées » et **Annuler** pendant 5 secondes. Ensuite, l'effacement est définitif. Il ne touche que vos notifications.

**Règles.** Le tiroir montre les 50 notifications les plus récentes. Chacun ne voit que les siennes. Les dates sont relatives : « à l'instant », « il y a N min », « il y a N h », « hier », « il y a N j ».

## 3.21 Mon profil

Votre carte, en bas de la barre latérale, ouvre **Mon profil**. Le profil n'affiche plus aucune donnée de démonstration : il lit votre compte et le Référentiel du projet.

> [Capture] Mon profil : carte d'identité et onglet Projet.

### 3.21.1 La carte d'identité

À gauche : votre photo (ou vos initiales), votre nom, votre profil principal (PMO projet, Administrateur, Responsable ou Lecteur), votre **Société** et votre **Équipe** (Client, AMOA ou Intégrateur), lues dans le Référentiel.

**Changer la photo**

1. Cliquez sur la photo ou sur **Changer la photo**.
2. Choisissez une image (JPEG, PNG…). Un autre type de fichier est refusé : « Choisissez une image (JPEG, PNG…) ».
3. L'image est recadrée au carré et réduite à 256 pixels, puis enregistrée. Elle s'affiche dans le profil et sur votre carte de la barre latérale.

### 3.21.2 Les quatre onglets

| Onglet | Contenu |
|---|---|
| Informations | **Prénom**, nom, position, société, e-mail, **téléphone**, **ville de résidence**, **pays de résidence**, **langue**, **fuseau horaire** |
| Projet | Vos projets, avec, pour chacun : projet (code — client), rôle, affectation (dates de début et de fin), droits (PMO, Responsable, Lecteur, ou Lecture pour l'administrateur) et colonne **Par défaut** |
| Notifications | Quatre préférences d'envoi (quotidien du matin, rapport hebdomadaire, actions échues, rappel la veille d'un comité) |
| Sécurité | Mot de passe (« Modifié il y a N jours ») et date et heure de votre dernière connexion |

**Ce que vous modifiez, ce qui est géré ailleurs**

- Vous modifiez : prénom, téléphone, ville de résidence, pays, langue, fuseau horaire, photo, préférences de notification. Ces réglages sont enregistrés automatiquement, sans bouton, pour votre compte.
- En lecture seule : le nom, la position et la société viennent du Référentiel du projet (gérés par le PMO) ; l'e-mail est votre identifiant de connexion, modifiable par l'administrateur.
- La **ville de résidence** sert de point de départ au widget Trafic.
- Le pied du profil indique la date de la dernière modification du profil (« Dernière modification le … » ou « Aucune modification enregistrée »).

### 3.21.3 Choisir le projet ouvert par défaut

1. Ouvrez l'onglet **Projet**.
2. Sur la ligne du projet voulu, cliquez sur **Choisir**. La pastille devient **Par défaut**. Toast : « {code} s'ouvrira par défaut ».
3. Un nouveau clic sur **Par défaut** retire ce choix (« Projet par défaut retiré »).

Le projet par défaut s'ouvre quand vous arrivez dans le Cockpit par une adresse qui ne précise pas de projet. Sans projet par défaut, le Cockpit ouvre le projet RISE s'il vous est ouvert, sinon le premier projet de votre liste. Le texte sous le tableau le rappelle (« Le Cockpit s'ouvre sur … quand l'adresse ne précise pas de projet. »).

### 3.21.4 Changer son mot de passe

1. Onglet **Sécurité**, ligne « Mot de passe », lien **Modifier**.
2. Saisissez le **Mot de passe actuel**, le **Nouveau mot de passe** et la **Confirmation**.
3. Cliquez sur **Enregistrer**. Toast : « Mot de passe modifié · vos autres sessions ont été fermées ». La session en cours reste ouverte.
4. Mot de passe actuel erroné : « Mot de passe actuel incorrect ».

## 3.22 Changer de projet

Un même compte peut avoir accès à plusieurs projets, avec un profil différent sur chacun.

1. Dans la barre latérale, cliquez sur le menu **Projet** (il affiche le code du projet ouvert). Si la barre est repliée, elle se déplie.
2. La liste de vos projets s'ouvre : pour chacun, son code, son nom et votre profil (PMO, RESPONSABLE, LECTEUR, ou ADMIN · LECTURE). Le projet ouvert est surligné. Cinq projets sont visibles d'emblée ; au-delà, faites défiler la liste à la molette.
3. Cliquez sur un projet : le Cockpit se recharge sur ce projet.

**Règles**

- La liste ne montre que les projets qui vous sont ouverts. Elle suit en direct les habilitations changées dans la Console, sans rechargement.
- Le projet ouvert figure aussi dans l'adresse de la page (`?project={code}`). Un projet auquel vous n'avez pas accès répond « Projet introuvable ».
- Pour choisir le projet ouvert à l'arrivée, voir 3.21.3.

## 3.23 Mises à jour en direct

Le Cockpit se tient à jour seul : une modification faite ailleurs apparaît sans recharger la page.

- **Ce qui est suivi** : toute écriture sur le projet ouvert ou sur la plateforme, faite par un collègue, par vous dans un autre onglet, par Jev, depuis la Console (par exemple une habilitation ou un module), ou par un traitement de fond (fin de l'indexation d'un document, mise en service d'un template, envoi d'une notification planifiée).
- **Quand** : le Cockpit relit les données aussitôt l'écriture annoncée. Il attend la fin d'une saisie en cours avant de relire. Si l'onglet est masqué, la relecture a lieu à votre retour sur l'onglet.
- **Vos propres modifications** ne déclenchent pas de relecture supplémentaire : l'écran les a déjà prises en compte.
- **La cloche** des notifications est relue à chaque annonce.
- Les échanges avec Jev et le calcul de la consommation d'IA ne provoquent pas de relecture.

**Exemple.** Le Responsable de C2 passe l'action A-41 à « Terminée ». Le PMO, qui a le registre des actions ouvert sur son poste, voit le statut changer sans recharger la page.

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
| Risque à plusieurs chantiers | Oui | Si Responsable de chacun de ses chantiers | — | — |
| Risque transverse (« Tous les chantiers ») | Oui | — | — | — |
| Faire modifier une donnée par Jev | Comme à la main | Comme à la main | — | — |
| Dates et % réel du planning | Tous | Son chantier | — | — |
| Porteur et criticité | Oui | — | — | — |
| Jalons, livrables, éléments de planning | Oui | — | — | — |
| Baromètre | Oui | Responsable du chantier transverse | — | — |
| Séances de comité (planifier, modifier, supprimer) | Oui | Si directeur de programme | Si directeur de programme | — |
| Templates et rapports de comité | Oui | Oui | — | — |
| Déposer un document | Oui | Oui | — | — |
| Supprimer un document | Oui | Ses dépôts | — | Oui |
| Voir l'onglet Référentiel | Oui | — | — | Oui (lecture) |
| Modifier le Référentiel, la fiche projet, Info projet | Oui | — | — | — |
| Demander une invitation | Oui | — | — | — |
| Demander un module | Oui | Oui | — | — |
| Choisir son projet par défaut, sa photo, ses préférences | Oui | Oui | Oui | Oui |

**Règles**

- **Cumul** : un même compte peut être PMO d'un projet et Responsable ou Lecteur d'un autre ; sur un projet, le profil le plus large s'applique. Être Responsable d'un chantier retire ce chantier de la liste Lecteur.
- **Directeur de programme** : la personne désignée comme responsable du projet planifie, met à jour et supprime les séances, quel que soit son profil.
- **Risques à plusieurs chantiers** : un risque est visible dès que l'un de ses chantiers l'est ; un risque transverse est visible de toute personne qui voit au moins un chantier. Pour le modifier, il faut le droit d'écriture sur chacun de ses chantiers ; un risque transverse ne se crée et ne se modifie que par le PMO.
- **Jev** : il lit les données sous vos droits et ne peut rien enregistrer que vous ne pourriez enregistrer à la main.
- **Documents restreints** : visibles du PMO, de l'administrateur et de l'auteur du dépôt.
- **Messages de refus** : chaque écriture interdite est refusée par le serveur avec un message explicite (« Action non autorisée pour votre profil », « Budget : PMO uniquement », « Templates : profil non Lecteur (PMO, Responsable) »…). L'écran annule alors la modification.

# 5. Paramétrage et préférences

| Réglage | Où | Effet |
|---|---|---|
| Disposition du tableau de bord | Aujourd'hui › Personnaliser | Widgets affichés et ordre, mémorisés pour votre compte |
| Couleurs d'une tuile | Survol d'un widget | Thème clair ou sombre de la tuile, mémorisé |
| Ville de résidence | Mon profil › Informations | Point de départ du widget Trafic |
| Photo, prénom | Mon profil › Informations | Affichés dans le Cockpit (profil et barre latérale) |
| Téléphone, pays, langue, fuseau horaire | Mon profil › Informations | Enregistrés pour votre compte |
| Projet ouvert par défaut | Mon profil › Projet | Projet ouvert à l'arrivée dans le Cockpit |
| Préférences de notification | Mon profil › Notifications | Enregistrées pour votre compte |
| Ville et pays du projet | Référentiel › Projet (PMO) | Widgets Météo et Trafic |
| Fuseau horaire du projet | Référentiel › Projet (PMO) | Date du jour du projet |
| Contenu de la fiche projet | Référentiel › Info projet (PMO) | Onglet Fiche projet |
| Dates, phases, sous-phases et dépendances des chantiers | Référentiel › Chantiers (PMO) | Planning, plan de livraison, rapports, Jev |
| Membres des instances | Référentiel › Instances de pilotage (PMO) | Participants des séances, onglet Gouvernance |

Ce qui se règle dans la Console, par l'administrateur : comptes et droits (y compris les projets proposés dans le menu « Projet »), modules Budget et Bénéfices, module « Message d'accueil de Jev », sources d'actualité, météo et trafic (Registre des cartes API), modèles d'IA utilisés par la Base de connaissance, par Jev et par les rapports, guide utilisateur du Cockpit, notifications planifiées.

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
Reformulez la question avec les mots de l'écran (« registre des risques », « fiche d'arbitrage »…). Pour une question sur une donnée précise, citez son code (R03, A-41, D-005). Pour un document, précisez son nom, la séance ou la date.

**Jev me pose une question au lieu d'agir.**
Il lui manque une information, ou la demande est ambiguë. Cliquez sur l'une des pastilles proposées, ou répondez librement. « Annuler la demande » abandonne la modification en cours.

**Comment écrire un message de plusieurs lignes à Jev ?**
Appuyez sur Maj+Entrée pour aller à la ligne ; Entrée envoie le message. Le champ s'agrandit jusqu'à 8 lignes environ.

**Je ne peux pas modifier l'avancement d'une phase.**
Une phase qui a des sous-phases a un avancement calculé : la moyenne de ses sous-phases, pondérée par leur durée. Modifiez l'avancement des sous-phases.

**Je ne peux pas modifier les dates d'un chantier dans la vue « Phase > Chantier ».**
Cette ligne montre le segment du chantier dans la phase, calculé à partir de ses sous-phases. Modifiez les sous-phases, ou les dates du chantier dans le Référentiel (PMO).

**Comment rattacher un risque à plusieurs chantiers ?**
Dites-le à Jev (« sur C1 et C3 », ou « sur tous les chantiers » pour un risque transverse, PMO), ou cochez les pastilles qu'il propose puis **Valider la sélection**.

**Je ne peux pas modifier un risque que je vois.**
Il concerne aussi un chantier dont vous n'êtes pas Responsable, ou il est transverse (réservé au PMO).

**Comment passer d'un projet à un autre ?**
Cliquez sur le menu « Projet » de la barre latérale et choisissez le projet. Pour ouvrir toujours le même projet à l'arrivée, choisissez-le dans Mon profil › Projet.

**Une modification faite par un collègue apparaît-elle sans recharger ?**
Oui : le Cockpit se met à jour en direct (voir 3.23). Si l'onglet était en arrière-plan, la mise à jour se fait à votre retour.

**Je ne peux pas supprimer une séance de comité.**
Un rapport y est rattaché, ou vous n'êtes ni PMO ni directeur de programme.

**Le baromètre affiche « — ».**
Aucun relevé n'a encore été saisi pour le projet.

**Je ne trouve plus les onglets Budget et Bénéfices.**
Ils ont été retirés du Pilotage le 5 octobre 2026. Pour demander l'activation d'un module, passez par Aujourd'hui › Personnaliser (widget ou mode verrouillé), puis **Demander l'activation** ; la réponse de l'administrateur arrive dans la cloche.

**Ma session s'est fermée.**
Après 30 minutes d'inactivité, la session se ferme. Reconnectez-vous : vous revenez sur la page ouverte.

# 7. Annexes

## Annexe A. Récapitulatif des règles de gestion

Les références désignent les fichiers du code (dossier `backend/src` sauf mention contraire). Les numéros de ligne ont été relevés le 1er octobre 2026 et peuvent avoir bougé depuis ; les règles ajoutées le 8 octobre 2026 citent le fichier seul.

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
| Création hors périmètre | « Donnée à rattacher à vos chantiers » | Pilotage | `cockpit/pilotage/transactional.ts` (`assertWriteLinks`) |
| Risque à plusieurs chantiers | Lecture si l'un des chantiers est visible (transverse : dès qu'un chantier est visible) ; écriture sur chacun des chantiers ; transverse : PMO seulement | Risques | `domain/rights.ts` (`canReadLinks`, `canWriteLinks`) ; `cockpit/pilotage/transactional.ts` (`riskWsInput`) |
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
| Avancement d'une phase | Moyenne des sous-phases pondérée par leur durée (jours calendaires, 1 jour sans dates), recalculée à chaque écriture d'une sous-phase ; saisie directe refusée | Planning | `domain/progress-rollup.ts` ; `cockpit/phase-progress.ts` |
| Segment d'un chantier dans une phase | Première à dernière sous-phase du chantier dans la phase, sinon intersection ; avancement pondéré par la durée ; non modifiable | Planning | `frontends/RISE Cockpit.dc.html` (`segOf`) |
| Ordre des chantiers | Code croissant (C1, C2, C3…) ; sous-phases par numéro | Planning | `frontends/RISE Cockpit.dc.html` (`plVals`) |
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
| Numéro de sous-phase | Libre ; unique dans le projet ; sans espace, « ; » ni « · » | Référentiel | `domain/workstream-links.ts` (`subphaseCodeError`) |
| Sous-phases d'un chantier | Chacune dans une phase du chantier ; phase retirée → ses sous-phases retirées | Référentiel | `domain/workstream-links.ts` ; `cockpit/referential/entities.ts` |
| Dépendances entre chantiers | Réciproques admises ; auto-dépendance refusée | Référentiel | `cockpit/referential/entities.ts` |
| Info projet | 8 rubriques, 60 lignes, libellé 120, valeur 2 000 caractères | Référentiel | `domain/project-info.ts:11-56` |
| Aiguillage de Jev | Question classée en 5 cas (données, guide, modification, documents, clarification) par la carte JEV ; seuil 0,45 ; modification seulement si confiance ≥ 0,75 | Jev | `domain/jev-router-cockpit.ts` ; `admin/jev-router.service.ts` |
| Données lues par Jev | Lecture seule, sous les droits de l'utilisateur ; une nouvelle requête par question | Jev | `admin/jev-cockpit-insight.service.ts` ; `domain/jev-cockpit-answers.ts` |
| Documents lus par Jev | 3 documents visés au plus, 10 extraits cherchés, 5 gardés ; documents restreints selon les droits | Jev | `domain/jev-cockpit-answers.ts` ; `cockpit/documents/kb.service.ts` |
| Réponses d'usage | Guide du Cockpit seul, 8 extraits cherchés, 4 gardés, seuil 0,58 | Jev | `domain/jev-rag.ts:25` ; `admin/guide-answer.service.ts` |
| Modifications par Jev | Risques, problèmes, actions, décisions : création, modification, suppression (code à retaper) ; questions à choix (6 choix, 8 questions au plus) ; validation explicite, droits habituels | Jev | `domain/jev-cockpit-write.ts` ; `cockpit/assistant/jev-cockpit-write.service.ts` ; `cockpit/assistant/assistant.controller.ts` |
| Mémoire de Jev | Conversation par utilisateur et par projet ; 10 derniers échanges et résumé des plus anciens | Jev | `admin/jev-memory.service.ts` |
| Message d'accueil | Une génération par compte, projet et jour ; faits limités aux chantiers visibles ; contrôle du texte ; message par règles en repli | Aujourd'hui | `domain/today-greeting.ts` ; `cockpit/today/today-greeting.service.ts` |
| Versement d'un rapport | Dépôt dans la Base de connaissance (« Support de comité ») ; version suivante si déjà versé ; échec sans effet sur le téléchargement | Comités et rapports | `cockpit/committees/report-template.service.ts` |
| Séance supprimée | PMO ou directeur de programme ; refusée si un rapport est rattaché | Comités | `frontends/api.js` (`sesDel`) ; `cockpit/committees/committees.controller.ts` |
| Notifications | 50 plus récentes ; effacement annulable 5 s | Notifications | `cockpit/my-notifications.controller.ts:8-56` ; `frontends/Notifications Cockpit.dc.html` |
| Préférences | Disposition, couleurs, prénom, ville, photo, notifications, téléphone, pays, langue, fuseau, projet par défaut | Préférences | `frontends/api.js` (`PREF_OF`, `setDefaultProject`) |
| Projet à l'arrivée | Projet par défaut s'il est ouvert au compte, sinon RISE s'il l'est, sinon le premier projet ouvert | Changer de projet | `frontends/api.js` (`arrive`) |
| Mises à jour en direct | Chaque écriture annoncée ; le Cockpit relit le projet (jamais pendant une saisie ; au retour sur l'onglet s'il est masqué) ; ses propres écritures ignorées | Mises à jour en direct | `core/changes.ts` ; `frontends/api.js` (`liveOpen`) |

## Annexe B. Points à clarifier et écarts constatés

Ces points viennent de la lecture du code. Ils décrivent un écart entre le code et un texte affiché, ou un comportement ambigu. Aucun n'a été tranché dans ce guide.

**Accès et profil**

1. **Lien expiré** : l'écran annonce « durée de validité de 30 minutes », même pour un lien d'invitation (14 jours).
2. **Activation d'une invitation** : l'écran final dit « Mot de passe modifié. … vos autres sessions ont été fermées », alors qu'il s'agit d'une première activation.
3. **Blocage par poste** (20 échecs) : l'écran parle du compte, et réinitialiser le mot de passe ne lève pas ce blocage.
4. **« Toujours là ? »** s'ouvre après 29 minutes et annonce « Sans activité depuis 30 minutes ».
5. **Mon profil** : ~~valeurs fixes~~ (corrigé le 07/10/2026 : données réelles, photo affichée). Reste : le bouton **Enregistrer** n'enregistre rien de plus (toast « Profil enregistré » seul, les réglages étant déjà enregistrés automatiquement) ; la langue et le fuseau horaire du profil sont enregistrés, mais aucun effet sur l'affichage n'a été constaté dans le code.
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

18. **Registre des risques** : le titre annonce « top 6 par criticité », l'écran affiche 4 risques avant « Voir plus ». ~~Texte fixe de l'évolution~~ (corrigé le 07/10/2026 : compteurs du registre).
19. ~~**Liste des chantiers** proposée pour un nouvel élément~~ : chantiers du projet ouvert (corrigé le 08/10/2026).
20. **Statut « Bloquée »** d'une action : enregistré « À faire » à la création, affiché « Ouverte » quand il vient du serveur.
21. **« Mes actions »** : filtre une personne fixe, pas l'utilisateur connecté.
22. **Jalons et livrables** : l'écran laisse un Responsable modifier, le serveur refuse (PMO uniquement).
23. **Confirmation métier** : la date choisie dans le formulaire est ignorée ; le serveur enregistre la date du jour.
24. **Fiche arbitrée** : option et date restent saisissables à l'écran, le serveur refuse.
25. **Problèmes ouverts** : le bloc affiche aussi les problèmes résolus.
26. **Baromètre** : notes bornées de 1 à 10 à l'écran, de 0 à 10 au serveur.
27. **Mes tâches** : « COPIL n°20 · 26 sept. » est un texte fixe ; jalons à 45 jours inclus à l'écran, exclus au serveur.

**Comités, documents, Jev**

28. ~~**« Oui, verser »** n'ajoute pas le rapport à la Base de connaissance~~ (corrigé le 05/10/2026) : le PowerPoint est réellement déposé et indexé. La fenêtre de versement s'ouvre avant la génération, et non après.
29. ~~**Téléchargements** de rapports et de modèles~~ (corrigé le 02/10/2026) : le téléchargement produit un vrai PowerPoint au format du template. Le PDF du rapport rattaché à une séance (serveur) reste minimal et n'est appelé par aucun écran.
30. **Nombre de pages** d'un template : trois calculs différents (publication, serveur, aperçu).
31. ~~**Publication d'un template** : historique de démonstration~~ (corrigé le 04/10/2026).
32. **Suppression d'un template** : sans confirmation ; le toast s'affiche avant un éventuel refus du serveur.
33. **Erreurs de dépôt** : le message est répété entre parenthèses.
34. ~~**Réponses de Jev sur les données** par un service bouchon~~ (corrigé le 01/10/2026) : Jev lit réellement les données ; les questions ambiguës ou hors sujet reçoivent une demande de précision.
35. ~~**Jev et la Base de connaissance**~~ (corrigé le 01/10/2026) : Jev cherche dans les documents et cite le document et le passage.
36. ~~**« Charger » de Jev**~~ : le trombone de pièce jointe a été retiré du panneau le 02/10/2026 (la fonction reste dans le code, sans point d'entrée).
37. ~~**« Annuler » d'un récapitulatif de Jev**~~ : n'apparaît plus avec le serveur (01/10/2026).

**Info projet et Référentiel**

38. **Jev** dit que « le référentiel est géré par l'administrateur du projet » : c'est le PMO.
39. **Saisie directe de la Fiche projet** : elle n'alimente pas l'objet Info projet, que lisent la Console et les notifications ; les deux peuvent diverger. L'écran ne contrôle pas les droits.
40. **Lots et tuiles chiffrées de la Fiche projet** : contenu statique, distinct des Lots du Référentiel. L'en-tête d'Info projet affiche désormais le code et le client du projet ouvert (07/10/2026) ; le titre « Projet RISE » n'a pas été revérifié.
41. **Contrôle des usages** : l'écran vérifie moins de cas que le serveur ; une suppression permise à l'écran peut être refusée ensuite.
42. **Rôle déjà porté par le passé** : sa suppression clôt les affectations, puis échoue côté serveur.
43. **Ajout d'une personne** : l'écran n'exige que le nom, le serveur exige un e-mail valide. **Ajout d'une phase** : dates facultatives à l'écran, obligatoires au serveur.
44. **Compte suspendu** affiché « Compte activé » ; une demande refusée réaffiche « Inviter » sans mention du refus.
45. **Client** : objet partagé par tous les projets, modifiable par le PMO de n'importe quel projet.
46. **Lecture des listes du Référentiel** (dont les e-mails des personnes) : ouverte à tout profil du projet par l'API.
47. **Verrouillage optimiste** : prévu côté serveur, jamais utilisé par l'écran ; le dernier qui enregistre l'emporte.

**Points relevés le 8 octobre 2026**

48. **Suggestions et accueil de Jev** : certaines suggestions proposent des gestes que Jev ne sait pas faire (« Supprimer les actions terminées », « Décaler toutes mes tâches à vendredi », « Ajouter un verbatim », « Décaler un jalon ») : Jev ne modifie que les risques, problèmes, actions et décisions. De même, l'accueil du mode « Explication et action » dans Info projet annonce « Je peux modifier, ajouter, supprimer ou expliquer des données ».
49. **Plan de livraison** : son niveau par défaut est « Sous-phases », alors que celui du Planning est « Phases ».
50. **Incohérence « Budget programme non renseigné »** : toujours émise par le serveur quand le budget programme existe sans être connu, alors qu'aucun écran ne permet plus de le renseigner (onglet Budget retiré).
51. **Rapport rattaché à une séance** : le rattachement à la prochaine séance planifiée se fait en plus du versement dans la Base de connaissance ; sans séance, le message « Rapport non enregistré : template ou séance introuvable » peut laisser croire que le versement a échoué.
52. **Liste des projets** : avec un seul projet, le menu « Projet » s'ouvre quand même sur une liste d'un élément.

## Annexe C. Fonctionnalités non documentées

Ces fonctionnalités existent dans le code mais sont désactivées, inaccessibles depuis l'écran, limitées à la démonstration ou sans effet. Elles ne sont pas décrites dans le corps du guide.

| Fonctionnalité | État |
|---|---|
| Onglets d'Aujourd'hui (Dashboard, Écarts, Échéances) | Définis, non affichés ; Écarts et Échéances s'ouvrent depuis les widgets |
| Onglet Qualité d'Aujourd'hui (complétude, fraîcheur, à confirmer) | Inaccessible ; contenu en partie fixe |
| Bloc « Santé calculée vs appréciation » (Écarts) | Contenu fixe |
| Ancienne vue Situation | Désactivée |
| Point d'accès serveur « Aujourd'hui » | Non appelé par l'écran |
| Onglets Périmètre, Contrat, Chronologie, WBS et vue RACI d'Info projet | Calculés, sans écran |
| Panneau « Modèle du projet » | Aucun accès |
| Écran du module Budget ; module Bénéfices | Onglets retirés du Pilotage le 05/10/2026 (les vues restent dans le code, plus atteignables) ; aucun écran Budget, aucun code Bénéfices |
| Suppression de risques, problèmes, actions, décisions | Sans bouton dans les tableaux ; possible par Jev (voir 3.19.4). Les séances se suppriment depuis le calendrier (voir 3.13.1) |
| Participants d'une séance, remplacement d'une décision, séance cible d'un problème | Disponibles côté serveur, sans écran |
| Saisie de la criticité (chemin critique) | Acceptée par le serveur, sans écran |
| Statut, sponsor, équipes éditeur et intégrateur, Go-Live prévu, santé forcée du projet | Acceptés par le serveur, sans écran |
| Clôture et archivage d'un projet | Sans écran |
| Import Excel du Référentiel | Console seulement |
| Statut des rapports, relecteur, validateur, audience ; PDF de rapport | Sans écran |
| Historique, recherche, retraitement et métadonnées des documents | Disponibles côté serveur, sans écran |
| Mode d'édition groupée des titres de Mes tâches | Inaccessible |
| Signal « porteurs sans affectation active » complet (serveur) | Non appelé ; l'écran fait un calcul réduit |
| Réponses locales de Jev, notifications et états de compte d'exemple | Démonstration, sans serveur |
| Pièce jointe dans le panneau de Jev | Fonction présente côté serveur et écran, sans bouton depuis le 02/10/2026 |
| Brouillon de template enregistré sur le serveur | Abandonné le 04/10/2026 (session sans persistance) ; les anciens brouillons sont supprimés |
| Mode développement (`?as=…`) et mode test (`?e2e=1`) | Réservés aux essais |
