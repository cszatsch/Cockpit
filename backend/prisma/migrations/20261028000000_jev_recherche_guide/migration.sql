-- Jev : recherche dans le guide utilisateur (RAG), réglages, journal technique, type des questions en mémoire (décision du 30/09/2026).
-- AlterTable
ALTER TABLE "jev_messages" ADD COLUMN     "reformulated" TEXT,
ADD COLUMN     "route" TEXT;

-- CreateTable
CREATE TABLE "jev_rag_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "search_k" INTEGER NOT NULL,
    "keep_k" INTEGER NOT NULL,
    "min_similarity" DOUBLE PRECISION NOT NULL,
    "embed_timeout_ms" INTEGER NOT NULL,
    "rerank_timeout_ms" INTEGER NOT NULL,
    "llm_timeout_ms" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "jev_rag_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jev_answer_logs" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "account_id" TEXT,
    "conversation_id" TEXT,
    "classification_id" TEXT,
    "question" TEXT NOT NULL,
    "reformulated" TEXT,
    "route" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "reason" TEXT,
    "extracts" JSONB,
    "reranker" TEXT,
    "rerank_fallback" TEXT,
    "model" TEXT,
    "timings" JSONB,
    "total_ms" INTEGER,
    "error" TEXT,

    CONSTRAINT "jev_answer_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jev_answer_logs_at_idx" ON "jev_answer_logs"("at");

