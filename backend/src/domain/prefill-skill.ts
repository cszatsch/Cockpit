/**
 * Skill « Préremplissage d’un projet » (07/10/2026) : vocabulaire et attendus des 14 onglets du fichier d'initialisation,
 * avec des exemples du projet RISE. Texte d'origine : créé par la migration `20261114000300_skill_preremplissage` et le
 * jeu de démonstration ; la version enregistrée dans Console › Skills fait foi (modifiable sans déploiement).
 * Dédiée au préremplissage : lue qu'elle soit active ou non, jamais ajoutée aux réponses de Jev.
 */
export const PREFILL_SKILL = 'Préremplissage d’un projet';

export const PREFILL_SKILL_TEXT = `Rôle : lire une proposition commerciale (et ses annexes) et en extraire les données des 14 onglets du fichier d’initialisation d’un projet du Cockpit. Les exemples viennent du projet RISE (programme ERP d’AMC Corp).

RÈGLES GÉNÉRALES
- Ne rien inventer. Une information absente du document reste vide. Un champ obligatoire vide sera signalé « manquant », ce qui est préférable à une valeur fausse.
- Une valeur déduite, convertie, moyennée ou choisie entre deux formulations est « incertaine » : confiance sous 70 % et motif court (« Déduit d’un volume en jours. », « Deux intitulés différents dans le document. »).
- Noter la page où figure chaque valeur.
- Écrire les noms exactement comme dans le document, et toujours de la même façon d’un onglet à l’autre : une personne citée dans 03 Personnes doit porter le même nom dans les onglets suivants.
- Dates au format JJ/MM/AAAA. Si seul le mois est connu, écrire MM/AAAA : la valeur sera marquée incertaine.
- Ne pas confondre une société (équipe), une fonction (intitulé de poste d’une personne) et un rôle (responsabilité tenue sur le projet).

01 ÉQUIPES
Définition : une équipe correspond à une société qui participe au projet : celle du client, mais aussi celle de chaque prestataire (cabinet de conseil ou AMOA, intégrateur, éditeur, sous-traitant).
À extraire : une ligne par société. Nom : le nom usuel de la société. Description : son rôle dans le projet (client, AMOA, intégrateur, éditeur…).
Ne pas confondre : une équipe n’est ni un service interne du client (DSI, Finance), ni un chantier, ni un comité.
Exemple RISE : ECF (le client) ; Onepoint (AMOA et pilotage) ; Codilog (intégrateur) ; Kéa Partners ; Keyrus.

02 RÔLES
Définition : un rôle est une responsabilité tenue sur le projet, indépendante de l’intitulé de poste de la personne. Un rôle n’est pas une permission dans l’application.
À extraire : les rôles cités ou évidents dans l’organisation proposée. Libellé : nom du rôle. Description : ce que fait ce rôle, si le document le dit.
Ne pas confondre : « Directrice Comptable » est une fonction (03 Personnes) ; le rôle correspondant est « Pilotes métiers ».
Exemple RISE : Sponsor Exécutif ; Directeur de programme ; Sponsors métiers ; Pilotes métiers ; AMOA interne ; AMOA Externe ; Equipe IT - DSI ; Intégrateur.

03 PERSONNES
Définition : l’annuaire des personnes nommées dans le document, côté client comme côté prestataires.
À extraire : Nom complet (prénom puis nom) ; Email, seulement s’il est écrit ; Équipe : la société de la personne, choisie parmi 01 Équipes ; Fonction : son intitulé de poste ; Actif : « Oui » par défaut.
Ne pas confondre : la fonction (« Directeur Commercial France ») avec le rôle sur le projet (« Pilotes métiers », onglet 04).
Exemple RISE : Laurent Garnier · ECF · Directeur de programme RISE ; Julien Morel · Onepoint · Directeur de projet ; Olivier Chevalier · Codilog · Directeur de projet ; Sophie Marchand · ECF · Directrice Comptable.

04 AFFECTATIONS
Définition : qui tient quel rôle sur le projet, et à partir de quand.
À extraire : Personne (de 03), Rôle (de 02), Début : date de prise de rôle (à défaut, le lancement du projet, valeur alors incertaine), Fin : seulement si elle est écrite.
Exemple RISE : Laurent Garnier · Directeur de programme ; Philippe Aubert · Sponsor Exécutif ; Robin Lefèvre · AMOA Externe.

05 PROJET
Définition : la fiche d’identité du client et du projet (une seule valeur par champ).
À extraire : Nom du client ; Secteur d’activité ; Pays (siège du client) ; Code projet (nom de code court, en majuscules, sans espace) ; Nom du projet ; Objectifs (deux ou trois phrases) ; Éditeur de la solution et Intégrateur (sociétés de 01) ; Date de démarrage ; Date de fin cible ; Fuseau horaire ; Statut (« Préparation » pour un projet qui démarre) ; Directeur de programme et Sponsor (personnes de 03).
Exemple RISE : client AMC Corp · code RISE · « RISE — next level » · objectif : remplacer 19 ERP par un unique Brand X + CRM, en 4 lots · du 01/03/2024 au 31/12/2030 · Europe/Paris · directeur de programme Laurent Garnier.

06 INFO PROJET
Définition : le contexte du client et le périmètre du projet, affichés dans la Fiche projet du Cockpit. Une ligne par élément.
Rubriques :
- Le client (libellé + valeur) : effectifs, siège, chiffre d’affaires, actionnaire… (raison sociale, secteur et pays viennent de 05 Projet : ne pas les répéter).
- Marques du groupe (liste).
- Programme en une phrase (une seule ligne, obligatoire).
- Enjeux stratégiques (liste, au moins une ligne).
- Périmètre fonctionnel (libellé + valeur) : domaine métier et ce qu’il couvre.
- Périmètre applicatif (libellé + valeur) : application et son rôle.
- Périmètre géographique (liste de pays ou de zones).
- Périmètre juridique (liste des sociétés concernées).
Exemple RISE : Programme en une phrase : « Programme de transformation digitale d’AMC Corp… » ; Enjeux : « Sortir de 19 ERP hétérogènes… » ; Périmètre fonctionnel : Finance · Comptabilité, contrôle de gestion, reporting Groupe ; Périmètre applicatif : Brand X · ERP principal, remplacé en Lot 1 ; Périmètre géographique : France, Belgique, Luxembourg, Allemagne.

07 LOTS
Définition : un lot (ou vague) est un périmètre déployé en une fois : un ensemble de sociétés, de pays ou de sites qui démarrent ensemble. Les lots se succèdent dans le temps.
À extraire : N° (1, 2, 3…), Périmètre, Début, Fin, Statut (Prévu, En cours, Terminé), Responsable (de 03).
Ne pas confondre : un lot dit QUI ou QUOI est déployé ; une phase dit À QUELLE ÉTAPE de la méthode on en est.
Exemple RISE : Lot 1 · AMC Corp, Brand X et stores · 01/03/2024 → 30/06/2027 ; Lot 2 · Autres filiales France ; Lot 3 · Filiales EMEA ; Lot 4 · Hors Europe.

08 PHASES
Définition : les grandes étapes de la méthode, dans l’ordre, pour un lot.
À extraire : N° (1, 2…), Nom, Lot (« Lot 1 »…), Début, Fin, Statut (Prévue, En cours, Terminée), Description.
Exemple RISE (Lot 1) : 1 Discover ; 2 Prepare ; 3 Explore ; 4 Realize ; 5 Deploy ; 6 Run.

09 SOUS-PHASES
Définition : le découpage d’une phase en étapes plus fines. Numérotation libre, propre au projet et unique : reprendre celle de la proposition si elle en a une, sinon le N° de la phase suivi d’un rang (5.1, 5.2…).
À extraire : Phase (« 5 · Deploy »), N°, Nom, Début, Fin, Statut, Description.
Exemple RISE (phase 5 Deploy) : 5.1 Mise en place de l’environnement de production ; 5.2 Formation des utilisateurs finaux ; 5.3 Répétition générale ; 5.4 Cutover / Go-live ; 5.5 Hypercare.

10 CHANTIERS
Définition : un chantier est un domaine de travail transverse aux phases (un domaine métier, ou un sujet technique ou d’accompagnement), porté par un responsable.
À extraire : Nom ; Responsable (de 03) ; Lot ; Statut (Actif, Clos) ; Début et Fin (dates du chantier, si la proposition les donne ; sinon laisser vide, elles sont calculées à partir de ses sous-phases) ; Description ; Phases (N° séparés par « ; ») ; Sous-phases (N° séparés par « ; », chacune dans une phase du chantier) ; Dépendances (chantiers dont il dépend, séparés par « ; », ou « Tous »).
Ne pas confondre : un chantier n’est ni une équipe (société), ni une phase.
Exemple RISE : Finance · Sophie Marchand ; Achats / Appros / Logistique · Élodie Faure ; Ventes / CRM · Thomas Girard ; Migration des données · Karim Benali, dépend de Finance ; Achats / Appros / Logistique ; Ventes / CRM ; Conduite du changement · Isabelle Perrin ; Pilotage et transverse · Laurent Garnier.

11 INSTANCES
Définition : les comités de gouvernance du projet.
À extraire : Nom ; Nom court (sigle) ; Couleur (au choix dans la liste) ; Fréquence (Quotidienne, Hebdomadaire, Bimensuelle, Mensuelle, Trimestrielle, Semestrielle, À la demande) ; Niveau (Stratégique, Pilotage, Opérationnel, Hors cycle) ; Rôle de l’instance (ce qu’elle décide).
Exemple RISE : Comité de pilotage · COPIL · Mensuelle · Stratégique · arbitre dates de bascule, périmètre, budget ; Comité de projet · Hebdomadaire ; Comité de chantier · Hebdomadaire ; Comité d’arbitrage · À la demande.

12 MEMBRES
Définition : la composition de chaque instance : une ligne par personne et par instance.
À extraire : Instance (de 11), Personne (de 03), Rôle dans l’instance (Président, Membre, Secrétaire, Invité).
Exemple RISE : Comité de pilotage · Philippe Aubert · Président ; Comité de pilotage · Laurent Garnier · Membre.

13 JALONS
Définition : une date clé du projet, un événement ponctuel (fin de recette, go-live, décision), et non une période.
À extraire : Libellé ; Phase ; Sous-phase ; Chantier ; Lot ; Responsable ; Date prévue ; Date de référence (date initialement prévue, si le document en donne une autre).
Ne pas confondre : un jalon est une date ; un livrable est un document ou un produit remis.
Exemple RISE : Fin de la recette Finance · phase 4 · chantier Finance · 19/09/2026 ; Fin de la migration Run 3 · chantier Migration des données · 14/10/2026.

14 LIVRABLES
Définition : une production remise pendant le projet (document, maquette, plan, rapport), rattachée à une sous-phase.
À extraire : Nom ; Sous-phase (« 1.2 · Stratégie de transformation ») ; Chantier ; Responsable ; Début ; Échéance.
Exemple RISE : Cartographie des processus actuels (as-is) · 1.1 Analyse du portefeuille Brand X · Julien Morel ; Feuille de route d’adoption · 1.2 Stratégie de transformation · chantier Conduite du changement.`;
