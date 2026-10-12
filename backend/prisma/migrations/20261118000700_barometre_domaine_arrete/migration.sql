-- Baromètre (12/10/2026) : suivi d'un domaine (chantier) arrêté à partir d'un mois ; son historique reste affiché.
ALTER TABLE "BarometerDomain" ADD COLUMN "retiredFrom" TEXT;
