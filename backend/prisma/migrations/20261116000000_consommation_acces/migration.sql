-- Consommation et coûts · Console › Accès (08/10/2026) : droits « Voir les coûts » et « Voir les données individuelles »,
-- compte et fonctionnalité des appels d'IA, événements d'usage, agrégats horaires et journaliers, réglages.
-- AlterTable
ALTER TABLE "AdminGrant" ADD COLUMN     "seeCosts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "seeIndividual" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "UsageRecord" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "feature" TEXT;

-- CreateTable
CREATE TABLE "usage_events" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "sessionId" TEXT,
    "feature" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_agg_hour" (
    "bucket" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "activeSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "connectedSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "logins" INTEGER NOT NULL DEFAULT 0,
    "events" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" BIGINT NOT NULL DEFAULT 0,
    "tokensOut" BIGINT NOT NULL DEFAULT 0,
    "costEur" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "usage_agg_hour_pkey" PRIMARY KEY ("bucket","accountId","feature","provider","model")
);

-- CreateTable
CREATE TABLE "usage_agg_day" (
    "bucket" DATE NOT NULL,
    "accountId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "activeSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "connectedSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "logins" INTEGER NOT NULL DEFAULT 0,
    "events" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" BIGINT NOT NULL DEFAULT 0,
    "tokensOut" BIGINT NOT NULL DEFAULT 0,
    "costEur" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "usage_agg_day_pkey" PRIMARY KEY ("bucket","accountId","feature","provider","model")
);

-- CreateTable
CREATE TABLE "usage_settings" (
    "id" TEXT NOT NULL,
    "idleMinutes" INTEGER NOT NULL DEFAULT 5,
    "unusualFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.6,
    "costAlertPct" INTEGER NOT NULL DEFAULT 30,
    "aggregatedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_events_at_idx" ON "usage_events"("at");

-- CreateIndex
CREATE INDEX "usage_events_accountId_at_idx" ON "usage_events"("accountId", "at");

CREATE INDEX "UsageRecord_accountId_at_idx" ON "UsageRecord"("accountId", "at");

INSERT INTO "usage_settings" ("id", "updatedAt") VALUES ('default', NOW()) ON CONFLICT DO NOTHING;
