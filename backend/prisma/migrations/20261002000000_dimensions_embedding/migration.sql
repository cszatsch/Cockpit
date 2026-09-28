-- Modèles : identifiant chez le fournisseur, contexte, dimensions de sortie (Embedding) ; dimension choisie dans l'affectation.
ALTER TABLE "AiModel" ADD COLUMN "providerModelId" TEXT,
ADD COLUMN "contextTokens" INTEGER,
ADD COLUMN "dimensions" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "defaultDimension" INTEGER;

ALTER TABLE "ModelAssignment" ADD COLUMN "primaryDimension" INTEGER,
ADD COLUMN "fallbackDimension" INTEGER;
