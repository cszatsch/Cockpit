import { setup, TestCtx, WHO } from '../helpers';

describe('Étape 1 — socle', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('refuse une requête sans jeton (401, format d\'erreur unique)', async () => {
    const r = await t.http().get('/api/me').expect(401);
    expect(r.body).toEqual({ code: 'UNAUTHENTICATED', message: expect.any(String) });
  });

  it('dev-login délivre un jeton pour p01', async () => {
    const r = await t.http().post('/api/auth/dev-login').send({ personId: 'p01' }).expect(200);
    expect(r.body.token).toBeTruthy();
    expect(r.body.accountId).toBe('u2');
  });

  it('refuse un compte suspendu (u11 Marc Delorme)', async () => {
    await t.http().post('/api/auth/dev-login').send({ accountId: 'u11' }).expect(401);
  });

  it('valide le corps de dev-login (400 + fields)', async () => {
    const r = await t.http().post('/api/auth/dev-login').send({}).expect(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.fields).toBeDefined();
  });

  it('le journal d\'audit est en ajout seul (trigger SQL)', async () => {
    const e = await t.db.auditEntry.findFirst();
    await expect(t.db.auditEntry.update({ where: { id: e!.id }, data: { action: 'x' } })).rejects.toThrow(/append-only/);
    await expect(t.db.auditEntry.delete({ where: { id: e!.id } })).rejects.toThrow(/append-only/);
  });

  it('logout ferme la session', async () => {
    const r = await t.http().post('/api/auth/dev-login').send(WHO.pmo).expect(200);
    await t.http().post('/api/auth/logout').set('Authorization', `Bearer ${r.body.token}`).expect(204);
    await t.http().get('/api/me').set('Authorization', `Bearer ${r.body.token}`).expect(401);
  });

  it('GET /me : projets ouverts au compte, pour le menu « Projet » du Cockpit (profil, projet affiché)', async () => {
    const pmo = (await (await t.as(WHO.pmo)).get('/api/me').expect(200)).body;
    expect(pmo.projects.map((p: any) => p.code)).toContain('RISE');
    expect(pmo.projects.find((p: any) => p.code === 'RISE')).toMatchObject({ id: 'RISE', name: expect.any(String), profile: 'PMO' });
    expect(pmo.projects.some((p: any) => p.id === pmo.projectId)).toBe(true);
    // Administrateur seul : tous les projets, en lecture.
    const admin = (await (await t.as(WHO.admin)).get('/api/me').expect(200)).body;
    expect(admin.projects.length).toBeGreaterThanOrEqual(pmo.projects.length);
    expect(admin.projects.every((p: any) => ['ADMIN', 'PMO', 'RESPONSABLE', 'LECTEUR'].includes(p.profile))).toBe(true);
  });

  it('GET /me : profil réel (identité, société, équipe), rôle et affectation par projet ; projet par défaut enregistré', async () => {
    const c = await t.as(WHO.pmo);
    const me = (await c.get('/api/me').expect(200)).body;
    expect(me.profile).toMatchObject({ firstName: 'Robin', lastName: 'Lefèvre', company: expect.any(String) });
    const rise = me.projects.find((p: any) => p.code === 'RISE');
    expect(rise).toMatchObject({ client: expect.any(String), roles: expect.arrayContaining([expect.any(String)]), startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    await c.patch('/api/me/preferences', { defaultProject: 'ATLAS', phone: '+33 6 12 34 56 78', country: 'Belgique' }).expect(200);
    const after = (await c.get('/api/me').expect(200)).body;
    expect(after.preferences).toMatchObject({ defaultProject: 'ATLAS', phone: '+33 6 12 34 56 78', country: 'Belgique' });
    expect(after.profile.updatedAt).toEqual(expect.any(String));
    await c.patch('/api/me/preferences', { defaultProject: null }).expect(200);
  });

  it('publie la documentation OpenAPI', async () => {
    const r = await t.http().get('/api/docs/openapi.json').expect(200);
    expect(r.body.openapi).toMatch(/^3\./);
  });
});
