import { parseNews } from '../../src/domain/news';

describe('Actualités : formats des fournisseurs (registre des cartes API)', () => {
  it('GNews v4', () => {
    const r = parseNews(JSON.stringify({ totalArticles: 1, articles: [{ title: 'Titre <b>GNews</b>', description: 'Résumé', url: 'https://ex.fr/1', image: 'https://ex.fr/1.jpg', publishedAt: '2026-09-28T16:00:00Z', source: { name: 'Le Figaro', url: 'https://lefigaro.fr' } }] }));
    expect(r).toEqual({ format: 'gnews', items: [{ title: 'Titre GNews', url: 'https://ex.fr/1', date: '2026-09-28T16:00:00.000Z', summary: 'Résumé', image: 'https://ex.fr/1.jpg', publisher: 'Le Figaro' }] });
  });

  it('NewsData.io (date sans fuseau, en UTC)', () => {
    const r = parseNews(JSON.stringify({ status: 'success', totalResults: 1, results: [{ title: 'Titre ND', link: 'https://ex.fr/2', description: null, pubDate: '2026-09-28 16:00:00', image_url: null, source_name: 'Ouest-France' }] }));
    expect(r).toEqual({ format: 'newsdata', items: [{ title: 'Titre ND', url: 'https://ex.fr/2', date: '2026-09-28T16:00:00.000Z', summary: '', image: null, publisher: 'Ouest-France' }] });
  });

  it('Finnhub (date en secondes Unix) ; lien non http(s) écarté ; format inconnu', () => {
    const r = parseNews(JSON.stringify([{ category: 'general', datetime: 1790611200, headline: 'Marchés en hausse', id: 1, image: '', related: '', source: 'Reuters', summary: 'Le CAC 40…', url: 'https://ex.com/3' }, { headline: 'Sans lien', url: 'javascript:x' }]));
    expect(r).toEqual({ format: 'finnhub', items: [{ title: 'Marchés en hausse', url: 'https://ex.com/3', date: new Date(1790611200 * 1000).toISOString(), summary: 'Le CAC 40…', image: null, publisher: 'Reuters' }] });
    expect(parseNews('{"error":"Please use an API key."}')).toBeNull();
    expect(parseNews('pas du JSON')).toBeNull();
    expect(parseNews('<rss version="2.0"><channel><title>X</title><item><title>A</title><link>https://a.fr</link></item></channel></rss>')).toMatchObject({ format: 'rss', items: [{ title: 'A', publisher: null }] });
  });
});
