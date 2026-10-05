-- Partager Cockpit (05/10/2026) : plafond mensuel facultatif par fournisseur d'IA et historique des paquets d'installation.
ALTER TABLE "Provider" ADD COLUMN "monthlyCapEur" INTEGER;

CREATE TABLE "share_packages" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "step" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "byAccountId" TEXT,
  "byName" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "dataMode" TEXT NOT NULL,
  "projects" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "dataLabel" TEXT NOT NULL,
  "keys" JSONB NOT NULL DEFAULT '[]',
  "smtp" BOOLEAN NOT NULL DEFAULT false,
  "files" BOOLEAN NOT NULL DEFAULT false,
  "code" BOOLEAN NOT NULL DEFAULT true,
  "prefill" JSONB,
  "updateMode" TEXT NOT NULL DEFAULT 'keep',
  "version" TEXT NOT NULL,
  "sizeBytes" BIGINT,
  "sha256" TEXT,
  "fileName" TEXT,
  "fileKey" TEXT,
  "fileDeletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "share_packages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "share_packages_createdAt_idx" ON "share_packages"("createdAt");
