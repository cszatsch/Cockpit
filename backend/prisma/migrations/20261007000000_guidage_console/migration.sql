-- Fonction IA « Guider l'utilisateur sur la console » (guidage, spécification IA § 8) : affectation par défaut,
-- créée seulement si la fonction n'est pas encore affectée et si les modèles du catalogue existent.
-- Principal : Claude Haiku 4.5 (rapide, économique) ; secours : GPT-6 Luna (autre fournisseur).
INSERT INTO "ModelAssignment" ("functionId", "primaryModelId", "fallbackModelId", "updatedAt", "version")
SELECT 'guidage', 'claude-haiku-4-5', 'gpt-6-luna', CURRENT_TIMESTAMP, 1
WHERE NOT EXISTS (SELECT 1 FROM "ModelAssignment" WHERE "functionId" = 'guidage')
  AND EXISTS (SELECT 1 FROM "AiModel" WHERE "id" = 'claude-haiku-4-5')
  AND EXISTS (SELECT 1 FROM "AiModel" WHERE "id" = 'gpt-6-luna');
