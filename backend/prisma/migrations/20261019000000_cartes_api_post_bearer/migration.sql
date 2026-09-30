-- Registre des cartes API (30/09/2026) : clé en Authorization: Bearer, appels POST avec corps JSON (service TypeSafe « JEV »).
ALTER TABLE "api_cards" ADD COLUMN "auth_mode" TEXT NOT NULL DEFAULT 'HEADER';
ALTER TABLE "api_cards" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'GET';
ALTER TABLE "api_cards" ADD COLUMN "body" TEXT;
