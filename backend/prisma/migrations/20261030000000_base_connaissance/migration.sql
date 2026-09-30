-- Base de connaissance du Cockpit (décisions du 30/09/2026) : dépôt de documents PDF, Word, PowerPoint et Excel,
-- extraction du texte, résumé, découpage, vectorisation (pgvector) ; historique en ajout seul.

-- AlterEnum
ALTER TYPE "ExtractionStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "format" TEXT,
ADD COLUMN "file_name" TEXT,
ADD COLUMN "uploaded_by_id" TEXT,
ADD COLUMN "uploaded_by" TEXT,
ADD COLUMN "uploaded_at" TIMESTAMP(3),
ADD COLUMN "content_hash" TEXT,
ADD COLUMN "summary" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "error" TEXT,
ADD COLUMN "ext_note" TEXT,
ADD COLUMN "progress" INTEGER,
ADD COLUMN "step_label" TEXT,
ADD COLUMN "chunk_count" INTEGER,
ADD COLUMN "embedding_model" TEXT,
ADD COLUMN "embedding_name" TEXT,
ADD COLUMN "embedding_dims" INTEGER,
ADD COLUMN "replaces_id" TEXT;

-- CreateIndex
CREATE INDEX "Document_projectId_contentHash_idx" ON "Document"("projectId", "content_hash");

-- CreateTable
CREATE TABLE "kb_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "slide" INTEGER,
    "sheet" TEXT,
    "row_start" INTEGER,
    "row_end" INTEGER,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "tokens" INTEGER NOT NULL,
    "dims" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "embedding" vector NOT NULL,

    CONSTRAINT "kb_chunks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "kb_chunks_document_id_idx" ON "kb_chunks"("document_id");
CREATE INDEX "kb_chunks_project_id_idx" ON "kb_chunks"("project_id");
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Index HNSW : créé par dimension au premier document vectorisé (hnswIndexSql(dims, 'kb_chunks')).

-- CreateTable
CREATE TABLE "document_events" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "project_id" TEXT NOT NULL,
    "document_id" TEXT,
    "document_name" TEXT NOT NULL,
    "account_id" TEXT,
    "by" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,

    CONSTRAINT "document_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "document_events_project_id_at_idx" ON "document_events"("project_id", "at");

-- Historique en ajout seul : ni modification ni suppression.
CREATE OR REPLACE FUNCTION document_event_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'document_events is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER document_event_no_update BEFORE UPDATE ON "document_events"
  FOR EACH ROW EXECUTE FUNCTION document_event_immutable();
CREATE TRIGGER document_event_no_delete BEFORE DELETE ON "document_events"
  FOR EACH ROW EXECUTE FUNCTION document_event_immutable();
