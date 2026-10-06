-- Préremplissage : plusieurs fichiers par dépôt (07/10/2026), métadonnées et clés de stockage.
ALTER TABLE "prefill_documents" ADD COLUMN "files" JSONB NOT NULL DEFAULT '[]';
