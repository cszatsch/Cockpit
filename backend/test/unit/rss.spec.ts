import { isFeed, mergeFeeds, parseFeed } from '../../src/domain/rss';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title><![CDATA[Le Monde.fr - Actualités]]></title>
<item><title><![CDATA[Budget 2027 : l’Assemblée adopte le texte]]></title><link>https://www.lemonde.fr/a.html</link>
<pubDate>Mon, 28 Sep 2026 16:00:00 +0200</pubDate><description><![CDATA[<p>Le vote a eu lieu <b>ce soir</b>.</p>]]></description>
<media:content url="https://img.lemonde.fr/a.jpg" medium="image"/></item>
<item><title>Tennis &amp; football</title><link>https://www.lemonde.fr/b.html</link><pubDate>Mon, 28 Sep 2026 18:00:00 +0200</pubDate>
<description>&lt;p&gt;Résumé &amp;amp; détails&lt;/p&gt;</description><enclosure url="https://img.lemonde.fr/b.jpg" type="image/jpeg"/></item>
<item><title>Lien dangereux</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>BBC</title>
<entry><title>World news</title><link rel="alternate" href="https://www.bbc.co.uk/news/1"/><updated>2026-09-28T15:30:00Z</updated><summary>Short &#8217;summary&#8217;</summary></entry>
</feed>`;

describe('Flux RSS et Atom (registre des cartes API)', () => {
  it('reconnaît un flux et en lit les articles en texte clair', () => {
    expect(isFeed(RSS)).toBe(true);
    expect(isFeed('{"a":1}')).toBe(false);
    const f = parseFeed(RSS);
    expect(f.title).toBe('Le Monde.fr - Actualités');
    expect(f.items).toHaveLength(2); // le lien javascript: est écarté
    expect(f.items[0]).toEqual({ title: 'Budget 2027 : l’Assemblée adopte le texte', url: 'https://www.lemonde.fr/a.html', date: '2026-09-28T14:00:00.000Z', summary: 'Le vote a eu lieu ce soir .', image: 'https://img.lemonde.fr/a.jpg' });
    expect(f.items[1]).toMatchObject({ title: 'Tennis & football', summary: 'Résumé & détails', image: 'https://img.lemonde.fr/b.jpg' });
  });

  it('Atom : lien alternatif, date de mise à jour, entités numériques', () => {
    expect(isFeed(ATOM)).toBe(true);
    const f = parseFeed(ATOM);
    expect(f).toEqual({ title: 'BBC', items: [{ title: 'World news', url: 'https://www.bbc.co.uk/news/1', date: '2026-09-28T15:30:00.000Z', summary: 'Short ’summary’', image: null }] });
  });

  it('agrégation : plus récents d’abord, doublons retirés, limite', () => {
    const m = mergeFeeds([{ source: 'Le Monde', feed: parseFeed(RSS) }, { source: 'BBC', feed: parseFeed(ATOM) }, { source: 'Doublon', feed: parseFeed(RSS) }], 10);
    expect(m.map((i) => i.source + ' · ' + i.title)).toEqual(['Le Monde · Tennis & football', 'BBC · World news', 'Le Monde · Budget 2027 : l’Assemblée adopte le texte']);
    expect(mergeFeeds([{ source: 'x', feed: parseFeed(RSS) }], 1)).toHaveLength(1);
  });
});
