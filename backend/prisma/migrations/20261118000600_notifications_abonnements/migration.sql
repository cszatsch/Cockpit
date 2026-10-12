-- Notifications, abonnements (12/10/2026) : règle obligatoire, désabonnements par compte, périmètre et désabonnés de chaque envoi.
ALTER TABLE "NotificationRule" ADD COLUMN "mandatory" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Delivery" ADD COLUMN "scope" TEXT;
ALTER TABLE "Delivery" ADD COLUMN "optedOut" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "NotificationOptOut" (
  "accountId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationOptOut_pkey" PRIMARY KEY ("accountId", "ruleId")
);
CREATE INDEX "NotificationOptOut_ruleId_idx" ON "NotificationOptOut"("ruleId");
-- Règle supprimée : ses désabonnements disparaissent avec elle.
CREATE OR REPLACE FUNCTION notification_optout_rule_gone() RETURNS trigger AS $$
BEGIN DELETE FROM "NotificationOptOut" WHERE "ruleId" = OLD.id; RETURN OLD; END $$ LANGUAGE plpgsql;
CREATE TRIGGER notification_optout_rule_gone AFTER DELETE ON "NotificationRule" FOR EACH ROW EXECUTE FUNCTION notification_optout_rule_gone();
