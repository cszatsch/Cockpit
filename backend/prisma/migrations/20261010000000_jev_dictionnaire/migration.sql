-- Jev de la Console, interrogation des données en langage naturel (Text-to-SQL) :
-- 1. dictionnaire des données (une fiche par vue, une ligne par colonne) ;
-- 2. schéma `jev` : vues en lecture seule de ce que la Console affiche, sans aucun secret
--    (empreintes de mot de passe, jetons et identifiants de session, clés API chiffrées, chemins de stockage).
-- Vues générées par jevViewsSql() (src/domain/jev-dictionnaire.ts).

-- CreateTable
CREATE TABLE "dictionnaire_tables" (
    "nom" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "relations" TEXT NOT NULL DEFAULT '',
    "usages" TEXT NOT NULL DEFAULT '',
    "regles" TEXT NOT NULL DEFAULT '',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "modifie_le" TIMESTAMP(3) NOT NULL,
    "modifie_par" TEXT,

    CONSTRAINT "dictionnaire_tables_pkey" PRIMARY KEY ("nom")
);

-- CreateTable
CREATE TABLE "dictionnaire_colonnes" (
    "table_nom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "signification" TEXT NOT NULL,
    "exemples_unites" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dictionnaire_colonnes_pkey" PRIMARY KEY ("table_nom","nom")
);

-- AddForeignKey
ALTER TABLE "dictionnaire_colonnes" ADD CONSTRAINT "dictionnaire_colonnes_table_nom_fkey" FOREIGN KEY ("table_nom") REFERENCES "dictionnaire_tables"("nom") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE SCHEMA IF NOT EXISTS jev;

CREATE VIEW jev.comptes AS
SELECT
  t.id AS id,
  t."fullName" AS nom,
  t.email AS email,
  t."personId" AS personne_id,
  t.status::text AS statut,
  (t."invitedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS invite_le,
  (t."inviteExpiresAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS invitation_expire_le,
  (t."lastLoginAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS derniere_connexion,
  t.profile->>'position' AS fonction,
  t.profile->>'company' AS societe,
  t.profile->>'team' AS equipe,
  t.profile->>'phone' AS telephone,
  t.profile->>'city' AS ville,
  t.profile->>'country' AS pays,
  t.profile->>'language' AS langue,
  t.profile->>'timezone' AS fuseau,
  (t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS cree_le
FROM "Account" t;

CREATE VIEW jev.comptes_projets AS
SELECT
  t."accountId" AS compte_id,
  t."projectId" AS projet_id
FROM "AccountProject" t;

CREATE VIEW jev.habilitations AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t."personId" AS personne_id,
  t."accountId" AS compte_id,
  t.profile::text AS profil,
  t."wsId" AS chantier_id,
  (t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS cree_le
FROM "Habilitation" t;

CREATE VIEW jev.administrateurs AS
SELECT
  t."accountId" AS compte_id,
  (t.since AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS depuis,
  t."grantedById" AS accorde_par_id
FROM "AdminGrant" t;

CREATE VIEW jev.sessions AS
SELECT
  t."accountId" AS compte_id,
  t.surface AS surface,
  t.device AS appareil,
  t.location AS lieu,
  (t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS ouverte_le,
  (t."lastSeenAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS derniere_activite,
  (t."revokedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS fermee_le
FROM "AuthSession" t;

CREATE VIEW jev.demandes_invitation AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t."personId" AS personne_id,
  p."firstName" || ' ' || p."lastName" AS personne_nom,
  p.email AS personne_email,
  t."requestedById" AS demande_par_id,
  t.status::text AS statut,
  (t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS demandee_le,
  (t."decidedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS decidee_le,
  t."decidedById" AS decidee_par_id
FROM "InvitationRequest" t LEFT JOIN "Person" p ON p.id = t."personId";

CREATE VIEW jev.journal_audit AS
SELECT
  t.id AS id,
  (t.at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS date,
  t."actorName" AS auteur,
  t."accountId" AS compte_id,
  t."profileUsed" AS profil_utilise,
  t.origin::text AS origine,
  t.severity::text AS gravite,
  t.action AS action,
  t.target AS cible,
  t."projectId" AS projet_id,
  t."wsId" AS chantier_id,
  t."entityType" AS type_objet,
  t."entityId" AS objet_id,
  t.field AS champ,
  t."oldValue" AS ancienne_valeur,
  t."newValue" AS nouvelle_valeur
FROM "AuditEntry" t;

CREATE VIEW jev.fournisseurs_ia AS
SELECT
  t.id AS id,
  t.name AS nom,
  t."keyCipher" IS NOT NULL AS cle_enregistree,
  t."keyLast4" AS cle_4_derniers,
  t.status::text AS statut,
  t."latencyMs" AS latence_ms,
  (t."lastTestedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS dernier_test,
  t."lastError" AS derniere_erreur
FROM "Provider" t;

CREATE VIEW jev.modeles_ia AS
SELECT
  t.id AS id,
  t."providerId" AS fournisseur_id,
  t.name AS nom,
  t.description AS description,
  t.category::text AS categorie,
  t."releaseDate" AS date_sortie,
  t."maxOutputTokens" AS sortie_max_jetons,
  t."contextTokens" AS contexte_jetons,
  t."providerModelId" AS id_chez_fournisseur,
  t.dimensions AS dimensions,
  t."defaultDimension" AS dimension_defaut,
  t."priceUnit"::text AS unite_tarif,
  t."priceInPerMTok" AS prix_entree_eur_million,
  t."priceOutPerMTok" AS prix_sortie_eur_million,
  t."pricePer1kRequests" AS prix_eur_mille_requetes,
  t.active AS actif
FROM "AiModel" t;

CREATE VIEW jev.affectations_ia AS
SELECT
  t."functionId" AS fonction,
  t."primaryModelId" AS principal_id,
  t."fallbackModelId" AS secours_id,
  t."primaryDimension" AS dimension_principal,
  t."fallbackDimension" AS dimension_secours,
  (t."updatedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS modifiee_le
FROM "ModelAssignment" t;

CREATE VIEW jev.consommation_ia AS
SELECT
  (t.at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS date,
  t."functionId" AS fonction,
  t."modelId" AS modele_id,
  t."providerId" AS fournisseur_id,
  t."projectId" AS projet_id,
  t."tokensIn" AS jetons_entree,
  t."tokensOut" AS jetons_sortie,
  t.requests AS requetes,
  t."costEur" AS cout_eur,
  t."fallbackUsed" AS secours_utilise,
  t.source::text AS origine
FROM "UsageRecord" t;

CREATE VIEW jev.plafonds_budget_ia AS
SELECT
  t.id AS id,
  t."limitEur" AS plafond_eur,
  t."warnPct" AS seuil_alerte_pct,
  t.enabled AS actif
FROM "BudgetThreshold" t;

CREATE VIEW jev.regles_notification AS
SELECT
  t.id AS id,
  t.kind::text AS type,
  t.name AS nom,
  t."targetProfiles" AS profils_cibles,
  t."projectIds" AS projets,
  t.platform AS plateforme,
  t."modelId" AS modele_id,
  t.prompt AS consigne,
  t.subject AS objet,
  t.body AS corps,
  t.frequency::text AS frequence,
  t.day AS jour,
  t.hour AS heure,
  t."everyDays" AS tous_les_n_jours,
  t.channels::text[] AS canaux,
  t.trigger::text AS declencheur,
  t.enabled AS active
FROM "NotificationRule" t;

CREATE VIEW jev.envois_notification AS
SELECT
  t.id AS id,
  t."ruleId" AS regle_id,
  (t.at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS date,
  t.channel::text AS canal,
  t."recipientsCount" AS nb_destinataires,
  t.status::text AS statut,
  t.error AS erreur,
  t."costEur" AS cout_eur,
  t.tokens AS jetons,
  t."projectId" AS projet_id,
  t.subject AS objet
FROM "Delivery" t;

CREATE VIEW jev.notifications_admin AS
SELECT
  t.id AS id,
  t.key AS cause,
  t.kind::text AS type,
  t.status::text AS etat,
  t.title AS titre,
  t.text AS texte,
  t.note AS note,
  t.level AS niveau,
  (t."readAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS lue_le,
  (t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS creee_le,
  t.decision AS decision,
  t."decidedBy" AS decidee_par,
  (t."decidedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS decidee_le,
  (t."resolvedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS resolue_le
FROM "Notification" t;

CREATE VIEW jev.projets AS
SELECT
  t.id AS id,
  t.code AS code,
  t.name AS nom,
  t."clientId" AS client_id,
  c.name AS client_nom,
  t.status::text AS statut,
  t."startDate" AS date_debut,
  t."targetEndDate" AS date_fin_cible,
  t.city AS ville,
  t.country AS pays,
  t.timezone AS fuseau,
  (t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS cree_le
FROM "Project" t LEFT JOIN "Client" c ON c.id = t."clientId";

CREATE VIEW jev.clients AS
SELECT
  t.id AS id,
  t.code AS code,
  t.name AS nom,
  t.status::text AS statut
FROM "Client" t;

CREATE VIEW jev.chantiers AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.code AS code,
  t.name AS nom,
  t."ownerId" AS responsable_personne_id,
  t.status::text AS statut,
  t."progressPct" AS avancement_pct,
  t.critical AS critique
FROM "Workstream" t;

CREATE VIEW jev.personnes AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t."firstName" AS prenom,
  t."lastName" AS nom,
  t.email AS email,
  t.title AS titre,
  t.active AS active
FROM "Person" t;

CREATE VIEW jev.phases AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.seq AS ordre,
  t.code AS code,
  t.name AS nom,
  t."startDate" AS date_debut,
  t."endDate" AS date_fin,
  t.status::text AS statut,
  t."progressPct" AS avancement_pct
FROM "Phase" t;

CREATE VIEW jev.snapshots AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  (t."takenAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS date,
  t.kind::text AS type,
  t.label AS libelle,
  t."takenBy" AS par,
  t.status::text AS statut,
  t.stats->'counts' AS comptes_objets
FROM "Snapshot" t;

CREATE VIEW jev.planification_snapshots AS
SELECT
  t."projectId" AS projet_id,
  t.enabled AS active,
  t.frequency AS frequence,
  t.day AS jour,
  t.hour AS heure,
  t.retention AS conservation
FROM "SnapshotSchedule" t;

CREATE VIEW jev.modules AS
SELECT
  t.id AS id,
  t.name AS nom,
  t.description AS description,
  t.scope::text AS portee,
  (t."globalSince" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS global_depuis
FROM "Module" t;

CREATE VIEW jev.modules_projets AS
SELECT
  t."moduleId" AS module_id,
  t."projectId" AS projet_id,
  (t.since AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS depuis
FROM "ModuleProject" t;

CREATE VIEW jev.demandes_module AS
SELECT
  t.id AS id,
  t."moduleId" AS module_id,
  t."projectId" AS projet_id,
  t."requestedBy" AS demandeur,
  t."requestedById" AS demandeur_compte_id,
  (t.at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS demandee_le,
  t.status::text AS statut,
  (t."decidedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS decidee_le
FROM "ModuleRequest" t;

CREATE VIEW jev.imports_projet AS
SELECT
  t.id AS id,
  t."fileName" AS fichier,
  t."uploadedBy" AS depose_par,
  (t."uploadedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS depose_le,
  t.status::text AS statut,
  t."projectId" AS projet_id,
  (t.report->>'errors')::int AS nb_erreurs,
  (t.report->>'warnings')::int AS nb_avertissements,
  t.report AS rapport
FROM "ProjectImport" t;

CREATE VIEW jev.cartes_api AS
SELECT
  t.id AS id,
  t.name AS nom,
  t.category AS categorie,
  regexp_replace(t.endpoint, '((api[_-]?key|apikey|key|token|access_token|appid)=)[^&]+', '\1••••', 'gi') AS endpoint,
  t.key_last4 AS cle_4_derniers,
  t.key_expires_at AS cle_expire_le,
  t.enabled AS active,
  t.check_error AS erreur_controle,
  t.latency_ms AS latence_ms,
  t.quota_limit AS quota_jour,
  t.timeout_ms AS delai_ms,
  t.feed AS flux_rss,
  t.widgets AS widgets,
  t.last_test AS dernier_test,
  (t.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS modifiee_le
FROM api_cards t;

CREATE VIEW jev.appels_cartes_api AS
SELECT
  t.card_id AS carte_id,
  (t.at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS date,
  t.code AS code,
  t.ms AS ms,
  t.source AS origine,
  t.widget AS widget
FROM api_card_calls t;

CREATE VIEW jev.skills AS
SELECT
  t.id AS id,
  t.n AS nom,
  t.t AS texte,
  t."on" AS active,
  t.position AS position,
  (t.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS modifiee_le,
  t.updated_by AS modifiee_par
FROM "Skill" t;

CREATE VIEW jev.persona AS
SELECT
  t.name AS nom,
  t.creature AS nature,
  t.style AS style,
  t.emoji AS emoji,
  t.soul AS soul,
  t.version AS version,
  (t.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS modifie_le,
  t.updated_by AS modifie_par
FROM "Persona" t;

CREATE VIEW jev.versions_persona AS
SELECT
  t.version AS version,
  t.data AS contenu,
  (t.saved_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS enregistree_le,
  t.saved_by AS enregistree_par
FROM "PersonaVersion" t;
