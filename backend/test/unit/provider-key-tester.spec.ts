import { ProviderKeyTester, probeFor } from '../../src/core/provider-key-tester';

/** Test réel des clés d'API : requête envoyée à chaque fournisseur et lecture de la réponse (fetch simulé). */
describe('ProviderKeyTester', () => {
  const KEY = 'sk-test-0123456789abcdefghij';
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const reply = (status: number, body: unknown) => async (url: any, init?: any) => {
    calls.push({ url: String(url), headers: init.headers });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  const tester = (fetchImpl: any) => Object.assign(new ProviderKeyTester(), { fetchImpl });
  beforeEach(() => (calls.length = 0));

  it('appelle l’API de chaque fournisseur avec son mode d’authentification', async () => {
    const t = tester(reply(200, { data: [] }));
    await t.test('anthropic', 'Anthropic', KEY);
    await t.test('openai', 'OpenAI', KEY);
    await t.test('mistral-ai', 'Mistral AI', KEY);
    await t.test('google', 'Google', KEY);
    expect(calls[0]).toMatchObject({ url: 'https://api.anthropic.com/v1/models?limit=1', headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01' } });
    expect(calls[1]).toMatchObject({ url: 'https://api.openai.com/v1/models', headers: { Authorization: `Bearer ${KEY}` } });
    expect(calls[2]).toMatchObject({ url: 'https://api.mistral.ai/v1/models', headers: { Authorization: `Bearer ${KEY}` } });
    expect(calls[3]).toMatchObject({ url: expect.stringContaining('generativelanguage.googleapis.com'), headers: { 'x-goog-api-key': KEY } });
    expect(calls[3].url).not.toContain(KEY); // clé en en-tête, jamais dans l'adresse
  });

  it('reconnaît les fournisseurs par identifiant ou par nom', () => {
    expect(probeFor('claude', '')?.label).toBe('Anthropic');
    expect(probeFor('fournisseur-1', 'Gemini')?.label).toBe('Google Gemini');
    expect(probeFor('x-ai', 'xAI')?.label).toBe('xAI');
    expect(probeFor('groq', 'Groq')?.label).toBe('Groq');
    expect(probeFor('maison', 'Mon LLM interne')).toBeNull();
  });

  it('2xx : clé valide, latence mesurée', async () => {
    const r = await tester(reply(200, { data: [] })).test('openai', 'OpenAI', KEY);
    expect(r).toMatchObject({ status: 'OK', error: null });
    expect(typeof r.latencyMs).toBe('number');
  });

  it('401 : clé refusée, avec le message du fournisseur et sans la clé', async () => {
    const r = await tester(reply(401, { error: { message: `Incorrect API key provided: ${KEY}.` } })).test('openai', 'OpenAI', KEY);
    expect(r.status).toBe('ERROR');
    expect(r.error).toMatch(/^401 · Clé refusée par OpenAI : Incorrect API key provided/);
    expect(r.error).not.toContain(KEY);
  });

  it('Google répond 400 à une clé invalide : refusée aussi', async () => {
    const r = await tester(reply(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } })).test('google', 'Google', KEY);
    expect(r).toMatchObject({ status: 'ERROR', latencyMs: null });
    expect(r.error).toBe('400 · Clé refusée par Google Gemini : API key not valid. Please pass a valid API key.');
  });

  it('429 : clé reconnue (quota ou débit), donc valide', async () => {
    const r = await tester(reply(429, { error: { message: 'Rate limit reached' } })).test('anthropic', 'Anthropic', KEY);
    expect(r.status).toBe('OK');
    expect(r.error).toMatch(/^429 · Clé valide/);
  });

  it('réseau ou délai : fournisseur injoignable', async () => {
    const down = await tester(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); }).test('mistral', 'Mistral AI', KEY);
    expect(down).toEqual({ status: 'ERROR', latencyMs: null, error: 'Mistral AI injoignable (ENOTFOUND)' });
    const slow = await tester(async () => { throw new DOMException('timeout', 'TimeoutError'); }).test('openai', 'OpenAI', KEY);
    expect(slow.error).toMatch(/délai de 10 s dépassé/);
  });

  it('fournisseur non reconnu : jamais déclaré valide, aucun appel', async () => {
    const r = await tester(reply(200, {})).test('maison', 'Mon LLM interne', KEY);
    expect(r.status).toBe('ERROR');
    expect(r.error).toMatch(/fournisseur non reconnu/);
    expect(calls).toHaveLength(0);
  });
});
