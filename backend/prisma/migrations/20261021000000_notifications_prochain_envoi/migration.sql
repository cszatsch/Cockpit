-- Planification des notifications (30/09/2026) : prochain envoi stocké sur chaque règle, vérifié chaque minute.
-- AlterTable
ALTER TABLE "NotificationRule" ADD COLUMN     "nextRunAt" TIMESTAMP(3),
ADD COLUMN     "scheduleKey" TEXT;

-- CreateIndex
CREATE INDEX "NotificationRule_enabled_nextRunAt_idx" ON "NotificationRule"("enabled", "nextRunAt");

