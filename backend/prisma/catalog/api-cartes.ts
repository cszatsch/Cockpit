/**
 * Catalogue des cartes API de la plateforme (consigne du commanditaire du 15/10/2026), appliqué par
 * `npm run cartes:catalogue -- --confirmer` (scripts/cartes-catalogue.ts).
 *
 * 10 widgets alimentés par une carte : Actualités Eco, News, News Tech et Sports en français et en anglais ; Météo et
 * Trafic en français. Les tags des cartes suivent les thèmes : Actualités Eco, News, News Tech, Sports, Météo, Trafic
 * (JEV garde le sien).
 *
 * - `CATALOG_KEEP` : cartes existantes gardées (clé, réglages, historique), remises au tag et aux widgets indiqués.
 * - `CATALOG_CARDS` : flux RSS créés (sans clé) ou, s'ils existent déjà, remis au catalogue.
 * - Toute autre carte de la base est supprimée (GNews et NewsData.io, retirées par le commanditaire, comprises).
 */
export interface CatalogCard {
  id: string;
  name: string;
  category: string;
  endpoint: string;
  widgets: string[];
}

/** Cartes gardées : tag et widgets (liste complète) ; rien d'indiqué = inchangé. */
export const CATALOG_KEEP: Record<string, { category?: string; widgets?: string[] }> = {
  'rss-le-monde': { category: 'News', widgets: ['news_fr'] },
  'rss-bbc': { category: 'News', widgets: ['news_en'] },
  'rss-lequipe': { category: 'Sports', widgets: ['sport_fr'] },
  finnhub: { category: 'Actualités Eco', widgets: ['eco_en'] },
  // Le géocodage sert aussi au trafic (domicile et site du projet).
  'open-meteo-geocodage': { category: 'Météo', widgets: ['meteo', 'trafic'] },
  'open-meteo': { category: 'Météo', widgets: ['meteo'] },
  'tomtom-routing': { category: 'Trafic', widgets: ['trafic'] },
  jev: {},
};

export const CATALOG_CARDS: readonly CatalogCard[] = [
  // Actualités Eco EN (avec Finnhub, gardée)
  { id: 'cnbc-top-news', name: 'CNBC – Top news', category: 'Actualités Eco', endpoint: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', widgets: ['eco_en'] },
  { id: 'ft-global-economy', name: 'Financial Times – Global economy', category: 'Actualités Eco', endpoint: 'https://www.ft.com/global-economy?format=rss', widgets: ['eco_en'] },
  { id: 'fortune', name: 'Fortune', category: 'Actualités Eco', endpoint: 'https://fortune.com/feed/fortune-feeds/?id=3230629', widgets: ['eco_en'] },
  { id: 'wsj-economy', name: 'Wall Street Journal – Economy', category: 'Actualités Eco', endpoint: 'https://feeds.content.dowjones.io/public/rss/socialeconomyfeed', widgets: ['eco_en'] },
  // Actualités Eco FR
  { id: 'franceinfo-entreprises', name: 'Franceinfo – Entreprises', category: 'Actualités Eco', endpoint: 'https://www.franceinfo.fr/economie/entreprises.rss', widgets: ['eco_fr'] },
  { id: 'le-figaro-economie', name: 'Le Figaro – Économie', category: 'Actualités Eco', endpoint: 'https://www.lefigaro.fr/rss/figaro_economie.xml', widgets: ['eco_fr'] },
  { id: 'le-monde-entreprise', name: 'Le Monde – Entreprise', category: 'Actualités Eco', endpoint: 'https://www.lemonde.fr/entreprises/rss_full.xml', widgets: ['eco_fr'] },
  // News FR (avec Le Monde) et News EN (avec BBC News)
  { id: 'franceinfo-titres', name: 'Franceinfo – Titres', category: 'News', endpoint: 'https://www.franceinfo.fr/titres.rss', widgets: ['news_fr'] },
  { id: 'nbc-news', name: 'NBC News', category: 'News', endpoint: 'https://feeds.nbcnews.com/nbcnews/public/news', widgets: ['news_en'] },
  { id: 'nyt-home', name: 'New York Times – Home', category: 'News', endpoint: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', widgets: ['news_en'] },
  // News Tech FR et News Tech EN (flux testés le 15/10/2026 : 200, frais, titre, lien et date pour chaque article)
  { id: '01net', name: '01net', category: 'News Tech', endpoint: 'https://www.01net.com/actualites/feed/', widgets: ['tech_fr'] },
  { id: 'le-monde-pixels', name: 'Le Monde – Pixels', category: 'News Tech', endpoint: 'https://www.lemonde.fr/pixels/rss_full.xml', widgets: ['tech_fr'] },
  { id: 'numerama', name: 'Numerama', category: 'News Tech', endpoint: 'https://www.numerama.com/feed/', widgets: ['tech_fr'] },
  { id: 'techcrunch', name: 'TechCrunch', category: 'News Tech', endpoint: 'https://techcrunch.com/feed/', widgets: ['tech_en'] },
  { id: 'the-verge', name: 'The Verge', category: 'News Tech', endpoint: 'https://www.theverge.com/rss/index.xml', widgets: ['tech_en'] },
  { id: 'cnbc-technology', name: 'CNBC – Technology', category: 'News Tech', endpoint: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910', widgets: ['tech_en'] },
  // Sports EN (Sports FR : L'Équipe, gardée)
  { id: 'cbs-sports-headlines', name: 'CBS Sports – Headlines', category: 'Sports', endpoint: 'https://www.cbssports.com/rss/headlines/', widgets: ['sport_en'] },
  { id: 'espn-top-news', name: 'ESPN – Top news', category: 'Sports', endpoint: 'https://www.espn.com/espn/rss/news', widgets: ['sport_en'] },
];
