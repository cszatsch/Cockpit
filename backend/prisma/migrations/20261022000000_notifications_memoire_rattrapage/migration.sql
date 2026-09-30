-- Notifications (30/09/2026) : mémoire des envois (occurrences uniques), mode et heure prévue dans l'historique, texte rédigé gardé.
-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "llmResponse" TEXT,
ADD COLUMN     "mode" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notification_occurrences" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMP(3),

    CONSTRAINT "notification_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_occurrences_status_scheduled_at_idx" ON "notification_occurrences"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_occurrences_rule_id_project_id_scheduled_at_key" ON "notification_occurrences"("rule_id", "project_id", "scheduled_at");

