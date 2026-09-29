-- Notifications internes du Cockpit et rédaction des alertes à partir des données (29/09/2026).

-- 1. Notifications des utilisateurs du Cockpit (canal « Dans l'application » des règles).
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "rule_id" TEXT,
    "delivery_id" TEXT,
    "project_id" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_notifications_account_id_created_at_idx" ON "user_notifications"("account_id", "created_at");

-- 2. Profil destinataire d'un envoi (un texte par profil).
ALTER TABLE "Delivery" ADD COLUMN "profile" TEXT;

-- 3. Rôle de lecture des vues du Cockpit : il ne voit que le périmètre posé par le serveur (rise.projet, rise.chantiers).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jev_lecteur_cockpit') THEN
    CREATE ROLE jev_lecteur_cockpit NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;
GRANT jev_lecteur_cockpit TO CURRENT_USER;

-- 4. Vues avec leur filtre de droits (cockpitViewSql(), src/domain/jev-dictionnaire-cockpit.ts).
CREATE OR REPLACE VIEW jev_cockpit.projets AS
SELECT
  t.id AS id,
  t.code AS code,
  t.name AS nom,
  c.name AS client,
  t.objective AS objectif,
  t.status::text AS statut,
  t."startDate" AS date_debut,
  t."targetEndDate" AS date_fin_cible,
  t."forecastGoliveIso" AS date_golive_prevue,
  t."programDirectorId" AS directeur_programme_id,
  t."sponsorId" AS sponsor_id,
  t."editorTeamId" AS equipe_editeur_id,
  t."integratorTeamId" AS equipe_integrateur_id,
  t.city AS ville,
  t.country AS pays,
  t.currency AS devise,
  t.timezone AS fuseau,
  t."healthOverride"->>'value' AS sante_manuelle,
  t."healthOverride"->>'reason' AS sante_motif
FROM "Project" t LEFT JOIN "Client" c ON c.id = t."clientId"
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t.id = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.references_planning AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.version AS version,
  t.date AS date,
  t."approvedAt" AS approuvee_le,
  t."approvedById" AS approuvee_par_id,
  t.reason AS motif,
  t.current AS en_vigueur
FROM "BaselineVersion" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.lots AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.seq AS numero,
  t.name AS nom,
  t."startDate" AS date_debut,
  t."endDate" AS date_fin,
  t."startPrec"::text AS precision_debut,
  t."endPrec"::text AS precision_fin,
  t.status::text AS statut,
  t."ownerId" AS responsable_id
FROM "Wave" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.phases AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.seq AS ordre,
  t.code AS code,
  t.name AS nom,
  t.description AS description,
  t."startDate" AS date_debut,
  t."endDate" AS date_fin,
  t."startPrec"::text AS precision_debut,
  t."endPrec"::text AS precision_fin,
  t.status::text AS statut,
  t."progressPct" AS avancement_reel_pct,
  t."plannedPctOverride" AS avancement_prevu_force_pct,
  t.critical AS critique,
  t."ownerId" AS responsable_id
FROM "Phase" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.sous_phases AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t."phaseId" AS phase_id,
  t.code AS code,
  t.name AS nom,
  t.description AS description,
  t."startDate" AS date_debut,
  t."endDate" AS date_fin,
  t.status::text AS statut,
  t."progressPct" AS avancement_reel_pct,
  t."plannedPctOverride" AS avancement_prevu_force_pct,
  t.critical AS critique,
  t."ownerId" AS responsable_id
FROM "Subphase" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.chantiers AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.code AS code,
  t.seq AS ordre,
  t.name AS nom,
  t.description AS description,
  t."ownerId" AS responsable_id,
  t.status::text AS statut,
  t."startDate" AS date_debut,
  t."endDate" AS date_fin,
  t."progressPct" AS avancement_reel_pct,
  t."plannedPctOverride" AS avancement_prevu_force_pct,
  t.critical AS critique,
  t."dependsOnAll" AS depend_de_tous
FROM "Workstream" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t.id = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

CREATE OR REPLACE VIEW jev_cockpit.chantiers_phases AS
SELECT
  w."projectId" AS projet_id,
  t."wsId" AS chantier_id,
  t."phaseId" AS phase_id
FROM "WorkstreamPhase" t JOIN "Workstream" w ON w.id = t."wsId"
WHERE (current_user <> 'jev_lecteur_cockpit' OR (w."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

CREATE OR REPLACE VIEW jev_cockpit.chantiers_lots AS
SELECT
  w."projectId" AS projet_id,
  t."wsId" AS chantier_id,
  t."waveId" AS lot_id
FROM "WorkstreamWave" t JOIN "Workstream" w ON w.id = t."wsId"
WHERE (current_user <> 'jev_lecteur_cockpit' OR (w."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

CREATE OR REPLACE VIEW jev_cockpit.dependances_chantiers AS
SELECT
  w."projectId" AS projet_id,
  t."wsId" AS chantier_id,
  t."dependsOnId" AS depend_de_id
FROM "WorkstreamDependency" t JOIN "Workstream" w ON w.id = t."wsId"
WHERE (current_user <> 'jev_lecteur_cockpit' OR (w."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

CREATE OR REPLACE VIEW jev_cockpit.avancements AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t."wsId" AS chantier_id,
  t.label AS libelle,
  t."valuePct" AS reel_pct,
  t."targetPct" AS cible_pct,
  t.detail AS detail,
  t."ownerId" AS responsable_id,
  (t."confirmedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS confirme_le
FROM "WorkstreamProgress" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

CREATE OR REPLACE VIEW jev_cockpit.jalons AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.code AS code,
  t.n AS libelle,
  t."phaseId" AS phase_id,
  t."subphaseId" AS sous_phase_id,
  t."wsId" AS chantier_id,
  t."waveId" AS lot_id,
  t."ownerId" AS responsable_id,
  t.iso AS date_prevue,
  t."baselineIso" AS date_reference,
  (t."confirmedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS confirme_le
FROM "Milestone" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

CREATE OR REPLACE VIEW jev_cockpit.livrables AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.name AS nom,
  t."subphaseId" AS sous_phase_id,
  t."workstreamId" AS chantier_id,
  t."ownerId" AS responsable_id,
  t.start AS date_debut,
  t.due AS echeance,
  t.prog AS avancement_pct,
  t."riskOverride"::text AS risque_force,
  t."teamLabel" AS equipe
FROM "Deliverable" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.equipes AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.name AS nom,
  t.description AS description,
  t.kind::text AS type
FROM "Team" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.roles AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.label AS libelle,
  t.description AS description,
  t.tier AS niveau
FROM "ProjectRole" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.personnes AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t."firstName" AS prenom,
  t."lastName" AS nom,
  t.email AS email,
  t."teamId" AS equipe_id,
  t.title AS fonction,
  t.active AS active,
  t."wsIds" AS chantiers_affiches
FROM "Person" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.affectations AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t."personId" AS personne_id,
  t."roleId" AS role_id,
  t."startDate" AS date_debut,
  t."endDate" AS date_fin
FROM "Assignment" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.instances AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.name AS nom,
  t."shortName" AS sigle,
  t.frequency::text AS frequence,
  t.level::text AS niveau,
  t.description AS description
FROM "GovernanceBody" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.membres_instances AS
SELECT
  b."projectId" AS projet_id,
  t."bodyId" AS instance_id,
  t."personId" AS personne_id,
  t.role::text AS role
FROM "BodyMember" t JOIN "GovernanceBody" b ON b.id = t."bodyId"
WHERE (current_user <> 'jev_lecteur_cockpit' OR (b."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.risques AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.code AS code,
  t.n AS libelle,
  t.p AS probabilite,
  t.i AS impact,
  t.p * t.i AS criticite,
  t.plan AS plan_mitigation,
  t."ownerId" AS responsable_id,
  t."wsId" AS chantier_id,
  t."dueIso" AS echeance,
  t.status::text AS statut
FROM "Risk" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

CREATE OR REPLACE VIEW jev_cockpit.problemes AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.code AS code,
  t.n AS libelle,
  t.sev AS gravite,
  t."originRiskId" AS risque_origine_id,
  t."openedIso" AS ouvert_le,
  t."ownerId" AS responsable_id,
  t."wsId" AS chantier_id,
  t."targetIso" AS date_cible,
  t."targetSessionId" AS seance_cible_id,
  t.detail AS detail,
  t.status::text AS statut
FROM "Issue" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

CREATE OR REPLACE VIEW jev_cockpit.actions AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.code AS code,
  t.n AS libelle,
  t.detail AS detail,
  t."ownerId" AS responsable_id,
  t."wsId" AS chantier_id,
  t."dueIso" AS echeance,
  t.status::text AS statut,
  t.prio::text AS priorite,
  t."sourceType"::text AS origine_type,
  t."sourceId" AS origine_id,
  t."closedAt" AS terminee_le
FROM "Action" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

CREATE OR REPLACE VIEW jev_cockpit.decisions AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.code AS code,
  t.t AS intitule,
  t.p AS priorite,
  t.status::text AS statut,
  t."crIso" AS creee_le,
  t."ddIso" AS decidee_le,
  t."wsId" AS chantier_id,
  t."bodyId" AS instance_id,
  t."decL" AS decision,
  t."makerId" AS decideur_id,
  t.impact AS impact,
  t."supersedesId" AS remplace_id,
  t."expectedSessionId" AS seance_prevue_id,
  t.full AS fiche_complete,
  t.opt AS option_retenue
FROM "Decision" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

CREATE OR REPLACE VIEW jev_cockpit.seances AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t."bodyId" AS instance_id,
  t.number AS numero,
  t."dateIso" AS date,
  t.time AS heure,
  t.place AS lieu,
  t.status::text AS statut,
  t.participants AS participants,
  t."reportId" AS rapport_id
FROM "Session" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.modeles_rapport AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.name AS nom,
  t."bodyId" AS instance_id,
  t."authorId" AS auteur_id,
  t."authorLabel" AS auteur,
  t.version AS version,
  t.description AS description,
  t.pages AS pages,
  t."publishedAt" AS publie_le,
  t.active AS actif
FROM "ReportTemplate" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.rapports AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t."templateId" AS modele_id,
  t."sessionId" AS seance_id,
  t.name AS nom,
  t.v AS version,
  t.status::text AS statut,
  (t."generatedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS genere_le,
  t."reportingDate" AS date_reporting,
  (t."captureAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS capture_le,
  t."reviewerId" AS relecteur_id,
  t."validatorId" AS valideur_id,
  t.audience AS destinataires
FROM "ReportInstance" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.barometre_releves AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.month AS mois,
  t."overallScore" AS note_globale,
  t.respondents AS repondants,
  (t.sentiment->>'positive')::float AS sentiment_positif_pct,
  (t.sentiment->>'neutral')::float AS sentiment_neutre_pct,
  (t.sentiment->>'negative')::float AS sentiment_negatif_pct,
  t.themes AS themes
FROM "BarometerSurvey" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.barometre_domaines AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.n AS domaine,
  t.size AS effectif,
  t.resp AS repondants,
  t.range AS plage,
  t.series AS notes_par_mois
FROM "BarometerDomain" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.mission AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.period AS periode,
  t.amoa AS montant_amoa,
  t.sub AS montant_sous_traitance,
  t.amoa + t.sub AS total,
  t.status::text AS statut
FROM "MissionPeriod" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.budget_programme AS
SELECT
  t."projectId" AS projet_id,
  t.known AS connu,
  t.reason AS motif
FROM "ProgramBudget" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true)));

CREATE OR REPLACE VIEW jev_cockpit.documents AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t.n AS nom,
  t.type AS type,
  t."dateIso" AS date,
  t.v AS version,
  t.conf::text AS confidentialite,
  t.src::text AS origine,
  t.ext::text AS extraction,
  t.pages AS pages,
  t."sizeBytes" AS taille_octets,
  t."linkedLabel" AS objets_lies
FROM "Document" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t.conf::text <> 'RESTRICTED')));

CREATE OR REPLACE VIEW jev_cockpit.liens_documents AS
SELECT
  d."projectId" AS projet_id,
  t."documentId" AS document_id,
  t."entityType" AS type_objet,
  t."entityId" AS objet_id
FROM "DocumentLink" t JOIN "Document" d ON d.id = t."documentId"
WHERE (current_user <> 'jev_lecteur_cockpit' OR (d."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR d.conf::text <> 'RESTRICTED')));

CREATE OR REPLACE VIEW jev_cockpit.commentaires AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t."entityType" AS type_objet,
  t."entityId" AS objet_id,
  t.text AS texte,
  t."authorId" AS auteur_id,
  t."authorName" AS auteur,
  t.resolved AS resolu,
  (t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS cree_le
FROM "CellComment" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND current_setting('rise.chantiers', true) = '*'));

CREATE OR REPLACE VIEW jev_cockpit.habilitations AS
SELECT
  t.id AS id,
  t."projectId" AS projet_id,
  t."personId" AS personne_id,
  t."accountId" AS compte_id,
  t.profile::text AS profil,
  t."wsId" AS chantier_id
FROM "Habilitation" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

GRANT USAGE ON SCHEMA jev_cockpit TO jev_lecteur_cockpit;
GRANT SELECT ON ALL TABLES IN SCHEMA jev_cockpit TO jev_lecteur_cockpit;
