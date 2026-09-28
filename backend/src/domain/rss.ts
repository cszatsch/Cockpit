/**
 * Lecture des flux RSS 2.0 et Atom (registre des cartes API, flux d'actualités) : règles pures, sans
 * dépendance, testées dans test/unit. Le texte est rendu en clair (balises HTML retirées, entités décodées) :
 * aucun HTML du fournisseur n'est transmis aux écrans.
 */

export interface FeedItem {
  title: string;
  url: string;
  /** Date de publication ISO, ou null si absente ou illisible. */
  date: string | null;
  summary: string;
  image: string | null;
}
export interface Feed {
  title: string;
  items: FeedItem[];
}

/** Longueurs maximales (texte d'affichage). */
export const FEED_TITLE_MAX = 300;
export const FEED_SUMMARY_MAX = 500;
/** Articles par flux et au total (agrégation). */
export const FEED_ITEMS_DEFAULT = 10;
export const FEED_ITEMS_MAX = 50;

/** Contenu RSS ou Atom (reconnaissance du format d'une réponse). */
export function isFeed(body: string): boolean {
  const head = body.slice(0, 2000).replace(/^﻿/, '').trimStart();
  return head.startsWith('<') && /<(rss|feed|rdf:RDF)[\s>]/i.test(head);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô', ucirc: 'û', icirc: 'î', euml: 'ë', iuml: 'ï' };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Texte d'un élément : CDATA déballé, balises HTML retirées, entités décodées, espaces réduits. */
function text(raw: string | undefined, max: number): string {
  if (!raw) return '';
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = decode(s); // entités d'un HTML échappé (&lt;p&gt;) avant de retirer les balises
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  s = decode(s).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/** Contenu du premier élément `tag` (nom éventuellement préfixé, ex. media:content). */
function inner(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m?.[1];
}
function attr(xml: string, tag: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? decode(m[1]) : undefined;
}
function blocks(xml: string, tag: string): string[] {
  return xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, 'gi')) ?? [];
}

/** Lien http(s) seulement (un lien javascript: ou relatif n'est pas transmis). */
function safeUrl(u: string | undefined): string {
  const s = (u ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}
function isoDate(s: string | undefined): string | null {
  if (!s) return null;
  const t = Date.parse(text(s, 100));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Lit un flux RSS 2.0 (ou RSS 1.0 / RDF) ou Atom ; les articles sans titre ni lien sont écartés. */
export function parseFeed(xml: string): Feed {
  const atom = /<feed[\s>]/i.test(xml.slice(0, 2000)) && !/<rss[\s>]/i.test(xml.slice(0, 2000));
  if (atom) {
    const items = blocks(xml, 'entry').map((e) => {
      const alt = e.match(/<link\b[^>]*rel\s*=\s*["']alternate["'][^>]*>/i)?.[0];
      const href = (alt && attr(alt, 'link', 'href')) || attr(e, 'link', 'href');
      return {
        title: text(inner(e, 'title'), FEED_TITLE_MAX),
        url: safeUrl(href),
        date: isoDate(inner(e, 'published') ?? inner(e, 'updated')),
        summary: text(inner(e, 'summary') ?? inner(e, 'content'), FEED_SUMMARY_MAX),
        image: safeUrl(attr(e, 'media:thumbnail', 'url') ?? attr(e, 'media:content', 'url')) || null,
      };
    });
    return { title: text(inner(xml.replace(/<entry[\s\S]*$/i, ''), 'title'), FEED_TITLE_MAX), items: items.filter((i) => i.title && i.url) };
  }
  const channel = inner(xml, 'channel') ?? xml;
  const items = blocks(xml, 'item').map((it) => ({
    title: text(inner(it, 'title'), FEED_TITLE_MAX),
    url: safeUrl(text(inner(it, 'link'), 2000) || text(inner(it, 'guid'), 2000)),
    date: isoDate(inner(it, 'pubDate') ?? inner(it, 'dc:date')),
    summary: text(inner(it, 'description'), FEED_SUMMARY_MAX),
    image: safeUrl(attr(it, 'media:content', 'url') ?? attr(it, 'media:thumbnail', 'url') ?? attr(it, 'enclosure', 'url')) || null,
  }));
  return { title: text(inner(channel.replace(/<item[\s\S]*$/i, ''), 'title'), FEED_TITLE_MAX), items: items.filter((i) => i.title && i.url) };
}

/** Agrégation de plusieurs flux : plus récents d'abord, doublons (même lien) retirés. */
export function mergeFeeds(feeds: Array<{ source: string; feed: Feed }>, limit: number): Array<FeedItem & { source: string }> {
  const seen = new Set<string>();
  return feeds
    .flatMap(({ source, feed }) => feed.items.map((i) => ({ ...i, source })))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)))
    .slice(0, limit);
}
