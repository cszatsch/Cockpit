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

// ───────────── Dimensions des modèles d'embedding (28/09/2026) ─────────────

/** Bornes d'une dimension de vecteur. */
export const DIMENSION_MIN = 1;
export const DIMENSION_MAX = 65_536;

/**
 * Dimensions d'un modèle selon sa catégorie : seul un Embedding en a. Liste d'entiers distincts
 * (triés du plus grand au plus petit) et valeur par défaut comprise dans la liste (la première si absente).
 */
export function normalizeDimensions(category: ModelCategory, dims: number[] | null | undefined, def: number | null | undefined): { dimensions: number[]; defaultDimension: number | null } | { errors: Record<string, string> } {
  if (category !== 'EMBEDDING') return { dimensions: [], defaultDimension: null };
  const list = [...new Set(dims ?? [])];
  if (!list.length) return { errors: { dimensions: 'au moins une dimension pour un modèle d’embedding' } };
  if (list.some((d) => !Number.isInteger(d) || d < DIMENSION_MIN || d > DIMENSION_MAX)) return { errors: { dimensions: `entiers de ${DIMENSION_MIN} à ${DIMENSION_MAX}` } };
  list.sort((a, b) => b - a);
  const d = def ?? list[0];
  if (!list.includes(d)) return { errors: { defaultDimension: 'doit faire partie des dimensions proposées' } };
  return { dimensions: list, defaultDimension: d };
}

/** Dimension effective d'une affectation : celle choisie, sinon la valeur par défaut du modèle. */
export function effectiveDimension(chosen: number | null | undefined, model: { defaultDimension: number | null } | null | undefined): number | null {
  return chosen ?? model?.defaultDimension ?? null;
}

/**
 * Réindexation nécessaire : chaque modèle d'embedding a son propre espace vectoriel. Changer de modèle, ou
 * de dimension pour un même modèle, rend les vecteurs déjà calculés incompatibles.
 */
export function reindexRequired(before: { modelId: string | null; dimension: number | null }, after: { modelId: string | null; dimension: number | null }): boolean {
  if (!before.modelId) return false; // aucun vecteur n'a encore été produit par cette fonction
  return before.modelId !== after.modelId || before.dimension !== after.dimension;
}

/** Message affiché à chaque changement de modèle d'embedding ou de dimension (demande du 28/09/2026). */
export const REINDEX_WARNING =
  "Changer de modèle d'embedding oblige à réindexer tous les documents. Chaque modèle a son propre espace vectoriel : les vecteurs de deux modèles différents ne sont pas compatibles, même s'ils ont la même dimension. Sans réindexation, la recherche renverra des résultats faux ou incohérents.";

/**
 * Capacité de sortie (spécification IA § 7) : un LLM couvre une fonction si son max output tokens atteint la sortie
 * requise. Sans modèle, ou sans max output tokens connu, on ne peut pas conclure : considéré comme couvrant.
 */
export function fitsOut(needOut: number, model?: { category: string; maxOutputTokens: number | null } | null): boolean {
  if (!model || model.category !== 'LLM' || model.maxOutputTokens == null) return true;
  return model.maxOutputTokens >= needOut;
}

/** Cours de référence BCE du 25/09/2026 : 1 € = 1,1403 $ (ecb.europa.eu) ; tarifs publiés en dollars convertis en euros. */
export const USD_PER_EUR = 1.1403;
export const USD_PER_EUR_DATE = '2026-09-25';
