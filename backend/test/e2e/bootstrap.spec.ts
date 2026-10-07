import path from 'path';
import { weightedProgress } from '../../src/domain/progress-rollup';
import { setup, TestCtx, WHO } from '../helpers';
import { loadDataModule } from '../../prisma/seed/source';

const R = '/api/projects/RISE';
const dir = path.join(__dirname, '../../../frontends');

describe('Étape 3 (brief § 13.3) — amorçage et GET /bootstrap', () => {
  let t: TestCtx;
  let rise: Record<string, any>;
  let plan: Record<string, any>;
  beforeAll(async () => {
    t = await setup();
    rise = loadDataModule(path.join(dir, 'rise-data.js'));
    plan = loadDataModule(path.join(dir, 'planning-data.js'));
  });
  afterAll(() => t.close());

  it('renvoie les mêmes clés que les modules', async () => {
    const r = await (await t.as(WHO.pmo)).get(`${R}/bootstrap`).expect(200);
    for (const k of [...Object.keys(rise), ...Object.keys(plan)]) expect(r.body).toHaveProperty(k);
  });

  it('mêmes cardinalités (9 jalons, 6 risques, 47 séances, 107 livrables, 38 personnes…)', async () => {
    const b = (await (await t.as(WHO.pmo)).get(`${R}/bootstrap`).expect(200)).body;
    expect(b.milestones).toHaveLength(9);
    expect(b.risks).toHaveLength(6);
    expect(b.sessions).toHaveLength(47);
    expect(b.model.DELIVERABLE.rows).toHaveLength(107);
    expect(b.model.PERSON.rows).toHaveLength(38);
    expect(b.people).toHaveLength(rise.people.length);
    expect(b.habilitations).toHaveLength(41);
    for (const k of ['issues', 'actions', 'decisions', 'reports', 'documents', 'mission', 'workstreams', 'volets', 'anomalies'] as const) {
      if (k === 'anomalies') continue; // recalculées (§ 7.13)
      expect([k, b[k].length]).toEqual([k, rise[k].length]);
    }
    for (const k of Object.keys(rise.model)) expect([k, b.model[k].rows.length]).toEqual([k, k === 'PROJECT_ASSIGNMENT' ? b.model[k].rows.length : rise.model[k].rows.length]);
    expect(b.phases).toHaveLength(plan.phases.length);
    expect(b.subphases).toHaveLength(plan.subphases.length);
    expect(b.chantiers).toHaveLength(plan.chantiers.length);
    expect(b.barometre.months).toEqual(rise.barometre.months);
    expect(b.barometre.domains.map((d: any) => d.series)).toEqual(rise.barometre.domains.map((d: any) => d.series));
  });

  it('champs calculés et correspondance avec les valeurs d’origine', async () => {
    const b = (await (await t.as(WHO.pmo)).get(`${R}/bootstrap`).expect(200)).body;
    expect(b.today).toBe('2026-09-26');
    expect(b.me).toEqual({ personId: 'p01', firstName: 'Robin', lastName: 'Lefèvre' });
    expect(b.milestones.map((m: any) => m.confirmedDays)).toEqual(rise.milestones.map((m: any) => m.confirmedDays));
    expect(b.milestones.map((m: any) => m.planned)).toEqual(rise.milestones.map((m: any) => m.planned));
    const dm = (id: string) => b.model.PHASE.rows.find((r: any) => r.id === id).cells;
    expect(b.model.PHASE.rows.map((r: any) => r.cells)).toEqual(rise.model.PHASE.rows.map((r: any) => r.cells));
    expect(dm('P5')).toEqual(['5', 'Deploy', 'Lot 1', '02/2026', '30/06/2027', 'En cours']);
    expect(b.model.SUBPHASE.rows.map((r: any) => r.cells)).toEqual(rise.model.SUBPHASE.rows.map((r: any) => r.cells));
    expect(b.model.WAVE.rows.map((r: any) => r.cells)).toEqual(rise.model.WAVE.rows.map((r: any) => r.cells));
    // Début et fin des chantiers (07/10/2026) : 8e et 9e cellules, absentes des données d'origine.
    expect(b.model.WORKSTREAM.rows.map((r: any) => r.cells.slice(0, 7))).toEqual(rise.model.WORKSTREAM.rows.map((r: any) => r.cells));
    expect(b.model.WORKSTREAM.rows.every((r: any) => r.cells.slice(7).every((c: string) => /^\d{2}\/\d{2}\/\d{4}$|^$/.test(c)))).toBe(true);
    expect(b.model.WORKSTREAM.cols.slice(-3)).toEqual(['sous-phases', 'début', 'fin']);
    expect(b.model.WORKSTREAM.rows.map((r: any) => r.waves)).toEqual(rise.model.WORKSTREAM.rows.map((r: any) => r.waves));
    expect(b.model.GOVERNANCE_BODY.rows.map((r: any) => [r.cells, r.members, r.color])).toEqual(rise.model.GOVERNANCE_BODY.rows.map((r: any) => [r.cells, r.members, r.color]));
    expect(b.model.DELIVERABLE.rows.map((r: any) => r.cells)).toEqual(rise.model.DELIVERABLE.rows.map((r: any) => r.cells));
    expect(b.model.ROLE.rows.map((r: any) => r.cells[0])).toEqual(rise.model.ROLE.rows.map((r: any) => r.cells[0]));
    expect(b.model.TEAM.rows.map((r: any) => r.cells.slice(1))).toEqual(rise.model.TEAM.rows.map((r: any) => r.cells.slice(1)));
    // « COPIL 26 sept. » (R03) devient une date : le libellé affiché est « 26 sept. » (le risque n'a pas de séance cible dans le modèle).
    expect(b.risks.map((r: any) => [r.id, r.due])).toEqual(rise.risks.map((r: any) => [r.id, String(r.due).replace(/^COPIL /, '')]));
    expect(b.actions.map((a: any) => [a.id, a.due, a.prio, a.source])).toEqual(rise.actions.map((a: any) => [a.id, a.due, a.prio, a.source]));
    expect(b.sessions).toEqual(rise.sessions.map((s: any) => expect.objectContaining(s)));
    expect(b.chantiers.map((c: any) => [c.id, c.start, c.end, c.reel, c.owner, c.phases])).toEqual(plan.chantiers.map((c: any) => [c.id, c.start, c.end, c.reel, c.owner, c.phases]));
    // Phase avec sous-phases : avancement = moyenne de ses sous-phases pondérée par leur durée (07/10/2026).
    const rolled = (ph: any) => weightedProgress(plan.subphases.filter((x: any) => x.ph === ph.id).map((x: any) => ({ startDate: x.start, endDate: x.end, progressPct: x.reel }))) ?? ph.reel;
    expect(b.phases.map((c: any) => [c.id, c.start, c.end, c.reel, c.owner])).toEqual(plan.phases.map((c: any) => [c.id, c.start, c.end, rolled(c), c.owner]));
    expect(b.templates.map((x: any) => [x.id, x.published, x.comps.length])).toEqual([
      ['T1', '12 juillet 2026', 5], ['T2', '3 août 2026', 2], ['T3', '20 juin 2026', 4], ['T4', '8 mai 2026', 3], ['T5', '15 avril 2026', 3], ['T6', '10 mars 2026', 3],
    ]);
    expect(b.tplHistory.map((h: any) => [h.date, h.time])).toEqual([['23 août 2026', '17:42'], ['18 août 2026', '09:15'], ['1 août 2026', '08:30'], ['24 juillet 2026', '18:05']]);
    expect(b.habilitations.find((h: any) => h.personId === 'p02')).toMatchObject({ profile: 'ADMIN' });
  });

  it('filtre le transactionnel par chantier pour un Lecteur (RG8)', async () => {
    const b = (await (await t.as(WHO.lecteurC3)).get(`${R}/bootstrap`).expect(200)).body;
    expect(new Set(b.risks.map((r: any) => r.wsId))).toEqual(new Set(['C3']));
    expect(b.actions.every((a: any) => a.wsId === 'C3')).toBe(true);
    expect(b.model.PHASE.rows).toHaveLength(6);
  });
});
