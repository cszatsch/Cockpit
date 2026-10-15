-- Compte à rebours Go-Live du Cockpit (16/10/2026) : message et affichage choisis par l'utilisateur, par projet.
ALTER TABLE "UserPreferences" ADD COLUMN "countdown" JSONB;
