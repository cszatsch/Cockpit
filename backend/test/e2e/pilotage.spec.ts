import { setup, TestCtx, WHO } from '../helpers';

const R = '/api/projects/RISE';

describe('Étapes 4-8 — jalons, pilotage, comités, habilitations, Aujourd’hui', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  describe('Étape 4 — jalons (§ 13.4)', () => {
    it('création sans phase → 400', async () => {
      const c = await t.as(WHO.pmo);
      const r = await c.post(`${R}/milestones`, { n: 'Sans phase', iso: '2026-12-01' }).expect(400);
      expect(r.body.fields.phaseId).toBeDefined();
    });
    it('sous-phase d’une autre phase → 422', async () => {
      const c = await t.as(WHO.pmo);
      const r = await c.post(`${R}/milestones`, { n: 'Mauvaise sous-phase', phaseId: 'P5', subphaseId: 'SP4.5', iso: '2026-12-01' }).expect(422);
      expect(r.body.fields.subphaseId).toBeDefined();
    });
    it('code attribué J10 ; date hors phase → 201 avec avertissement', async () => {
      const c = await t.as(WHO.pmo);
      const r = await c.post(`${R}/milestones`, { n: 'Clôture Lot 1', phaseId: 'P4', iso: '2026-12-01', id: 'x' }).expect(400);
      expect(r.body.fields).toBeDefined();
      const ok = await c.post(`${R}/milestones`, { n: 'Clôture Lot 1', phaseId: 'P4', iso: '2026-12-01' }).expect(201);
      expect(ok.body.code).toBe('J10');
      expect(ok.body.warnings[0]).toMatch(/sort de la période de la phase/);
      expect(ok.body.baselineIso).toBe('2026-12-01');
      expect(ok.body.gap).toBe(0);
    });
    it('modifier la date prévue remet la confirmation à maintenant et calcule l’écart', async () => {
      const c = await t.as(WHO.pmo);
      const before = await c.get(`${R}/milestones/J03`).expect(200);
      expect(before.body.confirmedDays).toBe(19);
      const r = await c.patch(`${R}/milestones/J03`, { iso: '2026-10-20' }).expect(200);
      expect(r.body.gap).toBe(5);
      expect(r.body.confirmedDays).toBe(0);
    });
  });

  describe('Étape 5 — pilotage (§ 13.5)', () => {
    it('fiche D-007 (ARBITRATED) modifiée → 409', async () => {
      const c = await t.as(WHO.pmo);
      const r = await c.patch(`${R}/decisions/D-007/arbitration`, { question: 'Nouvelle question' }).expect(409);
      expect(r.body.code).toBe('READ_ONLY');
      await c.patch(`${R}/decisions/D-007`, { t: 'Titre' }).expect(409);
    });
    it('action échue → late = true (calculé, A-43 et A-44 comprises)', async () => {
      const c = await t.as(WHO.pmo);
      const r = await c.get(`${R}/actions`).expect(200);
      const late = r.body.filter((a: any) => a.late).map((a: any) => a.id).sort();
      expect(late).toEqual(['A-41', 'A-42', 'A-43', 'A-44']);
    });
    it('création d’un risque : id attribué par le serveur, criticité calculée, historique', async () => {
      const c = await t.as(WHO.pmo);
      const r = await c.post(`${R}/risks`, { n: 'Nouveau risque', p: 4, i: 5, owner: 'p06', wsId: 'C5' }).expect(201);
      expect(r.body.id).toBe('R08');
      expect(r.body.criticality).toBe('CRITICAL');
      const a = await c.post(`${R}/actions`, { n: 'Plan', owner: 'p06', wsId: 'C5', sourceType: 'RISK', sourceId: 'R08', prio: 'HIGH' }).expect(201);
      expect(a.body.id).toBe('A-50');
      const d = await c.del(`${R}/risks/R08`).expect(409);
      expect(d.body.usages[0]).toMatchObject({ entityType: 'ACTION', id: 'A-50' });
    });
    it('décision : clôture sans date → date du jour ; arbitrage d’une décision qui en remplace une autre', async () => {
      const c = await t.as(WHO.pmo);
      const d = await c.patch(`${R}/decisions/D-009`, { status: 'ARBITRATED' }).expect(422);
      expect(d.body.fields.decL).toBeDefined();
      const ok = await c.patch(`${R}/decisions/D-009`, { status: 'ARBITRATED', decL: '40 US prioritaires retenues' }).expect(200);
      expect(ok.body.ddIso).toBe('2026-09-26');
      const d2 = await t.db.decision.findUnique({ where: { id: 'D-002' } });
      expect(d2!.status).toBe('SUPERSEDED');
    });
    it('planning : fin ≥ début ; baromètre : sentiment = 100 ; budget inactif → 409', async () => {
      const c = await t.as(WHO.pmo);
      await c.patch(`${R}/planning/phase/P5`, { endDate: '2020-01-01' }).expect(400);
      // Phase avec sous-phases : avancement calculé (moyenne pondérée par la durée, 07/10/2026), saisie refusée.
      const no = await c.patch(`${R}/planning/phase/P5`, { progressPct: 50 }).expect(400);
      expect(no.body.fields.progressPct).toMatch(/pondérée par leur durée/);
      await c.patch(`${R}/planning/subphase/SP5.2`, { progressPct: 80 }).expect(200);
      const subs = await t.db.subphase.findMany({ where: { phaseId: 'P5' } });
      const days = (x: any) => (Date.parse(x.endDate) - Date.parse(x.startDate)) / 864e5 + 1;
      const want = Math.round(subs.reduce((n, x) => n + x.progressPct * days(x), 0) / subs.reduce((n, x) => n + days(x), 0));
      expect((await t.db.phase.findUnique({ where: { id: 'P5' } }))!.progressPct).toBe(want);
      await c.post(`${R}/barometer/surveys`, { month: '2026-09', overallScore: 6, respondents: 30, sentiment: { negative: 20, neutral: 20, positive: 50 } }).expect(400);
      const b = await c.post(`${R}/barometer/surveys`, { month: '2026-09', overallScore: 6.04, respondents: 30, sentiment: { negative: 20, neutral: 20, positive: 60 } }).expect(201);
      expect(b.body.surveys.at(-1)).toMatchObject({ month: '2026-09', key: 'm2026-09', overallScore: 6 });
      await c.patch(`${R}/budget/program`, { known: true }).expect(409);
      const g = await c.get(`${R}/budget`).expect(200);
      expect(g.body.moduleActive).toBe(false);
      expect(g.body.periods[0].total).toBe(512);
    });
    it('suivi des livrables : statuts calculés', async () => {
      const c = await t.as(WHO.pmo);
      const r = await c.get(`${R}/deliverables/tracking`).expect(200);
      expect(r.body.counters.total).toBe(107);
      expect(r.body.counters.late).toBe(1);
      expect(r.body.items.find((x: any) => x.id === 'l80').status).toBe('LATE');
    });
    it('avancement : signal écart réel/cible (Q9)', async () => {
      const c = await t.as(WHO.pmo);
      const r = await c.get(`${R}/workstream-progress`).expect(200);
      expect(r.body.map((x: any) => x.sig)).toEqual(['OK', 'WATCH', 'WATCH', 'WATCH', 'WATCH', 'RISK', 'WATCH', 'WATCH']);
    });
  });

  describe('Étape 6 — comités (§ 13.6)', () => {
    it('nouvelle séance du COPIL → n°24 (règle max + 1, Q5) avec les membres', async () => {
      const c = await t.as(WHO.pmo);
      const r = await c.post(`${R}/sessions`, { bodyId: 'g1', dateIso: '2027-01-21', time: '14:00' }).expect(201);
      expect(r.body.number).toBe(24);
      expect(r.body.participants).toEqual(['p04', 'p03', 'p05', 'p10', 'p02', 'p14']);
    });
    it('déplacer une séance HELD → 422 ; confirmer une séance future → 422', async () => {
      const c = await t.as(WHO.pmo);
      await c.patch(`${R}/sessions/S-g1-20`, { dateIso: '2026-10-01' }).expect(422);
      await c.patch(`${R}/sessions/S-g1-21`, { status: 'HELD' }).expect(422);
      await c.patch(`${R}/sessions/S-g1-20`, { status: 'PLANNED' }).expect(422);
    });
    it('modifier le lieu → entrée d’historique', async () => {
      const c = await t.as(WHO.pmo);
      await c.patch(`${R}/sessions/S-g1-21`, { place: 'Visio' }).expect(200);
      const a = await t.db.auditEntry.findFirst({ where: { entityType: 'SESSION', entityId: 'S-g1-21', field: 'place' } });
      expect(a).toMatchObject({ oldValue: 'Siège · salle du Conseil + visio', newValue: 'Visio', profileUsed: 'PMO' });
    });
    it('générer un rapport depuis une séance, puis le télécharger en PDF', async () => {
      const c = await t.as(WHO.pmo);
      const r = await c.post(`${R}/sessions/S-g1-21/reports`, { templateId: 'T1' }).expect(201);
      expect(r.body).toMatchObject({ sessionId: 'S-g1-21', status: 'DRAFT', v: 'v1' });
      const f = await c.get(`${R}/reports/${r.body.id}/file`).expect(200);
      expect(f.headers['content-type']).toBe('application/pdf');
      expect(f.body.slice(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('Étape 7 — habilitations (§ 13.7)', () => {
    it('risque sur plusieurs chantiers ou transverse (08/10/2026) : lecture si l’un des chantiers est visible, écriture sur chacun ; transverse réservé au PMO', async () => {
      const pmo = await t.as(WHO.pmo);
      const multi = (await pmo.post(`${R}/risks`, { n: 'Risque C3 + C8', p: 3, i: 3, owner: 'p06', wsIds: ['C3', 'C8'] }).expect(201)).body;
      expect(multi).toMatchObject({ wsId: 'C3', wsIds: ['C3', 'C8'], allWs: false });
      const trans = (await pmo.post(`${R}/risks`, { n: 'Risque transverse', p: 4, i: 5, owner: 'p06', allWs: true }).expect(201)).body;
      expect(trans).toMatchObject({ wsId: null, wsIds: [], allWs: true });
      await pmo.post(`${R}/risks`, { n: 'Sans chantier', p: 1, i: 1, owner: 'p06' }).expect(400);
      await pmo.post(`${R}/risks`, { n: 'Chantier inconnu', p: 1, i: 1, owner: 'p06', wsIds: ['C99'] }).expect(400);
      // Lecteur C8 : voit le risque C3 + C8 et le transverse ; Lecteur C3 aussi ; Responsable C5 : le transverse seulement.
      const l8 = await t.as(WHO.lecteurC8), l3 = await t.as(WHO.lecteurC3), r5 = await t.as(WHO.respC5);
      await l8.get(`${R}/risks/${multi.code}`).expect(200);
      await l3.get(`${R}/risks/${trans.code}`).expect(200);
      await r5.get(`${R}/risks/${multi.code}`).expect(404);
      const list5 = (await r5.get(`${R}/risks`).expect(200)).body.map((x: any) => x.code);
      expect(list5).toContain(trans.code);
      expect(list5).not.toContain(multi.code);
      const byWs = (await pmo.get(`${R}/risks?wsId=C8`).expect(200)).body.map((x: any) => x.code);
      expect(byWs).toEqual(expect.arrayContaining([multi.code, trans.code]));
      // Responsable C5 : pas de transverse, pas de C5 + C3 ; le transverse reste modifiable par le PMO seul.
      await r5.post(`${R}/risks`, { n: 'x', p: 1, i: 1, owner: 'p06', allWs: true }).expect(422);
      await r5.post(`${R}/risks`, { n: 'x', p: 1, i: 1, owner: 'p06', wsIds: ['C5', 'C3'] }).expect(422);
      await r5.patch(`${R}/risks/${trans.code}`, { plan: 'x' }).expect(403);
      expect((await pmo.patch(`${R}/risks/${multi.code}`, { allWs: true }).expect(200)).body).toMatchObject({ allWs: true, wsIds: [] });
      expect((await pmo.patch(`${R}/risks/${multi.code}`, { wsIds: ['C8'] }).expect(200)).body).toMatchObject({ allWs: false, wsIds: ['C8'], wsId: 'C8' });
      // Bootstrap : chantiers en clair.
      const boot = (await pmo.get(`${R}/bootstrap`).expect(200)).body;
      expect(boot.risks.find((x: any) => x.id === trans.id)).toMatchObject({ allWs: true, ws: 'Tous les chantiers' });
      await pmo.del(`${R}/risks/${multi.code}`).expect(204);
      await pmo.del(`${R}/risks/${trans.code}`).expect(204);
    });
    it('actions issues d’un risque (09/10/2026) : elles reprennent les chantiers du risque, transverse compris', async () => {
      const pmo = await t.as(WHO.pmo);
      const rk = (await pmo.post(`${R}/risks`, { n: 'Risque C2', p: 3, i: 3, owner: 'p06', wsIds: ['C2'] }).expect(201)).body;
      const ac = (await pmo.post(`${R}/actions`, { n: 'Action du risque', owner: 'p06', wsId: 'C2', dueIso: '2026-11-15', status: 'OPEN', prio: 'HIGH', sourceType: 'RISK', sourceId: rk.id }).expect(201)).body;
      const wsOf = async () => { const a = (await pmo.get(`${R}/actions/${ac.code}`).expect(200)).body; return { wsId: a.wsId, wsIds: a.wsIds, allWs: a.allWs }; };
      await pmo.patch(`${R}/risks/${rk.code}`, { wsIds: ['C2', 'C1'] }).expect(200);
      expect(await wsOf()).toEqual({ wsId: 'C2', wsIds: ['C2', 'C1'], allWs: false });
      await pmo.patch(`${R}/risks/${rk.code}`, { allWs: true }).expect(200);
      expect(await wsOf()).toEqual({ wsId: null, wsIds: [], allWs: true });
      const audit = await t.db.auditEntry.findMany({ where: { entityType: 'ACTION', entityId: ac.id } });
      expect(audit.length).toBeGreaterThan(0);
      await pmo.del(`${R}/actions/${ac.code}`).expect(204);
      await pmo.del(`${R}/risks/${rk.code}`).expect(204);
    });
    it('actions sur plusieurs chantiers ou transverses (09/10/2026) : lecture si l’un est visible, écriture sur chacun, transverse PMO', async () => {
      const pmo = await t.as(WHO.pmo);
      const multi = (await pmo.post(`${R}/actions`, { n: 'Action C3 + C8', owner: 'p06', wsIds: ['C3', 'C8'], dueIso: '2026-11-15' }).expect(201)).body;
      expect(multi).toMatchObject({ wsId: 'C3', wsIds: ['C3', 'C8'], allWs: false });
      const trans = (await pmo.post(`${R}/actions`, { n: 'Action transverse', owner: 'p06', allWs: true }).expect(201)).body;
      expect(trans).toMatchObject({ wsId: null, wsIds: [], allWs: true });
      await pmo.post(`${R}/actions`, { n: 'Sans chantier', owner: 'p06' }).expect(400);
      const l8 = await t.as(WHO.lecteurC8), r5 = await t.as(WHO.respC5);
      await l8.get(`${R}/actions/${multi.code}`).expect(200);
      await r5.get(`${R}/actions/${multi.code}`).expect(404);
      expect((await r5.get(`${R}/actions`).expect(200)).body.map((x: any) => x.code)).toContain(trans.code);
      await r5.post(`${R}/actions`, { n: 'x', owner: 'p06', allWs: true }).expect(422);
      await r5.post(`${R}/actions`, { n: 'x', owner: 'p06', wsIds: ['C5', 'C3'] }).expect(422);
      const boot = (await pmo.get(`${R}/bootstrap`).expect(200)).body;
      expect(boot.actions.find((x: any) => x.id === multi.id)).toMatchObject({ wsIds: ['C3', 'C8'], allWs: false });
      expect(boot.actions.find((x: any) => x.id === trans.id)).toMatchObject({ allWs: true });
      await pmo.del(`${R}/actions/${multi.code}`).expect(204);
      await pmo.del(`${R}/actions/${trans.code}`).expect(204);
    });
    it('un Admin qui modifie un risque → 403 (RG6)', async () => {
      const c = await t.as(WHO.admin);
      await c.patch(`${R}/risks/R01`, { n: 'x' }).expect(403);
    });
    it('Responsable C5 : risque C5 200, risque C3 403 ; création hors chantier 422', async () => {
      const c = await t.as(WHO.respC5);
      await c.patch(`${R}/risks/R01`, { plan: 'Plan révisé' }).expect(200);
      await c.patch(`${R}/risks/R03`, { plan: 'x' }).expect(403);
      await c.get(`${R}/risks/R03`).expect(404); // lecture hors périmètre : existence non révélée (RG16)
      await c.post(`${R}/risks`, { n: 'x', p: 1, i: 1, owner: 'p06', wsId: 'C3' }).expect(422);
      const a = await t.db.auditEntry.findFirst({ where: { entityType: 'RISK', entityId: 'R01', field: 'plan' } });
      expect(a!.profileUsed).toBe('RESPONSABLE');
    });
    it('Responsable C1 lit mais ne modifie pas un risque d’un chantier lu (403)', async () => {
      // p09 : Responsable C2 et C4, Lecteur C3
      const c = await t.as({ personId: 'p09' });
      await c.patch(`${R}/risks/R03`, { plan: 'x' }).expect(403);
      await c.patch(`${R}/risks/R02`, { plan: 'Gel du périmètre confirmé' }).expect(200);
    });
    it('Responsable C5 modifie les dates de C5 (200) mais pas celles d’un jalon de C5 (403)', async () => {
      const c = await t.as(WHO.respC5);
      await c.patch(`${R}/planning/workstream/C5`, { endDate: '2027-07-01' }).expect(200);
      await c.patch(`${R}/milestones/J04`, { iso: '2026-10-20' }).expect(403);
      await c.patch(`${R}/planning/phase/P5`, { progressPct: 60 }).expect(403);
    });
    it('le Directeur de programme crée une séance (201), un Responsable non (403)', async () => {
      await (await t.as(WHO.director)).post(`${R}/sessions`, { bodyId: 'g2', dateIso: '2026-12-23' }).expect(201);
      await (await t.as(WHO.respC5)).post(`${R}/sessions`, { bodyId: 'g2', dateIso: '2026-12-30' }).expect(403);
    });
    it('un Lecteur de C3 ne reçoit pas les risques de C1 (RG8)', async () => {
      const c = await t.as(WHO.lecteurC3);
      const r = await c.get(`${R}/risks`).expect(200);
      expect(r.body.map((x: any) => x.wsId)).toEqual(['C3']);
      await c.patch(`${R}/risks/R03`, { plan: 'x' }).expect(403);
    });
    it('Admin + Responsable A : modifie A, lit le reste (RG5)', async () => {
      await t.db.habilitation.create({ data: { id: 'h-test', projectId: 'RISE', personId: 'p02', profile: 'RESPONSABLE', wsId: 'C7' } });
      const c = await t.as(WHO.admin);
      await c.patch(`${R}/risks/R07`, { p: 4 }).expect(200);
      await c.patch(`${R}/risks/R01`, { p: 4 }).expect(403);
      const all = await c.get(`${R}/risks`).expect(200);
      expect(all.body.length).toBeGreaterThanOrEqual(6);
      await t.db.habilitation.delete({ where: { id: 'h-test' } });
    });
    it('baromètre : PMO ou Responsable de C8 uniquement', async () => {
      await (await t.as(WHO.respC5)).patch(`${R}/barometer/surveys/2026-07`, { respondents: 34 }).expect(403);
      await (await t.as(WHO.director)).patch(`${R}/barometer/surveys/2026-07`, { respondents: 34 }).expect(200);
    });
  });

  describe('Étape 8 — Aujourd’hui et Mes tâches (§ 13.8)', () => {
    it('Mes tâches de p01 : actions ouvertes, décisions, jalons < 45 j, tâches manuelles privées', async () => {
      const c = await t.as(WHO.pmo);
      const created = await c.post(`${R}/tasks`, { title: 'Relire le support COPIL', dueIso: '2026-09-28' }).expect(201);
      const r = await c.get(`${R}/me/tasks`).expect(200);
      expect(r.body.map((x: any) => x.kind)).toContain('MANUAL');
      const other = await t.as(WHO.respC5);
      await other.patch(`${R}/tasks/${created.body.id}`, { title: 'x' }).expect(404);
      const ov = await c.patch(`${R}/tasks/${created.body.id}`, { status: 'DONE' }).expect(200);
      expect(ov.body.status).toBe('DONE');
    });
    it('tâche confiée (09/10/2026) : responsable, chantiers, 4 statuts ; visible et modifiable par le responsable, supprimable par l’auteur seul', async () => {
      const c = await t.as(WHO.pmo), resp = await t.as(WHO.respC5), lect = await t.as(WHO.lecteurC3);
      const tk = (await c.post(`${R}/tasks`, { title: 'Rédiger le cahier de recette', owner: 'p06', wsIds: ['C5', 'C3'], status: 'IN_PROGRESS', link: { entityType: 'ACTION', entityId: 'A-41' } }).expect(201)).body;
      expect(tk).toMatchObject({ ownerId: 'p06', wsIds: ['C5', 'C3'], allWs: false, status: 'IN_PROGRESS' });
      const mine = (await resp.get(`${R}/me/tasks`).expect(200)).body.find((x: any) => x.id === tk.id);
      expect(mine).toMatchObject({ kind: 'MANUAL', owner: 'p06', wsIds: ['C5', 'C3'], status: 'IN_PROGRESS' });
      expect((await resp.patch(`${R}/tasks/${tk.id}`, { status: 'BLOCKED' }).expect(200)).body.status).toBe('BLOCKED');
      await resp.del(`${R}/tasks/${tk.id}`).expect(404);
      await c.post(`${R}/tasks`, { title: 'x', owner: 'p99' }).expect(400);
      await c.post(`${R}/tasks`, { title: 'x', wsIds: ['C99'] }).expect(400);
      await lect.post(`${R}/tasks`, { title: 'x', owner: 'p06' }).expect(422);
      const tr = (await c.post(`${R}/tasks`, { title: 'Tâche transverse', allWs: true }).expect(201)).body;
      expect(tr).toMatchObject({ allWs: true, wsIds: [] });
      await c.del(`${R}/tasks/${tk.id}`).expect(204);
      await c.del(`${R}/tasks/${tr.id}`).expect(204);
    });
    it('fiche d’arbitrage, critères par option (09/10/2026) : enregistrés tels quels, ancien format déduit, poids contrôlés par option', async () => {
      const c = await t.as(WHO.pmo);
      const d = (await c.post(`${R}/decisions`, { t: 'Solution CRM', p: 3, wsId: 'C3', bodyId: 'g1' }).expect(201)).body;
      const crit = (n: number[]) => [{ name: 'Coût total', weightPct: 40, score: n[0], comment: 'A' }, { name: 'Délai', weightPct: 35, score: n[1], comment: '' }, { name: 'Couverture', weightPct: 25, score: n[2], comment: '' }];
      const r = await c.patch(`${R}/decisions/${d.code}/arbitration`, { question: 'Solution CRM', options: [{ code: 'A', label: 'Prolonger', criteria: crit([3, 4, 1]) }, { code: 'B', label: 'Migrer', criteria: crit([2, 2, 4]).slice(0, 2) }], recommendation: 'B' }).expect(200);
      expect(r.body.arbitration.options[0].criteria).toHaveLength(3);
      expect(r.body.arbitration.criteria).toEqual([
        { name: 'Coût total', weightPct: 40, scoreA: 3, commentA: 'A', scoreB: 2, commentB: 'A' },
        { name: 'Délai', weightPct: 35, scoreA: 4, commentA: '', scoreB: 2, commentB: '' },
        { name: 'Couverture', weightPct: 25, scoreA: 1, commentA: '', scoreB: 0, commentB: '' },
      ]);
      expect(r.body.warnings).toEqual(['Option B : la somme des poids vaut 75 % (100 % attendus)']);
      await c.del(`${R}/decisions/${d.code}`).expect(204);
    });
    it('écran Aujourd’hui : prochain COPIL n°21, validations du décideur, échéancier et écarts', async () => {
      const c = await t.as({ personId: 'p04' });
      const r = await c.get(`${R}/today`).expect(200);
      expect(r.body.today).toBe('2026-09-26');
      expect(r.body.nextCommittee).toMatchObject({ number: 21, dateIso: '2026-10-26' });
      expect(r.body.countdown.label).toBe('J-187');
      // Message par règles (02/10/2026) : une seule priorité, ni « prêt » ni compteur à zéro.
      expect(r.body.message).toMatch(/^(Bonjour|Bonne semaine|Bonsoir) Philippe, /);
      expect(r.body.message).not.toMatch(/prêt| 0 /);
      const pmo = await (await t.as(WHO.pmo)).get(`${R}/today`).expect(200);
      expect(pmo.body.timeline.length).toBeLessThanOrEqual(10);
      const kinds = pmo.body.anomalies.map((a: any) => a.kind);
      expect(kinds).toEqual(expect.arrayContaining(['BUDGET_UNKNOWN', 'ACTION_LATE']));
    });
  });
});
