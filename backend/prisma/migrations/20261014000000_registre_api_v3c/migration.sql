-- Registre des cartes API v3c : la latence et la dernière réponse repartent de zéro quand l'endpoint change.
ALTER TABLE "api_cards" ADD COLUMN "endpoint_since" TIMESTAMP(3);

-- Widgets alimentés : identifiants du catalogue du Cockpit (anciens libellés de l'en-tête X-RISE-Widget).
UPDATE "api_cards" SET "widgets" = array_replace("widgets", 'Météo · ville', 'meteo');
UPDATE "api_cards" SET "widgets" = array_replace("widgets", 'Actualités', 'news');
UPDATE "api_cards" SET "widgets" = array_replace("widgets", 'Trafic · ville', 'trafic');
UPDATE "api_cards" SET "widgets" = ARRAY(SELECT DISTINCT unnest("widgets")) WHERE cardinality("widgets") > 1;
