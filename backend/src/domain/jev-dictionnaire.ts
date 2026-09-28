/**
 * Dictionnaire des données du Jev de la Console (interrogation en langage naturel, Text-to-SQL).
 *
 * Une fiche par vue du schéma `jev` : description, colonnes (expression SQL, type, signification, exemples et
 * unités), relations, usages, règles et précautions. Ce fichier est la source unique :
 * - `jevViewsSql()` produit les vues en lecture seule (migration `…_jev_dictionnaire`) ;
 * - `prisma/seed/dictionnaire.ts` charge les fiches dans `dictionnaire_tables` et `dictionnaire_colonnes`.
 *
 * Périmètre (décision du 28/09/2026) : ce que la Console affiche, e-mails compris ; jamais les secrets
 * (empreintes de mot de passe, jetons et identifiants de session, clés API chiffrées, chemins de stockage).
 * Heures : converties en heure de Paris (fuseau de la plateforme), sans fuseau.
 */

export interface DictColumn {
  nom: string;
  /** Expression SQL sur la table source (alias `t`, et jointures déclarées dans `source`). */
  expr: string;
  type: 'texte' | 'entier' | 'décimal' | 'booléen' | 'date' | 'date-heure' | 'json' | 'liste de textes' | 'liste d’entiers';
  signification: string;
  exemples?: string;
}

export interface DictTable {
  /** Nom de la vue, sans le schéma (`jev.<nom>`). */
  nom: string;
  /** Clause FROM (alias `t` pour la table principale). */
  source: string;
  /** Filtre éventuel (sans WHERE). */
  filtre?: string;
  description: string;
  colonnes: DictColumn[];
  relations: string[];
  usages: string[];
  regles: string[];
}

export const JEV_SCHEMA = 'jev';

/** Date-heure stockée en UTC → heure de Paris. */
const P = (col: string) => `(t.${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris'`;
const q = (c: string) => `"${c}"`;

export const DICTIONNAIRE: DictTable[] = [
  // ───────────── Accès ─────────────
  {
    nom: 'comptes',
    source: '"Account" t',
    description: 'Comptes des utilisateurs de la plateforme (Cockpit et Console) : identité, état du compte, invitation et dernière connexion, profil de l’administrateur. Une ligne par compte, quel que soit le nombre de projets. Écrans : Accès › Utilisateurs, Administrateurs, Mon profil, Vue d’ensemble.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant du compte', exemples: 'u1, u12' },
      { nom: 'nom', expr: `t.${q('fullName')}`, type: 'texte', signification: 'Prénom et nom affichés', exemples: 'Thomas Girard' },
      { nom: 'email', expr: 't.email', type: 'texte', signification: 'Adresse e-mail de connexion (unique)', exemples: 'thomas.girard@client.fr' },
      { nom: 'personne_id', expr: `t.${q('personId')}`, type: 'texte', signification: 'Personne d’un projet liée au compte (facultatif) → personnes.id' },
      { nom: 'statut', expr: 't.status::text', type: 'texte', signification: 'État du compte', exemples: 'INVITED = invité (n’a pas encore activé son compte), ACTIVE = actif, SUSPENDED = suspendu' },
      { nom: 'invite_le', expr: P(q('invitedAt')), type: 'date-heure', signification: 'Date d’envoi de la dernière invitation (null si le compte n’a jamais été invité)' },
      { nom: 'invitation_expire_le', expr: P(q('inviteExpiresAt')), type: 'date-heure', signification: 'Fin de validité du lien d’invitation (14 jours après l’envoi)' },
      { nom: 'derniere_connexion', expr: P(q('lastLoginAt')), type: 'date-heure', signification: 'Dernière connexion réussie (null : jamais connecté)' },
      { nom: 'fonction', expr: `t.profile->>'position'`, type: 'texte', signification: 'Fonction (profil de l’administrateur, Mon profil)' },
      { nom: 'societe', expr: `t.profile->>'company'`, type: 'texte', signification: 'Société' },
      { nom: 'equipe', expr: `t.profile->>'team'`, type: 'texte', signification: 'Équipe' },
      { nom: 'telephone', expr: `t.profile->>'phone'`, type: 'texte', signification: 'Téléphone' },
      { nom: 'ville', expr: `t.profile->>'city'`, type: 'texte', signification: 'Ville' },
      { nom: 'pays', expr: `t.profile->>'country'`, type: 'texte', signification: 'Pays' },
      { nom: 'langue', expr: `t.profile->>'language'`, type: 'texte', signification: 'Langue' },
      { nom: 'fuseau', expr: `t.profile->>'timezone'`, type: 'texte', signification: 'Fuseau horaire', exemples: 'Europe/Paris' },
      { nom: 'cree_le', expr: P(q('createdAt')), type: 'date-heure', signification: 'Création du compte' },
    ],
    relations: [
      'comptes.id = comptes_projets.compte_id (projets rattachés au compte)',
      'comptes.id = habilitations.compte_id (profils par projet : PMO, Responsable, Lecteur)',
      'comptes.id = administrateurs.compte_id (le compte est administrateur)',
      'comptes.id = sessions.compte_id',
      'comptes.personne_id = personnes.id',
    ],
    usages: [
      'Compter les comptes par statut (Vue d’ensemble : « Comptes actifs », « invité(s) », « suspendu(s) »).',
      'Lister les invitations en attente, expirées ou sans réponse depuis plus de 7 jours.',
      'Trouver les comptes inactifs : actifs sans connexion depuis N jours.',
      'Retrouver l’e-mail, la fonction ou la société d’une personne.',
    ],
    regles: [
      'Invitation en attente = statut INVITED (c’est le chiffre « invité(s) » de la Vue d’ensemble).',
      'Invitation expirée = statut INVITED et invitation_expire_le antérieure à maintenant. Invitation encore valable = statut INVITED et invitation_expire_le postérieure ou égale à maintenant.',
      'Invitation sans réponse depuis plus de 7 jours (point « À traiter » de la Vue d’ensemble) = statut INVITED et invite_le antérieure à maintenant moins 7 jours.',
      'Jours depuis la dernière connexion = partie entière de (maintenant − derniere_connexion) en jours ; null si jamais connecté. Un compte actif jamais connecté compte comme inactif.',
      'Le profil (PMO, Responsable, Lecteur) n’est pas dans cette table : il se lit dans habilitations. Le profil affiché est le plus fort : PMO > Responsable > Lecteur. Administrateur : présence dans administrateurs.',
      'Les colonnes fonction à fuseau ne sont renseignées que pour les administrateurs qui ont rempli Mon profil ; null sinon.',
    ],
  },
  {
    nom: 'comptes_projets',
    source: '"AccountProject" t',
    description: 'Projets auxquels un compte est rattaché (codes projet affichés dans la liste des utilisateurs). Une ligne par couple compte × projet.',
    colonnes: [
      { nom: 'compte_id', expr: `t.${q('accountId')}`, type: 'texte', signification: 'Compte → comptes.id' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet → projets.id' },
    ],
    relations: ['comptes_projets.compte_id = comptes.id', 'comptes_projets.projet_id = projets.id (le code lisible est projets.code)'],
    usages: ['Lister les utilisateurs d’un projet, ou les projets d’un utilisateur.', 'Compter les utilisateurs par projet.'],
    regles: ['Afficher le code du projet (projets.code, ex. RISE) plutôt que son identifiant.', 'Le rattachement ne dit pas le profil : voir habilitations.'],
  },
  {
    nom: 'habilitations',
    source: '"Habilitation" t',
    description: 'Profils des personnes et des comptes sur chaque projet : PMO (tout le projet), Responsable ou Lecteur (sur un chantier). Écrans : Droits et habilitations, fiche d’un utilisateur.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant de l’habilitation' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet → projets.id' },
      { nom: 'personne_id', expr: `t.${q('personId')}`, type: 'texte', signification: 'Personne du projet → personnes.id (facultatif)' },
      { nom: 'compte_id', expr: `t.${q('accountId')}`, type: 'texte', signification: 'Compte → comptes.id (facultatif)' },
      { nom: 'profil', expr: 't.profile::text', type: 'texte', signification: 'Profil sur le projet', exemples: 'PMO, RESPONSABLE, LECTEUR' },
      { nom: 'chantier_id', expr: `t.${q('wsId')}`, type: 'texte', signification: 'Chantier concerné (Responsable, Lecteur) → chantiers.id ; null pour PMO' },
      { nom: 'cree_le', expr: P(q('createdAt')), type: 'date-heure', signification: 'Création de l’habilitation' },
    ],
    relations: [
      'habilitations.compte_id = comptes.id',
      'habilitations.personne_id = personnes.id, et personnes.email = comptes.email relie aussi une personne à un compte',
      'habilitations.projet_id = projets.id',
      'habilitations.chantier_id = chantiers.id',
    ],
    usages: ['Qui est PMO sur un projet ?', 'Quels sont les droits d’un utilisateur ?', 'Qui est responsable d’un chantier ?'],
    regles: [
      'Une habilitation appartient à un compte si compte_id = comptes.id, OU si personne_id désigne une personne dont l’e-mail (sans tenir compte de la casse) est celui du compte, OU si personne_id = comptes.personne_id.',
      'Profil affiché d’un compte = le plus fort de ses habilitations : PMO > RESPONSABLE > LECTEUR.',
      'Le profil ADMIN n’est jamais dans cette table : voir administrateurs.',
    ],
  },
  {
    nom: 'administrateurs',
    source: '"AdminGrant" t',
    description: 'Comptes qui administrent la plateforme (accès à la Console). Écran : Accès › Administrateurs.',
    colonnes: [
      { nom: 'compte_id', expr: `t.${q('accountId')}`, type: 'texte', signification: 'Compte administrateur → comptes.id' },
      { nom: 'depuis', expr: P('since'), type: 'date-heure', signification: 'Date à laquelle le compte est devenu administrateur' },
      { nom: 'accorde_par_id', expr: `t.${q('grantedById')}`, type: 'texte', signification: 'Compte qui a accordé le droit → comptes.id (null : compte initial)' },
    ],
    relations: ['administrateurs.compte_id = comptes.id', 'administrateurs.accorde_par_id = comptes.id'],
    usages: ['Qui est administrateur ?', 'Depuis quand ? Qui l’a nommé ?'],
    regles: ['Joindre comptes pour avoir le nom et le statut ; un administrateur suspendu reste dans cette table.'],
  },
  {
    nom: 'sessions',
    source: '"AuthSession" t',
    description: 'Sessions de connexion (Cockpit ou Console) : appareil, lieu, dernière activité. Écrans : fiche d’un utilisateur, Mon profil › Sécurité.',
    colonnes: [
      { nom: 'compte_id', expr: `t.${q('accountId')}`, type: 'texte', signification: 'Compte → comptes.id' },
      { nom: 'surface', expr: 't.surface', type: 'texte', signification: 'Application de la session', exemples: 'APP = Cockpit, ADMIN = Console, null = session de développement' },
      { nom: 'appareil', expr: 't.device', type: 'texte', signification: 'Navigateur et système', exemples: 'Chrome · Windows' },
      { nom: 'lieu', expr: 't.location', type: 'texte', signification: 'Lieu approximatif de connexion' },
      { nom: 'ouverte_le', expr: P(q('createdAt')), type: 'date-heure', signification: 'Ouverture de la session' },
      { nom: 'derniere_activite', expr: P(q('lastSeenAt')), type: 'date-heure', signification: 'Dernière requête de la session' },
      { nom: 'fermee_le', expr: P(q('revokedAt')), type: 'date-heure', signification: 'Fermeture (déconnexion, révocation, expiration) ; null si encore ouverte' },
    ],
    relations: ['sessions.compte_id = comptes.id'],
    usages: ['Sessions ouvertes d’un utilisateur.', 'Qui est connecté en ce moment ?'],
    regles: [
      'Session ouverte = fermee_le est null ET dernière activité récente : une session de la Console expire après 15 minutes d’inactivité, une session du Cockpit après 30 minutes. Une session sans activité depuis plus longtemps n’est plus utilisable même si fermee_le est null.',
    ],
  },
  {
    nom: 'demandes_invitation',
    source: '"InvitationRequest" t LEFT JOIN "Person" p ON p.id = t."personId"',
    description: 'Demandes d’invitation émises par un PMO depuis le Référentiel du Cockpit, à accepter ou refuser par un administrateur (tiroir de notifications, Vue d’ensemble).',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant de la demande' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet → projets.id' },
      { nom: 'personne_id', expr: `t.${q('personId')}`, type: 'texte', signification: 'Personne à inviter → personnes.id' },
      { nom: 'personne_nom', expr: `p.${q('firstName')} || ' ' || p.${q('lastName')}`, type: 'texte', signification: 'Prénom et nom de la personne à inviter' },
      { nom: 'personne_email', expr: 'p.email', type: 'texte', signification: 'E-mail de la personne à inviter' },
      { nom: 'demande_par_id', expr: `t.${q('requestedById')}`, type: 'texte', signification: 'Compte du demandeur (PMO) → comptes.id' },
      { nom: 'statut', expr: 't.status::text', type: 'texte', signification: 'État de la demande', exemples: 'PENDING = à traiter, APPROVED = acceptée, REJECTED = refusée' },
      { nom: 'demandee_le', expr: P(q('createdAt')), type: 'date-heure', signification: 'Date de la demande' },
      { nom: 'decidee_le', expr: P(q('decidedAt')), type: 'date-heure', signification: 'Date de la décision (null si à traiter)' },
      { nom: 'decidee_par_id', expr: `t.${q('decidedById')}`, type: 'texte', signification: 'Administrateur qui a décidé → comptes.id' },
    ],
    relations: ['demandes_invitation.projet_id = projets.id', 'demandes_invitation.demande_par_id = comptes.id', 'demandes_invitation.decidee_par_id = comptes.id'],
    usages: ['Demandes d’invitation à traiter.', 'Qui a demandé quoi, et quand ?'],
    regles: ['À traiter = statut PENDING (point « Demande d’invitation du PMO » de la Vue d’ensemble).'],
  },
  {
    nom: 'journal_audit',
    source: '"AuditEntry" t',
    description: 'Journal d’audit en ajout seul : chaque action (création, modification, suppression, décision) de la plateforme, avec son auteur, sa date et les valeurs avant / après. Conservé 24 mois. Écran : Accès › Administrateurs › Journal d’audit ; Vue d’ensemble « Actions sensibles récentes ».',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant de l’entrée' },
      { nom: 'date', expr: P('at'), type: 'date-heure', signification: 'Moment de l’action' },
      { nom: 'auteur', expr: `t.${q('actorName')}`, type: 'texte', signification: 'Nom de l’auteur', exemples: 'Julien Morel, Système' },
      { nom: 'compte_id', expr: `t.${q('accountId')}`, type: 'texte', signification: 'Compte de l’auteur → comptes.id (null pour le système)' },
      { nom: 'profil_utilise', expr: `t.${q('profileUsed')}`, type: 'texte', signification: 'Profil avec lequel l’action a été faite', exemples: 'ADMIN, PMO, RESPONSABLE' },
      { nom: 'origine', expr: 't.origin::text', type: 'texte', signification: 'Origine de l’action', exemples: 'MANUAL = à l’écran, JEV = par Jev, IMPORT = import Excel, SYSTEM = tâche automatique' },
      { nom: 'gravite', expr: 't.severity::text', type: 'texte', signification: 'Niveau', exemples: 'INFO, SENSITIVE = sensible, CRITICAL = critique' },
      { nom: 'action', expr: 't.action', type: 'texte', signification: 'Libellé de l’action', exemples: 'Suspension d’un utilisateur, Skill modifiée' },
      { nom: 'cible', expr: 't.target', type: 'texte', signification: 'Objet visé, en clair', exemples: 'Thomas Girard, Guidage console' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet concerné → projets.id (null : action de plateforme)' },
      { nom: 'chantier_id', expr: `t.${q('wsId')}`, type: 'texte', signification: 'Chantier concerné → chantiers.id' },
      { nom: 'type_objet', expr: `t.${q('entityType')}`, type: 'texte', signification: 'Type d’objet', exemples: 'Account, Skill, Provider, ApiCard, Risk' },
      { nom: 'objet_id', expr: `t.${q('entityId')}`, type: 'texte', signification: 'Identifiant de l’objet' },
      { nom: 'champ', expr: 't.field', type: 'texte', signification: 'Champ modifié (null si l’action porte sur l’objet entier)' },
      { nom: 'ancienne_valeur', expr: `t.${q('oldValue')}`, type: 'json', signification: 'Valeur avant' },
      { nom: 'nouvelle_valeur', expr: `t.${q('newValue')}`, type: 'json', signification: 'Valeur après, ou détails de l’action' },
    ],
    relations: ['journal_audit.compte_id = comptes.id', 'journal_audit.projet_id = projets.id', 'journal_audit.chantier_id = chantiers.id'],
    usages: ['Qui a fait quoi, et quand ?', 'Actions sensibles ou critiques récentes.', 'Historique d’un objet (type_objet + objet_id).', 'Nombre d’actions par auteur, par jour, par origine.'],
    regles: [
      'Actions sensibles récentes (Vue d’ensemble) = gravite SENSITIVE ou CRITICAL, triées par date décroissante.',
      'Les valeurs sont en JSON : lire un champ avec ->> (ex. nouvelle_valeur->>\'status\').',
      'Toujours limiter le nombre de lignes et trier par date décroissante pour « les dernières actions ».',
    ],
  },

  // ───────────── IA ─────────────
  {
    nom: 'fournisseurs_ia',
    source: '"Provider" t',
    description: 'Fournisseurs de modèles d’IA (Anthropic, OpenAI, Mistral, Google…) et l’état de leur clé API. Écran : IA › Fournisseurs et modèles.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant du fournisseur', exemples: 'anthropic, openai, mistral, google, openrouter' },
      { nom: 'nom', expr: 't.name', type: 'texte', signification: 'Nom affiché', exemples: 'Anthropic' },
      { nom: 'cle_enregistree', expr: `t.${q('keyCipher')} IS NOT NULL`, type: 'booléen', signification: 'Une clé API est enregistrée' },
      { nom: 'cle_4_derniers', expr: `t.${q('keyLast4')}`, type: 'texte', signification: '4 derniers caractères de la clé (la clé elle-même n’est jamais lisible)' },
      { nom: 'statut', expr: 't.status::text', type: 'texte', signification: 'Résultat du dernier test de la clé', exemples: 'OK = valide, ERROR = refusée ou injoignable, UNTESTED = jamais testée' },
      { nom: 'latence_ms', expr: `t.${q('latencyMs')}`, type: 'entier', signification: 'Temps de réponse du dernier test', exemples: 'en millisecondes' },
      { nom: 'dernier_test', expr: P(q('lastTestedAt')), type: 'date-heure', signification: 'Date du dernier test' },
      { nom: 'derniere_erreur', expr: `t.${q('lastError')}`, type: 'texte', signification: 'Message du dernier échec', exemples: '401 · Clé refusée par OpenAI' },
    ],
    relations: ['fournisseurs_ia.id = modeles_ia.fournisseur_id', 'fournisseurs_ia.id = consommation_ia.fournisseur_id'],
    usages: ['Quels fournisseurs sont opérationnels ? (Vue d’ensemble : « Fournisseurs opérationnels »)', 'Quelle clé est refusée, et pourquoi ?'],
    regles: [
      'Fournisseur opérationnel = statut OK. UNTESTED compte comme indisponible : ses modèles ne répondent pas.',
      'Les clés sont testées automatiquement toutes les 2 heures ; une clé refusée crée un incident dans le tiroir de notifications.',
    ],
  },
  {
    nom: 'modeles_ia',
    source: '"AiModel" t',
    description: 'Catalogue des modèles d’IA : catégorie, fournisseur, tarif, contexte, date de sortie. Écran : IA › Fournisseurs et modèles.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant du modèle', exemples: 'claude-haiku-4-5, gpt-6-luna' },
      { nom: 'fournisseur_id', expr: `t.${q('providerId')}`, type: 'texte', signification: 'Fournisseur → fournisseurs_ia.id' },
      { nom: 'nom', expr: 't.name', type: 'texte', signification: 'Nom affiché', exemples: 'Claude Haiku 4.5' },
      { nom: 'description', expr: 't.description', type: 'texte', signification: 'Description courte' },
      { nom: 'categorie', expr: 't.category::text', type: 'texte', signification: 'Catégorie', exemples: 'LLM = génère du texte, EMBEDDING = vectorisation, RERANKING = reclassement' },
      { nom: 'date_sortie', expr: `t.${q('releaseDate')}`, type: 'date', signification: 'Date de sortie du modèle' },
      { nom: 'sortie_max_jetons', expr: `t.${q('maxOutputTokens')}`, type: 'entier', signification: 'Longueur maximale d’une réponse (LLM)', exemples: 'en jetons' },
      { nom: 'contexte_jetons', expr: `t.${q('contextTokens')}`, type: 'entier', signification: 'Longueur de contexte', exemples: 'en jetons' },
      { nom: 'id_chez_fournisseur', expr: `t.${q('providerModelId')}`, type: 'texte', signification: 'Identifiant du modèle chez le fournisseur', exemples: 'claude-haiku-4-5-20251001' },
      { nom: 'dimensions', expr: 't.dimensions', type: 'liste d’entiers', signification: 'Dimensions de vecteurs acceptées (Embedding)' },
      { nom: 'dimension_defaut', expr: `t.${q('defaultDimension')}`, type: 'entier', signification: 'Dimension proposée par défaut (Embedding)' },
      { nom: 'unite_tarif', expr: `t.${q('priceUnit')}::text`, type: 'texte', signification: 'Unité de facturation', exemples: 'TOKENS = au jeton, REQUESTS = à la requête (Reranking)' },
      { nom: 'prix_entree_eur_million', expr: `t.${q('priceInPerMTok')}`, type: 'décimal', signification: 'Prix des jetons en entrée', exemples: '€ par million de jetons' },
      { nom: 'prix_sortie_eur_million', expr: `t.${q('priceOutPerMTok')}`, type: 'décimal', signification: 'Prix des jetons en sortie (LLM)', exemples: '€ par million de jetons' },
      { nom: 'prix_eur_mille_requetes', expr: `t.${q('pricePer1kRequests')}`, type: 'décimal', signification: 'Prix à la requête (Reranking)', exemples: '€ pour 1 000 requêtes' },
      { nom: 'actif', expr: 't.active', type: 'booléen', signification: 'Modèle utilisable (un modèle inactif ne peut pas être affecté en principal)' },
    ],
    relations: ['modeles_ia.fournisseur_id = fournisseurs_ia.id', 'modeles_ia.id = affectations_ia.principal_id ou affectations_ia.secours_id', 'modeles_ia.id = consommation_ia.modele_id'],
    usages: ['Quels modèles sont disponibles, par catégorie ?', 'Quel est le modèle le moins cher pour une catégorie ?', 'Quels modèles d’un fournisseur ?'],
    regles: [
      'Un modèle répond seulement s’il est actif, de la catégorie attendue par la fonction, et si son fournisseur a le statut OK.',
      'Prix : null si non applicable à l’unité de facturation du modèle.',
    ],
  },
  {
    nom: 'affectations_ia',
    source: '"ModelAssignment" t',
    description: 'Modèle principal et modèle de secours de chaque fonction IA. Écran : IA › Affectation des modèles.',
    colonnes: [
      { nom: 'fonction', expr: `t.${q('functionId')}`, type: 'texte', signification: 'Fonction IA', exemples: 'insights = Insights, crud = Gestion des données, rapports = Rapports, guidage = Guidage console (Jev de la Console), doc_vec = Vectorisation, doc_rrk = Reclassement, doc_syn = Synthèse' },
      { nom: 'principal_id', expr: `t.${q('primaryModelId')}`, type: 'texte', signification: 'Modèle principal → modeles_ia.id' },
      { nom: 'secours_id', expr: `t.${q('fallbackModelId')}`, type: 'texte', signification: 'Modèle de secours → modeles_ia.id (facultatif)' },
      { nom: 'dimension_principal', expr: `t.${q('primaryDimension')}`, type: 'entier', signification: 'Taille des vecteurs du principal (Vectorisation seulement)' },
      { nom: 'dimension_secours', expr: `t.${q('fallbackDimension')}`, type: 'entier', signification: 'Taille des vecteurs du secours (Vectorisation seulement)' },
      { nom: 'modifiee_le', expr: P(q('updatedAt')), type: 'date-heure', signification: 'Dernière modification de l’affectation' },
    ],
    relations: ['affectations_ia.principal_id = modeles_ia.id', 'affectations_ia.secours_id = modeles_ia.id'],
    usages: ['Quel modèle sert telle fonction ?', 'Quelle fonction tourne sur son secours ?', 'Quelles fonctions dépendent d’un fournisseur ?'],
    regles: [
      'Catégorie attendue : doc_vec → EMBEDDING, doc_rrk → RERANKING, toutes les autres → LLM.',
      'État d’une fonction : NOMINAL si le principal est disponible (actif, bonne catégorie, fournisseur OK) ; sinon FALLBACK (sur secours) si le secours est disponible ; sinon INDISPONIBLE.',
      'Chaîne Documents (doc_vec → doc_rrk → doc_syn) : une étape indisponible rend indisponibles les étapes suivantes.',
    ],
  },
  {
    nom: 'consommation_ia',
    source: '"UsageRecord" t',
    description: 'Une ligne par appel à un modèle d’IA : fonction, modèle, jetons, coût, bascule sur le secours. Écran : IA › Vue générale des coûts ; Vue d’ensemble « Dépense IA du mois ».',
    colonnes: [
      { nom: 'date', expr: P('at'), type: 'date-heure', signification: 'Moment de l’appel' },
      { nom: 'fonction', expr: `t.${q('functionId')}`, type: 'texte', signification: 'Fonction IA appelée (voir affectations_ia.fonction)' },
      { nom: 'modele_id', expr: `t.${q('modelId')}`, type: 'texte', signification: 'Modèle qui a répondu → modeles_ia.id' },
      { nom: 'fournisseur_id', expr: `t.${q('providerId')}`, type: 'texte', signification: 'Fournisseur → fournisseurs_ia.id' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet à l’origine de l’appel → projets.id (null : Console, notifications de plateforme)' },
      { nom: 'jetons_entree', expr: `t.${q('tokensIn')}`, type: 'entier', signification: 'Jetons envoyés au modèle' },
      { nom: 'jetons_sortie', expr: `t.${q('tokensOut')}`, type: 'entier', signification: 'Jetons produits par le modèle' },
      { nom: 'requetes', expr: 't.requests', type: 'entier', signification: 'Requêtes facturées (Reranking à la requête ; 0 sinon)' },
      { nom: 'cout_eur', expr: `t.${q('costEur')}`, type: 'décimal', signification: 'Coût de l’appel au tarif du moment', exemples: 'en euros' },
      { nom: 'secours_utilise', expr: `t.${q('fallbackUsed')}`, type: 'booléen', signification: 'L’appel a été servi par le modèle de secours' },
      { nom: 'origine', expr: 't.source::text', type: 'texte', signification: 'Origine de l’appel', exemples: 'COCKPIT, JEV, NOTIFICATION, IMPORT' },
      { nom: 'requete_id', expr: 't.id', type: 'texte', signification: 'Identifiant de la requête (Journal consommation et coûts)', exemples: 'req_4f9a1c02b7' },
      { nom: 'prix_entree_eur_million', expr: `t.${q('priceIn')}`, type: 'décimal', signification: 'Tarif d’entrée du modèle au moment de l’appel, figé', exemples: '€ par million de jetons ; null pour les appels antérieurs au journal' },
      { nom: 'prix_sortie_eur_million', expr: `t.${q('priceOut')}`, type: 'décimal', signification: 'Tarif de sortie du modèle au moment de l’appel, figé', exemples: '€ par million de jetons' },
      { nom: 'duree_ms', expr: `t.${q('durationMs')}`, type: 'entier', signification: 'Latence totale de l’appel', exemples: 'en millisecondes ; null si non mesurée' },
    ],
    relations: ['consommation_ia.modele_id = modeles_ia.id', 'consommation_ia.fournisseur_id = fournisseurs_ia.id', 'consommation_ia.fonction = affectations_ia.fonction', 'consommation_ia.projet_id = projets.id'],
    usages: ['Dépense du mois, par jour, par fonction, par modèle, par fournisseur ou par projet.', 'Jetons consommés.', 'Part des appels servis par le secours.'],
    regles: [
      'Dépense du mois = somme de cout_eur pour les dates du 1er du mois de la date du jour jusqu’à la date du jour incluse. Arrondir à 2 décimales.',
      'Projection de fin de mois = dépense du mois + (dépense des 7 derniers jours, date du jour incluse, ÷ 7) × nombre de jours restants jusqu’à la fin du mois (date du jour exclue).',
      'Ligne budgétaire : doc_vec, doc_rrk et doc_syn forment la ligne « docs » (Documents) ; les autres fonctions sont leur propre ligne.',
      'Les jours sont des jours civils de Paris : grouper par date (date::date), les dates étant déjà en heure de Paris.',
      'Le coût d’un appel est calculé avec les tarifs figés au moment de l’appel (prix_entree_eur_million, prix_sortie_eur_million), pas avec le catalogue actuel : ne pas le recalculer depuis modeles_ia.',
    ],
  },
  {
    nom: 'plafonds_budget_ia',
    source: '"BudgetThreshold" t',
    description: 'Plafonds de dépense IA mensuels (global et par ligne budgétaire) et leur seuil d’alerte. Écran : IA › Vue générale des coûts.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Plafond', exemples: 'all = global ; insights, crud, rapports, guidage, docs = par ligne budgétaire' },
      { nom: 'plafond_eur', expr: `t.${q('limitEur')}`, type: 'décimal', signification: 'Plafond mensuel', exemples: 'en euros ; null = pas de plafond' },
      { nom: 'seuil_alerte_pct', expr: `t.${q('warnPct')}`, type: 'entier', signification: 'Seuil d’alerte', exemples: 'en % du plafond (ex. 80)' },
      { nom: 'actif', expr: 't.enabled', type: 'booléen', signification: 'Plafond surveillé' },
    ],
    relations: ['plafonds_budget_ia.id = ligne budgétaire de consommation_ia.fonction (doc_vec, doc_rrk, doc_syn → docs ; « all » = toutes les fonctions)'],
    usages: ['Où en est-on du budget IA ?', 'Quel plafond est atteint ou dépassé ?'],
    regles: [
      'Statut d’un plafond, calculé avec la dépense et la projection du mois de sa ligne (voir consommation_ia) : pas de plafond si inactif ou plafond_eur null ; DÉPASSEMENT si la projection de fin de mois dépasse le plafond ; ALERTE si la dépense atteint plafond × seuil_alerte_pct / 100 ; sinon sous le plafond.',
      'Pourcentage affiché = dépense du mois ÷ plafond × 100, arrondi.',
    ],
  },

  // ───────────── Notifications ─────────────
  {
    nom: 'regles_notification',
    source: '"NotificationRule" t',
    description: 'Règles de notification et d’alerte envoyées aux utilisateurs (application, e-mail) : cible, fréquence, déclencheur, modèle de rédaction. Écran : Plateforme › Notifications et alertes.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant de la règle', exemples: 'n1, n3' },
      { nom: 'type', expr: 't.kind::text', type: 'texte', signification: 'Type', exemples: 'NOTIFICATION, ALERT' },
      { nom: 'nom', expr: 't.name', type: 'texte', signification: 'Nom de la règle', exemples: 'Jalon en retard' },
      { nom: 'profils_cibles', expr: `t.${q('targetProfiles')}`, type: 'liste de textes', signification: 'Profils destinataires', exemples: 'admin, pmo, resp (Responsable), lec (Lecteur)' },
      { nom: 'projets', expr: `t.${q('projectIds')}`, type: 'liste de textes', signification: 'Codes des projets concernés (vide : aucun projet précis)' },
      { nom: 'plateforme', expr: 't.platform', type: 'booléen', signification: 'Règle de plateforme (hors projet)' },
      { nom: 'modele_id', expr: `t.${q('modelId')}`, type: 'texte', signification: 'Modèle qui rédige le message → modeles_ia.id' },
      { nom: 'consigne', expr: 't.prompt', type: 'texte', signification: 'Consigne donnée au modèle' },
      { nom: 'objet', expr: 't.subject', type: 'texte', signification: 'Objet du message (avec variables {jalon}, {projet}…)' },
      { nom: 'corps', expr: 't.body', type: 'texte', signification: 'Texte du message (modèle)' },
      { nom: 'frequence', expr: 't.frequency::text', type: 'texte', signification: 'Fréquence', exemples: 'IMMEDIATE, DAILY, WEEKLY, CUSTOM' },
      { nom: 'jour', expr: 't.day', type: 'texte', signification: 'Jour d’envoi (hebdomadaire)' },
      { nom: 'heure', expr: 't.hour', type: 'texte', signification: 'Heure d’envoi', exemples: '08:00' },
      { nom: 'tous_les_n_jours', expr: `t.${q('everyDays')}`, type: 'entier', signification: 'Intervalle (fréquence CUSTOM)', exemples: 'en jours' },
      { nom: 'canaux', expr: 't.channels::text[]', type: 'liste de textes', signification: 'Canaux', exemples: 'APP = dans l’application, EMAIL' },
      { nom: 'declencheur', expr: 't.trigger::text', type: 'texte', signification: 'Déclencheur', exemples: 'SCHEDULE, MILESTONE_LATE, RISK_CRITICAL, DOCUMENT_ANALYZED, BUDGET_THRESHOLD, MANUAL' },
      { nom: 'active', expr: 't.enabled', type: 'booléen', signification: 'Règle active' },
    ],
    relations: ['regles_notification.id = envois_notification.regle_id', 'regles_notification.modele_id = modeles_ia.id'],
    usages: ['Quelles alertes sont actives ?', 'Qui reçoit telle notification, et quand ?'],
    regles: ['Tester l’appartenance à une liste avec ANY : \'pmo\' = ANY(profils_cibles).'],
  },
  {
    nom: 'envois_notification',
    source: '"Delivery" t',
    description: 'Historique des envois de notifications : règle, canal, nombre de destinataires, succès ou échec, coût. Écran : Notifications et alertes › Historique ; Vue d’ensemble (échecs d’envoi).',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant de l’envoi' },
      { nom: 'regle_id', expr: `t.${q('ruleId')}`, type: 'texte', signification: 'Règle → regles_notification.id' },
      { nom: 'date', expr: P('at'), type: 'date-heure', signification: 'Moment de l’envoi' },
      { nom: 'canal', expr: 't.channel::text', type: 'texte', signification: 'Canal', exemples: 'APP, EMAIL' },
      { nom: 'nb_destinataires', expr: `t.${q('recipientsCount')}`, type: 'entier', signification: 'Nombre de destinataires' },
      { nom: 'statut', expr: 't.status::text', type: 'texte', signification: 'Résultat', exemples: 'OK, ERROR' },
      { nom: 'erreur', expr: 't.error', type: 'texte', signification: 'Motif de l’échec' },
      { nom: 'cout_eur', expr: `t.${q('costEur')}`, type: 'décimal', signification: 'Coût de rédaction', exemples: 'en euros' },
      { nom: 'jetons', expr: 't.tokens', type: 'entier', signification: 'Jetons consommés' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet concerné → projets.id' },
      { nom: 'objet', expr: 't.subject', type: 'texte', signification: 'Objet du message envoyé' },
    ],
    relations: ['envois_notification.regle_id = regles_notification.id', 'envois_notification.projet_id = projets.id'],
    usages: ['Y a-t-il eu des échecs d’envoi ?', 'Combien de notifications envoyées cette semaine ?'],
    regles: ['Échecs signalés en Vue d’ensemble = statut ERROR sur les 7 derniers jours.'],
  },
  {
    nom: 'notifications_admin',
    source: '"Notification" t',
    description: 'Notifications de l’administrateur (cloche de la barre latérale) : incidents, alertes, demandes d’invitation et d’activation de module. Une notification par cause, rouverte si la cause réapparaît.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant' },
      { nom: 'cause', expr: 't.key', type: 'texte', signification: 'Cause unique', exemples: 'provider:openai, budget:all, invite:…, module:…, apicard:…, import:…, snapshot:…, tech:…' },
      { nom: 'type', expr: 't.kind::text', type: 'texte', signification: 'Type', exemples: 'ERR = incident, WARN = alerte, INVITE = demande d’invitation, MODULE = demande de module' },
      { nom: 'etat', expr: 't.status::text', type: 'texte', signification: 'État', exemples: 'OPEN = à traiter, DECIDED = décision prise (annulable 10 s), DONE = traitée, RESOLVED = cause disparue' },
      { nom: 'titre', expr: 't.title', type: 'texte', signification: 'Titre affiché' },
      { nom: 'texte', expr: 't.text', type: 'texte', signification: 'Détail affiché' },
      { nom: 'note', expr: 't.note', type: 'texte', signification: 'Note complémentaire' },
      { nom: 'niveau', expr: 't.level', type: 'texte', signification: 'Niveau d’une alerte (une aggravation la remet en non lue)' },
      { nom: 'lue_le', expr: P(q('readAt')), type: 'date-heure', signification: 'Lecture (null : non lue)' },
      { nom: 'creee_le', expr: P(q('createdAt')), type: 'date-heure', signification: 'Apparition' },
      { nom: 'decision', expr: 't.decision', type: 'texte', signification: 'Décision', exemples: 'ACCEPT, REFUSE' },
      { nom: 'decidee_par', expr: `t.${q('decidedBy')}`, type: 'texte', signification: 'Nom de l’administrateur qui a décidé' },
      { nom: 'decidee_le', expr: P(q('decidedAt')), type: 'date-heure', signification: 'Date de la décision' },
      { nom: 'resolue_le', expr: P(q('resolvedAt')), type: 'date-heure', signification: 'Disparition de la cause' },
    ],
    relations: [],
    usages: ['Qu’y a-t-il à traiter dans la cloche ?', 'Quels incidents ont eu lieu cette semaine ?'],
    regles: ['À traiter = etat OPEN. Non lue = lue_le null et etat OPEN.'],
  },

  // ───────────── Projets ─────────────
  {
    nom: 'projets',
    source: '"Project" t LEFT JOIN "Client" c ON c.id = t."clientId"',
    description: 'Projets de la plateforme (Bibliothèque des projets) : code, nom, client, dates, statut.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant du projet' },
      { nom: 'code', expr: 't.code', type: 'texte', signification: 'Code du projet (unique, affiché partout)', exemples: 'RISE, ATLAS, HORIZON, ORION' },
      { nom: 'nom', expr: 't.name', type: 'texte', signification: 'Nom du projet' },
      { nom: 'client_id', expr: `t.${q('clientId')}`, type: 'texte', signification: 'Client → clients.id' },
      { nom: 'client_nom', expr: 'c.name', type: 'texte', signification: 'Nom du client' },
      { nom: 'statut', expr: 't.status::text', type: 'texte', signification: 'Statut', exemples: 'PREPARATION = en préparation, ACTIVE = actif, CLOSED = clos' },
      { nom: 'date_debut', expr: `t.${q('startDate')}`, type: 'texte', signification: 'Date de début', exemples: 'texte AAAA-MM-JJ' },
      { nom: 'date_fin_cible', expr: `t.${q('targetEndDate')}`, type: 'texte', signification: 'Date de fin visée', exemples: 'texte AAAA-MM-JJ' },
      { nom: 'ville', expr: 't.city', type: 'texte', signification: 'Ville' },
      { nom: 'pays', expr: 't.country', type: 'texte', signification: 'Pays' },
      { nom: 'fuseau', expr: 't.timezone', type: 'texte', signification: 'Fuseau horaire du projet' },
      { nom: 'cree_le', expr: P(q('createdAt')), type: 'date-heure', signification: 'Création du projet sur la plateforme' },
    ],
    relations: ['projets.id = comptes_projets.projet_id, habilitations.projet_id, chantiers.projet_id, personnes.projet_id, phases.projet_id, snapshots.projet_id, modules_projets.projet_id…', 'projets.client_id = clients.id'],
    usages: ['Liste des projets et de leurs clients.', 'Nombre de chantiers, de personnes ou de phases par projet.'],
    regles: ['Les dates de projet sont du texte au format AAAA-MM-JJ : les convertir avec ::date pour comparer ou calculer.', 'Les autres tables désignent un projet par son id ; afficher le code.'],
  },
  {
    nom: 'clients',
    source: '"Client" t',
    description: 'Clients pour lesquels les projets sont menés (nom affiché dans la Bibliothèque des projets) : code, nom, statut.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant du client' },
      { nom: 'code', expr: 't.code', type: 'texte', signification: 'Code du client' },
      { nom: 'nom', expr: 't.name', type: 'texte', signification: 'Nom du client' },
      { nom: 'statut', expr: 't.status::text', type: 'texte', signification: 'Statut', exemples: 'ACTIVE, INACTIVE' },
    ],
    relations: ['clients.id = projets.client_id'],
    usages: ['Projets d’un client.'],
    regles: [],
  },
  {
    nom: 'chantiers',
    source: '"Workstream" t',
    description: 'Chantiers des projets (périmètre des Responsables et des Lecteurs).',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant du chantier' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet → projets.id' },
      { nom: 'code', expr: 't.code', type: 'texte', signification: 'Code du chantier (unique dans le projet)', exemples: 'C01' },
      { nom: 'nom', expr: 't.name', type: 'texte', signification: 'Nom du chantier' },
      { nom: 'responsable_personne_id', expr: `t.${q('ownerId')}`, type: 'texte', signification: 'Responsable du chantier → personnes.id' },
      { nom: 'statut', expr: 't.status::text', type: 'texte', signification: 'Statut du chantier' },
      { nom: 'avancement_pct', expr: `t.${q('progressPct')}`, type: 'entier', signification: 'Avancement réalisé', exemples: 'en %' },
      { nom: 'critique', expr: 't.critical', type: 'booléen', signification: 'Chantier critique' },
    ],
    relations: ['chantiers.projet_id = projets.id', 'chantiers.id = habilitations.chantier_id', 'chantiers.responsable_personne_id = personnes.id'],
    usages: ['Chantiers d’un projet.', 'Qui a des droits sur un chantier ?'],
    regles: ['Le contenu détaillé des projets (actions, risques, jalons) relève du Cockpit, pas de la Console.'],
  },
  {
    nom: 'personnes',
    source: '"Person" t',
    description: 'Personnes de l’équipe de chaque projet (Référentiel du Cockpit), invitables sur la plateforme.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant de la personne' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet → projets.id' },
      { nom: 'prenom', expr: `t.${q('firstName')}`, type: 'texte', signification: 'Prénom' },
      { nom: 'nom', expr: `t.${q('lastName')}`, type: 'texte', signification: 'Nom de famille' },
      { nom: 'email', expr: 't.email', type: 'texte', signification: 'E-mail (unique dans le projet)' },
      { nom: 'titre', expr: 't.title', type: 'texte', signification: 'Fonction dans le projet' },
      { nom: 'active', expr: 't.active', type: 'booléen', signification: 'Personne active dans le projet' },
    ],
    relations: ['personnes.projet_id = projets.id', 'personnes.email = comptes.email (sans tenir compte de la casse) : la personne a un compte', 'personnes.id = habilitations.personne_id'],
    usages: ['Personnes d’un projet qui n’ont pas encore de compte.', 'Taille de l’équipe par projet.'],
    regles: ['Une même personne réelle peut apparaître dans plusieurs projets (une ligne par projet) : dédoublonner par e-mail.'],
  },
  {
    nom: 'phases',
    source: '"Phase" t',
    description: 'Phases du planning de chaque projet (phase en cours affichée dans la Bibliothèque).',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant de la phase' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet → projets.id' },
      { nom: 'ordre', expr: 't.seq', type: 'entier', signification: 'Rang de la phase dans le projet' },
      { nom: 'code', expr: 't.code', type: 'texte', signification: 'Code de la phase' },
      { nom: 'nom', expr: 't.name', type: 'texte', signification: 'Nom de la phase' },
      { nom: 'date_debut', expr: `t.${q('startDate')}`, type: 'texte', signification: 'Date de début de la phase', exemples: 'texte AAAA-MM-JJ' },
      { nom: 'date_fin', expr: `t.${q('endDate')}`, type: 'texte', signification: 'Date de fin de la phase', exemples: 'texte AAAA-MM-JJ' },
      { nom: 'statut', expr: 't.status::text', type: 'texte', signification: 'Statut de la phase' },
      { nom: 'avancement_pct', expr: `t.${q('progressPct')}`, type: 'entier', signification: 'Avancement réalisé', exemples: 'en %' },
    ],
    relations: ['phases.projet_id = projets.id'],
    usages: ['Phase en cours d’un projet.', 'Dates de début et de fin du planning.'],
    regles: ['Phase en cours = date_debut::date ≤ date du jour ≤ date_fin::date. Début du planning = plus petite date_debut ; fin = plus grande date_fin.'],
  },
  {
    nom: 'snapshots',
    source: '"Snapshot" t',
    description: 'Sauvegardes (snapshots) de l’état d’un projet, automatiques ou manuelles. Écrans : Projets › Snapshots, Vue d’ensemble « Dernier snapshot ».',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant du snapshot' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet → projets.id' },
      { nom: 'date', expr: P(q('takenAt')), type: 'date-heure', signification: 'Moment de la capture' },
      { nom: 'type', expr: 't.kind::text', type: 'texte', signification: 'Type', exemples: 'AUTO = planifié, MANUAL = manuel' },
      { nom: 'libelle', expr: 't.label', type: 'texte', signification: 'Libellé (snapshots manuels)' },
      { nom: 'par', expr: `t.${q('takenBy')}`, type: 'texte', signification: 'Auteur (manuel) ou Système' },
      { nom: 'statut', expr: 't.status::text', type: 'texte', signification: 'Statut', exemples: 'RUNNING = en cours, DONE = terminé, FAILED = en échec' },
      { nom: 'comptes_objets', expr: `t.stats->'counts'`, type: 'json', signification: 'Nombre d’objets capturés par type', exemples: '{"Risques": 24, "Actions": 58}' },
    ],
    relations: ['snapshots.projet_id = projets.id'],
    usages: ['Dernier snapshot réussi d’un projet ou de la plateforme.', 'Snapshots en échec.'],
    regles: ['Dernier snapshot (Vue d’ensemble) = statut DONE, le plus récent.'],
  },
  {
    nom: 'planification_snapshots',
    source: '"SnapshotSchedule" t',
    description: 'Planification des snapshots automatiques de chaque projet.',
    colonnes: [
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet → projets.id' },
      { nom: 'active', expr: 't.enabled', type: 'booléen', signification: 'Planification active' },
      { nom: 'frequence', expr: 't.frequency', type: 'texte', signification: 'Fréquence', exemples: 'Quotidienne, Hebdomadaire, Mensuelle' },
      { nom: 'jour', expr: 't.day', type: 'texte', signification: 'Jour de capture' },
      { nom: 'heure', expr: 't.hour', type: 'texte', signification: 'Heure de capture', exemples: '04:00' },
      { nom: 'conservation', expr: 't.retention', type: 'texte', signification: 'Durée de conservation', exemples: '12 mois' },
    ],
    relations: ['planification_snapshots.projet_id = projets.id'],
    usages: ['Quand a lieu le prochain snapshot ?', 'Combien de temps sont-ils conservés ?'],
    regles: [],
  },
  {
    nom: 'modules',
    source: '"Module" t',
    description: 'Modules optionnels de la plateforme (ex. Suivi des bénéfices, Risques avancés) et leur portée. Écran : Plateforme › Modules.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant du module' },
      { nom: 'nom', expr: 't.name', type: 'texte', signification: 'Nom du module' },
      { nom: 'description', expr: 't.description', type: 'texte', signification: 'Description' },
      { nom: 'portee', expr: 't.scope::text', type: 'texte', signification: 'Portée', exemples: 'OFF = désactivé, ALL = toute la plateforme, PROJECTS = certains projets (voir modules_projets)' },
      { nom: 'global_depuis', expr: P(q('globalSince')), type: 'date-heure', signification: 'Activation pour toute la plateforme' },
    ],
    relations: ['modules.id = modules_projets.module_id', 'modules.id = demandes_module.module_id'],
    usages: ['Quels modules sont actifs, et où ?'],
    regles: ['Un module est actif sur un projet si portee = ALL, ou si portee = PROJECTS et une ligne modules_projets existe pour ce projet.'],
  },
  {
    nom: 'modules_projets',
    source: '"ModuleProject" t',
    description: 'Projets sur lesquels un module est activé (portée « certains projets »).',
    colonnes: [
      { nom: 'module_id', expr: `t.${q('moduleId')}`, type: 'texte', signification: 'Module → modules.id' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet → projets.id' },
      { nom: 'depuis', expr: P('since'), type: 'date-heure', signification: 'Date d’activation sur ce projet' },
    ],
    relations: ['modules_projets.module_id = modules.id', 'modules_projets.projet_id = projets.id'],
    usages: ['Modules actifs sur un projet.'],
    regles: ['Sans effet si le module a la portée OFF ou ALL.'],
  },
  {
    nom: 'demandes_module',
    source: '"ModuleRequest" t',
    description: 'Demandes d’activation d’un module pour un projet, à décider par un administrateur.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant de la demande' },
      { nom: 'module_id', expr: `t.${q('moduleId')}`, type: 'texte', signification: 'Module demandé → modules.id' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet → projets.id' },
      { nom: 'demandeur', expr: `t.${q('requestedBy')}`, type: 'texte', signification: 'Nom du demandeur' },
      { nom: 'demandeur_compte_id', expr: `t.${q('requestedById')}`, type: 'texte', signification: 'Compte du demandeur → comptes.id' },
      { nom: 'demandee_le', expr: P('at'), type: 'date-heure', signification: 'Date de la demande' },
      { nom: 'statut', expr: 't.status::text', type: 'texte', signification: 'État', exemples: 'PENDING = à traiter, APPROVED = acceptée, REJECTED = refusée' },
      { nom: 'decidee_le', expr: P(q('decidedAt')), type: 'date-heure', signification: 'Date de la décision' },
    ],
    relations: ['demandes_module.module_id = modules.id', 'demandes_module.projet_id = projets.id'],
    usages: ['Demandes de module à traiter.'],
    regles: ['À traiter = statut PENDING. Une demande acceptée n’active le module que pour le projet demandeur.'],
  },
  {
    nom: 'imports_projet',
    source: '"ProjectImport" t',
    description: 'Imports du fichier Excel d’initialisation d’un projet : contrôle, erreurs, avertissements, import. Écran : Projets › Initialisation d’un projet.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant de l’import' },
      { nom: 'fichier', expr: `t.${q('fileName')}`, type: 'texte', signification: 'Nom du fichier déposé' },
      { nom: 'depose_par', expr: `t.${q('uploadedBy')}`, type: 'texte', signification: 'Nom de l’utilisateur' },
      { nom: 'depose_le', expr: P(q('uploadedAt')), type: 'date-heure', signification: 'Date du dépôt' },
      { nom: 'statut', expr: 't.status::text', type: 'texte', signification: 'État', exemples: 'CHECKED = contrôlé, REJECTED = refusé (erreurs bloquantes), IMPORTED = importé' },
      { nom: 'projet_id', expr: `t.${q('projectId')}`, type: 'texte', signification: 'Projet créé → projets.id (après import)' },
      { nom: 'nb_erreurs', expr: `(t.report->>'errors')::int`, type: 'entier', signification: 'Erreurs bloquantes' },
      { nom: 'nb_avertissements', expr: `(t.report->>'warnings')::int`, type: 'entier', signification: 'Avertissements' },
      { nom: 'rapport', expr: 't.report', type: 'json', signification: 'Rapport de contrôle complet', exemples: '{ok, errors, warnings, issues[], checks, counts, project{code,name,client,…}}' },
    ],
    relations: ['imports_projet.projet_id = projets.id'],
    usages: ['Imports refusés et leurs erreurs.', 'Qui a importé quel projet ?'],
    regles: ['Le détail des anomalies est dans rapport->\'issues\' (tableau JSON).'],
  },

  // ───────────── Registre des cartes API ─────────────
  {
    nom: 'cartes_api',
    source: 'api_cards t',
    description: 'Cartes du Registre des cartes API : services externes des widgets (météo, trafic, actualités, finance, flux RSS), leur endpoint, leur clé (jamais lisible), délai, quota et état. Écran : Registre des cartes API.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant de la carte' },
      { nom: 'nom', expr: 't.name', type: 'texte', signification: 'Nom de la carte', exemples: 'OpenWeather, TomTom Traffic, GNews' },
      { nom: 'categorie', expr: 't.category', type: 'texte', signification: 'Catégorie', exemples: 'Météo, Trafic, Actualités, Environnement, Mobilité, Calendrier, Finance, Autre' },
      { nom: 'endpoint', expr: `regexp_replace(t.endpoint, '((api[_-]?key|apikey|key|token|access_token|appid)=)[^&]+', '\\1••••', 'gi')`, type: 'texte', signification: 'Adresse appelée ; {key} marque l’emplacement de la clé (toute clé écrite en clair est masquée)' },
      { nom: 'cle_4_derniers', expr: 't.key_last4', type: 'texte', signification: '4 derniers caractères de la clé' },
      { nom: 'cle_expire_le', expr: 't.key_expires_at', type: 'date', signification: 'Échéance de la clé' },
      { nom: 'active', expr: 't.enabled', type: 'booléen', signification: 'Carte activée' },
      { nom: 'erreur_controle', expr: 't.check_error', type: 'texte', signification: 'Échec du dernier contrôle (null : dernier contrôle réussi)', exemples: 'Clé refusée · 401, Délai dépassé' },
      { nom: 'latence_ms', expr: 't.latency_ms', type: 'entier', signification: 'Temps de réponse du dernier contrôle', exemples: 'en millisecondes' },
      { nom: 'quota_jour', expr: 't.quota_limit', type: 'entier', signification: 'Quota journalier d’appels (null : pas de quota)' },
      { nom: 'delai_ms', expr: 't.timeout_ms', type: 'entier', signification: 'Délai d’appel propre à la carte', exemples: 'en millisecondes ; null = 8 000' },
      { nom: 'flux_rss', expr: 't.feed', type: 'booléen', signification: 'Flux RSS ou Atom (pas d’API JSON)' },
      { nom: 'widgets', expr: 't.widgets', type: 'liste de textes', signification: 'Widgets du Cockpit qui utilisent la carte' },
      { nom: 'dernier_test', expr: 't.last_test', type: 'json', signification: 'Dernier test manuel', exemples: '{code, ms, at, body}' },
      { nom: 'modifiee_le', expr: P('updated_at'), type: 'date-heure', signification: 'Dernière modification' },
    ],
    relations: ['cartes_api.id = appels_cartes_api.carte_id'],
    usages: ['Quelles cartes sont en erreur ?', 'Quelles clés expirent bientôt ?', 'Quota du jour d’une carte.'],
    regles: [
      'État affiché, dans cet ordre : carte désactivée → « Désactivée » ; erreur_controle non null → en erreur ; cle_expire_le dépassée → « Clé expirée » (erreur) ; cle_expire_le dans 30 jours ou moins → avertissement ; appels du jour ≥ 85 % de quota_jour → avertissement ; sinon opérationnelle.',
      'Appels du jour = nombre de lignes de appels_cartes_api de la carte depuis minuit (heure de Paris) jusqu’à maintenant, toutes origines confondues.',
      'Échéance de la clé signalée à 30, 7 et 1 jour.',
    ],
  },
  {
    nom: 'appels_cartes_api',
    source: 'api_card_calls t',
    description: 'Un appel à une carte API : proxy des widgets, contrôle de santé (toutes les 15 min) ou test manuel ; code de réponse et temps.',
    colonnes: [
      { nom: 'carte_id', expr: 't.card_id', type: 'texte', signification: 'Carte → cartes_api.id' },
      { nom: 'date', expr: P('at'), type: 'date-heure', signification: 'Moment de l’appel' },
      { nom: 'code', expr: 't.code', type: 'entier', signification: 'Code HTTP de la réponse (0 : injoignable)', exemples: '200, 401, 429' },
      { nom: 'ms', expr: 't.ms', type: 'entier', signification: 'Temps de réponse', exemples: 'en millisecondes' },
      { nom: 'origine', expr: 't.source', type: 'texte', signification: 'Origine', exemples: 'PROXY = widget, HEALTH = contrôle de santé, TEST = test manuel' },
      { nom: 'widget', expr: 't.widget', type: 'texte', signification: 'Widget appelant (PROXY)' },
    ],
    relations: ['appels_cartes_api.carte_id = cartes_api.id'],
    usages: ['Latence moyenne sur 24 h.', 'Taux d’échec d’une carte.', 'Appels du jour.'],
    regles: ['Appel réussi = code entre 1 et 399. Latence moyenne = moyenne de ms des appels réussis.'],
  },

  // ───────────── Assistant ─────────────
  {
    nom: 'skills',
    source: '"Skill" t',
    description: 'Skills de Jev : consignes ajoutées à son prompt. Écran : Assistant › Skills.',
    colonnes: [
      { nom: 'id', expr: 't.id', type: 'texte', signification: 'Identifiant' },
      { nom: 'nom', expr: 't.n', type: 'texte', signification: 'Nom de la skill', exemples: 'Guidage console, Insights' },
      { nom: 'texte', expr: 't.t', type: 'texte', signification: 'Texte de la consigne (20 000 caractères au plus)' },
      { nom: 'active', expr: 't."on"', type: 'booléen', signification: 'Skill active' },
      { nom: 'position', expr: 't.position', type: 'entier', signification: 'Ordre dans la liste' },
      { nom: 'modifiee_le', expr: P('updated_at'), type: 'date-heure', signification: 'Dernière modification' },
      { nom: 'modifiee_par', expr: 't.updated_by', type: 'texte', signification: 'Auteur de la dernière modification' },
    ],
    relations: [],
    usages: ['Quelles skills sont actives ?'],
    regles: ['Le Jev de la Console n’utilise que la skill « Guidage console » ; le Jev du Cockpit utilise toutes les skills actives, dans l’ordre de position.'],
  },
  {
    nom: 'persona',
    source: '"Persona" t',
    description: 'Persona de Jev (une seule ligne) : identité et personnalité (Soul). Écran : Assistant › Persona.',
    colonnes: [
      { nom: 'nom', expr: 't.name', type: 'texte', signification: 'Nom de l’assistant', exemples: 'Jev' },
      { nom: 'nature', expr: 't.creature', type: 'texte', signification: 'Ce qu’il est', exemples: 'Copilote de projet' },
      { nom: 'style', expr: 't.style', type: 'texte', signification: 'Style de réponse' },
      { nom: 'emoji', expr: 't.emoji', type: 'texte', signification: 'Emoji' },
      { nom: 'soul', expr: 't.soul', type: 'texte', signification: 'Personnalité (texte libre)' },
      { nom: 'version', expr: 't.version', type: 'entier', signification: 'Numéro de version' },
      { nom: 'modifie_le', expr: P('updated_at'), type: 'date-heure', signification: 'Dernière modification' },
      { nom: 'modifie_par', expr: 't.updated_by', type: 'texte', signification: 'Auteur' },
    ],
    relations: [],
    usages: ['Qui a modifié le Persona, et quand ?'],
    regles: [],
  },
  {
    nom: 'versions_persona',
    source: '"PersonaVersion" t',
    description: 'Historique des versions du Persona de Jev.',
    colonnes: [
      { nom: 'version', expr: 't.version', type: 'entier', signification: 'Numéro de version' },
      { nom: 'contenu', expr: 't.data', type: 'json', signification: 'Identité et Soul de cette version', exemples: '{identity{name,creature,style,emoji}, soul}' },
      { nom: 'enregistree_le', expr: P('saved_at'), type: 'date-heure', signification: 'Date d’enregistrement' },
      { nom: 'enregistree_par', expr: 't.saved_by', type: 'texte', signification: 'Auteur' },
    ],
    relations: ['versions_persona.version ≤ persona.version'],
    usages: ['Historique des modifications du Persona.'],
    regles: [],
  },
];

/** Colonnes SQL d'une vue (nom de la colonne → expression). */
export function viewSql(t: DictTable): string {
  const cols = t.colonnes.map((c) => `  ${c.expr} AS ${c.nom}`).join(',\n');
  return `CREATE VIEW ${JEV_SCHEMA}.${t.nom} AS\nSELECT\n${cols}\nFROM ${t.source}${t.filtre ? `\nWHERE ${t.filtre}` : ''};`;
}

/** Schéma et vues en lecture seule (migration). */
export function jevViewsSql(): string {
  return [`CREATE SCHEMA IF NOT EXISTS ${JEV_SCHEMA};`, ...DICTIONNAIRE.map(viewSql)].join('\n\n');
}
