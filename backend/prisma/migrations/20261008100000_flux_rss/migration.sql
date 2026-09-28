-- Flux RSS d'actualités dans le registre des cartes API.
-- AlterTable
ALTER TABLE "api_cards" ADD COLUMN     "feed" BOOLEAN NOT NULL DEFAULT false;


-- Flux initiaux (adresses vérifiées le 28/09/2026) : Le Monde, L'Équipe et BBC répondent ; Les Échos refuse l'accès
-- (403 « Access Denied » de son hébergeur) : carte créée désactivée.
INSERT INTO "api_cards" ("id", "name", "category", "endpoint", "enabled", "feed", "widgets", "updated_at", "updated_by") VALUES
  ('rss-le-monde', 'Le Monde', 'Actualités', 'https://www.lemonde.fr/rss/une.xml', true, true, ARRAY['Actualités'], CURRENT_TIMESTAMP, 'Données initiales'),
  ('rss-les-echos', 'Les Échos', 'Actualités', 'https://syndication.lesechos.fr/rss/rss_une.xml', false, true, ARRAY[]::TEXT[], CURRENT_TIMESTAMP, 'Données initiales'),
  ('rss-lequipe', 'L''Équipe', 'Actualités', 'https://dwh.lequipe.fr/api/edito/rss?path=/', true, true, ARRAY['Actualités'], CURRENT_TIMESTAMP, 'Données initiales'),
  ('rss-bbc', 'BBC News', 'Actualités', 'https://feeds.bbci.co.uk/news/rss.xml', true, true, ARRAY['Actualités'], CURRENT_TIMESTAMP, 'Données initiales')
ON CONFLICT ("id") DO NOTHING;
