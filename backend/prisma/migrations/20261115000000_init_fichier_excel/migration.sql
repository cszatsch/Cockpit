-- Initialisation d'un projet, point d'entrée unique (maquette v3, 07/10/2026) : le dépôt est une proposition
-- commerciale (préremplissage par IA) ou l'Excel d'initialisation rempli (contrôle de conformité).
ALTER TABLE "prefill_documents" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'proposition';
-- Excel conforme : import gardé pour la prévisualisation et la publication (`project_imports`).
ALTER TABLE "prefill_tasks" ADD COLUMN "importId" TEXT;
