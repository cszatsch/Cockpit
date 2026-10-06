-- Mesures OpenRouter des modèles (06/10/2026) : identifiant OpenRouter, score τ²-Bench Airline (%),
-- coût moyen d'une session (€), débit médian du meilleur fournisseur (tokens/s), date du relevé.
ALTER TABLE "AiModel" ADD COLUMN "openrouterId" TEXT;
ALTER TABLE "AiModel" ADD COLUMN "benchmarkScore" DOUBLE PRECISION;
ALTER TABLE "AiModel" ADD COLUMN "costPerSessionEur" DOUBLE PRECISION;
ALTER TABLE "AiModel" ADD COLUMN "tokensPerSecond" DOUBLE PRECISION;
ALTER TABLE "AiModel" ADD COLUMN "statsAt" TIMESTAMP(3);
