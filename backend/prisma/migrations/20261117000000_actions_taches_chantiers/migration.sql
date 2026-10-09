-- Actions rattachées à plusieurs chantiers, ou à tous (transverse), comme les risques (« Saisir sans Jev », 09/10/2026).
-- `wsId` devient le chantier principal (premier de la liste, null si transverse) ; `wsIds` : chantiers concernés.
ALTER TABLE "Action" ALTER COLUMN "wsId" DROP NOT NULL;
ALTER TABLE "Action" ADD COLUMN "wsIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Action" ADD COLUMN "allWs" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Action" SET "wsIds" = ARRAY["wsId"] WHERE "wsId" IS NOT NULL;

-- Tâches : responsable, chantiers (un ou plusieurs, ou transverse) et statuts « En cours » / « Bloquée ».
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
ALTER TABLE "Task" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Task" ADD COLUMN "wsIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Task" ADD COLUMN "allWs" BOOLEAN NOT NULL DEFAULT false;

-- Vues du Jev du Cockpit : chantiers et caractère transverse des actions (une ligne par action et par chantier).
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
  t."closedAt" AS terminee_le,
  t."wsIds" AS chantier_ids,
  t."allWs" AS transverse
FROM "Action" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."allWs" OR t."wsIds" && string_to_array(current_setting('rise.chantiers', true), ','))));

CREATE OR REPLACE VIEW jev_cockpit.actions_chantiers AS
SELECT
  t."projectId" AS projet_id,
  t.id AS action_id,
  w.id AS chantier_id,
  t."allWs" AS transverse
FROM "Action" t JOIN "Workstream" w ON w."projectId" = t."projectId" AND (t."allWs" OR w.id = ANY(t."wsIds"))
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR w.id = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));
GRANT SELECT ON jev_cockpit.actions_chantiers TO jev_lecteur_cockpit;
