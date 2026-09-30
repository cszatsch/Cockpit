-- Guide utilisateur : dépôt unique, historique des dépôts et indexation vectorielle (décision du 30/09/2026).
-- pgvector : vecteurs des extraits du guide (index HNSW partiel par dimension, créé à la première indexation).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "GuideUploadStatus" AS ENUM ('INDEXING', 'SUCCESS', 'FAILED');

-- AlterEnum
ALTER TYPE "UsageSource" ADD VALUE 'GUIDE';

-- AlterTable
ALTER TABLE "guide_versions" ADD COLUMN     "chunks" INTEGER,
ADD COLUMN     "pages" INTEGER,
ADD COLUMN     "upload_id" TEXT;

-- CreateTable
CREATE TABLE "guide_uploads" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "account_id" TEXT,
    "by" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "pages" INTEGER,
    "chunks" INTEGER,
    "status" "GuideUploadStatus" NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "step_label" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "version" TEXT,
    "storage_key" TEXT,
    "embedding_model" TEXT,
    "embedding_name" TEXT,
    "embedding_dims" INTEGER,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "guide_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guide_chunks" (
    "id" TEXT NOT NULL,
    "upload_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "section_path" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "page_start" INTEGER NOT NULL,
    "page_end" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "dims" INTEGER NOT NULL,
    "embedding" vector NOT NULL,

    CONSTRAINT "guide_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guide_uploads_at_idx" ON "guide_uploads"("at");

-- CreateIndex
CREATE INDEX "guide_chunks_upload_id_idx" ON "guide_chunks"("upload_id");

-- AddForeignKey
ALTER TABLE "guide_chunks" ADD CONSTRAINT "guide_chunks_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "guide_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Un seul dépôt en cours d'indexation à la fois.
CREATE UNIQUE INDEX "guide_uploads_one_indexing" ON "guide_uploads" ((true)) WHERE "status" = 'INDEXING';

-- Vectorisation sans modèle de secours (décision du 30/09/2026) : changer de modèle impose de revectoriser.
UPDATE "ModelAssignment" SET "fallbackModelId" = NULL, "fallbackDimension" = NULL WHERE "functionId" = 'doc_vec';
