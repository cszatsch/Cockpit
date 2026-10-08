-- Risques rattachés à plusieurs chantiers, ou à tous (transverse), demande du commanditaire du 08/10/2026.
-- `wsId` devient le chantier principal (premier de la liste, null si transverse) ; `wsIds` : chantiers concernés.
ALTER TABLE "Risk" ALTER COLUMN "wsId" DROP NOT NULL;
ALTER TABLE "Risk" ADD COLUMN "wsIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Risk" ADD COLUMN "allWs" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Risk" SET "wsIds" = ARRAY["wsId"] WHERE "wsId" IS NOT NULL;

-- Vues du Jev du Cockpit : chantiers et caractère transverse des risques, une ligne par risque et par chantier.
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
  t.status::text AS statut,
  t."wsIds" AS chantier_ids,
  t."allWs" AS transverse
FROM "Risk" t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."allWs" OR t."wsIds" && string_to_array(current_setting('rise.chantiers', true), ','))));

CREATE OR REPLACE VIEW jev_cockpit.risques_chantiers AS
SELECT
  t."projectId" AS projet_id,
  t.id AS risque_id,
  w.id AS chantier_id,
  t."allWs" AS transverse
FROM "Risk" t JOIN "Workstream" w ON w."projectId" = t."projectId" AND (t."allWs" OR w.id = ANY(t."wsIds"))
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR w.id = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));


GRANT SELECT ON jev_cockpit.risques_chantiers TO jev_lecteur_cockpit;
