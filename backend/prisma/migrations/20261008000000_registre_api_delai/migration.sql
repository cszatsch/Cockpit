-- Registre des cartes API : délai d'appel propre à une carte (service lent).
-- AlterTable
ALTER TABLE "api_cards" ADD COLUMN     "timeout_ms" INTEGER;


-- GDELT répond en 16 à 29 s (mesures du 28/09/2026) : délai de 45 s ; l'erreur « Délai dépassé » du dernier contrôle est effacée.
UPDATE "api_cards" SET "timeout_ms" = 45000, "check_error" = NULL WHERE "id" = 'gdelt';
