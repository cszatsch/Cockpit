# Jev de la Console — dictionnaire des données

> Généré depuis `backend/src/domain/jev-dictionnaire.ts` (`npm run dictionnaire:doc`) : ne pas modifier à la main.
> 31 vues en lecture seule du schéma `jev`, chargées dans `dictionnaire_tables` et `dictionnaire_colonnes`.
> Heures en heure de Paris. Aucun secret (empreintes de mot de passe, sessions, clés API chiffrées, chemins de stockage).

## Sommaire

- [`jev.comptes`](#comptes) — 17 colonnes
- [`jev.comptes_projets`](#comptes_projets) — 2 colonnes
- [`jev.habilitations`](#habilitations) — 7 colonnes
- [`jev.administrateurs`](#administrateurs) — 3 colonnes
- [`jev.sessions`](#sessions) — 7 colonnes
- [`jev.demandes_invitation`](#demandes_invitation) — 10 colonnes
- [`jev.journal_audit`](#journal_audit) — 16 colonnes
- [`jev.fournisseurs_ia`](#fournisseurs_ia) — 8 colonnes
- [`jev.modeles_ia`](#modeles_ia) — 16 colonnes
- [`jev.affectations_ia`](#affectations_ia) — 6 colonnes
- [`jev.consommation_ia`](#consommation_ia) — 15 colonnes
- [`jev.plafonds_budget_ia`](#plafonds_budget_ia) — 4 colonnes
- [`jev.regles_notification`](#regles_notification) — 17 colonnes
- [`jev.envois_notification`](#envois_notification) — 11 colonnes
- [`jev.notifications_admin`](#notifications_admin) — 14 colonnes
- [`jev.projets`](#projets) — 12 colonnes
- [`jev.clients`](#clients) — 4 colonnes
- [`jev.chantiers`](#chantiers) — 8 colonnes
- [`jev.personnes`](#personnes) — 7 colonnes
- [`jev.phases`](#phases) — 9 colonnes
- [`jev.snapshots`](#snapshots) — 8 colonnes
- [`jev.planification_snapshots`](#planification_snapshots) — 6 colonnes
- [`jev.modules`](#modules) — 5 colonnes
- [`jev.modules_projets`](#modules_projets) — 3 colonnes
- [`jev.demandes_module`](#demandes_module) — 8 colonnes
- [`jev.imports_projet`](#imports_projet) — 9 colonnes
- [`jev.cartes_api`](#cartes_api) — 15 colonnes
- [`jev.appels_cartes_api`](#appels_cartes_api) — 6 colonnes
- [`jev.skills`](#skills) — 7 colonnes
- [`jev.persona`](#persona) — 8 colonnes
- [`jev.versions_persona`](#versions_persona) — 4 colonnes

## comptes

Comptes des utilisateurs de la plateforme (Cockpit et Console) : identité, état du compte, invitation et dernière connexion, profil de l’administrateur. Une ligne par compte, quel que soit le nombre de projets. Écrans : Accès › Utilisateurs, Administrateurs, Mon profil, Vue d’ensemble.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du compte | u1, u12 |
| `nom` | texte | Prénom et nom affichés | Thomas Girard |
| `email` | texte | Adresse e-mail de connexion (unique) | thomas.girard@client.fr |
| `personne_id` | texte | Personne d’un projet liée au compte (facultatif) → personnes.id |  |
| `statut` | texte | État du compte | INVITED = invité (n’a pas encore activé son compte), ACTIVE = actif, SUSPENDED = suspendu |
| `invite_le` | date-heure | Date d’envoi de la dernière invitation (null si le compte n’a jamais été invité) |  |
| `invitation_expire_le` | date-heure | Fin de validité du lien d’invitation (14 jours après l’envoi) |  |
| `derniere_connexion` | date-heure | Dernière connexion réussie (null : jamais connecté) |  |
| `fonction` | texte | Fonction (profil de l’administrateur, Mon profil) |  |
| `societe` | texte | Société |  |
| `equipe` | texte | Équipe |  |
| `telephone` | texte | Téléphone |  |
| `ville` | texte | Ville |  |
| `pays` | texte | Pays |  |
| `langue` | texte | Langue |  |
| `fuseau` | texte | Fuseau horaire | Europe/Paris |
| `cree_le` | date-heure | Création du compte |  |

**Relations**

- comptes.id = comptes_projets.compte_id (projets rattachés au compte)
- comptes.id = habilitations.compte_id (profils par projet : PMO, Responsable, Lecteur)
- comptes.id = administrateurs.compte_id (le compte est administrateur)
- comptes.id = sessions.compte_id
- comptes.personne_id = personnes.id

**Usages**

- Compter les comptes par statut (Vue d’ensemble : « Comptes actifs », « invité(s) », « suspendu(s) »).
- Lister les invitations en attente, expirées ou sans réponse depuis plus de 7 jours.
- Trouver les comptes inactifs : actifs sans connexion depuis N jours.
- Retrouver l’e-mail, la fonction ou la société d’une personne.

**Règles et précautions**

- Invitation en attente = statut INVITED (c’est le chiffre « invité(s) » de la Vue d’ensemble).
- Invitation expirée = statut INVITED et invitation_expire_le antérieure à maintenant. Invitation encore valable = statut INVITED et invitation_expire_le postérieure ou égale à maintenant.
- Invitation sans réponse depuis plus de 7 jours (point « À traiter » de la Vue d’ensemble) = statut INVITED et invite_le antérieure à maintenant moins 7 jours.
- Jours depuis la dernière connexion = partie entière de (maintenant − derniere_connexion) en jours ; null si jamais connecté. Un compte actif jamais connecté compte comme inactif.
- Le profil (PMO, Responsable, Lecteur) n’est pas dans cette table : il se lit dans habilitations. Le profil affiché est le plus fort : PMO > Responsable > Lecteur. Administrateur : présence dans administrateurs.
- Les colonnes fonction à fuseau ne sont renseignées que pour les administrateurs qui ont rempli Mon profil ; null sinon.

## comptes_projets

Projets auxquels un compte est rattaché (codes projet affichés dans la liste des utilisateurs). Une ligne par couple compte × projet.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `compte_id` | texte | Compte → comptes.id |  |
| `projet_id` | texte | Projet → projets.id |  |

**Relations**

- comptes_projets.compte_id = comptes.id
- comptes_projets.projet_id = projets.id (le code lisible est projets.code)

**Usages**

- Lister les utilisateurs d’un projet, ou les projets d’un utilisateur.
- Compter les utilisateurs par projet.

**Règles et précautions**

- Afficher le code du projet (projets.code, ex. RISE) plutôt que son identifiant.
- Le rattachement ne dit pas le profil : voir habilitations.

## habilitations

Profils des personnes et des comptes sur chaque projet : PMO (tout le projet), Responsable ou Lecteur (sur un chantier). Écrans : Droits et habilitations, fiche d’un utilisateur.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de l’habilitation |  |
| `projet_id` | texte | Projet → projets.id |  |
| `personne_id` | texte | Personne du projet → personnes.id (facultatif) |  |
| `compte_id` | texte | Compte → comptes.id (facultatif) |  |
| `profil` | texte | Profil sur le projet | PMO, RESPONSABLE, LECTEUR |
| `chantier_id` | texte | Chantier concerné (Responsable, Lecteur) → chantiers.id ; null pour PMO |  |
| `cree_le` | date-heure | Création de l’habilitation |  |

**Relations**

- habilitations.compte_id = comptes.id
- habilitations.personne_id = personnes.id, et personnes.email = comptes.email relie aussi une personne à un compte
- habilitations.projet_id = projets.id
- habilitations.chantier_id = chantiers.id

**Usages**

- Qui est PMO sur un projet ?
- Quels sont les droits d’un utilisateur ?
- Qui est responsable d’un chantier ?

**Règles et précautions**

- Une habilitation appartient à un compte si compte_id = comptes.id, OU si personne_id désigne une personne dont l’e-mail (sans tenir compte de la casse) est celui du compte, OU si personne_id = comptes.personne_id.
- Profil affiché d’un compte = le plus fort de ses habilitations : PMO > RESPONSABLE > LECTEUR.
- Le profil ADMIN n’est jamais dans cette table : voir administrateurs.

## administrateurs

Comptes qui administrent la plateforme (accès à la Console). Écran : Accès › Administrateurs.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `compte_id` | texte | Compte administrateur → comptes.id |  |
| `depuis` | date-heure | Date à laquelle le compte est devenu administrateur |  |
| `accorde_par_id` | texte | Compte qui a accordé le droit → comptes.id (null : compte initial) |  |

**Relations**

- administrateurs.compte_id = comptes.id
- administrateurs.accorde_par_id = comptes.id

**Usages**

- Qui est administrateur ?
- Depuis quand ? Qui l’a nommé ?

**Règles et précautions**

- Joindre comptes pour avoir le nom et le statut ; un administrateur suspendu reste dans cette table.

## sessions

Sessions de connexion (Cockpit ou Console) : appareil, lieu, dernière activité. Écrans : fiche d’un utilisateur, Mon profil › Sécurité.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `compte_id` | texte | Compte → comptes.id |  |
| `surface` | texte | Application de la session | APP = Cockpit, ADMIN = Console, null = session de développement |
| `appareil` | texte | Navigateur et système | Chrome · Windows |
| `lieu` | texte | Lieu approximatif de connexion |  |
| `ouverte_le` | date-heure | Ouverture de la session |  |
| `derniere_activite` | date-heure | Dernière requête de la session |  |
| `fermee_le` | date-heure | Fermeture (déconnexion, révocation, expiration) ; null si encore ouverte |  |

**Relations**

- sessions.compte_id = comptes.id

**Usages**

- Sessions ouvertes d’un utilisateur.
- Qui est connecté en ce moment ?

**Règles et précautions**

- Session ouverte = fermee_le est null ET dernière activité récente : une session de la Console expire après 15 minutes d’inactivité, une session du Cockpit après 30 minutes. Une session sans activité depuis plus longtemps n’est plus utilisable même si fermee_le est null.

## demandes_invitation

Demandes d’invitation émises par un PMO depuis le Référentiel du Cockpit, à accepter ou refuser par un administrateur (tiroir de notifications, Vue d’ensemble).

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de la demande |  |
| `projet_id` | texte | Projet → projets.id |  |
| `personne_id` | texte | Personne à inviter → personnes.id |  |
| `personne_nom` | texte | Prénom et nom de la personne à inviter |  |
| `personne_email` | texte | E-mail de la personne à inviter |  |
| `demande_par_id` | texte | Compte du demandeur (PMO) → comptes.id |  |
| `statut` | texte | État de la demande | PENDING = à traiter, APPROVED = acceptée, REJECTED = refusée |
| `demandee_le` | date-heure | Date de la demande |  |
| `decidee_le` | date-heure | Date de la décision (null si à traiter) |  |
| `decidee_par_id` | texte | Administrateur qui a décidé → comptes.id |  |

**Relations**

- demandes_invitation.projet_id = projets.id
- demandes_invitation.demande_par_id = comptes.id
- demandes_invitation.decidee_par_id = comptes.id

**Usages**

- Demandes d’invitation à traiter.
- Qui a demandé quoi, et quand ?

**Règles et précautions**

- À traiter = statut PENDING (point « Demande d’invitation du PMO » de la Vue d’ensemble).

## journal_audit

Journal d’audit en ajout seul : chaque action (création, modification, suppression, décision) de la plateforme, avec son auteur, sa date et les valeurs avant / après. Conservé 24 mois. Écran : Accès › Administrateurs › Journal d’audit ; Vue d’ensemble « Actions sensibles récentes ».

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de l’entrée |  |
| `date` | date-heure | Moment de l’action |  |
| `auteur` | texte | Nom de l’auteur | Julien Morel, Système |
| `compte_id` | texte | Compte de l’auteur → comptes.id (null pour le système) |  |
| `profil_utilise` | texte | Profil avec lequel l’action a été faite | ADMIN, PMO, RESPONSABLE |
| `origine` | texte | Origine de l’action | MANUAL = à l’écran, JEV = par Jev, IMPORT = import Excel, SYSTEM = tâche automatique |
| `gravite` | texte | Niveau | INFO, SENSITIVE = sensible, CRITICAL = critique |
| `action` | texte | Libellé de l’action | Suspension d’un utilisateur, Skill modifiée |
| `cible` | texte | Objet visé, en clair | Thomas Girard, Guidage console |
| `projet_id` | texte | Projet concerné → projets.id (null : action de plateforme) |  |
| `chantier_id` | texte | Chantier concerné → chantiers.id |  |
| `type_objet` | texte | Type d’objet | Account, Skill, Provider, ApiCard, Risk |
| `objet_id` | texte | Identifiant de l’objet |  |
| `champ` | texte | Champ modifié (null si l’action porte sur l’objet entier) |  |
| `ancienne_valeur` | json | Valeur avant |  |
| `nouvelle_valeur` | json | Valeur après, ou détails de l’action |  |

**Relations**

- journal_audit.compte_id = comptes.id
- journal_audit.projet_id = projets.id
- journal_audit.chantier_id = chantiers.id

**Usages**

- Qui a fait quoi, et quand ?
- Actions sensibles ou critiques récentes.
- Historique d’un objet (type_objet + objet_id).
- Nombre d’actions par auteur, par jour, par origine.

**Règles et précautions**

- Actions sensibles récentes (Vue d’ensemble) = gravite SENSITIVE ou CRITICAL, triées par date décroissante.
- Les valeurs sont en JSON : lire un champ avec ->> (ex. nouvelle_valeur->>'status').
- Toujours limiter le nombre de lignes et trier par date décroissante pour « les dernières actions ».

## fournisseurs_ia

Fournisseurs de modèles d’IA (Anthropic, OpenAI, Mistral, Google…) et l’état de leur clé API. Écran : IA › Fournisseurs et modèles.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du fournisseur | anthropic, openai, mistral, google, openrouter |
| `nom` | texte | Nom affiché | Anthropic |
| `cle_enregistree` | booléen | Une clé API est enregistrée |  |
| `cle_4_derniers` | texte | 4 derniers caractères de la clé (la clé elle-même n’est jamais lisible) |  |
| `statut` | texte | Résultat du dernier test de la clé | OK = valide, ERROR = refusée ou injoignable, UNTESTED = jamais testée |
| `latence_ms` | entier | Temps de réponse du dernier test | en millisecondes |
| `dernier_test` | date-heure | Date du dernier test |  |
| `derniere_erreur` | texte | Message du dernier échec | 401 · Clé refusée par OpenAI |

**Relations**

- fournisseurs_ia.id = modeles_ia.fournisseur_id
- fournisseurs_ia.id = consommation_ia.fournisseur_id

**Usages**

- Quels fournisseurs sont opérationnels ? (Vue d’ensemble : « Fournisseurs opérationnels »)
- Quelle clé est refusée, et pourquoi ?

**Règles et précautions**

- Fournisseur opérationnel = statut OK. UNTESTED compte comme indisponible : ses modèles ne répondent pas.
- Les clés sont testées automatiquement toutes les 2 heures ; une clé refusée crée un incident dans le tiroir de notifications.

## modeles_ia

Catalogue des modèles d’IA : catégorie, fournisseur, tarif, contexte, date de sortie. Écran : IA › Fournisseurs et modèles.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du modèle | claude-haiku-4-5, gpt-6-luna |
| `fournisseur_id` | texte | Fournisseur → fournisseurs_ia.id |  |
| `nom` | texte | Nom affiché | Claude Haiku 4.5 |
| `description` | texte | Description courte |  |
| `categorie` | texte | Catégorie | LLM = génère du texte, EMBEDDING = vectorisation, RERANKING = reclassement |
| `date_sortie` | date | Date de sortie du modèle |  |
| `sortie_max_jetons` | entier | Longueur maximale d’une réponse (LLM) | en jetons |
| `contexte_jetons` | entier | Longueur de contexte | en jetons |
| `id_chez_fournisseur` | texte | Identifiant du modèle chez le fournisseur | claude-haiku-4-5-20251001 |
| `dimensions` | liste d’entiers | Dimensions de vecteurs acceptées (Embedding) |  |
| `dimension_defaut` | entier | Dimension proposée par défaut (Embedding) |  |
| `unite_tarif` | texte | Unité de facturation | TOKENS = au jeton, REQUESTS = à la requête (Reranking) |
| `prix_entree_eur_million` | décimal | Prix des jetons en entrée | € par million de jetons |
| `prix_sortie_eur_million` | décimal | Prix des jetons en sortie (LLM) | € par million de jetons |
| `prix_eur_mille_requetes` | décimal | Prix à la requête (Reranking) | € pour 1 000 requêtes |
| `actif` | booléen | Modèle utilisable (un modèle inactif ne peut pas être affecté en principal) |  |

**Relations**

- modeles_ia.fournisseur_id = fournisseurs_ia.id
- modeles_ia.id = affectations_ia.principal_id ou affectations_ia.secours_id
- modeles_ia.id = consommation_ia.modele_id

**Usages**

- Quels modèles sont disponibles, par catégorie ?
- Quel est le modèle le moins cher pour une catégorie ?
- Quels modèles d’un fournisseur ?

**Règles et précautions**

- Un modèle répond seulement s’il est actif, de la catégorie attendue par la fonction, et si son fournisseur a le statut OK.
- Prix : null si non applicable à l’unité de facturation du modèle.

## affectations_ia

Modèle principal et modèle de secours de chaque fonction IA. Écran : IA › Affectation des modèles.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `fonction` | texte | Fonction IA | insights = Insights, crud = Gestion des données, rapports = Rapports, guidage = Guidage console (Jev de la Console), doc_vec = Vectorisation, doc_rrk = Reclassement, doc_syn = Synthèse |
| `principal_id` | texte | Modèle principal → modeles_ia.id |  |
| `secours_id` | texte | Modèle de secours → modeles_ia.id (facultatif) |  |
| `dimension_principal` | entier | Taille des vecteurs du principal (Vectorisation seulement) |  |
| `dimension_secours` | entier | Taille des vecteurs du secours (Vectorisation seulement) |  |
| `modifiee_le` | date-heure | Dernière modification de l’affectation |  |

**Relations**

- affectations_ia.principal_id = modeles_ia.id
- affectations_ia.secours_id = modeles_ia.id

**Usages**

- Quel modèle sert telle fonction ?
- Quelle fonction tourne sur son secours ?
- Quelles fonctions dépendent d’un fournisseur ?

**Règles et précautions**

- Catégorie attendue : doc_vec → EMBEDDING, doc_rrk → RERANKING, toutes les autres → LLM.
- État d’une fonction : NOMINAL si le principal est disponible (actif, bonne catégorie, fournisseur OK) ; sinon FALLBACK (sur secours) si le secours est disponible ; sinon INDISPONIBLE.
- Chaîne Documents (doc_vec → doc_rrk → doc_syn) : une étape indisponible rend indisponibles les étapes suivantes.

## consommation_ia

Une ligne par appel à un modèle d’IA : fonction, modèle, jetons, coût, bascule sur le secours. Écran : IA › Vue générale des coûts ; Vue d’ensemble « Dépense IA du mois ».

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `date` | date-heure | Moment de l’appel |  |
| `fonction` | texte | Fonction IA appelée (voir affectations_ia.fonction) |  |
| `modele_id` | texte | Modèle qui a répondu → modeles_ia.id |  |
| `fournisseur_id` | texte | Fournisseur → fournisseurs_ia.id |  |
| `projet_id` | texte | Projet à l’origine de l’appel → projets.id (null : Console, notifications de plateforme) |  |
| `jetons_entree` | entier | Jetons envoyés au modèle |  |
| `jetons_sortie` | entier | Jetons produits par le modèle |  |
| `requetes` | entier | Requêtes facturées (Reranking à la requête ; 0 sinon) |  |
| `cout_eur` | décimal | Coût de l’appel au tarif du moment | en euros |
| `secours_utilise` | booléen | L’appel a été servi par le modèle de secours |  |
| `origine` | texte | Origine de l’appel | COCKPIT, JEV, NOTIFICATION, IMPORT |
| `requete_id` | texte | Identifiant de la requête (Journal consommation et coûts) | req_4f9a1c02b7 |
| `prix_entree_eur_million` | décimal | Tarif d’entrée du modèle au moment de l’appel, figé | € par million de jetons ; null pour les appels antérieurs au journal |
| `prix_sortie_eur_million` | décimal | Tarif de sortie du modèle au moment de l’appel, figé | € par million de jetons |
| `duree_ms` | entier | Latence totale de l’appel | en millisecondes ; null si non mesurée |

**Relations**

- consommation_ia.modele_id = modeles_ia.id
- consommation_ia.fournisseur_id = fournisseurs_ia.id
- consommation_ia.fonction = affectations_ia.fonction
- consommation_ia.projet_id = projets.id

**Usages**

- Dépense du mois, par jour, par fonction, par modèle, par fournisseur ou par projet.
- Jetons consommés.
- Part des appels servis par le secours.

**Règles et précautions**

- Dépense du mois = somme de cout_eur pour les dates du 1er du mois de la date du jour jusqu’à la date du jour incluse. Arrondir à 2 décimales.
- Projection de fin de mois = dépense du mois + (dépense des 7 derniers jours, date du jour incluse, ÷ 7) × nombre de jours restants jusqu’à la fin du mois (date du jour exclue).
- Ligne budgétaire : doc_vec, doc_rrk et doc_syn forment la ligne « docs » (Documents) ; les autres fonctions sont leur propre ligne.
- Les jours sont des jours civils de Paris : grouper par date (date::date), les dates étant déjà en heure de Paris.
- Le coût d’un appel est calculé avec les tarifs figés au moment de l’appel (prix_entree_eur_million, prix_sortie_eur_million), pas avec le catalogue actuel : ne pas le recalculer depuis modeles_ia.

## plafonds_budget_ia

Plafonds de dépense IA mensuels (global et par ligne budgétaire) et leur seuil d’alerte. Écran : IA › Vue générale des coûts.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Plafond | all = global ; insights, crud, rapports, guidage, docs = par ligne budgétaire |
| `plafond_eur` | décimal | Plafond mensuel | en euros ; null = pas de plafond |
| `seuil_alerte_pct` | entier | Seuil d’alerte | en % du plafond (ex. 80) |
| `actif` | booléen | Plafond surveillé |  |

**Relations**

- plafonds_budget_ia.id = ligne budgétaire de consommation_ia.fonction (doc_vec, doc_rrk, doc_syn → docs ; « all » = toutes les fonctions)

**Usages**

- Où en est-on du budget IA ?
- Quel plafond est atteint ou dépassé ?

**Règles et précautions**

- Statut d’un plafond, calculé avec la dépense et la projection du mois de sa ligne (voir consommation_ia) : pas de plafond si inactif ou plafond_eur null ; DÉPASSEMENT si la projection de fin de mois dépasse le plafond ; ALERTE si la dépense atteint plafond × seuil_alerte_pct / 100 ; sinon sous le plafond.
- Pourcentage affiché = dépense du mois ÷ plafond × 100, arrondi.

## regles_notification

Règles de notification et d’alerte envoyées aux utilisateurs (application, e-mail) : cible, fréquence, déclencheur, modèle de rédaction. Écran : Plateforme › Notifications et alertes.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de la règle | n1, n3 |
| `type` | texte | Type | NOTIFICATION, ALERT |
| `nom` | texte | Nom de la règle | Jalon en retard |
| `profils_cibles` | liste de textes | Profils destinataires | admin, pmo, resp (Responsable), lec (Lecteur) |
| `projets` | liste de textes | Codes des projets concernés (vide : aucun projet précis) |  |
| `plateforme` | booléen | Règle de plateforme (hors projet) |  |
| `modele_id` | texte | Modèle qui rédige le message → modeles_ia.id |  |
| `consigne` | texte | Consigne donnée au modèle |  |
| `objet` | texte | Objet du message (avec variables {jalon}, {projet}…) |  |
| `corps` | texte | Texte du message (modèle) |  |
| `frequence` | texte | Fréquence | IMMEDIATE, DAILY, WEEKLY, CUSTOM |
| `jour` | texte | Jour d’envoi (hebdomadaire) |  |
| `heure` | texte | Heure d’envoi | 08:00 |
| `tous_les_n_jours` | entier | Intervalle (fréquence CUSTOM) | en jours |
| `canaux` | liste de textes | Canaux | APP = dans l’application, EMAIL |
| `declencheur` | texte | Déclencheur | SCHEDULE, MILESTONE_LATE, RISK_CRITICAL, DOCUMENT_ANALYZED, BUDGET_THRESHOLD, MANUAL |
| `active` | booléen | Règle active |  |

**Relations**

- regles_notification.id = envois_notification.regle_id
- regles_notification.modele_id = modeles_ia.id

**Usages**

- Quelles alertes sont actives ?
- Qui reçoit telle notification, et quand ?

**Règles et précautions**

- Tester l’appartenance à une liste avec ANY : 'pmo' = ANY(profils_cibles).

## envois_notification

Historique des envois de notifications : règle, canal, nombre de destinataires, succès ou échec, coût. Écran : Notifications et alertes › Historique ; Vue d’ensemble (échecs d’envoi).

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de l’envoi |  |
| `regle_id` | texte | Règle → regles_notification.id |  |
| `date` | date-heure | Moment de l’envoi |  |
| `canal` | texte | Canal | APP, EMAIL |
| `nb_destinataires` | entier | Nombre de destinataires |  |
| `statut` | texte | Résultat | OK, ERROR |
| `erreur` | texte | Motif de l’échec |  |
| `cout_eur` | décimal | Coût de rédaction | en euros |
| `jetons` | entier | Jetons consommés |  |
| `projet_id` | texte | Projet concerné → projets.id |  |
| `objet` | texte | Objet du message envoyé |  |

**Relations**

- envois_notification.regle_id = regles_notification.id
- envois_notification.projet_id = projets.id

**Usages**

- Y a-t-il eu des échecs d’envoi ?
- Combien de notifications envoyées cette semaine ?

**Règles et précautions**

- Échecs signalés en Vue d’ensemble = statut ERROR sur les 7 derniers jours.

## notifications_admin

Notifications de l’administrateur (cloche de la barre latérale) : incidents, alertes, demandes d’invitation et d’activation de module. Une notification par cause, rouverte si la cause réapparaît.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `cause` | texte | Cause unique | provider:openai, budget:all, invite:…, module:…, apicard:…, import:…, snapshot:…, tech:… |
| `type` | texte | Type | ERR = incident, WARN = alerte, INVITE = demande d’invitation, MODULE = demande de module |
| `etat` | texte | État | OPEN = à traiter, DECIDED = décision prise (annulable 10 s), DONE = traitée, RESOLVED = cause disparue |
| `titre` | texte | Titre affiché |  |
| `texte` | texte | Détail affiché |  |
| `note` | texte | Note complémentaire |  |
| `niveau` | texte | Niveau d’une alerte (une aggravation la remet en non lue) |  |
| `lue_le` | date-heure | Lecture (null : non lue) |  |
| `creee_le` | date-heure | Apparition |  |
| `decision` | texte | Décision | ACCEPT, REFUSE |
| `decidee_par` | texte | Nom de l’administrateur qui a décidé |  |
| `decidee_le` | date-heure | Date de la décision |  |
| `resolue_le` | date-heure | Disparition de la cause |  |

**Usages**

- Qu’y a-t-il à traiter dans la cloche ?
- Quels incidents ont eu lieu cette semaine ?

**Règles et précautions**

- À traiter = etat OPEN. Non lue = lue_le null et etat OPEN.

## projets

Projets de la plateforme (Bibliothèque des projets) : code, nom, client, dates, statut.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du projet |  |
| `code` | texte | Code du projet (unique, affiché partout) | RISE, ATLAS, HORIZON, ORION |
| `nom` | texte | Nom du projet |  |
| `client_id` | texte | Client → clients.id |  |
| `client_nom` | texte | Nom du client |  |
| `statut` | texte | Statut | PREPARATION = en préparation, ACTIVE = actif, CLOSED = clos |
| `date_debut` | texte | Date de début | texte AAAA-MM-JJ |
| `date_fin_cible` | texte | Date de fin visée | texte AAAA-MM-JJ |
| `ville` | texte | Ville |  |
| `pays` | texte | Pays |  |
| `fuseau` | texte | Fuseau horaire du projet |  |
| `cree_le` | date-heure | Création du projet sur la plateforme |  |

**Relations**

- projets.id = comptes_projets.projet_id, habilitations.projet_id, chantiers.projet_id, personnes.projet_id, phases.projet_id, snapshots.projet_id, modules_projets.projet_id…
- projets.client_id = clients.id

**Usages**

- Liste des projets et de leurs clients.
- Nombre de chantiers, de personnes ou de phases par projet.

**Règles et précautions**

- Les dates de projet sont du texte au format AAAA-MM-JJ : les convertir avec ::date pour comparer ou calculer.
- Les autres tables désignent un projet par son id ; afficher le code.

## clients

Clients pour lesquels les projets sont menés (nom affiché dans la Bibliothèque des projets) : code, nom, statut.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du client |  |
| `code` | texte | Code du client |  |
| `nom` | texte | Nom du client |  |
| `statut` | texte | Statut | ACTIVE, INACTIVE |

**Relations**

- clients.id = projets.client_id

**Usages**

- Projets d’un client.

## chantiers

Chantiers des projets (périmètre des Responsables et des Lecteurs).

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du chantier |  |
| `projet_id` | texte | Projet → projets.id |  |
| `code` | texte | Code du chantier (unique dans le projet) | C01 |
| `nom` | texte | Nom du chantier |  |
| `responsable_personne_id` | texte | Responsable du chantier → personnes.id |  |
| `statut` | texte | Statut du chantier |  |
| `avancement_pct` | entier | Avancement réalisé | en % |
| `critique` | booléen | Chantier critique |  |

**Relations**

- chantiers.projet_id = projets.id
- chantiers.id = habilitations.chantier_id
- chantiers.responsable_personne_id = personnes.id

**Usages**

- Chantiers d’un projet.
- Qui a des droits sur un chantier ?

**Règles et précautions**

- Le contenu détaillé des projets (actions, risques, jalons) relève du Cockpit, pas de la Console.

## personnes

Personnes de l’équipe de chaque projet (Référentiel du Cockpit), invitables sur la plateforme.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de la personne |  |
| `projet_id` | texte | Projet → projets.id |  |
| `prenom` | texte | Prénom |  |
| `nom` | texte | Nom de famille |  |
| `email` | texte | E-mail (unique dans le projet) |  |
| `titre` | texte | Fonction dans le projet |  |
| `active` | booléen | Personne active dans le projet |  |

**Relations**

- personnes.projet_id = projets.id
- personnes.email = comptes.email (sans tenir compte de la casse) : la personne a un compte
- personnes.id = habilitations.personne_id

**Usages**

- Personnes d’un projet qui n’ont pas encore de compte.
- Taille de l’équipe par projet.

**Règles et précautions**

- Une même personne réelle peut apparaître dans plusieurs projets (une ligne par projet) : dédoublonner par e-mail.

## phases

Phases du planning de chaque projet (phase en cours affichée dans la Bibliothèque).

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de la phase |  |
| `projet_id` | texte | Projet → projets.id |  |
| `ordre` | entier | Rang de la phase dans le projet |  |
| `code` | texte | Code de la phase |  |
| `nom` | texte | Nom de la phase |  |
| `date_debut` | texte | Date de début de la phase | texte AAAA-MM-JJ |
| `date_fin` | texte | Date de fin de la phase | texte AAAA-MM-JJ |
| `statut` | texte | Statut de la phase |  |
| `avancement_pct` | entier | Avancement réalisé | en % |

**Relations**

- phases.projet_id = projets.id

**Usages**

- Phase en cours d’un projet.
- Dates de début et de fin du planning.

**Règles et précautions**

- Phase en cours = date_debut::date ≤ date du jour ≤ date_fin::date. Début du planning = plus petite date_debut ; fin = plus grande date_fin.

## snapshots

Sauvegardes (snapshots) de l’état d’un projet, automatiques ou manuelles. Écrans : Projets › Snapshots, Vue d’ensemble « Dernier snapshot ».

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du snapshot |  |
| `projet_id` | texte | Projet → projets.id |  |
| `date` | date-heure | Moment de la capture |  |
| `type` | texte | Type | AUTO = planifié, MANUAL = manuel |
| `libelle` | texte | Libellé (snapshots manuels) |  |
| `par` | texte | Auteur (manuel) ou Système |  |
| `statut` | texte | Statut | RUNNING = en cours, DONE = terminé, FAILED = en échec |
| `comptes_objets` | json | Nombre d’objets capturés par type | {"Risques": 24, "Actions": 58} |

**Relations**

- snapshots.projet_id = projets.id

**Usages**

- Dernier snapshot réussi d’un projet ou de la plateforme.
- Snapshots en échec.

**Règles et précautions**

- Dernier snapshot (Vue d’ensemble) = statut DONE, le plus récent.

## planification_snapshots

Planification des snapshots automatiques de chaque projet.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `projet_id` | texte | Projet → projets.id |  |
| `active` | booléen | Planification active |  |
| `frequence` | texte | Fréquence | Quotidienne, Hebdomadaire, Mensuelle |
| `jour` | texte | Jour de capture |  |
| `heure` | texte | Heure de capture | 04:00 |
| `conservation` | texte | Durée de conservation | 12 mois |

**Relations**

- planification_snapshots.projet_id = projets.id

**Usages**

- Quand a lieu le prochain snapshot ?
- Combien de temps sont-ils conservés ?

## modules

Modules optionnels de la plateforme (ex. Suivi des bénéfices, Risques avancés) et leur portée. Écran : Plateforme › Modules.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du module |  |
| `nom` | texte | Nom du module |  |
| `description` | texte | Description |  |
| `portee` | texte | Portée | OFF = désactivé, ALL = toute la plateforme, PROJECTS = certains projets (voir modules_projets) |
| `global_depuis` | date-heure | Activation pour toute la plateforme |  |

**Relations**

- modules.id = modules_projets.module_id
- modules.id = demandes_module.module_id

**Usages**

- Quels modules sont actifs, et où ?

**Règles et précautions**

- Un module est actif sur un projet si portee = ALL, ou si portee = PROJECTS et une ligne modules_projets existe pour ce projet.

## modules_projets

Projets sur lesquels un module est activé (portée « certains projets »).

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `module_id` | texte | Module → modules.id |  |
| `projet_id` | texte | Projet → projets.id |  |
| `depuis` | date-heure | Date d’activation sur ce projet |  |

**Relations**

- modules_projets.module_id = modules.id
- modules_projets.projet_id = projets.id

**Usages**

- Modules actifs sur un projet.

**Règles et précautions**

- Sans effet si le module a la portée OFF ou ALL.

## demandes_module

Demandes d’activation d’un module pour un projet, à décider par un administrateur.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de la demande |  |
| `module_id` | texte | Module demandé → modules.id |  |
| `projet_id` | texte | Projet → projets.id |  |
| `demandeur` | texte | Nom du demandeur |  |
| `demandeur_compte_id` | texte | Compte du demandeur → comptes.id |  |
| `demandee_le` | date-heure | Date de la demande |  |
| `statut` | texte | État | PENDING = à traiter, APPROVED = acceptée, REJECTED = refusée |
| `decidee_le` | date-heure | Date de la décision |  |

**Relations**

- demandes_module.module_id = modules.id
- demandes_module.projet_id = projets.id

**Usages**

- Demandes de module à traiter.

**Règles et précautions**

- À traiter = statut PENDING. Une demande acceptée n’active le module que pour le projet demandeur.

## imports_projet

Imports du fichier Excel d’initialisation d’un projet : contrôle, erreurs, avertissements, import. Écran : Projets › Initialisation d’un projet.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de l’import |  |
| `fichier` | texte | Nom du fichier déposé |  |
| `depose_par` | texte | Nom de l’utilisateur |  |
| `depose_le` | date-heure | Date du dépôt |  |
| `statut` | texte | État | CHECKED = contrôlé, REJECTED = refusé (erreurs bloquantes), IMPORTED = importé |
| `projet_id` | texte | Projet créé → projets.id (après import) |  |
| `nb_erreurs` | entier | Erreurs bloquantes |  |
| `nb_avertissements` | entier | Avertissements |  |
| `rapport` | json | Rapport de contrôle complet | {ok, errors, warnings, issues[], checks, counts, project{code,name,client,…}} |

**Relations**

- imports_projet.projet_id = projets.id

**Usages**

- Imports refusés et leurs erreurs.
- Qui a importé quel projet ?

**Règles et précautions**

- Le détail des anomalies est dans rapport->'issues' (tableau JSON).

## cartes_api

Cartes du Registre des cartes API : services externes des widgets (météo, trafic, actualités, finance, flux RSS), leur endpoint, leur clé (jamais lisible), délai, quota et état. Écran : Registre des cartes API.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de la carte |  |
| `nom` | texte | Nom de la carte | OpenWeather, TomTom Traffic, GNews |
| `categorie` | texte | Catégorie | Météo, Trafic, Actualités, Environnement, Mobilité, Calendrier, Finance, Autre |
| `endpoint` | texte | Adresse appelée ; {key} marque l’emplacement de la clé (toute clé écrite en clair est masquée) |  |
| `cle_4_derniers` | texte | 4 derniers caractères de la clé |  |
| `cle_expire_le` | date | Échéance de la clé |  |
| `active` | booléen | Carte activée |  |
| `erreur_controle` | texte | Échec du dernier contrôle (null : dernier contrôle réussi) | Clé refusée · 401, Délai dépassé |
| `latence_ms` | entier | Temps de réponse du dernier contrôle | en millisecondes |
| `quota_jour` | entier | Quota journalier d’appels (null : pas de quota) |  |
| `delai_ms` | entier | Délai d’appel propre à la carte | en millisecondes ; null = 8 000 |
| `flux_rss` | booléen | Flux RSS ou Atom (pas d’API JSON) |  |
| `widgets` | liste de textes | Widgets du Cockpit qui utilisent la carte |  |
| `dernier_test` | json | Dernier test manuel | {code, ms, at, body} |
| `modifiee_le` | date-heure | Dernière modification |  |

**Relations**

- cartes_api.id = appels_cartes_api.carte_id

**Usages**

- Quelles cartes sont en erreur ?
- Quelles clés expirent bientôt ?
- Quota du jour d’une carte.

**Règles et précautions**

- État affiché, dans cet ordre : carte désactivée → « Désactivée » ; erreur_controle non null → en erreur ; cle_expire_le dépassée → « Clé expirée » (erreur) ; cle_expire_le dans 30 jours ou moins → avertissement ; appels du jour ≥ 85 % de quota_jour → avertissement ; sinon opérationnelle.
- Appels du jour = nombre de lignes de appels_cartes_api de la carte depuis minuit (heure de Paris) jusqu’à maintenant, toutes origines confondues.
- Échéance de la clé signalée à 30, 7 et 1 jour.

## appels_cartes_api

Un appel à une carte API : proxy des widgets, contrôle de santé (toutes les 15 min) ou test manuel ; code de réponse et temps.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `carte_id` | texte | Carte → cartes_api.id |  |
| `date` | date-heure | Moment de l’appel |  |
| `code` | entier | Code HTTP de la réponse (0 : injoignable) | 200, 401, 429 |
| `ms` | entier | Temps de réponse | en millisecondes |
| `origine` | texte | Origine | PROXY = widget, HEALTH = contrôle de santé, TEST = test manuel |
| `widget` | texte | Widget appelant (PROXY) |  |

**Relations**

- appels_cartes_api.carte_id = cartes_api.id

**Usages**

- Latence moyenne sur 24 h.
- Taux d’échec d’une carte.
- Appels du jour.

**Règles et précautions**

- Appel réussi = code entre 1 et 399. Latence moyenne = moyenne de ms des appels réussis.

## skills

Skills de Jev : consignes ajoutées à son prompt. Écran : Assistant › Skills.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `nom` | texte | Nom de la skill | Guidage console, Insights |
| `texte` | texte | Texte de la consigne (20 000 caractères au plus) |  |
| `active` | booléen | Skill active |  |
| `position` | entier | Ordre dans la liste |  |
| `modifiee_le` | date-heure | Dernière modification |  |
| `modifiee_par` | texte | Auteur de la dernière modification |  |

**Usages**

- Quelles skills sont actives ?

**Règles et précautions**

- Le Jev de la Console n’utilise que la skill « Guidage console » ; le Jev du Cockpit utilise toutes les skills actives, dans l’ordre de position.

## persona

Persona de Jev (une seule ligne) : identité et personnalité (Soul). Écran : Assistant › Persona.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `nom` | texte | Nom de l’assistant | Jev |
| `nature` | texte | Ce qu’il est | Copilote de projet |
| `style` | texte | Style de réponse |  |
| `emoji` | texte | Emoji |  |
| `soul` | texte | Personnalité (texte libre) |  |
| `version` | entier | Numéro de version |  |
| `modifie_le` | date-heure | Dernière modification |  |
| `modifie_par` | texte | Auteur |  |

**Usages**

- Qui a modifié le Persona, et quand ?

## versions_persona

Historique des versions du Persona de Jev.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `version` | entier | Numéro de version |  |
| `contenu` | json | Identité et Soul de cette version | {identity{name,creature,style,emoji}, soul} |
| `enregistree_le` | date-heure | Date d’enregistrement |  |
| `enregistree_par` | texte | Auteur |  |

**Relations**

- versions_persona.version ≤ persona.version

**Usages**

- Historique des modifications du Persona.
