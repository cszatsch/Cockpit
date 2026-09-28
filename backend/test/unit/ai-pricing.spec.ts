import { chainStates, costOf, modelAgeMonths, modelAgeTier, normalizePrice } from '../../src/domain/ai-pricing';

describe('Tarification des modèles et chaîne Documents (spécification IA § 3)', () => {
  const m = (o: object) => ({ category: 'LLM', priceUnit: 'TOKENS', priceInPerMTok: null, priceOutPerMTok: null, pricePer1kRequests: null, ...o });

  it('coût : tokens × € / M, ou requêtes / 1 000 × € / 1 000 requêtes', () => {
    expect(costOf(m({ priceInPerMTok: 3, priceOutPerMTok: 15 }), { tokensIn: 2e6, tokensOut: 1e6, requests: 0 })).toBe(21);
    expect(costOf(m({ category: 'EMBEDDING', priceInPerMTok: 0.12 }), { tokensIn: 4.2e6, tokensOut: 0, requests: 0 })).toBeCloseTo(0.504);
    expect(costOf(m({ category: 'RERANKING', priceUnit: 'REQUESTS', pricePer1kRequests: 1.85 }), { tokensIn: 9e6, tokensOut: 0, requests: 3150 })).toBeCloseTo(5.8275);
  });

  it('tarif selon la catégorie : LLM entrée + sortie, Embedding entrée seule, Reranking à la requête ou au token', () => {
    expect(normalizePrice('LLM', { unit: 'TOKENS', in: 1, out: 2 })).toEqual({ price: { unit: 'TOKENS', in: 1, out: 2, per1k: null } });
    expect(normalizePrice('LLM', { unit: 'TOKENS', in: 1 })).toEqual({ errors: { 'price.out': expect.any(String) } });
    expect(normalizePrice('EMBEDDING', { unit: 'TOKENS', in: 0.1, out: 9 })).toEqual({ price: { unit: 'TOKENS', in: 0.1, out: null, per1k: null } });
    expect(normalizePrice('EMBEDDING', { unit: 'REQUESTS', per1k: 1 })).toMatchObject({ errors: { 'price.unit': expect.any(String) } });
    expect(normalizePrice('RERANKING', { unit: 'REQUESTS', per1k: 1.85, in: 4 })).toEqual({ price: { unit: 'REQUESTS', in: null, out: null, per1k: 1.85 } });
    expect(normalizePrice('RERANKING', { unit: 'TOKENS', in: 0.5 })).toEqual({ price: { unit: 'TOKENS', in: 0.5, out: null, per1k: null } });
    expect(normalizePrice('RERANKING', { unit: 'REQUESTS', per1k: -1 })).toMatchObject({ errors: { 'price.per1k': expect.any(String) } });
  });

  it('ancienneté : < 12 mois récent, 12 à 24 à surveiller, > 24 ancien', () => {
    expect(modelAgeMonths('2025-09-29', '2026-09-28')).toBe(11);
    expect(modelAgeMonths('2025-09-28', '2026-09-28')).toBe(12);
    expect(modelAgeTier(11)).toBe('RECENT');
    expect(modelAgeTier(24)).toBe('WATCH');
    expect(modelAgeTier(25)).toBe('OLD');
  });

  it('chaîne : une étape indisponible suspend les suivantes ; un secours en service ne bloque pas', () => {
    expect(chainStates(['NOMINAL', 'UNAVAILABLE', 'NOMINAL'])).toEqual(['NOMINAL', 'UNAVAILABLE', 'BLOCKED']);
    expect(chainStates(['FALLBACK', 'NOMINAL', 'NOMINAL'])).toEqual(['FALLBACK', 'NOMINAL', 'NOMINAL']);
    expect(chainStates(['UNAVAILABLE', 'UNAVAILABLE', 'NOMINAL'])).toEqual(['UNAVAILABLE', 'BLOCKED', 'BLOCKED']);
  });
});
