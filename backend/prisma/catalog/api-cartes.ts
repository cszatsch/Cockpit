/**
 * Catalogue des cartes API de la plateforme (consigne du commanditaire du 15/10/2026), appliqué par
 * `npm run cartes:catalogue -- --confirmer` (scripts/cartes-catalogue.ts).
 *
 * - `CATALOG_KEEP` : cartes gardées (clé, réglages, historique) ; les widgets indiqués sont ajoutés à leurs widgets
 *   actuels, le tag indiqué remplace le leur.
 * - `CATALOG_CARDS` : flux RSS créés (sans clé) ou, s'ils existent déjà, remis à ces widgets.
 * - Toute autre carte de la base est une carte de démonstration : supprimée.
 *
 * Tags des nouveaux flux : Économie, News, Sports — pas « Actualités » ni « Finance », que la tuile Actualité du
 * Cockpit agrège en entier (`GET /api/widgets/news`) : elle reste alimentée par les mêmes cartes qu'avant.
 */
export interface CatalogCard {
  id: string;
  name: string;
  category: string;
  endpoint: string;
  widgets: string[];
}

/**
 * Cartes gardées : widgets thématiques ajoutés et, le cas échéant, nouveau tag. GNews et NewsData.io retirées le
 * 15/10/2026 (consigne du commanditaire) : absentes de la liste, elles sont supprimées.
 */
export const CATALOG_KEEP: Record<string, { widgets?: string[]; category?: string }> = {
  'rss-bbc': {},
  'rss-le-monde': { widgets: ['news_fr'] },
  'rss-lequipe': { widgets: ['sport_fr'], category: 'Sports' },
  'open-meteo-geocodage': {},
  'open-meteo': {},
  'tomtom-routing': {},
  finnhub: {},
  jev: {},
};

export const CATALOG_CARDS: readonly CatalogCard[] = [
  // Actualités éco EN
  { id: 'ft-global-economy', name: 'Financial Times – Global economy', category: 'Économie', endpoint: 'https://www.ft.com/global-economy?format=rss', widgets: ['eco_en'] },
  { id: 'fortune', name: 'Fortune', category: 'Économie', endpoint: 'https://fortune.com/feed/', widgets: ['eco_en'] },
  { id: 'cnbc-top-news', name: 'CNBC – Top news', category: 'Économie', endpoint: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', widgets: ['eco_en'] },
  { id: 'wsj-economy', name: 'Wall Street Journal – Economy', category: 'Économie', endpoint: 'https://feeds.content.dowjones.io/public/rss/socialeconomyfeed', widgets: ['eco_en'] },
  // Actualités éco FR
  { id: 'franceinfo-entreprises', name: 'Franceinfo – Entreprises', category: 'Économie', endpoint: 'https://www.francetvinfo.fr/economie/entreprises.rss', widgets: ['eco_fr'] },
  { id: 'le-monde-entreprise', name: 'Le Monde – Entreprise', category: 'Économie', endpoint: 'https://www.lemonde.fr/entreprises/rss_full.xml', widgets: ['eco_fr'] },
  { id: 'le-figaro-economie', name: 'Le Figaro – Économie', category: 'Économie', endpoint: 'https://www.lefigaro.fr/rss/figaro_economie.xml', widgets: ['eco_fr'] },
  // News FR (avec Le Monde, gardé) et News EN
  { id: 'franceinfo-titres', name: 'Franceinfo – Titres', category: 'News', endpoint: 'https://www.francetvinfo.fr/titres.rss', widgets: ['news_fr'] },
  { id: 'nyt-home', name: 'New York Times – Home', category: 'News', endpoint: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', widgets: ['news_en'] },
  { id: 'nbc-news', name: 'NBC News', category: 'News', endpoint: 'https://feeds.nbcnews.com/nbcnews/public/news', widgets: ['news_en'] },
  // Sport US
  { id: 'espn-top-news', name: 'ESPN – Top news', category: 'Sports', endpoint: 'https://www.espn.com/espn/rss/news', widgets: ['sport_us'] },
  { id: 'cbs-sports-headlines', name: 'CBS Sports – Headlines', category: 'Sports', endpoint: 'https://www.cbssports.com/rss/headlines/', widgets: ['sport_us'] },
];
