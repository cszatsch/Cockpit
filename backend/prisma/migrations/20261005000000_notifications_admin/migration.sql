-- Notifications de l'administrateur (spécification NOTIFICATIONS § 5)
-- CreateEnum
CREATE TYPE "AdminNotificationKind" AS ENUM ('ERR', 'WARN', 'INVITE', 'MODULE');

-- CreateEnum
CREATE TYPE "AdminNotificationStatus" AS ENUM ('OPEN', 'DECIDED', 'DONE', 'RESOLVED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "AdminNotificationKind" NOT NULL,
    "status" "AdminNotificationStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT,
    "actLabel" TEXT,
    "target" TEXT,
    "meta" JSONB,
    "level" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedBy" TEXT,
    "undoUntil" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_key_key" ON "Notification"("key");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

