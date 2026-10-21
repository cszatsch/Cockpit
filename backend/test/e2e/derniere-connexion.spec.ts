import { setup, TestCtx, Client, WHO } from '../helpers';

const A = '/api/admin';

/**
 * Console › Accès › Utilisateurs, « Dernière connexion » (21/10/2026) : une connexion de la veille, moins de 24 h
 * avant l'heure de lecture, s'affichait « Aujourd'hui » (jours comptés en périodes de 24 h). Jours du calendrier à Paris.
 * Heure figée des tests : 26/09/2026 08:24 UTC, soit 10:24 à Paris.
 */
describe('Console — dernière connexion en jours du calendrier', () => {
  let t: TestCtx;
  let admin: Client;
  let id: string;

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    id = (await t.db.account.findFirstOrThrow({ where: { status: 'ACTIVE', id: { not: 'u1' } }, orderBy: { id: 'asc' } })).id;
  });
  afterAll(() => t.close());

  const row = async () => (await admin.get(`${A}/accounts?limit=500`).expect(200)).body.items.find((a: any) => a.id === id);
  const loginAt = (iso: string) => t.db.account.update({ where: { id }, data: { lastLoginAt: new Date(iso) } });

  it('connexion d’hier 15:11, 19 h plus tôt : « hier » (1 jour), et non « aujourd’hui »', async () => {
    await loginAt('2026-09-25T13:11:00Z');
    expect((await row()).lastLoginDays).toBe(1);
  });

  it('connexion du jour, même juste après minuit à Paris : 0', async () => {
    await loginAt('2026-09-25T22:05:00Z'); // 26/09 00:05 à Paris
    expect((await row()).lastLoginDays).toBe(0);
  });

  it('connexion d’il y a trois jours civils : 3', async () => {
    await loginAt('2026-09-23T20:00:00Z');
    expect((await row()).lastLoginDays).toBe(3);
  });
});
