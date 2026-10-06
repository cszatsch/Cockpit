import { comparable, intelligenceIndex, matchOpenRouter, sessionCostUsd, sessionEur, throughputOf } from '../../src/domain/model-stats';

/** Mesures OpenRouter des modèles (06/10/2026, page Rankings d'OpenRouter). */
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
  it('coût par session : Hermes Agent, tranche de 10 à 49 tours ; null hors Hermes ou hors tranche', () => {
    const d = { harnesses: [
      { label: 'Claude Code', models: [{ model: 'a/x', points: [{ bucket: 'core', medianUsd: 9 }] }] },
      { label: 'Hermes Agent', models: [{ model: 'z-ai/glm-5.3-flash-20260826', points: [{ bucket: 'single', medianUsd: 0.0009 }, { bucket: 'core', medianUsd: 0.0396 }] }, { model: 'b/y', points: [{ bucket: 'short', medianUsd: 1 }] }] },
    ] };
    expect(sessionCostUsd(d, 'z-ai/glm-5.3-flash-20260826')).toBe(0.0396);
    expect(sessionCostUsd(d, 'a/x')).toBeNull();
    expect(sessionCostUsd(d, 'b/y')).toBeNull();
  });
  it('score : Intelligence Index ; débit : médiane du meilleur fournisseur, arrondie', () => {
    expect(intelligenceIndex({ aaData: { intelligence: [{ permaslug: 'anthropic/claude-opus-5.5-20260921', score: 57.6 }] } }, 'anthropic/claude-opus-5.5-20260921')).toBe(57.6);
    expect(intelligenceIndex({ aaData: { intelligence: [] } }, 'x')).toBeNull();
    expect(throughputOf([{ slug: 'openai/gpt-oss-120b', p50_throughput: 734.5 }], 'openai/gpt-oss-120b')).toBe(735);
    expect(throughputOf([{ slug: 'x', p50_throughput: null }], 'x')).toBeNull();
  });
  it('coût de session converti en euros', () => {
    expect(sessionEur(0.0396, 1.1403)).toBe(0.0347);
  });
});
