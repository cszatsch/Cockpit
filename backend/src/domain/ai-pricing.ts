/**
 * Tarification des modèles d'IA et coût estimé d'une fonction (spécification IA § 2-3, 28/09/2026).
 * Règles pures, sans base : partagées par l'affectation, la passerelle LLM et les tests.
 */

export type ModelCategory = 'LLM' | 'EMBEDDING' | 'RERANKING';
export type PriceUnit = 'TOKENS' | 'REQUESTS';

/** Tarif d'un modèle : € par million de tokens (entrée, sortie) ou € pour 1 000 requêtes. */
export interface Price {
  unit: PriceUnit;
  in: number | null;
  out: number | null;
  per1k: number | null;
}

/** Volume d'une fonction : tokens en entrée et en sortie, nombre de requêtes. */
export interface Volume {
  tokensIn: number;
  tokensOut: number;
  requests: number;
}

/** Colonnes d'un modèle en base (sous-ensemble utile au calcul). */
export interface PricedModel {
  category: ModelCategory | string;
  priceUnit: PriceUnit | string;
  priceInPerMTok: number | null;
  priceOutPerMTok: number | null;
  pricePer1kRequests: number | null;
}

export function priceOf(m: PricedModel): Price {
  return { unit: m.priceUnit === 'REQUESTS' ? 'REQUESTS' : 'TOKENS', in: m.priceInPerMTok, out: m.priceOutPerMTok, per1k: m.pricePer1kRequests };
}

/** Coût d'un volume au tarif d'un modèle : tokens × € / M, ou requêtes / 1 000 × € / 1 000 requêtes. */
export function costOf(m: PricedModel, v: Volume): number {
  const p = priceOf(m);
  if (p.unit === 'REQUESTS') return (v.requests / 1000) * (p.per1k ?? 0);
  return (v.tokensIn * (p.in ?? 0) + v.tokensOut * (p.out ?? 0)) / 1e6;
}

/**
 * Tarif cohérent avec la catégorie (le formulaire s'adapte, le serveur fait foi) :
 * - LLM : au token, entrée et sortie obligatoires ;
 * - Embedding : au token, entrée seule (pas de sortie) ;
 * - Reranking : à la requête (€ / 1 000 requêtes) ou au token (entrée seule).
 * Renvoie le tarif normalisé (champs sans objet mis à null) ou les erreurs par champ.
 */
export function normalizePrice(category: ModelCategory, p: Partial<Price>): { price: Price } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const unit: PriceUnit = category === 'RERANKING' && p.unit === 'REQUESTS' ? 'REQUESTS' : 'TOKENS';
  if (category !== 'RERANKING' && p.unit === 'REQUESTS') errors['price.unit'] = 'Tarif à la requête réservé au Reranking';
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (unit === 'REQUESTS') {
    if (!ok(p.per1k)) errors['price.per1k'] = 'Tarif obligatoire (€ / 1 000 requêtes)';
  } else {
    if (!ok(p.in)) errors['price.in'] = 'Tarif d’entrée obligatoire (€ / M tokens)';
    if (category === 'LLM' && !ok(p.out)) errors['price.out'] = 'Tarif de sortie obligatoire (€ / M tokens)';
  }
  if (Object.keys(errors).length) return { errors };
  return {
    price: unit === 'REQUESTS'
      ? { unit, in: null, out: null, per1k: p.per1k! }
      : { unit, in: p.in!, out: category === 'LLM' ? p.out! : null, per1k: null },
  };
}

/** Seuils d'ancienneté d'un modèle (mois depuis sa sortie) : < 12 récent, 12 à 24 à surveiller, > 24 ancien. */
export const MODEL_AGE_WATCH_MONTHS = 12;
export const MODEL_AGE_OLD_MONTHS = 24;

export function modelAgeMonths(releaseIso: string, todayIso: string): number {
  const [ry, rm, rd] = releaseIso.split('-').map(Number);
  const [ty, tm, td] = todayIso.split('-').map(Number);
  return Math.max(0, (ty - ry) * 12 + tm - rm - (td < rd ? 1 : 0));
}

export function modelAgeTier(months: number): 'RECENT' | 'WATCH' | 'OLD' {
  return months < MODEL_AGE_WATCH_MONTHS ? 'RECENT' : months <= MODEL_AGE_OLD_MONTHS ? 'WATCH' : 'OLD';
}

/** État d'une étape de chaîne : une étape indisponible suspend toutes les suivantes (un secours en service ne bloque pas). */
export type StepState = 'NOMINAL' | 'FALLBACK' | 'UNAVAILABLE' | 'BLOCKED';

export function chainStates(ordered: Array<'NOMINAL' | 'FALLBACK' | 'UNAVAILABLE'>): StepState[] {
  let stopped = false;
  return ordered.map((s) => {
    if (stopped) return 'BLOCKED';
    if (s === 'UNAVAILABLE') stopped = true;
    return s;
  });
}
