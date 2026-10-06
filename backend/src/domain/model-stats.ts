/**
 * Mesures OpenRouter des modèles d'IA (06/10/2026, sources désignées par le commanditaire sur openrouter.ai/rankings) :
 * - score : Intelligence Index d'Artificial Analysis (rubrique « Benchmarks ») ;
 * - coût par session : coût médian d'une session de 10 à 49 tours dans Hermes Agent (rubrique « Cost per session ») ;
 * - débit : médiane (P50) en tokens/s du meilleur fournisseur (rubrique « Fastest models »).
 * Règles pures, testées dans `test/unit/model-stats.spec.ts`.
 */

/** API publique d'OpenRouter (liste des modèles, pour la correspondance des identifiants). */
export const OPENROUTER_API = 'https://openrouter.ai/api/v1';
/** Données de la page Rankings d'OpenRouter (sans clé). */
export const OPENROUTER_RANKINGS_API = 'https://openrouter.ai/api/frontend/v1/rankings';
/** Coût par session : agent retenu (premier onglet de la rubrique) et tranche de 10 à 49 tours. */
export const SESSION_HARNESS = 'Hermes Agent';
export const SESSION_BUCKET = 'core';
/** Relevé quotidien (heure de Paris du serveur). */
export const MODEL_STATS_CRON = '30 4 * * *';
/** Délai d'un appel à OpenRouter. */
export const MODEL_STATS_TIMEOUT_MS = 20_000;

/** Préfixe OpenRouter de chaque fournisseur de la plateforme (OpenRouter : identifiant déjà complet). */
export const OPENROUTER_PREFIX: Record<string, string> = { anthropic: 'anthropic', openai: 'openai', google: 'google', mistral: 'mistralai', cohere: 'cohere', xai: 'x-ai', deepseek: 'deepseek' };

/** Forme comparable d'un identifiant ou d'un nom : minuscules, sans séparateurs ni date finale (claude-haiku-4-5-20251001 → claudehaiku45). */
export const comparable = (s: string) => String(s).toLowerCase().replace(/[-_.]?\d{8}$|-\d{4}-\d{2}-\d{2}$/, '').replace(/[^a-z0-9]/g, '');

export interface OpenRouterModel { id: string; name: string; canonical_slug?: string }

/**
 * Modèle OpenRouter correspondant à un modèle de la plateforme : identifiant saisi, sinon identifiant chez le
 * fournisseur (OpenRouter : tel quel ; autres : préfixe du fournisseur + identifiant), sinon nom affiché.
 */
export function matchOpenRouter(list: OpenRouterModel[], m: { providerId: string; providerModelId: string | null; name: string; openrouterId: string | null }): OpenRouterModel | null {
  if (m.openrouterId) return list.find((x) => x.id === m.openrouterId) ?? null;
  if (m.providerId === 'openrouter') return m.providerModelId ? list.find((x) => x.id === m.providerModelId) ?? null : null;
  const prefix = OPENROUTER_PREFIX[m.providerId];
  if (!prefix) return null;
  const mine = list.filter((x) => x.id.startsWith(prefix + '/') && !x.id.includes(':'));
  const byId = m.providerModelId ? mine.find((x) => comparable(x.id.split('/')[1]) === comparable(m.providerModelId!)) : undefined;
  return byId ?? mine.find((x) => comparable(x.name.split(': ').pop() ?? x.name) === comparable(m.name)) ?? null;
}

export interface SessionCostData { harnesses: Array<{ label: string; models: Array<{ model: string; points: Array<{ bucket: string; medianUsd: number }> }> }> }
export interface BenchmarksData { aaData: { intelligence: Array<{ permaslug: string; score: number }> } }
export type PerformanceData = Array<{ slug: string; p50_throughput: number | null }>;

/** Coût médian d'une session de 10 à 49 tours dans Hermes Agent, en dollars ; null si non mesuré. */
export function sessionCostUsd(d: SessionCostData, slug: string): number | null {
  const h = d.harnesses.find((x) => x.label === SESSION_HARNESS);
  const p = h?.models.find((x) => x.model === slug)?.points.find((x) => x.bucket === SESSION_BUCKET);
  return p ? p.medianUsd : null;
}

/** Intelligence Index d'Artificial Analysis ; null si non évalué. */
export const intelligenceIndex = (d: BenchmarksData, slug: string): number | null => d.aaData.intelligence.find((x) => x.permaslug === slug)?.score ?? null;

/** Débit médian du meilleur fournisseur (tokens/s, arrondi) ; null sans mesure. */
export function throughputOf(d: PerformanceData, slug: string): number | null {
  const v = d.find((x) => x.slug === slug)?.p50_throughput;
  return typeof v === 'number' && v > 0 ? Math.round(v) : null;
}

/** Coût d'une session en euros (publié en dollars), quatre décimales. */
export const sessionEur = (usd: number, usdPerEur: number) => Math.round((usd / usdPerEur) * 10_000) / 10_000;
