-- Traces de Jev (01/10/2026) : décomposition chronométrée de chaque question, de la question à la réponse.
CREATE TABLE "jev_traces" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "total_ms" INTEGER NOT NULL,
    "meta" JSONB NOT NULL,
    "spans" JSONB NOT NULL,
    CONSTRAINT "jev_traces_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "jev_traces_at_idx" ON "jev_traces"("at");
