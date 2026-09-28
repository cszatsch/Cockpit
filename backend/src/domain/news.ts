/**
 * Actualités des cartes API (registre) : réponses des fournisseurs ramenées à une même forme d'article.
 * Formats reconnus par leur structure : GNews v4 (`articles[]`), NewsData.io (`results[]`), Finnhub (`[]` avec
 * `headline`), RSS / Atom (voir rss.ts). Texte en clair, liens http(s) seulement. Règles pures, testées.
 */
import { FEED_SUMMARY_MAX, FEED_TITLE_MAX, FeedItem, isFeed, parseFeed } from './rss';

export type NewsFormat = 'gnews' | 'newsdata' | 'finnhub' | 'rss';

const clean = (v: unknown, max: number): string => {
  const s = String(v ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
};
const link = (v: unknown): string => (typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim() : '');
const iso = (v: unknown): string | null => {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? new Date(v * 1000).toISOString() : null; // secondes Unix (Finnhub)
  if (typeof v !== 'string' || !v.trim()) return null;
  // NewsData : « 2026-09-28 16:00:00 » en UTC, sans fuseau.
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v.trim()) ? v.trim().replace(' ', 'T') + 'Z' : v;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Article normalisé, avec la source déclarée par le fournisseur (journal d'origine) quand elle existe. */
export type NewsItem = FeedItem & { publisher: string | null };

/** Reconnaît le format d'une réponse et en lit les articles ; null si le format est inconnu. */
export function parseNews(body: string): { format: NewsFormat; items: NewsItem[] } | null {
  if (isFeed(body)) return { format: 'rss', items: parseFeed(body).items.map((i) => ({ ...i, publisher: null })) };
  let j: any;
  try {
    j = JSON.parse(body);
  } catch {
    return null;
  }
  const keep = (x: NewsItem) => !!(x.title && x.url);
  if (j && Array.isArray(j.articles)) {
    return {
      format: 'gnews',
      items: j.articles
        .map((a: any) => ({ title: clean(a.title, FEED_TITLE_MAX), url: link(a.url), date: iso(a.publishedAt), summary: clean(a.description ?? a.content, FEED_SUMMARY_MAX), image: link(a.image) || null, publisher: clean(a.source?.name, 80) || null }))
        .filter(keep),
    };
  }
  if (j && Array.isArray(j.results)) {
    return {
      format: 'newsdata',
      items: j.results
        .map((a: any) => ({ title: clean(a.title, FEED_TITLE_MAX), url: link(a.link), date: iso(a.pubDate), summary: clean(a.description, FEED_SUMMARY_MAX), image: link(a.image_url) || null, publisher: clean(a.source_name ?? a.source_id, 80) || null }))
        .filter(keep),
    };
  }
  if (Array.isArray(j) && j.some((a) => a && typeof a === 'object' && 'headline' in a)) {
    return {
      format: 'finnhub',
      items: j
        .map((a: any) => ({ title: clean(a.headline, FEED_TITLE_MAX), url: link(a.url), date: iso(a.datetime), summary: clean(a.summary, FEED_SUMMARY_MAX), image: link(a.image) || null, publisher: clean(a.source, 80) || null }))
        .filter(keep),
    };
  }
  return null;
}
