-- Analyse des temps de traitement (01/10/2026) : une ligne par étape exécutée de chaque prompt de Jev et une ligne e2e.
CREATE TABLE "step_timings" (
    "id" BIGSERIAL NOT NULL,
    "request_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "error_type" TEXT,
    "error_message" TEXT,
    CONSTRAINT "step_timings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "step_timings_started_at_idx" ON "step_timings"("started_at");
