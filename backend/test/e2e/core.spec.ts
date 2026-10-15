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

  it('horloge mondiale (15/10/2026) : villes de l’utilisateur (1 à 4, fuseaux IANA, sans doublon), propres à chaque compte', async () => {
    const c = await t.as(WHO.pmo);
    const city = (name: string, timeZone: string, lat = 0, lon = 0) => ({ name, timeZone, lat, lon });
    const clock = { cities: [city('Lyon', 'Europe/Paris', 45.76, 4.84), city('Calcutta', 'Asia/Kolkata', 22.57, 88.36), city('Montréal', 'America/Toronto', 45.5, -73.57)], showSeconds: true };
    await c.patch('/api/me/preferences', { worldClock: clock }).expect(200);
    expect((await c.get('/api/me').expect(200)).body.preferences.worldClock).toEqual(clock);
    // Un autre compte garde les villes par défaut.
    expect((await (await t.as(WHO.admin)).get('/api/me').expect(200)).body.preferences.worldClock ?? null).toBeNull();
    const bad = async (worldClock: unknown) => (await c.patch('/api/me/preferences', { worldClock }).expect(400)).body.fields;
    expect(await bad({ cities: [1, 2, 3, 4, 5].map((i) => city('V' + i, 'Europe/Paris')) })).toBeDefined();
    expect(await bad({ cities: [] })).toBeDefined();
    expect(await bad({ cities: [city('Atlantide', 'Ocean/Atlantis')] })).toBeDefined();
    expect(await bad({ cities: [city('Lyon', 'Europe/Paris'), city('lyon', 'Europe/Paris')] })).toBeDefined();
    expect(await bad({ cities: [{ ...city('Lyon', 'Europe/Paris'), lat: 120 }] })).toBeDefined();
    await c.patch('/api/me/preferences', { worldClock: null }).expect(200);
    expect((await c.get('/api/me').expect(200)).body.preferences.worldClock).toBeNull();
  });

  it('compte à rebours Go-Live (16/10/2026) : réglages par projet, propres à chaque compte, validés', async () => {
    const c = await t.as(WHO.pmo);
    const countdown = { RISE: { title: 'Bascule PMS', targetDate: '2027-05-03', targetTime: '07:30', unit: 'business', accent: '#5fd0c4', secondsThreshold: 24 }, ATLAS: { startDate: '2026-01-05' } };
    await c.patch('/api/me/preferences', { countdown }).expect(200);
    expect((await c.get('/api/me').expect(200)).body.preferences.countdown).toEqual(countdown);
    expect((await (await t.as(WHO.admin)).get('/api/me').expect(200)).body.preferences.countdown ?? null).toBeNull();
    const bad = async (o: unknown) => (await c.patch('/api/me/preferences', { countdown: { RISE: o } }).expect(400)).body.fields;
    expect(await bad({ targetDate: '2027-02-31' })).toBeDefined();
    expect(await bad({ targetTime: '25:00' })).toBeDefined();
    expect(await bad({ unit: 'weeks' })).toBeDefined();
    expect(await bad({ secondsThreshold: 12 })).toBeDefined();
    expect(await bad({ accent: 'orange' })).toBeDefined();
    expect(await bad({ title: 'x'.repeat(81) })).toBeDefined();
    expect(await bad({ inconnu: 1 })).toBeDefined();
    await c.patch('/api/me/preferences', { countdown: null }).expect(200);
    expect((await c.get('/api/me').expect(200)).body.preferences.countdown).toBeNull();
  });

  it('publie la documentation OpenAPI', async () => {
    const r = await t.http().get('/api/docs/openapi.json').expect(200);
    expect(r.body.openapi).toMatch(/^3\./);
  });
});
