-- Requête SQL retenue pour la rédaction d'une notification et nombre de lignes rendues (incident du 19/10/2026).
ALTER TABLE "Delivery" ADD COLUMN "sqlQuery" TEXT;
ALTER TABLE "Delivery" ADD COLUMN "rowCount" INTEGER;
