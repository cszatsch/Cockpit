-- CreateEnum
CREATE TYPE "RuleTrigger" AS ENUM ('SCHEDULE', 'MILESTONE_LATE', 'RISK_CRITICAL', 'DOCUMENT_ANALYZED', 'BUDGET_THRESHOLD', 'MANUAL');

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "eventKey" TEXT,
ADD COLUMN     "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "NotificationRule" ADD COLUMN     "trigger" "RuleTrigger" NOT NULL DEFAULT 'SCHEDULE';

-- CreateIndex
CREATE INDEX "Delivery_ruleId_eventKey_idx" ON "Delivery"("ruleId", "eventKey");
