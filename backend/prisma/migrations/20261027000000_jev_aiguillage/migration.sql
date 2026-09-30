-- Aiguillage des questions de Jev (décision du 30/09/2026) : trace de chaque classification.
-- CreateTable
CREATE TABLE "jev_classifications" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "account_id" TEXT,
    "conversation_id" TEXT,
    "question" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "choice" TEXT,
    "confidence" DOUBLE PRECISION,
    "probabilities" JSONB,
    "latency_ms" INTEGER,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "prompt_version" TEXT NOT NULL,
    "model" TEXT,
    "source" TEXT NOT NULL DEFAULT 'LIVE',

    CONSTRAINT "jev_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jev_classifications_at_idx" ON "jev_classifications"("at");

