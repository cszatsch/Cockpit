-- Suppression d'un projet (Console › Projets, demande du commanditaire du 10/10/2026) : sauvegarde de sécurité restaurable 48 h.
CREATE TABLE "project_trash" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedById" TEXT,
    "deletedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "archiveKey" TEXT NOT NULL,
    "stats" JSONB NOT NULL,
    CONSTRAINT "project_trash_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_trash_expiresAt_idx" ON "project_trash"("expiresAt");
