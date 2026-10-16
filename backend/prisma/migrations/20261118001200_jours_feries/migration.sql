-- Jours fériés (16/10/2026) : table de référence par pays et région, indépendante des projets (remplie au démarrage du
-- serveur), noms de pays du Référentiel, et vue du Jev du Cockpit qui relit à chaque question le pays et la période du projet.
CREATE TABLE "PublicHoliday" (
  "country" TEXT NOT NULL,
  "region" TEXT NOT NULL DEFAULT '',
  "date" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "observedFrom" TEXT,
  CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("country", "region", "date")
);

CREATE TABLE "PublicHolidayCountry" (
  "label" TEXT NOT NULL,
  "iso" TEXT NOT NULL,
  CONSTRAINT "PublicHolidayCountry_pkey" PRIMARY KEY ("label")
);

CREATE OR REPLACE VIEW jev_cockpit.jours_feries AS
SELECT
  p.id AS projet_id,
  t.date AS date,
  t.name AS nom,
  t.country AS pays,
  extract(isodow from t.date::date)::int AS jour_semaine_num,
  (ARRAY['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'])[extract(isodow from t.date::date)::int] AS jour_semaine,
  CASE WHEN extract(isodow from t.date::date) >= 6 THEN 'WEEKEND' WHEN extract(isodow from t.date::date) IN (2, 4) AND NOT EXISTS (SELECT 1 FROM "PublicHoliday" b WHERE b.country = t.country AND b.region = t.region AND b.date = to_char(t.date::date + CASE extract(isodow from t.date::date) WHEN 2 THEN -1 ELSE 1 END, 'YYYY-MM-DD')) THEN 'PONT' ELSE 'JOUR_PERDU' END AS effet,
  CASE WHEN extract(isodow from t.date::date) IN (2, 4) AND NOT EXISTS (SELECT 1 FROM "PublicHoliday" b WHERE b.country = t.country AND b.region = t.region AND b.date = to_char(t.date::date + CASE extract(isodow from t.date::date) WHEN 2 THEN -1 ELSE 1 END, 'YYYY-MM-DD')) THEN to_char(t.date::date + CASE extract(isodow from t.date::date) WHEN 2 THEN -1 ELSE 1 END, 'YYYY-MM-DD') END AS jour_pont,
  CASE WHEN extract(isodow from t.date::date) >= 6 THEN 0 ELSE 1 END AS jours_ouvres_perdus,
  t."observedFrom" AS reporte_du
FROM "Project" p JOIN "PublicHolidayCountry" hc ON lower(hc.label) = lower(btrim(p.country)) JOIN "PublicHoliday" t ON t.country = hc.iso AND t.region = ''
WHERE t.date >= p."startDate" AND t.date <= p."targetEndDate" AND (current_user <> 'jev_lecteur_cockpit' OR (p.id = current_setting('rise.projet', true)));

GRANT SELECT ON jev_cockpit.jours_feries TO jev_lecteur_cockpit;
