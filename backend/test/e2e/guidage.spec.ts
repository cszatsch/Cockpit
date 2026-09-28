import { setup, TestCtx, Client, WHO } from '../helpers';
import { LlmService } from '../../src/core/llm.service';
import { JEV_SYSTEM_PROMPT } from '../../src/domain/jev-prompt';

/** Fonction IA « Guider l’utilisateur sur la console » (spécification IA § 8). */
describe('Console — guidage (fonction IA guidage)', () => {
  let t: TestCtx;
  let admin: Client;
  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
  });
  afterAll(() => t.close());

  it('référentiel : fonction console, estimation tant qu’il n’y a pas d’historique, affectation par défaut', async () => {
    const f = (await admin.get('/api/admin/functions').expect(200)).body.functions.find((x: any) => x.id === 'guidage');
    expect(f).toMatchObject({ name: 'Guider l’utilisateur sur la console', short: 'Guidage console', category: 'LLM', scope: 'console', isNew: true, est: { in: 0.9, out: 0.25, req: 800 }, vol: null, budgetLine: 'guidage' });
    const insights = (await admin.get('/api/admin/functions').expect(200)).body.functions.find((x: any) => x.id === 'insights');
    expect(insights).toMatchObject({ scope: 'cockpit', est: null });
    expect(insights.vol).not.toBeNull();
    const a = (await admin.get('/api/admin/assignments').expect(200)).body.find((x: any) => x.functionId === 'guidage');
    expect(a).toMatchObject({ primary: 'haiku', fallback: 'gpt5mini', state: 'NOMINAL', scope: 'console', vol: null });
  });

  it('question à Jev dans la console : fonction guidage, prompt système → persona → skill de guidage → page ouverte ; consommation tracée', async () => {
    const spy = jest.spyOn(t.app.get(LlmService), 'complete');
    await admin.post('/api/assistant/skills', { n: 'Guidage console', t: '## Objectif\nGuider l’administrateur.', on: false }).expect(201);
    const sk = (await admin.get('/api/assistant/skills').expect(200)).body.find((s: any) => s.n === 'Guidage console');
    await admin.patch(`/api/assistant/skills/${sk.id}`, { on: true }).expect(200);
    const before = await t.db.usageRecord.count({ where: { functionId: 'guidage' } });
    await admin.post('/api/admin/assistant/messages', { context: { section: 'apis' }, text: 'Où règle-t-on le quota d’une carte ?' }).expect(200);
    const call = spy.mock.calls.at(-1)![0];
    expect(call.functionId).toBe('guidage');
    const sys = call.system!;
    const idx = ['## Identité', '## Personnalité', '## Skill : Guidage console', '## Page de console ouverte\napis · Registre des cartes API'].map((x) => sys.indexOf(x));
    expect(sys.startsWith(JEV_SYSTEM_PROMPT)).toBe(true);
    expect(idx.every((i) => i > 0)).toBe(true);
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
    // Une seule skill : les autres skills actives ne sont pas envoyées au guidage.
    expect(sys).not.toContain('## Skill : Analyser le projet');
    expect(await t.db.usageRecord.count({ where: { functionId: 'guidage', modelId: 'haiku', fallbackUsed: false } })).toBe(before + 1);
    spy.mockRestore();
  });

  it('bascule principal → secours quand la clé du fournisseur du principal est refusée ; le volume réel remplace l’estimation', async () => {
    await t.db.provider.update({ where: { id: 'anthropic' }, data: { status: 'ERROR' } });
    await admin.post('/api/admin/assistant/messages', { context: { section: 'overview' }, text: 'Comment configurer une clé ?' }).expect(200);
    const last = await t.db.usageRecord.findFirstOrThrow({ where: { functionId: 'guidage' }, orderBy: { at: 'desc' } });
    expect(last).toMatchObject({ modelId: 'gpt5mini', fallbackUsed: true });
    const a = (await admin.get('/api/admin/assignments').expect(200)).body.find((x: any) => x.functionId === 'guidage');
    expect(a.state).toBe('FALLBACK');
    const f = (await admin.get('/api/admin/functions').expect(200)).body.functions.find((x: any) => x.id === 'guidage');
    expect(f.vol).not.toBeNull();
    expect(f.vol.in).toBeGreaterThan(0);
  });
});
