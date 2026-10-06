import { setup, TestCtx, WHO } from '../helpers';

const R = '/api/projects/RISE';

describe('Étapes 2-3 — droits et Référentiel', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('GET /api/me renvoie les droits effectifs calculés par le serveur', async () => {
    const c = await t.as(WHO.pmo);
    const r = await c.get('/api/me').expect(200);
    expect(r.body.person.id).toBe('p01');
    expect(r.body.effective).toMatchObject({ pmo: true, admin: false });
    expect(r.body.rights.referentielEdit).toBe(true);
    const resp = await (await t.as(WHO.respC5)).get('/api/me').expect(200);
    expect(resp.body.effective.responsable).toEqual(['C5', 'C6']);
  });

  it('GET /api/projects renvoie les projets accessibles', async () => {
    const admin = await (await t.as(WHO.admin)).get('/api/projects').expect(200);
    expect(admin.body.map((p: any) => p.code)).toEqual(expect.arrayContaining(['RISE', 'ATLAS', 'HORIZON', 'NOVA', 'ORBIT']));
    const lec = await (await t.as(WHO.lecteurC3)).get('/api/projects').expect(200);
    expect(lec.body.map((p: any) => p.code)).toEqual(['RISE']);
  });

  it('un Lecteur ne voit pas le Référentiel (403) mais lit les valeurs utiles', async () => {
    const c = await t.as(WHO.lecteurC3);
    const r = await c.get(`${R}/referential`).expect(403);
    expect(r.body.code).toBe('FORBIDDEN');
    await c.get(`${R}/phases`).expect(200);
    await c.post(`${R}/teams`, { name: 'X' }).expect(403);
  });

  it('un Admin voit le Référentiel mais ne le modifie pas (RG6)', async () => {
    const c = await t.as(WHO.admin);
    await c.get(`${R}/referential`).expect(200);
    await c.patch(`${R}/phases/P1`, { name: 'Découverte' }).expect(403);
  });

  it('supprimer une phase utilisée → 409 avec la liste des usages', async () => {
    const c = await t.as(WHO.pmo);
    const r = await c.del(`${R}/phases/P4`).expect(409);
    expect(r.body.code).toBe('IN_USE');
    const types = new Set(r.body.usages.map((u: any) => u.entityType));
    expect(types).toEqual(new Set(['SUBPHASE', 'MILESTONE', 'DELIVERABLE', 'WORKSTREAM']));
    expect(r.body.usages[0]).toEqual({ entityType: expect.any(String), id: expect.any(String), label: expect.any(String) });
  });

  it('personne utilisée (responsable, membre) → 409 ; équipe avec personnes → 409', async () => {
    const c = await t.as(WHO.pmo);
    const p = await c.del(`${R}/persons/p03`).expect(409);
    expect(p.body.usages.some((u: any) => u.entityType === 'GOVERNANCE_BODY')).toBe(true);
    const tm = await c.del(`${R}/teams/t13`).expect(409);
    expect(tm.body.usages.every((u: any) => ['PERSON', 'PROJECT'].includes(u.entityType))).toBe(true);
  });

  it('création, modification (historique champ par champ), suppression définitive', async () => {
    const c = await t.as(WHO.pmo);
    const created = await c.post(`${R}/teams`, { name: 'Accenture', kind: 'OTHER', id: 'forbidden' }).expect(400);
    expect(created.body.fields).toBeDefined();
    const team = await c.post(`${R}/teams`, { name: 'Accenture', kind: 'OTHER' }).expect(201);
    expect(team.body.id).toBeTruthy();
    expect(team.headers.etag).toBe('W/"1"');
    await c.post(`${R}/teams`, { name: 'accenture' }).expect(409);
    const upd = await c.patch(`${R}/teams/${team.body.id}`, { description: 'Renfort' }).expect(200);
    expect(upd.body.version).toBe(2);
    await c.patch(`${R}/teams/${team.body.id}`, { description: 'x' }).set('If-Match', 'W/"1"').expect(412);
    const audit = await t.db.auditEntry.findMany({ where: { entityType: 'TEAM', entityId: team.body.id } });
    expect(audit.map((a) => a.field)).toEqual(expect.arrayContaining([null, 'description']));
    expect(audit.find((a) => a.field === 'description')).toMatchObject({ oldValue: null, newValue: 'Renfort', profileUsed: 'PMO', accountId: 'u2' });
    await c.del(`${R}/teams/${team.body.id}`).expect(204);
    await c.get(`${R}/teams/${team.body.id}`).expect(404);
  });

  it('personne : e-mail unique et valide ; affectations sans doublon exact, fin ≥ début', async () => {
    const c = await t.as(WHO.pmo);
    await c.post(`${R}/persons`, { firstName: 'Zoé', lastName: 'Martin', email: 'pas-un-mail', teamId: 't10' }).expect(400);
    await c.post(`${R}/persons`, { firstName: 'Zoé', lastName: 'Martin', email: 'ROBIN.LEFEVRE@example.com', teamId: 't10' }).expect(409);
    const p = await c.post(`${R}/persons`, { firstName: 'Zoé', lastName: 'Martin', email: 'zoe.martin@example.com', teamId: 't10' }).expect(201);
    expect(p.body).toMatchObject({ name: 'Zoé Martin', initials: 'ZM', org: 'AMOA' });
    await c.post(`${R}/assignments`, { personId: p.body.id, roleId: 'ro10', startDate: '2026-10-01', endDate: '2026-09-01' }).expect(400);
    await c.post(`${R}/assignments`, { personId: p.body.id, roleId: 'ro10', startDate: '2026-09-01' }).expect(201);
    await c.post(`${R}/assignments`, { personId: p.body.id, roleId: 'ro10', startDate: '2026-09-01' }).expect(409);
    // Chevauchement autorisé : autre rôle, même période
    await c.post(`${R}/assignments`, { personId: p.body.id, roleId: 'ro08', startDate: '2026-09-01' }).expect(201);
    const view = await c.get(`${R}/persons/${p.body.id}`).expect(200);
    expect(view.body.roles.sort()).toEqual(['AMOA Externe', 'AMOA interne']);
  });

  it('sous-phase : code préfixé par la phase ; chantier : code attribué par le serveur', async () => {
    const c = await t.as(WHO.pmo);
    await c.post(`${R}/subphases`, { phaseId: 'P5', code: '4.9', name: 'Mauvais code' }).expect(400);
    const sp = await c.post(`${R}/subphases`, { phaseId: 'P5', code: '5.9', name: 'Stabilisation', startDate: '2026-01-01', endDate: '2026-02-01' }).expect(201);
    expect(sp.body.warnings?.[0]).toMatch(/sort de la période/);
    const ws = await c.post(`${R}/workstreams`, { name: 'Data & BI', ownerId: 'p06', phaseIds: ['P5'], dependsOn: ['C5'] }).expect(201);
    expect(ws.body.code).toBe('C9');
    expect(ws.body.dependsOn).toEqual(['C5']);
    const put = await c.put(`${R}/workstreams/${ws.body.id}/dependencies`, { dependsOn: 'ALL' }).expect(200);
    expect(put.body.dependsOn).toBe('ALL');

    // Sous-phases du chantier (06/10/2026) : dans ses phases ; phase retirée → sous-phases retirées (D3).
    const other = await t.db.subphase.findFirstOrThrow({ where: { projectId: 'RISE', phaseId: 'P1' } });
    const bad = await c.put(`${R}/workstreams/${ws.body.id}/subphases`, { subphaseIds: [other.id] }).expect(400);
    expect(bad.body.fields.subphaseIds).toMatch(/la phase n’est pas rattachée au chantier/);
    const ok = await c.put(`${R}/workstreams/${ws.body.id}/subphases`, { subphaseIds: [sp.body.id] }).expect(200);
    expect(ok.body.subphaseIds).toEqual([sp.body.id]);
    const moved = await c.patch(`${R}/subphases/${sp.body.id}`, { phaseId: 'P4', code: '4.9' }).expect(400);
    expect(moved.body.fields.phaseId).toMatch(/rattachée aux chantiers C9/);
    const dropped = await c.patch(`${R}/workstreams/${ws.body.id}`, { phaseIds: ['P4'] }).expect(200);
    expect(dropped.body.subphaseIds).toEqual([]);
    expect(dropped.body.warnings).toEqual(['Sous-phases retirées avec leur phase : 5.9']);
    await c.patch(`${R}/workstreams/${ws.body.id}`, { phaseIds: ['P4', 'P5'], subphaseIds: [sp.body.id] }).expect(200);
    // Sous-phase supprimée : le lien part en cascade, tracé sur le chantier.
    await c.del(`${R}/subphases/${sp.body.id}`).expect(204);
    expect((await c.get(`${R}/workstreams/${ws.body.id}`).expect(200)).body.subphaseIds).toEqual([]);
    const trace = await t.db.auditEntry.findFirst({ where: { entityType: 'WORKSTREAM', entityId: ws.body.id, field: 'subphaseIds' }, orderBy: { at: 'desc' } });
    expect(trace?.newValue).toEqual([]);

    // Dépendance circulaire refusée, quelle que soit la longueur de la boucle.
    await c.put(`${R}/workstreams/${ws.body.id}/dependencies`, { dependsOn: ['C5'] }).expect(200);
    const loop = await c.put(`${R}/workstreams/C5/dependencies`, { dependsOn: [ws.body.id] }).expect(400);
    expect(loop.body.fields.dependsOn).toBe('dépendance circulaire : C5 → C9 → C5');
  });

  it('instance : membres uniques, nom court unique', async () => {
    const c = await t.as(WHO.pmo);
    await c.put(`${R}/governance-bodies/g5/members`, { members: [{ personId: 'p03', role: 'CHAIR' }, { personId: 'p03' }] }).expect(409);
    const r = await c.put(`${R}/governance-bodies/g5/members`, { members: [{ personId: 'p03', role: 'CHAIR' }, { personId: 'p04' }] }).expect(200);
    expect(r.body.members).toEqual([{ personId: 'p03', role: 'CHAIR' }, { personId: 'p04', role: 'MEMBER' }]);
    await c.patch(`${R}/governance-bodies/g5`, { shortName: 'COPIL' }).expect(409);
  });

  it('projet : code non modifiable ; forçage de santé avec motif obligatoire ; today', async () => {
    const c = await t.as(WHO.pmo);
    const g = await c.get(`${R}/project`).expect(200);
    expect(g.body).toMatchObject({ code: 'RISE', today: '2026-09-26', baseline: { version: 'v5', date: '2027-04-01', previous: { version: 'v4', date: '2026-11-01' } } });
    expect(g.body.healthOverride).toBeNull();
    await c.patch(`${R}/project`, { code: 'X' }).expect(400);
    await c.patch(`${R}/project`, { healthOverride: { value: 'Rouge' } }).expect(400);
    const p = await c.patch(`${R}/project`, { healthOverride: { value: 'Rouge', reason: 'Report' } }).expect(200);
    expect(p.body.healthOverride).toMatchObject({ value: 'Rouge', reason: 'Report', by: 'p01' });
    await c.patch(`${R}/project/sections/identity.0`, { value: ['Raison sociale', 'AMC Corp SA'] }).expect(200);
  });

  it('signal « porteur sans affectation active »', async () => {
    const c = await t.as(WHO.pmo);
    const r = await c.get(`${R}/signals/owners-without-assignment`).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});
