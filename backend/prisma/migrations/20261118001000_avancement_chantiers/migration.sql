-- Avancement d'un chantier rattaché à des sous-phases (15/10/2026) : moyenne des avancements de ses sous-phases pondérée
-- par leur durée en jours (début et fin inclus ; 1 jour si une date manque), comme pour les phases. Recalcul unique des
-- chantiers existants ; ensuite, l'application le recalcule à chaque écriture d'une sous-phase ou des liens
-- chantier ↔ sous-phase (rollupWorkstreamProgress).
UPDATE "Workstream" w
SET "progressPct" = s."pct",
    "version" = w."version" + 1,
    "updatedAt" = NOW()
FROM (SELECT l."wsId",
             ROUND(SUM(LEAST(100, GREATEST(0, sp."progressPct")) * d."jours")::numeric / SUM(d."jours"))::int AS "pct"
        FROM "WorkstreamSubphase" l
        JOIN "Subphase" sp ON sp."id" = l."subphaseId",
             LATERAL (SELECT CASE
                        WHEN sp."startDate" ~ '^\d{4}-\d{2}-\d{2}' AND sp."endDate" ~ '^\d{4}-\d{2}-\d{2}'
                         AND substr(sp."endDate", 1, 10)::date >= substr(sp."startDate", 1, 10)::date
                        THEN substr(sp."endDate", 1, 10)::date - substr(sp."startDate", 1, 10)::date + 1
                        ELSE 1 END AS "jours") d
       GROUP BY l."wsId") s
WHERE s."wsId" = w."id"
  AND w."progressPct" <> s."pct";
