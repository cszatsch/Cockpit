/**
 * Mesures OpenRouter des modèles d'IA (06/10/2026) : score au τ²-Bench Airline (benchmark qu'OpenRouter fait tourner
 * lui-même : sessions de service client multi-tours avec appels d'outils), coût moyen d'une session de ce benchmark,
 * débit médian (P50) du meilleur fournisseur. Règles pures, testées dans `test/unit/model-stats.spec.ts`.
 */

/** API publique d'OpenRouter. */
export const OPENROUTER_API = 'https://openrouter.ai/api/v1';
/** Benchmark retenu : celui d'OpenRouter qui mesure une session complète (précision et coût par tâche). */
export const MODEL_STATS_BENCHMARK = 'tau_bench_verified_airline';
/** Relevé quotidien (heure de Paris du serveur). */
export const MODEL_STATS_CRON = '30 4 * * *';
/** Délai d'un appel à OpenRouter. */
export const MODEL_STATS_TIMEOUT_MS = 20_000;

/** Préfixe OpenRouter de chaque fournisseur de la plateforme (OpenRouter : identifiant déjà complet). */
export const OPENROUTER_PREFIX: Record<string, string> = { anthropic: 'anthropic', openai: 'openai', google: 'google', mistral: 'mistralai', cohere: 'cohere', xai: 'x-ai', deepseek: 'deepseek' };

/** Forme comparable d'un identifiant ou d'un nom : minuscules, sans séparateurs ni date finale (claude-haiku-4-5-20251001 → claudehaiku45). */
export const comparable = (s: string) => String(s).toLowerCase().replace(/[-_.]?\d{8}$|-\d{4}-\d{2}-\d{2}$/, '').replace(/[^a-z0-9]/g, '');

export interface OpenRouterModel { id: string; name: string; canonical_slug?: string; links?: { details?: string } }

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

/** Débit retenu : médiane (P50) du meilleur fournisseur, en tokens/s ; null sans mesure. */
export function bestThroughput(endpoints: Array<{ throughput_last_30m?: { p50?: number | null } | number | null }>): number | null {
  const v = endpoints.map((e) => (typeof e.throughput_last_30m === 'number' ? e.throughput_last_30m : e.throughput_last_30m?.p50 ?? null)).filter((x): x is number => typeof x === 'number' && x > 0);
  return v.length ? Math.round(Math.max(...v)) : null;
}

/** Score affiché : précision en pourcentage, une décimale. */
export const benchmarkPct = (accuracy: number) => Math.round(accuracy * 1000) / 10;
/** Coût d'une session en euros (publié en dollars), quatre décimales. */
export const sessionEur = (usd: number, usdPerEur: number) => Math.round((usd / usdPerEur) * 10_000) / 10_000;
