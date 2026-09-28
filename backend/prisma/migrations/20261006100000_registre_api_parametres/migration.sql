-- Registre des cartes API : paramètres par défaut des cartes initiales, utilisés par le contrôle de santé
-- (un endpoint nu répond 400 pour le géocodage). Les paramètres envoyés par un widget les remplacent.
UPDATE "api_cards" SET "endpoint" = 'https://geocoding-api.open-meteo.com/v1/search?name=Paris&count=1&format=json', "check_error" = NULL WHERE "id" = 'open-meteo-geocodage' AND "endpoint" = 'https://geocoding-api.open-meteo.com/v1/search';
UPDATE "api_cards" SET "endpoint" = 'https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m', "check_error" = NULL WHERE "id" = 'open-meteo' AND "endpoint" = 'https://api.open-meteo.com/v1/forecast';
UPDATE "api_cards" SET "endpoint" = 'https://api.gdeltproject.org/api/v2/doc/doc?query=France&mode=artlist&maxrecords=1&timespan=1d&format=json', "check_error" = NULL WHERE "id" = 'gdelt' AND "endpoint" = 'https://api.gdeltproject.org/api/v2/doc/doc';
