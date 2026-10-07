-- Avancement d'une phase qui a des sous-phases (07/10/2026, arbitrage du commanditaire) : moyenne des avancements de
-- ses sous-phases pondérée par leur durée en jours (début et fin inclus ; 1 jour si une date manque). Recalcul unique
-- des phases existantes ; ensuite, l'application le recalcule à chaque écriture d'une sous-phase (rollupPhaseProgress).
UPDATE "Phase" p
SET "progressPct" = s."pct",
    "version" = p."version" + 1,
    "updatedAt" = NOW()
FROM (SELECT sp."phaseId",
             ROUND(SUM(LEAST(100, GREATEST(0, sp."progressPct")) * d."jours")::numeric / SUM(d."jours"))::int AS "pct"
        FROM "Subphase" sp,
             LATERAL (SELECT CASE
                        WHEN sp."startDate" ~ '^\d{4}-\d{2}-\d{2}' AND sp."endDate" ~ '^\d{4}-\d{2}-\d{2}'
                         AND substr(sp."endDate", 1, 10)::date >= substr(sp."startDate", 1, 10)::date
                        THEN substr(sp."endDate", 1, 10)::date - substr(sp."startDate", 1, 10)::date + 1
                        ELSE 1 END AS "jours") d
       GROUP BY sp."phaseId") s
WHERE s."phaseId" = p."id"
  AND p."progressPct" <> s."pct";
