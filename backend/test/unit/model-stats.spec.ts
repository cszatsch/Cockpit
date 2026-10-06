import { benchmarkPct, bestThroughput, comparable, matchOpenRouter, sessionEur } from '../../src/domain/model-stats';

/** Mesures OpenRouter des modèles (06/10/2026). */
describe('Mesures OpenRouter — règles', () => {
  const list = [
    { id: 'anthropic/claude-haiku-4.5', name: 'Anthropic: Claude Haiku 4.5' },
    { id: 'anthropic/claude-sonnet-5', name: 'Anthropic: Claude Sonnet 5' },
    { id: 'mistralai/mistral-small-2603', name: 'Mistral: Mistral Small 4' },
    { id: 'z-ai/glm-5.3-flash', name: 'Z.ai: GLM 5.3 Flash' },
    { id: 'z-ai/glm-5.3-flash:batch', name: 'Z.ai: GLM 5.3 Flash (batch)' },
  ];
  it('identifiant comparable : sans séparateurs ni date finale', () => {
    expect(comparable('claude-haiku-4-5-20251001')).toBe('claudehaiku45');
    expect(comparable('claude-haiku-4.5')).toBe('claudehaiku45');
  });
  it('correspondance : identifiant saisi, OpenRouter tel quel, préfixe du fournisseur, puis nom affiché', () => {
    expect(matchOpenRouter(list, { providerId: 'anthropic', providerModelId: 'claude-haiku-4-5-20251001', name: 'x', openrouterId: null })?.id).toBe('anthropic/claude-haiku-4.5');
    expect(matchOpenRouter(list, { providerId: 'mistral', providerModelId: 'autre', name: 'Mistral Small 4', openrouterId: null })?.id).toBe('mistralai/mistral-small-2603');
    expect(matchOpenRouter(list, { providerId: 'openrouter', providerModelId: 'z-ai/glm-5.3-flash', name: 'x', openrouterId: null })?.id).toBe('z-ai/glm-5.3-flash');
    expect(matchOpenRouter(list, { providerId: 'anthropic', providerModelId: 'x', name: 'x', openrouterId: 'anthropic/claude-sonnet-5' })?.id).toBe('anthropic/claude-sonnet-5');
    expect(matchOpenRouter(list, { providerId: 'inconnu', providerModelId: 'x', name: 'x', openrouterId: null })).toBeNull();
  });
  it('débit : médiane du meilleur fournisseur ; null sans mesure', () => {
    expect(bestThroughput([{ throughput_last_30m: { p50: 23 } }, { throughput_last_30m: { p50: 58.4 } }, { throughput_last_30m: null }])).toBe(58);
    expect(bestThroughput([{ throughput_last_30m: null }])).toBeNull();
  });
  it('score en %, coût de session converti en euros', () => {
    expect(benchmarkPct(0.7533333)).toBe(75.3);
    expect(sessionEur(0.19939614, 1.1403)).toBe(0.1749);
  });
});
