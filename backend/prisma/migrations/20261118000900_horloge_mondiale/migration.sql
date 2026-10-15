-- Horloge mondiale du Cockpit (15/10/2026) : villes choisies par l'utilisateur (4 au plus) et affichage des secondes.
ALTER TABLE "UserPreferences" ADD COLUMN "worldClock" JSONB;
