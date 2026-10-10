-- Consommation et coûts : alignement de la vue Accès sur la vue IA (source de vérité) et appels simulés retirés partout
-- (demande du commanditaire du 10/10/2026).
-- Le repère « projet de démonstration » ne sert plus : les coûts d'IA de tous les projets comptent, comme dans la vue IA.
ALTER TABLE "Project" DROP COLUMN "demo";

-- Vues de Jev regénérées depuis src/domain/jev-dictionnaire.ts : sans les appels simulés par le bouchon.
CREATE OR REPLACE VIEW jev.consommation_ia AS
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
  t.source::text AS origine,
  t.id AS requete_id,
  t."priceIn" AS prix_entree_eur_million,
  t."priceOut" AS prix_sortie_eur_million,
  t."durationMs" AS duree_ms
FROM "UsageRecord" t
WHERE NOT t."simulated";

CREATE OR REPLACE VIEW jev.budget_ia AS
SELECT
  t.ligne AS ligne,
  t.libelle AS libelle,
  t.ordre AS ordre,
  t.jour AS date_jour,
  round(t.depense::numeric, 2) AS depense_mois_eur,
  round(t.rythme::numeric, 2) AS rythme_7j_eur_jour,
  t.restants AS jours_restants,
  round((t.depense + t.rythme * t.restants)::numeric, 2) AS projection_fin_mois_eur,
  t.plafond AS plafond_eur,
  t.seuil AS seuil_alerte_pct,
  t.actif AS plafond_actif,
  CASE WHEN t.plafond > 0 THEN round((t.depense / t.plafond * 100)::numeric, 1) END AS pourcentage_atteint,
  CASE WHEN NOT t.actif OR t.plafond IS NULL OR t.plafond = 0 THEN 'SANS_PLAFOND' WHEN t.depense + t.rythme * t.restants >= t.plafond THEN 'DEPASSEMENT' WHEN t.depense + t.rythme * t.restants > t.plafond * t.seuil / 100.0 THEN 'ALERTE' ELSE 'SOUS_LE_PLAFOND' END AS statut
FROM (
  WITH j AS (
    SELECT COALESCE(NULLIF(current_setting('rise.jour', true), '')::date, (now() AT TIME ZONE 'Europe/Paris')::date) AS jour
  ), b AS (
    SELECT jour, date_trunc('month', jour)::date AS debut, ((date_trunc('month', jour) + interval '1 month - 1 day')::date - jour) AS restants FROM j
  ), lignes(ligne, libelle, ordre) AS (
    VALUES ('all', 'Budget global', 0), ('insights', 'Insights', 1), ('crud', 'Gestion des données', 2), ('rapports', 'Rapports', 3), ('guidage', 'Guidage console', 4), ('init_projet', 'Initialisation projet', 5), ('docs', 'Documents', 6)
  ), u AS (
    SELECT CASE WHEN r."functionId" IN ('doc_vec', 'doc_rrk', 'doc_syn') THEN 'docs' ELSE r."functionId" END AS ligne,
      r."costEur" AS cout, ((r.at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date AS jour
    FROM "UsageRecord" r, b
    WHERE r.at >= (LEAST(b.debut, b.jour - 6)::timestamp AT TIME ZONE 'Europe/Paris') AND NOT r."simulated"
  ), c AS (
    SELECT l.ligne, l.libelle, l.ordre, b.jour, b.restants,
      COALESCE(sum(u.cout) FILTER (WHERE u.jour BETWEEN b.debut AND b.jour), 0) AS depense,
      COALESCE(sum(u.cout) FILTER (WHERE u.jour BETWEEN b.jour - 6 AND b.jour), 0) / 7.0 AS rythme
    FROM lignes l CROSS JOIN b LEFT JOIN u ON (l.ligne = 'all' OR u.ligne = l.ligne)
    GROUP BY l.ligne, l.libelle, l.ordre, b.jour, b.restants
  )
  SELECT c.*, p."limitEur" AS plafond, COALESCE(p."warnPct", 80) AS seuil, COALESCE(p.enabled, false) AS actif
  FROM c LEFT JOIN "BudgetThreshold" p ON p.id = c.ligne
) t;

-- Agrégats de la vue Accès recalculés en entier au prochain passage (tâche usage.aggregate).
UPDATE usage_settings SET "aggregatedUntil" = NULL;
