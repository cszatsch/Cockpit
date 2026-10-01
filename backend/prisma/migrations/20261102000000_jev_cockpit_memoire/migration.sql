-- Mémoire du Jev du Cockpit (cas 3 de l'aiguillage, 01/10/2026) : conversations par application et par projet, et
-- modification en cours de préparation (brouillon : opérations résolues, question à choix posée).
ALTER TABLE "jev_conversations" ADD COLUMN "app" TEXT NOT NULL DEFAULT 'console';
ALTER TABLE "jev_conversations" ADD COLUMN "project_id" TEXT;
ALTER TABLE "jev_conversations" ADD COLUMN "draft" JSONB;
CREATE INDEX "jev_conversations_account_id_app_project_id_updated_at_idx" ON "jev_conversations"("account_id", "app", "project_id", "updated_at");
