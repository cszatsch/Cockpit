-- Profil du Cockpit (07/10/2026) : téléphone, pays de résidence et projet ouvert par défaut (code du projet).
ALTER TABLE "UserPreferences" ADD COLUMN "phone" TEXT;
ALTER TABLE "UserPreferences" ADD COLUMN "country" TEXT;
ALTER TABLE "UserPreferences" ADD COLUMN "defaultProject" TEXT;
