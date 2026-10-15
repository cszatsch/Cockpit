import { weightedProgress } from '../../src/domain/progress-rollup';
import { setup, TestCtx, WHO } from '../helpers';

const R = '/api/projects/RISE';

// Avancement d'un chantier rattaché à des sous-phases (15/10/2026) : calculé par le serveur (moyenne pondérée par la durée)
// et enregistré dans Workstream.progressPct, lu tel quel par le bootstrap (Planning, Aujourd'hui, rapports, Jev).
describe('Avancement des chantiers calculé sur leurs sous-phases', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  const expected = async (wsId: string) => {
    const links = await t.db.workstreamSubphase.findMany({ where: { wsId }, include: { subphase: true } });
    return weightedProgress(links.map((l) => l.subphase));
  };
  const stored = async (wsId: string) => (await t.db.workstream.findUniqueOrThrow({ where: { id: wsId } })).progressPct;

  it('liens, avancement des sous-phases, saisie refusée, suppression, bootstrap', async () => {
    const c = await t.as(WHO.pmo);
    const subs = await t.db.subphase.findMany({ where: { projectId: 'RISE', phaseId: 'P5' }, orderBy: { code: 'asc' }, take: 2 });
    expect(subs.length).toBe(2);
    await c.patch(`${R}/planning/subphase/${subs[0].id}`, { progressPct: 40 }).expect(200);
    await c.patch(`${R}/planning/subphase/${subs[1].id}`, { progressPct: 10 }).expect(200);

    // Rattachement des sous-phases : recalcul immédiat.
    const ws = await c.post(`${R}/workstreams`, { name: 'Recette avancement', ownerId: 'p06', phaseIds: ['P5'] }).expect(201);
    expect(await stored(ws.body.id)).toBe(0);
    await c.put(`${R}/workstreams/${ws.body.id}/subphases`, { subphaseIds: subs.map((s) => s.id) }).expect(200);
    const first = await expected(ws.body.id);
    expect(first).not.toBe(0);
    expect(await stored(ws.body.id)).toBe(first);

    // Avancement d'une sous-phase modifié (Planning) : le chantier suit.
    await c.patch(`${R}/planning/subphase/${subs[1].id}`, { progressPct: 90 }).expect(200);
    const second = await expected(ws.body.id);
    expect(second).not.toBe(first);
    expect(await stored(ws.body.id)).toBe(second);

    // Saisie directe refusée, par le Planning comme par le Référentiel.
    const no = await c.patch(`${R}/planning/workstream/${ws.body.id}`, { progressPct: 5 }).expect(400);
    expect(no.body.fields.progressPct).toMatch(/Avancement du chantier calculé/);
    await c.patch(`${R}/workstreams/${ws.body.id}`, { progressPct: 5 }).expect(400);

    // Sous-phase créée avec le chantier (à 0 %) : recalcul ; supprimée : retour à la valeur précédente.
    const sp = await c.post(`${R}/subphases`, { phaseId: 'P5', wsId: ws.body.id, name: 'Sous-phase longue', startDate: '2026-10-01', endDate: '2027-06-30' }).expect(201);
    const third = await expected(ws.body.id);
    expect(third).toBeLessThan(second!);
    expect(await stored(ws.body.id)).toBe(third);
    await c.del(`${R}/subphases/${sp.body.id}`).expect(204);
    expect(await stored(ws.body.id)).toBe(second);

    // Le bootstrap renvoie la valeur enregistrée.
    const b = (await c.get(`${R}/bootstrap`).expect(200)).body;
    expect(b.chantiers.find((x: any) => x.id === ws.body.id).reel).toBe(second);

    // Plus aucune sous-phase : la saisie redevient possible.
    await c.put(`${R}/workstreams/${ws.body.id}/subphases`, { subphaseIds: [] }).expect(200);
    await c.patch(`${R}/planning/workstream/${ws.body.id}`, { progressPct: 12 }).expect(200);
    expect(await stored(ws.body.id)).toBe(12);
  });
});
