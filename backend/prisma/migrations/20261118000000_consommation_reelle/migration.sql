-- Consommation et coûts · Accès : usage réel seulement (demande du commanditaire du 10/10/2026).
-- Repères ajoutés, aucune donnée supprimée.
ALTER TABLE "Account" ADD COLUMN "demo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "demo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UsageRecord" ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT false;

-- Jeu de démonstration déjà chargé : comptes du domaine réservé example.com, projet RISE de la maquette.
UPDATE "Account" SET "demo" = true WHERE lower("email") LIKE '%@example.com';
UPDATE "Project" SET "demo" = true WHERE "id" = 'RISE';

-- Appels passés simulés par le bouchon : sans durée mesurée ou de moins de 50 ms (un appel réel à un fournisseur prend
-- toujours davantage) ; les nouveaux appels portent le repère au moment de l'enregistrement.
UPDATE "UsageRecord" SET "simulated" = true WHERE "durationMs" IS NULL OR "durationMs" < 50;

-- Agrégats recalculés en entier au prochain passage (tâche usage.aggregate).
UPDATE usage_settings SET "aggregatedUntil" = NULL;
