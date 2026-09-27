-- Catégorie des modèles d'IA (LLM, Embedding, Reranking) ; les modèles existants sont des LLM.
CREATE TYPE "ModelCategory" AS ENUM ('LLM', 'EMBEDDING', 'RERANKING');

ALTER TABLE "AiModel" ADD COLUMN "category" "ModelCategory" NOT NULL DEFAULT 'LLM';
