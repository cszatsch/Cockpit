import { chainStates, costOf, effectiveDimension, fitsOut, modelAgeMonths, modelAgeTier, normalizeDimensions, normalizePrice, reindexRequired, REINDEX_WARNING } from '../../src/domain/ai-pricing';

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

describe('Dimensions des modèles d’embedding et réindexation', () => {
  it('seul un Embedding a des dimensions ; liste triée, défaut compris dans la liste', () => {
    expect(normalizeDimensions('LLM', [1024], 1024)).toEqual({ dimensions: [], defaultDimension: null });
    expect(normalizeDimensions('EMBEDDING', [256, 4096, 1024, 1024], 1024)).toEqual({ dimensions: [4096, 1024, 256], defaultDimension: 1024 });
    expect(normalizeDimensions('EMBEDDING', [1024], null)).toEqual({ dimensions: [1024], defaultDimension: 1024 });
    expect(normalizeDimensions('EMBEDDING', [], null)).toMatchObject({ errors: { dimensions: expect.any(String) } });
    expect(normalizeDimensions('EMBEDDING', [512, 0], 512)).toMatchObject({ errors: { dimensions: expect.any(String) } });
    expect(normalizeDimensions('EMBEDDING', [1024, 512], 768)).toMatchObject({ errors: { defaultDimension: expect.any(String) } });
  });

  it('réindexation : changement de modèle ou de dimension, pas pour une première affectation', () => {
    expect(effectiveDimension(null, { defaultDimension: 1024 })).toBe(1024);
    expect(effectiveDimension(512, { defaultDimension: 1024 })).toBe(512);
    expect(reindexRequired({ modelId: null, dimension: null }, { modelId: 'a', dimension: 1024 })).toBe(false);
    expect(reindexRequired({ modelId: 'a', dimension: 1024 }, { modelId: 'a', dimension: 1024 })).toBe(false);
    expect(reindexRequired({ modelId: 'a', dimension: 1024 }, { modelId: 'b', dimension: 1024 })).toBe(true);
    expect(reindexRequired({ modelId: 'a', dimension: 1024 }, { modelId: 'a', dimension: 512 })).toBe(true);
    expect(REINDEX_WARNING).toMatch(/réindexer tous les documents/);
  });
});

describe('Capacité de sortie (génération de rapports)', () => {
  it('un LLM couvre la sortie requise si son max output tokens l’atteint', () => {
    expect(fitsOut(38000, { category: 'LLM', maxOutputTokens: 64000 })).toBe(true);
    expect(fitsOut(38000, { category: 'LLM', maxOutputTokens: 32000 })).toBe(false);
    expect(fitsOut(38000, { category: 'LLM', maxOutputTokens: null })).toBe(true);
    expect(fitsOut(38000, null)).toBe(true);
  });
});

describe('Prompt de Jev : skills (spécification SKILLS § 6)', () => {
  it('base, Persona, puis une section par skill active dans l’ordre de position ; texte tel quel', () => {
    const { assembleJevPrompt, skillLimits } = require('../../src/domain/jev-prompt');
    const skills = [
      { n: 'B', t: '- deux', on: true, position: 2 },
      { n: 'Off', t: 'jamais', on: false, position: 0 },
      { n: 'A', t: '## Titre\n1. un', on: true, position: 1 },
    ];
    expect(assembleJevPrompt('Base', null, skills)).toBe('Base\n\n## Skill : A\n## Titre\n1. un\n\n## Skill : B\n- deux');
    expect(assembleJevPrompt('Base', 'Persona', [])).toBe('Base\n\nPersona');
    expect(skillLimits({ n: 'x'.repeat(61), t: 'y'.repeat(20_001) })).toEqual({ n: expect.any(String), t: expect.any(String) });
    expect(skillLimits({ n: 'x'.repeat(60), t: 'y'.repeat(20_000) })).toEqual({});
  });
});
