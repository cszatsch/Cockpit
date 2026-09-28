-- Pipeline Documents et fiche modèle enrichie (28/09/2026).
-- Modèles : date de sortie, tokens de sortie max (LLM), unité de facturation, tarif à la requête ; tarifs facultatifs selon la catégorie.
CREATE TYPE "PriceUnit" AS ENUM ('TOKENS', 'REQUESTS');

ALTER TABLE "AiModel" ADD COLUMN "releaseDate" DATE,
ADD COLUMN "maxOutputTokens" INTEGER,
ADD COLUMN "priceUnit" "PriceUnit" NOT NULL DEFAULT 'TOKENS',
ADD COLUMN "pricePer1kRequests" DOUBLE PRECISION,
ALTER COLUMN "priceInPerMTok" DROP NOT NULL,
ALTER COLUMN "priceOutPerMTok" DROP NOT NULL;

-- Un Embedding ou un Reranking ne génère pas de texte : pas de tarif de sortie.
UPDATE "AiModel" SET "priceOutPerMTok" = NULL WHERE "category" <> 'LLM';

-- Consommation : requêtes facturées (Reranking).
ALTER TABLE "UsageRecord" ADD COLUMN "requests" INTEGER NOT NULL DEFAULT 0;

-- « Analyse de documents » devient trois étapes : l'ancienne affectation et l'historique vont à la Synthèse.
UPDATE "ModelAssignment" SET "functionId" = 'doc_syn' WHERE "functionId" = 'docs';
UPDATE "UsageRecord" SET "functionId" = 'doc_syn' WHERE "functionId" = 'docs';
