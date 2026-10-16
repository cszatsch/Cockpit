-- Priorité des actions et des tâches (16/10/2026) : niveau « Critique » ajouté (quatre niveaux, comme les décisions),
-- et priorité des tâches manuelles (Moyenne par défaut).
ALTER TYPE "Priority" ADD VALUE IF NOT EXISTS 'CRITICAL' BEFORE 'HIGH';
ALTER TABLE "Task" ADD COLUMN "prio" "Priority" NOT NULL DEFAULT 'MEDIUM';
