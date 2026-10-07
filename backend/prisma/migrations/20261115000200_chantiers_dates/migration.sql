-- Chantiers : dates de début et de fin (07/10/2026). Les chantiers importés avant cette date avaient reçu les dates du
-- projet ; ceux qui les ont encore exactement (jamais modifiées) prennent la première date de début et la dernière date
-- de fin de leurs sous-phases, quand elles en ont. Les autres chantiers sont inchangés.
UPDATE "Workstream" w
SET "startDate" = COALESCE(s."debut", w."startDate"),
    "endDate"   = COALESCE(s."fin", w."endDate"),
    "updatedAt" = NOW()
FROM "Project" p,
     (SELECT ws."wsId", MIN(sp."startDate") AS "debut", MAX(sp."endDate") AS "fin"
        FROM "WorkstreamSubphase" ws JOIN "Subphase" sp ON sp."id" = ws."subphaseId"
       GROUP BY ws."wsId") s
WHERE p."id" = w."projectId"
  AND s."wsId" = w."id"
  AND w."startDate" = p."startDate"
  AND w."endDate" = p."targetEndDate"
  AND (s."debut" IS NOT NULL OR s."fin" IS NOT NULL);

-- Consigne de la skill « Préremplissage d’un projet » (onglet 10) : début et fin du chantier, si la phrase d'origine
-- n'a pas été modifiée par l'utilisateur.
UPDATE "Skill"
SET "t" = replace("t", 'À extraire : Nom ; Responsable (de 03) ; Lot ; Statut (Actif, Clos) ; Description ;',
  'À extraire : Nom ; Responsable (de 03) ; Lot ; Statut (Actif, Clos) ; Début et Fin (dates du chantier, si la proposition les donne ; sinon laisser vide, elles sont calculées à partir de ses sous-phases) ; Description ;')
WHERE "t" LIKE '%À extraire : Nom ; Responsable (de 03) ; Lot ; Statut (Actif, Clos) ; Description ;%';
