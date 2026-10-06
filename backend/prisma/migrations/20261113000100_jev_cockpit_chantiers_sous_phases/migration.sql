-- Vue du Jev du Cockpit : sous-phases des chantiers (06/10/2026), filtrée par droits comme chantiers_phases.
CREATE OR REPLACE VIEW jev_cockpit.chantiers_sous_phases AS
SELECT
  w."projectId" AS projet_id,
  t."wsId" AS chantier_id,
  t."subphaseId" AS sous_phase_id
FROM "WorkstreamSubphase" t JOIN "Workstream" w ON w.id = t."wsId"
WHERE (current_user <> 'jev_lecteur_cockpit' OR (w."projectId" = current_setting('rise.projet', true) AND (current_setting('rise.chantiers', true) = '*' OR t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ',')))));

GRANT SELECT ON jev_cockpit.chantiers_sous_phases TO jev_lecteur_cockpit;
