-- Registre des cartes API : retrait de « GDELT · actualités » (limite de débit du fournisseur, 429) et de
-- « Les Échos » (accès refusé par le site, 403), à la demande du commanditaire (28/09/2026).
-- Traçage au journal d'audit (ajout seul), puis suppression des cartes et de leurs appels.
INSERT INTO "AuditEntry" ("id", "at", "actorName", "origin", "severity", "action", "target", "entityType", "entityId")
SELECT 'mig-retrait-' || "id", CURRENT_TIMESTAMP, 'Migration 20261009000000', 'SYSTEM', 'SENSITIVE', 'Suppression d’une carte API',
       "name" || ' · retirée à la demande du commanditaire', 'ApiCard', "id"
FROM "api_cards" WHERE "id" IN ('gdelt', 'rss-les-echos');
DELETE FROM "api_card_calls" WHERE "card_id" IN ('gdelt', 'rss-les-echos');
DELETE FROM "api_cards" WHERE "id" IN ('gdelt', 'rss-les-echos');
