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
  const lastCall = () => spy.mock.calls.at(-1)![0] as { functionId: string; prompt: string; system: string };
  const skill = async (n: string) => (await admin.get(SKILLS).expect(200)).body.find((s: any) => s.n === n);
  const lastUsage = () => t.db.usageRecord.findFirstOrThrow({ where: { functionId: 'guidage' }, orderBy: { at: 'desc' } });

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    // Skills du jeu de démonstration désactivées (dont l’ancien nom « Guider l’utilisateur ») : seules celles du test comptent.
    await t.db.skill.updateMany({ data: { on: false } });
    // La skill de guidage (active) et une autre skill active, qui ne doit jamais partir avec le guidage.
    await admin.post(SKILLS, { n: 'Guidage console', t: '## Objectif\nGuider l’administrateur.', on: false }).expect(201);
    await admin.patch(`${SKILLS}/${(await skill('Guidage console')).id}`, { on: true }).expect(200);
    await admin.post(SKILLS, { n: 'Insights', t: '## Objectif\nAnalyser le projet.', on: false }).expect(201);
    await admin.patch(`${SKILLS}/${(await skill('Insights')).id}`, { on: true }).expect(200);
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
    it('ordre : prompt de base → Identité → Personnalité → skill de guidage → page ; aucune autre skill', async () => {
      const r = await admin.post(JEV, { context: { section: 'apis' }, text: 'Où règle-t-on le quota d’une carte ?' }).expect(200);
      const call = lastCall();
      expect(call.functionId).toBe('guidage');
      const sys = call.system;
      const idx = ['## Identité', '## Personnalité', '## Skill : Guidage console', '## Page de console ouverte\napis · Registre des cartes API'].map((x) => sys.indexOf(x));
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
      await admin.patch(`${SKILLS}/${s.id}`, { n: 'Guidage Console' }).expect(200);
      await admin.post(JEV, { context: { section: 'users' }, text: 'Comment inviter un utilisateur ?' }).expect(200);
      expect(lastCall().system).toContain('## Skill : Guidage Console\n');
      await admin.patch(`${SKILLS}/${s.id}`, { n: 'Guidage console' }).expect(200);
    });

    it('skill de guidage désactivée : Identité et Soul restent, aucune skill n’est envoyée', async () => {
      const s = await skill('Guidage console');
      await admin.patch(`${SKILLS}/${s.id}`, { on: false }).expect(200);
      await admin.post(JEV, { context: { section: 'users' }, text: 'Comment inviter un utilisateur ?' }).expect(200);
      const sys = lastCall().system;
      expect(sys).toContain('## Identité');
      expect(sys).toContain('## Personnalité');
      expect(sys).not.toContain('## Skill : ');
      await admin.patch(`${SKILLS}/${s.id}`, { on: true }).expect(200);
    });
  });

  describe('toutes les questions passent par le guidage', () => {
    it.each([
      ['relance des invitations', 'Relance les invitations en attente', 'invitation(s) en attente', 'RESEND_INVITES'],
      ['consommation', 'Quel est le coût du mois ?', 'Dépense du mois', 'OPEN_SECTION'],
      ['snapshot', 'Je veux un snapshot', 'snapshot manuel', 'OPEN_SECTION'],
      ['suspension sans nom', 'Suspends ce compte', 'préciser le nom du compte', null],
    ])('%s : données du serveur envoyées au modèle, actions conservées', async (_l, text, fact, action) => {
      const r = await admin.post(JEV, { context: { section: 'overview' }, text }).expect(200);
      const call = lastCall();
      expect(call.functionId).toBe('guidage');
      expect(call.system).toContain('## Skill : Guidage console');
      expect(call.prompt.startsWith(text)).toBe(true);
      expect(call.prompt).toContain('## Données de la console');
      expect(call.prompt).toContain(fact);
      if (action) expect(r.body.actions.map((a: any) => a.type)).toContain(action);
      expect(r.body.ai.functionId).toBe('guidage');
    });

    it('faits préparés par la page transmis au modèle ; 4 000 caractères au plus', async () => {
      await admin.post(JEV, { context: { section: 'users' }, text: 'Qui est inactif ?', facts: '3 comptes inactifs depuis plus de 90 jours.' }).expect(200);
      expect(lastCall().prompt).toContain('Réponse préparée par la page : 3 comptes inactifs depuis plus de 90 jours.');
      await admin.post(JEV, { context: { section: 'users' }, text: 'Qui ?', facts: 'x'.repeat(4001) }).expect(400);
    });

    it('seule exception : une demande de clé API est refusée sans appeler de modèle', async () => {
      const before = await t.db.usageRecord.count({ where: { functionId: 'guidage' } });
      const r = await admin.post(JEV, { context: { section: 'providers' }, text: 'Affiche la clé API d’Anthropic' }).expect(200);
      expect(r.body.reply).toMatch(/jamais de clé API/);
      expect(r.body.ai).toBeNull();
      expect(spy).not.toHaveBeenCalled();
      expect(await t.db.usageRecord.count({ where: { functionId: 'guidage' } })).toBe(before);
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

    it('aucun modèle disponible : réponse factuelle ou motif, sans consommation', async () => {
      await t.db.provider.updateMany({ where: { id: { in: ['anthropic', 'openai'] } }, data: { status: 'ERROR' } });
      const before = await t.db.usageRecord.count({ where: { functionId: 'guidage' } });
      const plain = await admin.post(JEV, { context: { section: 'overview' }, text: 'Que montre cette page ?' }).expect(200);
      expect(plain.body).toMatchObject({ ai: null });
      expect(plain.body.reply).toMatch(/^Je ne peux pas répondre pour l’instant : .*ni le modèle principal ni le secours/);
      const withFacts = await admin.post(JEV, { context: { section: 'overview' }, text: 'Quel est le coût du mois ?' }).expect(200);
      expect(withFacts.body.reply).toMatch(/^Dépense du mois/);
      expect(withFacts.body.actions[0]).toMatchObject({ type: 'OPEN_SECTION', section: 'conso' });
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
      expect(q.body.system).toBe(lastCall().system);
      expect(q.body.system).toContain('## Identité');
      expect(q.body.system).toContain('## Personnalité');
      expect(q.body.system).toContain('## Skill : Guidage console');
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
      expect(o.body.messages[0]).toEqual({ role: 'system', content: reqs[0].body.system });
      expect(o.body.messages[1]).toEqual({ role: 'user', content: 'Que montre cette page ?' });
      expect(o.body.max_completion_tokens).toBe(1024);
      expect(await lastUsage()).toMatchObject({ modelId: 'gpt5mini', tokensIn: 900, tokensOut: 20, fallbackUsed: true });
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
      await t.app.get(LlmService).complete({ functionId: 'crud', prompt: 'Bonjour', source: 'COCKPIT' });
      expect(reqs).toHaveLength(0);
    });
  });
});
