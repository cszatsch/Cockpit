import { setup, TestCtx, WHO } from '../helpers';
import { BACKGROUND_DEBOUNCE_MS, ChangeEvent, ChangesService } from '../../src/core/changes';
import { PrismaService } from '../../src/core/prisma.service';

/** Mises à jour en direct (05/10/2026) : chaque écriture réussie est annoncée, avec son projet et l'écran d'origine. */
describe('Mises à jour en direct', () => {
  let t: TestCtx;
  let seen: ChangeEvent[] = [];
  beforeAll(async () => {
    t = await setup();
    // Écritures du démarrage (remise en échec des traitements interrompus) : annonce passée avant l'abonnement.
    await new Promise((r) => setTimeout(r, BACKGROUND_DEBOUNCE_MS + 200));
    t.app.get(ChangesService).subscribe((e) => seen.push(e));
  });
  beforeEach(() => { seen = []; });
  afterAll(() => t.close());

  it('écriture de la Console : annoncée sans projet, avec l’identifiant de l’écran', async () => {
    const c = await t.as(WHO.admin);
    await c.put('/api/admin/providers/mistral/cap', { monthlyCapEur: 25 }).set('X-Client-Id', 'ecran-a').expect(200);
    expect(seen).toEqual([expect.objectContaining({ project: null, client: 'ecran-a' })]);
  });

  it('écriture du Cockpit : annoncée avec son projet ; révision croissante', async () => {
    const c = await t.as(WHO.pmo);
    const s = (await c.post('/api/projects/RISE/sessions', { bodyId: 'g1', dateIso: '2026-10-20' }).expect(201)).body;
    await c.del(`/api/projects/RISE/sessions/${s.id}`).expect(204);
    expect(seen.map((e) => e.project)).toEqual(['RISE', 'RISE']);
    expect(seen[1].rev).toBe(seen[0].rev + 1);
  });

  it('lectures, écritures refusées et écritures sans effet affiché : pas d’annonce', async () => {
    const c = await t.as(WHO.admin);
    await c.get('/api/admin/providers').expect(200);
    await c.put('/api/admin/providers/mistral/cap', { monthlyCapEur: 0 }).expect(400);
    await (await t.as(WHO.pmo)).patch('/api/me/preferences', { theme: 'dark' });
    expect(seen).toEqual([]);
  });

  it('appel à un LLM (Jev du Cockpit) : annoncé comme consommation, avec son projet', async () => {
    await (await t.as(WHO.pmo)).post('/api/projects/RISE/assistant/messages', { context: { space: 'pilotage', tab: 'risques' }, text: 'Quels sont les risques critiques ?' }).expect(200);
    const usage = seen.filter((e) => e.kind === 'usage');
    expect(usage.length).toBeGreaterThanOrEqual(1);
    expect(usage[0].project).toBe('RISE');
    expect(seen.filter((e) => e.kind === 'data')).toEqual([]);
  });

  it('écritures de fond (hors requête : tâche planifiée, traitement détaché) : une annonce regroupée ; mesures en « usage »', async () => {
    const db = t.app.get(PrismaService);
    await db.provider.update({ where: { id: 'mistral' }, data: { latencyMs: 111 } });
    await db.provider.update({ where: { id: 'openai' }, data: { latencyMs: 222 } });
    await db.jevTrace.deleteMany({ where: { id: 'inexistant' } });
    await new Promise((r) => setTimeout(r, BACKGROUND_DEBOUNCE_MS + 300));
    expect(seen).toEqual([expect.objectContaining({ kind: 'data', project: null, client: null })]);
  });
});
