import { setup, TestCtx, WHO } from '../helpers';

const R = '/api/projects/RISE';

// Priorité des actions et des tâches (16/10/2026) : quatre niveaux (Critique ajouté), priorité des tâches manuelles,
// priorité dans « Mes tâches » ; problème créé par « Saisir sans Jev » (né d'un risque).
describe('Priorité des actions et des tâches ; problème', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('action : priorité Critique acceptée, libellé « Critique » au bootstrap ; valeur inconnue refusée', async () => {
    const c = await t.as(WHO.pmo);
    const a = (await c.post(`${R}/actions`, { n: 'Recette de bout en bout', owner: 'p01', wsIds: ['C3'], dueIso: '2026-11-20', prio: 'CRITICAL', sourceType: 'RISK', sourceId: 'R03' }).expect(201)).body;
    expect(a.prio).toBe('CRITICAL');
    await c.post(`${R}/actions`, { n: 'Autre', owner: 'p01', wsIds: ['C3'], prio: 'URGENT' }).expect(400);
    const b = (await c.get(`${R}/bootstrap`).expect(200)).body;
    expect(b.actions.find((x: any) => x.id === a.id).prio).toBe('Critique');
    await c.patch(`${R}/actions/${a.id}`, { prio: 'LOW' }).expect(200);
    expect((await t.db.action.findUniqueOrThrow({ where: { id: a.id } })).prio).toBe('LOW');
  });

  it('tâche : priorité à la création (Moyenne par défaut), modifiable, dans « Mes tâches »', async () => {
    const c = await t.as(WHO.pmo);
    const d = (await c.post(`${R}/tasks`, { title: 'Sans priorité' }).expect(201)).body;
    expect(d.prio).toBe('MEDIUM');
    const k = (await c.post(`${R}/tasks`, { title: 'Relire le cahier de recette', prio: 'HIGH' }).expect(201)).body;
    expect(k.prio).toBe('HIGH');
    await c.patch(`${R}/tasks/${k.id}`, { prio: 'CRITICAL' }).expect(200);
    await c.post(`${R}/tasks`, { title: 'X', prio: 'HAUTE' }).expect(400);
    const mine = (await c.get(`${R}/me/tasks`).expect(200)).body;
    expect(mine.find((x: any) => x.id === k.id).prio).toBe('CRITICAL');
    expect(mine.filter((x: any) => x.kind === 'MILESTONE').every((x: any) => x.prio === null)).toBe(true);
    expect(mine.filter((x: any) => x.kind === 'ACTION').every((x: any) => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(x.prio))).toBe(true);
  });

  it('problème né d’un risque : sévérité, chantier, porteur, impact', async () => {
    const c = await t.as(WHO.pmo);
    const p = (await c.post(`${R}/issues`, { n: 'Environnement de recette indisponible', sev: 4, owner: 'p01', wsId: 'C3', originRiskId: 'R03', detail: 'Recette bloquée', targetIso: '2026-11-05' }).expect(201)).body;
    expect(p).toMatchObject({ sev: 4, wsId: 'C3', originRiskId: 'R03' });
  });
});
