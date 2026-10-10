import { setup, TestCtx, Client, WHO } from '../helpers';

const A = '/api/admin';

/**
 * Profil Super Admin de la Console (demande du commanditaire du 10/10/2026) : tous les droits ; l'Admin consulte le menu IA
 * sans le modifier ; seul un Super Admin attribue ce profil ou agit sur le compte d'un Super Admin.
 */
describe('Console — Super Admin', () => {
  let t: TestCtx;
  let sup: Client;
  let adm: Client;
  const ADM = 'acc-admin-simple';

  beforeAll(async () => {
    t = await setup();
    // u1 (jeu de démonstration) est Super Admin ; ADM est un Admin.
    await t.db.account.create({ data: { id: ADM, email: 'admin.simple@example.com', fullName: 'Alice Admin', status: 'ACTIVE' } });
    await t.db.adminGrant.create({ data: { accountId: ADM } });
    sup = await t.as(WHO.admin);
    adm = await t.as({ accountId: ADM });
  });
  afterAll(() => t.close());

  it('profil : Super Admin pour u1, Admin pour les autres (fiche, liste, Administrateurs, connexion)', async () => {
    expect((await sup.get(`${A}/me/profile`).expect(200)).body).toMatchObject({ admin: true, superAdmin: true });
    expect((await adm.get(`${A}/me/profile`).expect(200)).body).toMatchObject({ admin: true, superAdmin: false });
    const u1 = (await sup.get(`${A}/accounts/u1`).expect(200)).body;
    expect(u1).toMatchObject({ profile: 'SUPER_ADMIN', superAdmin: true });
    expect(u1.profiles[0]).toBe('SUPER_ADMIN');
    expect(u1.profiles).not.toContain('ADMIN');
    const list = (await sup.get(`${A}/accounts?profile=super`).expect(200)).body;
    expect(list.items.map((x: any) => x.id)).toEqual(['u1']);
    expect(list.counts.byProfile.SUPER_ADMIN).toBe(1);
    const admins = (await sup.get(`${A}/admins`).expect(200)).body;
    expect(admins.find((x: any) => x.accountId === 'u1')).toMatchObject({ level: 'super', superAdmin: true });
    expect(admins.find((x: any) => x.accountId === ADM)).toMatchObject({ level: 'admin', superAdmin: false });
  });

  it('menu IA : l’Admin lit, le Super Admin modifie', async () => {
    // Lecture ouverte à l'Admin.
    await adm.get(`${A}/providers`).expect(200);
    await adm.get(`${A}/models`).expect(200);
    await adm.get(`${A}/assignments`).expect(200);
    await adm.get(`${A}/usage/month`).expect(200);
    expect((await adm.get('/api/ai/latency')).status).not.toBe(403);
    // Modifications refusées à l'Admin (403), quel que soit le corps.
    const m = (await t.db.aiModel.findFirstOrThrow({ where: { category: 'LLM' } }));
    const refused = [
      adm.post(`${A}/providers`, { name: 'Nouveau', apiKey: 'sk-test-0000000000' }),
      adm.put(`${A}/providers/${m.providerId}/key`, { apiKey: 'sk-test-0000000000' }),
      adm.put(`${A}/providers/${m.providerId}/cap`, { monthlyCapEur: 10 }),
      adm.post(`${A}/providers/${m.providerId}/test`, {}),
      adm.post(`${A}/providers/test-all`, {}),
      adm.post(`${A}/models`, { name: 'x' }),
      adm.patch(`${A}/models/${m.id}`, { active: false }),
      adm.del(`${A}/models/${m.id}`),
      adm.post(`${A}/models/stats/refresh`, {}),
      adm.put(`${A}/assignments`, { rapports: { primary: m.id } }),
      adm.put(`${A}/budget-thresholds/all`, { capEur: 10 }),
      adm.put(`${A}/guides/console/settings`, { k: 5 }),
    ];
    for (const r of await Promise.all(refused)) {
      expect(r.status).toBe(403);
      expect(r.body.message).toBe('Modification réservée au Super Admin');
    }
    // Le Super Admin modifie (affectation valide du jeu de démonstration, cf. ai-models.spec.ts).
    await sup.put(`${A}/assignments`, { rapports: { primary: 'sonnet', fallback: 'gpt5' } }).expect(200);
    // Les autres domaines restent ouverts à l'Admin (ex. Persona, Skills : lecture et écriture inchangées).
    await adm.get('/api/assistant/skills').expect(200);
  });

  it('comptes : seul un Super Admin agit sur le compte d’un Super Admin ou attribue ce profil', async () => {
    const msg = 'Compte d’un Super Admin : action réservée au Super Admin';
    for (const r of await Promise.all([
      adm.put(`${A}/accounts/u1/habilitations`, { admin: true, projects: [] }),
      adm.patch(`${A}/accounts/u1`, { fullName: 'Julien Morel bis' }),
      adm.post(`${A}/accounts/u1/suspend`, {}),
      adm.del(`${A}/accounts/u1/sessions`),
      adm.del(`${A}/admins/u1`),
      adm.put(`${A}/admins/u1/consumption-rights`, { seeCosts: false }),
    ])) {
      expect(r.status).toBe(403);
      expect(r.body.message).toBe(msg);
    }
    // Un Admin ne peut pas nommer de Super Admin.
    const r = await adm.put(`${A}/accounts/u37/habilitations`, { admin: true, superAdmin: true, projects: [] });
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Profil Super Admin : attribution réservée au Super Admin');
    // Le Super Admin nomme ADM, qui peut alors modifier le menu IA, puis le lui retire.
    const named = (await sup.put(`${A}/accounts/${ADM}/habilitations`, { admin: true, superAdmin: true, projects: [] }).expect(200)).body;
    expect(named).toMatchObject({ profile: 'SUPER_ADMIN', superAdmin: true });
    const adm2 = await t.as({ accountId: ADM });
    expect((await adm2.put(`${A}/budget-thresholds/all`, { capEur: 10 })).status).not.toBe(403);
    // Habilitations réécrites sans `superAdmin` : le profil est gardé.
    expect((await sup.put(`${A}/accounts/${ADM}/habilitations`, { admin: true, projects: [] }).expect(200)).body.superAdmin).toBe(true);
    expect((await sup.put(`${A}/accounts/${ADM}/habilitations`, { admin: true, superAdmin: false, projects: [] }).expect(200)).body).toMatchObject({ profile: 'ADMIN', superAdmin: false });
    // Page Administrateurs : niveau changé par le Super Admin, jamais par un Admin.
    expect((await adm.put(`${A}/admins/${ADM}/level`, { level: 'super' })).status).toBe(403);
    expect((await sup.put(`${A}/admins/${ADM}/level`, { level: 'super' }).expect(200)).body.find((x: any) => x.accountId === ADM).level).toBe('super');
    expect((await sup.put(`${A}/admins/${ADM}/level`, { level: 'admin' }).expect(200)).body.find((x: any) => x.accountId === ADM).level).toBe('admin');
    expect((await sup.put(`${A}/admins/u1/level`, { level: 'admin' })).status).toBe(409);
    // Un Super Admin ne retire pas son propre profil.
    expect((await sup.put(`${A}/accounts/u1/habilitations`, { admin: true, superAdmin: false, projects: [] })).status).toBe(409);
    const audit = await t.db.auditEntry.findMany({ where: { entityType: 'AdminGrant', entityId: ADM }, orderBy: { at: 'asc' } });
    expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(['Attribution du profil Super Admin', 'Retrait du profil Super Admin']));
  });
});
