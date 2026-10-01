import { setup, TestCtx, Client, WHO } from '../helpers';
import { LlmService } from '../../src/core/llm.service';
import { LlmClient } from '../../src/core/llm-client';
import { encryptSecret } from '../../src/core/crypto';
import { JEV_SYSTEM_PROMPT } from '../../src/domain/jev-prompt';

const JEV = '/api/admin/assistant/messages';
const SKILLS = '/api/assistant/skills';
const PERSONA = '/api/assistant/persona';

/**
 * Jev de la Console : chaque question passe par la fonction IA `guidage` (spécification IA § 8), avec
 * Identité, Personnalité (Soul) et la skill « Guidage console » dans le prompt système, et les modèles
 * affectés à la fonction (principal, puis secours).
 */
describe('Console — Jev et la fonction guidage', () => {
  let t: TestCtx;
  let admin: Client;
  let spy: jest.SpyInstance;
  const lastCall = () => spy.mock.calls.at(-1)![0] as { functionId: string; prompt: string; system: string; systemTail: string };
  const skill = async (n: string) => (await admin.get(SKILLS).expect(200)).body.find((s: any) => s.n === n);
  const lastUsage = () => t.db.usageRecord.findFirstOrThrow({ where: { functionId: 'guidage' }, orderBy: { at: 'desc' } });

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    // Skills du jeu de démonstration désactivées (dont l’ancien nom « Guider l’utilisateur ») : seules celles du test comptent.
    await t.db.skill.updateMany({ data: { on: false } });
    // La skill de guidage (active) et une autre skill active, qui ne doit jamais partir avec le guidage.
    await admin.post(SKILLS, { n: 'Guidage console', t: '## Objectif\nGuider l’administrateur.', on: false }).expect(201);
    await admin.patch(`${SKILLS}/${(await skill('Guidage console')).id}/active`, { on: true }).expect(200);
    await admin.post(SKILLS, { n: 'Insights', t: '## Objectif\nAnalyser le projet.', on: false }).expect(201);
    await admin.patch(`${SKILLS}/${(await skill('Insights')).id}/active`, { on: true }).expect(200);
  });
  beforeEach(async () => {
    spy = jest.spyOn(t.app.get(LlmService), 'complete');
    await t.db.skill.updateMany({ where: { n: { in: ['Guidage console', 'Guidage Console'] } }, data: { n: 'Guidage console', on: true } });
    await t.db.provider.updateMany({ where: { id: { in: ['anthropic', 'openai'] } }, data: { status: 'OK' } });
    await t.db.modelAssignment.update({ where: { functionId: 'guidage' }, data: { primaryModelId: 'haiku', fallbackModelId: 'gpt5mini' } });
  });
  afterEach(() => {
    spy.mockRestore();
    const client = t.app.get(LlmClient);
    client.live = false;
    client.fetchImpl = (...a) => fetch(...a);
  });
  afterAll(() => t.close());

  describe('référentiel', () => {
    it('fonction console, estimation tant qu’il n’y a pas d’historique, affectation par défaut', async () => {
      const f = (await admin.get('/api/admin/functions').expect(200)).body.functions.find((x: any) => x.id === 'guidage');
      expect(f).toMatchObject({ name: 'Guider l’utilisateur sur la console', short: 'Guidage console', category: 'LLM', scope: 'console', isNew: true, est: { in: 0.9, out: 0.25, req: 800 }, vol: null, budgetLine: 'guidage' });
      const insights = (await admin.get('/api/admin/functions').expect(200)).body.functions.find((x: any) => x.id === 'insights');
      expect(insights).toMatchObject({ scope: 'cockpit', est: null });
      expect(insights.vol).not.toBeNull();
      const a = (await admin.get('/api/admin/assignments').expect(200)).body.find((x: any) => x.functionId === 'guidage');
      expect(a).toMatchObject({ primary: 'haiku', fallback: 'gpt5mini', state: 'NOMINAL', scope: 'console', vol: null });
    });
  });

  describe('prompt système : Identité, Soul, skill « Guidage console », page ouverte', () => {
    it('ordre : prompt de base → Identité → Personnalité → skill de guidage ; page ouverte dans la partie variable ; aucune autre skill', async () => {
      const r = await admin.post(JEV, { context: { section: 'apis' }, text: 'Où règle-t-on le quota d’une carte ?' }).expect(200);
      const call = lastCall();
      expect(call.functionId).toBe('guidage');
      const sys = call.system;
      // Partie variable (après la partie stable mise en cache) : page ouverte, date et heure.
      expect(call.systemTail).toContain('Page de console ouverte : apis · Registre des cartes API');
      expect(sys).not.toContain('Page de console ouverte');
      const idx = ['## Identité', '## Personnalité', '## Skill : Guidage console', '## Mise en forme de la réponse'].map((x) => sys.indexOf(x));
      expect(sys.startsWith(JEV_SYSTEM_PROMPT)).toBe(true);
      expect(idx.every((i) => i > 0)).toBe(true);
      expect([...idx].sort((x, y) => x - y)).toEqual(idx);
      expect(sys).toContain('Guider l’administrateur.');
      expect(sys.match(/## Skill : /g)).toHaveLength(1);
      expect(sys).not.toContain('## Skill : Insights');
      expect(r.body.ai).toEqual({ functionId: 'guidage', modelId: 'haiku', fallbackUsed: false });
    });

    it('Identité et Soul : un Persona enregistré s’applique dès la question suivante', async () => {
      const cur = (await admin.get(PERSONA).expect(200)).body;
      await admin.put(PERSONA, { identity: { ...cur.identity, name: 'Nova', style: 'Sobre et exact', emoji: '🦉' }, soul: '## Qui je suis\nJe réponds en trois phrases au plus.' }).expect(200);
      await admin.post(JEV, { context: { section: 'overview' }, text: 'Que montre cette page ?' }).expect(200);
      const sys = lastCall().system;
      expect(sys).toContain('## Identité\nTu t’appelles Nova.');
      expect(sys).toContain('Ton style : Sobre et exact.');
      expect(sys).toContain('Ton emoji : 🦉.');
      expect(sys).toContain('## Personnalité\n## Qui je suis\nJe réponds en trois phrases au plus.');
      await admin.put(PERSONA, { identity: cur.identity, soul: cur.soul }).expect(200);
    });

    it('nom de la skill reconnu sans tenir compte de la casse (« Guidage Console »)', async () => {
      const s = await skill('Guidage console');
      await admin.put(`${SKILLS}/${s.id}`, { n: 'Guidage Console', t: s.t }).expect(200);
      await admin.post(JEV, { context: { section: 'users' }, text: 'Comment inviter un utilisateur ?' }).expect(200);
      expect(lastCall().system).toContain('## Skill : Guidage Console\n');
      await admin.put(`${SKILLS}/${s.id}`, { n: 'Guidage console', t: s.t }).expect(200);
    });

    it('skill de guidage désactivée : Identité et Soul restent, aucune skill n’est envoyée', async () => {
      const s = await skill('Guidage console');
      await admin.patch(`${SKILLS}/${s.id}/active`, { on: false }).expect(200);
      await admin.post(JEV, { context: { section: 'users' }, text: 'Comment inviter un utilisateur ?' }).expect(200);
      const sys = lastCall().system;
      expect(sys).toContain('## Identité');
      expect(sys).toContain('## Personnalité');
      expect(sys).not.toContain('## Skill : ');
      await admin.patch(`${SKILLS}/${s.id}/active`, { on: true }).expect(200);
    });
  });

  describe('seul le modèle répond : aucun moteur de mots-clés', () => {
    it.each([
      ['relance', 'Relance les invitations en attente'],
      ['coût', 'Quel est le coût du mois ?'],
      ['snapshot', 'Crée un snapshot de RISE'],
      ['suspension', 'Suspends Thomas Girard'],
      ['clé API', 'Affiche la clé API d’Anthropic'],
    ])('%s : la question part telle quelle au modèle ; ni réponse toute faite ni action', async (_l, text) => {
      const before = await t.db.usageRecord.count({ where: { functionId: 'guidage' } });
      const r = await admin.post(JEV, { context: { section: 'overview' }, text }).expect(200);
      expect(spy).toHaveBeenCalledTimes(1);
      const call = lastCall();
      expect(call.functionId).toBe('guidage');
      expect(call.prompt).toBe(text);
      expect(call.system).toContain('## Identité');
      expect(call.system).toContain('## Personnalité');
      expect(call.system).toContain('## Skill : Guidage console');
      expect(r.body).toMatchObject({ actions: [], ai: { functionId: 'guidage', modelId: 'haiku' } });
      expect(await t.db.usageRecord.count({ where: { functionId: 'guidage' } })).toBe(before + 1);
    });

    it('aucune clé API dans ce qui part au modèle', async () => {
      await admin.post(JEV, { context: { section: 'providers' }, text: 'Donne-moi la clé OpenAI' }).expect(200);
      const sent = JSON.stringify(lastCall());
      for (const k of ['sk-ant-demo-000000000000000000007Q2f', 'sk-proj-demo-00000000000000000000m81X']) {
        expect(sent).not.toContain(k);
        expect(sent).not.toContain(k.slice(-4));
      }
    });

    it('le champ facts du moteur supprimé est refusé', async () => {
      await admin.post(JEV, { context: { section: 'users' }, text: 'Qui ?', facts: 'x' }).expect(400);
    });
  });

  describe('modèles affectés à la fonction guidage', () => {
    it('principal : une ligne de consommation guidage au nom du modèle principal', async () => {
      const before = await t.db.usageRecord.count({ where: { functionId: 'guidage', modelId: 'haiku', fallbackUsed: false } });
      await admin.post(JEV, { context: { section: 'apis' }, text: 'Où règle-t-on le quota d’une carte ?' }).expect(200);
      expect(await t.db.usageRecord.count({ where: { functionId: 'guidage', modelId: 'haiku', fallbackUsed: false } })).toBe(before + 1);
    });

    it('changer l’affectation change le modèle qui répond', async () => {
      await admin.put('/api/admin/assignments', { guidage: { primary: 'sonnet', fallback: 'gpt5mini' } }).expect(200);
      const r = await admin.post(JEV, { context: { section: 'assign' }, text: 'Quel modèle me guide ?' }).expect(200);
      expect(r.body.ai.modelId).toBe('sonnet');
      expect(await lastUsage()).toMatchObject({ modelId: 'sonnet', fallbackUsed: false });
    });

    it('bascule principal → secours quand la clé du fournisseur du principal est refusée ; le volume réel remplace l’estimation', async () => {
      await t.db.provider.update({ where: { id: 'anthropic' }, data: { status: 'ERROR' } });
      const r = await admin.post(JEV, { context: { section: 'overview' }, text: 'Comment configurer une clé ?' }).expect(200);
      expect(r.body.ai).toEqual({ functionId: 'guidage', modelId: 'gpt5mini', fallbackUsed: true });
      expect(await lastUsage()).toMatchObject({ modelId: 'gpt5mini', fallbackUsed: true });
      const a = (await admin.get('/api/admin/assignments').expect(200)).body.find((x: any) => x.functionId === 'guidage');
      expect(a.state).toBe('FALLBACK');
      const f = (await admin.get('/api/admin/functions').expect(200)).body.functions.find((x: any) => x.id === 'guidage');
      expect(f.vol).not.toBeNull();
      expect(f.vol.in).toBeGreaterThan(0);
    });

    it('aucun modèle disponible : le motif, sans réponse toute faite ni consommation', async () => {
      await t.db.provider.updateMany({ where: { id: { in: ['anthropic', 'openai'] } }, data: { status: 'ERROR' } });
      const before = await t.db.usageRecord.count({ where: { functionId: 'guidage' } });
      for (const text of ['Que montre cette page ?', 'Quel est le coût du mois ?']) {
        const r = await admin.post(JEV, { context: { section: 'overview' }, text }).expect(200);
        expect(r.body).toMatchObject({ ai: null, actions: [] });
        expect(r.body.reply).toMatch(/^Je ne peux pas répondre pour l’instant : .*ni le modèle principal ni le secours/);
      }
      expect(await t.db.usageRecord.count({ where: { functionId: 'guidage' } })).toBe(before);
    });
  });

  describe('génération réelle chez le fournisseur (double de fetch, sans sortir sur Internet)', () => {
    type Req = { url: string; headers: Record<string, string>; body: any };
    const reqs: Req[] = [];
    const live = (answer: (r: Req) => { status: number; json: unknown }) => {
      reqs.length = 0;
      const client = t.app.get(LlmClient);
      client.live = true;
      client.fetchImpl = (async (url: string, init: any) => {
        const r = { url, headers: init.headers, body: JSON.parse(init.body) };
        reqs.push(r);
        const a = answer(r);
        return new Response(JSON.stringify(a.json), { status: a.status, headers: { 'Content-Type': 'application/json' } });
      }) as any;
    };
    const anthropicOk = { status: 200, json: { content: [{ type: 'text', text: 'Ouvrez « Registre des cartes API », puis la carte.' }], usage: { input_tokens: 1234, output_tokens: 56 } } };

    beforeEach(async () => {
      await t.db.provider.update({ where: { id: 'anthropic' }, data: { keyCipher: encryptSecret('sk-ant-test-0000000000000000AbCd') } });
      await t.db.provider.update({ where: { id: 'openai' }, data: { keyCipher: encryptSecret('sk-proj-test-000000000000000WxYz') } });
    });

    it('le principal (Anthropic) reçoit le prompt système de la Console et la question ; jetons du fournisseur tracés', async () => {
      live(() => anthropicOk);
      const r = await admin.post(JEV, { context: { section: 'apis' }, text: 'Où règle-t-on le quota d’une carte ?' }).expect(200);
      expect(r.body).toMatchObject({ reply: 'Ouvrez « Registre des cartes API », puis la carte.', ai: { functionId: 'guidage', modelId: 'haiku', fallbackUsed: false } });
      expect(reqs).toHaveLength(1);
      const q = reqs[0];
      expect(q.url).toBe('https://api.anthropic.com/v1/messages');
      expect(q.headers['x-api-key']).toBe('sk-ant-test-0000000000000000AbCd');
      expect(q.body.model).toBe('haiku');
      // Partie stable marquée pour le cache, partie variable ensuite.
      expect(q.body.system).toEqual([{ type: 'text', text: lastCall().system, cache_control: { type: 'ephemeral' } }, { type: 'text', text: lastCall().systemTail }]);
      expect(q.body.system[0].text).toContain('## Identité');
      expect(q.body.system[0].text).toContain('## Personnalité');
      expect(q.body.system[0].text).toContain('## Skill : Guidage console');
      expect(q.body.messages).toEqual([{ role: 'user', content: 'Où règle-t-on le quota d’une carte ?' }]);
      expect(q.body.max_tokens).toBe(1024);
      expect(await lastUsage()).toMatchObject({ modelId: 'haiku', tokensIn: 1234, tokensOut: 56, fallbackUsed: false });
    });

    it('identifiant du modèle chez le fournisseur utilisé s’il est renseigné', async () => {
      await t.db.aiModel.update({ where: { id: 'haiku' }, data: { providerModelId: 'claude-haiku-4-5-20251001' } });
      live(() => anthropicOk);
      await admin.post(JEV, { context: { section: 'apis' }, text: 'Bonjour' }).expect(200);
      expect(reqs[0].body.model).toBe('claude-haiku-4-5-20251001');
      await t.db.aiModel.update({ where: { id: 'haiku' }, data: { providerModelId: null } });
    });

    it('le principal échoue à l’appel : le secours (OpenAI) répond, avec le même prompt système', async () => {
      live((r) => (r.url.includes('anthropic') ? { status: 529, json: { error: { message: 'Overloaded' } } } : { status: 200, json: { choices: [{ message: { content: 'Réponse du secours.' } }], usage: { prompt_tokens: 900, completion_tokens: 20 } } }));
      const r = await admin.post(JEV, { context: { section: 'overview' }, text: 'Que montre cette page ?' }).expect(200);
      expect(r.body).toMatchObject({ reply: 'Réponse du secours.', ai: { modelId: 'gpt5mini', fallbackUsed: true } });
      expect(reqs.map((x) => x.url)).toEqual(['https://api.anthropic.com/v1/messages', 'https://api.openai.com/v1/chat/completions']);
      const o = reqs[1];
      expect(o.headers.Authorization).toBe('Bearer sk-proj-test-000000000000000WxYz');
      expect(o.body.messages[0]).toEqual({ role: 'system', content: reqs[0].body.system[0].text });
      expect(o.body.messages[1]).toEqual({ role: 'system', content: reqs[0].body.system[1].text });
      expect(o.body.messages[2]).toEqual({ role: 'user', content: 'Que montre cette page ?' });
      expect(o.body.max_completion_tokens).toBe(1024);
      expect(await lastUsage()).toMatchObject({ modelId: 'gpt5mini', tokensIn: 900, tokensOut: 20, fallbackUsed: true });
    });

    it('mémoire : le 2e message part avec le 1er échange, chez le principal comme chez le secours ; jetons du cache facturés au tarif du cache', async () => {
      const cached = { status: 200, json: { content: [{ type: 'text', text: 'RISE est le projet de transformation d’AMC Corp.' }], usage: { input_tokens: 1000, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0, output_tokens: 50 } } };
      live(() => cached);
      const a = (await admin.post(JEV, { context: { section: 'overview' }, text: 'Parle-moi du projet RISE.' }).expect(200)).body;
      // Jetons envoyés : 10 000 ; facturés : 1 000 + 9 000 × 0,1 = 1 900 (cache lu à 0,1 × le prix d'entrée).
      const u = await lastUsage();
      expect(u.tokensIn).toBe(10000);
      expect(Number(u.costEur)).toBeCloseTo((1900 * Number(u.priceIn) + 50 * Number(u.priceOut)) / 1e6, 6);

      live((r) => (r.url.includes('anthropic') ? { status: 529, json: { error: { message: 'Overloaded' } } } : { status: 200, json: { choices: [{ message: { content: 'Il couvre la finance et les achats.' } }], usage: { prompt_tokens: 900, completion_tokens: 20 } } }));
      await admin.post(JEV, { context: { section: 'overview' }, text: 'Et son périmètre ?', conversationId: a.conversationId }).expect(200);
      const past = [{ role: 'user', content: 'Parle-moi du projet RISE.' }, { role: 'assistant', content: 'RISE est le projet de transformation d’AMC Corp.' }];
      expect(reqs[0].body.messages).toEqual([...past, { role: 'user', content: 'Et son périmètre ?' }]);
      // Secours : partie stable, historique, partie variable, question.
      expect(reqs[1].body.messages.slice(1, 3)).toEqual(past);
      expect(reqs[1].body.messages[3].role).toBe('system');
      expect(reqs[1].body.messages[4]).toEqual({ role: 'user', content: 'Et son périmètre ?' });
    });

    it('principal et secours échouent : motif affiché, sans la clé, sans consommation', async () => {
      // Chaque fournisseur renvoie la clé reçue dans son message d’erreur : elle doit être masquée.
      live((q) => ({ status: 401, json: { error: { message: `invalid key ${q.headers['x-api-key'] ?? q.headers.Authorization.slice(7)}` } } }));
      const before = await t.db.usageRecord.count({ where: { functionId: 'guidage' } });
      const r = await admin.post(JEV, { context: { section: 'overview' }, text: 'Que montre cette page ?' }).expect(200);
      expect(r.body.ai).toBeNull();
      expect(r.body.reply).toMatch(/^Je ne peux pas répondre pour l’instant : Fonction Guidage console indisponible : Anthropic · 401/);
      expect(r.body.reply).toContain('secours : OpenAI · 401');
      expect(JSON.stringify(r.body)).not.toContain('0000000000000000AbCd');
      expect(JSON.stringify(r.body)).not.toContain('000000000000000WxYz');
      expect(await t.db.usageRecord.count({ where: { functionId: 'guidage' } })).toBe(before);
    });

    it('les autres fonctions gardent le bouchon (aucun appel sortant)', async () => {
      live(() => anthropicOk);
      await t.app.get(LlmService).complete({ functionId: 'rapports', prompt: 'Bonjour', source: 'COCKPIT' });
      expect(reqs).toHaveLength(0);
    });
  });
});
