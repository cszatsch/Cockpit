import { LlmCallError, LlmClient } from '../../src/core/llm-client';

/** Client LLM, protocole compatible OpenAI (OpenRouter) : raisonnement coupé, réponse vide expliquée, lignes de maintien (07/10/2026). */
describe('LlmClient — OpenRouter', () => {
  const calls: any[] = [];
  const client = (answers: Array<{ status: number; body: string }>) => {
    calls.length = 0;
    const c = new LlmClient();
    c.fetchImpl = (async (_u: string, init: any) => {
      calls.push(JSON.parse(init.body));
      const a = answers.shift()!;
      return new Response(a.body, { status: a.status, headers: { 'Content-Type': 'application/json' } });
    }) as any;
    return c;
  };
  const call = { providerId: 'openrouter', providerName: 'OpenRouter', model: 'deepseek/deepseek-v4.1-flash', key: 'sk-or-test-00000000', system: 'S', prompt: 'P', maxTokens: 16000 };
  const ok = (content: string, extra: Record<string, unknown> = {}) => JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 }, ...extra });

  it('raisonnement coupé sur demande (reasoning.enabled = false), absent sinon', async () => {
    const c = client([{ status: 200, body: ok('{"lignes":[]}') }, { status: 200, body: ok('x') }]);
    await c.generate({ ...call, reasoning: 'off' });
    expect(calls[0].reasoning).toEqual({ enabled: false, exclude: true });
    await c.generate(call);
    expect(calls[1].reasoning).toBeUndefined();
  });

  it('modèle au raisonnement obligatoire : refus du réglage → nouvel appel avec une réflexion réduite', async () => {
    const c = client([{ status: 400, body: JSON.stringify({ error: { message: 'Reasoning is mandatory for this endpoint and cannot be disabled' } }) }, { status: 200, body: ok('{"lignes":[]}') }]);
    const r = await c.generate({ ...call, reasoning: 'off' });
    expect(r.text).toBe('{"lignes":[]}');
    expect(calls.map((x) => x.reasoning)).toEqual([{ enabled: false, exclude: true }, { effort: 'low', exclude: true }]);
  });

  it('réponse vide : motif d’arrêt et jetons de raisonnement dans le message', async () => {
    const c = client([{ status: 200, body: JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: { prompt_tokens: 38000, completion_tokens: 16000, completion_tokens_details: { reasoning_tokens: 16000 } } }) }]);
    await expect(c.generate(call)).rejects.toThrow(new LlmCallError('OpenRouter : réponse vide (arrêt : length · raisonnement : 16000 jetons)'));
  });

  it('lignes de maintien d’OpenRouter avant le JSON : réponse lue', async () => {
    const c = client([{ status: 200, body: `: OPENROUTER PROCESSING\n\n: OPENROUTER PROCESSING\n\n${ok('{"lignes":[]}')}` }]);
    expect((await c.generate(call)).text).toBe('{"lignes":[]}');
  });
});
