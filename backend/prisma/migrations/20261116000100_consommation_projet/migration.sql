-- Consommation et coûts · Accès : filtre « Projet » (08/10/2026). Projet des événements d'usage (Cockpit), dimension
-- « projet » des agrégats ; agrégats recalculés en entier au prochain passage (repère remis à zéro).
ALTER TABLE "usage_events" ADD COLUMN "projectId" TEXT;

ALTER TABLE "usage_agg_hour" ADD COLUMN "project" TEXT NOT NULL DEFAULT '';
ALTER TABLE "usage_agg_hour" DROP CONSTRAINT "usage_agg_hour_pkey";
ALTER TABLE "usage_agg_hour" ADD CONSTRAINT "usage_agg_hour_pkey" PRIMARY KEY ("bucket", "accountId", "feature", "provider", "model", "project");

ALTER TABLE "usage_agg_day" ADD COLUMN "project" TEXT NOT NULL DEFAULT '';
ALTER TABLE "usage_agg_day" DROP CONSTRAINT "usage_agg_day_pkey";
ALTER TABLE "usage_agg_day" ADD CONSTRAINT "usage_agg_day_pkey" PRIMARY KEY ("bucket", "accountId", "feature", "provider", "model", "project");

UPDATE "usage_settings" SET "aggregatedUntil" = NULL;
