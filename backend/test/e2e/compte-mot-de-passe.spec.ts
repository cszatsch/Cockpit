import request from 'supertest';
import { MailerService } from '../../src/core/mailer.service';
import { setup, TestCtx, Client, WHO } from '../helpers';

const A = '/api/admin';
const PWD = 'Provisoire-Compte-2026!';

/**
 * Compte créé avec son mot de passe par le Super Admin (demande du commanditaire du 20/10/2026) : la fenêtre « Inviter »
 * sans e-mail, pour ne pas dépendre des filtres de messagerie d'une société ; « Définir le mot de passe » d'un invité.
 */
describe('Console — compte créé avec mot de passe (Super Admin)', () => {
  let t: TestCtx;
  let sup: Client;
  let adm: Client;
  let mailer: MailerService;
  const ADM = 'acc-admin-pwd';
  const login = (email: string, password: string, surface: 'app' | 'admin' = 'app') => request(t.app.getHttpServer()).post('/api/auth/login').send({ email, password, surface });

  beforeAll(async () => {
    t = await setup();
    mailer = t.app.get(MailerService);
    await t.db.account.create({ data: { id: ADM, email: 'admin.pwd@example.com', fullName: 'Alice Admin', status: 'ACTIVE' } });
    await t.db.adminGrant.create({ data: { accountId: ADM } });
    sup = await t.as(WHO.admin);
    adm = await t.as({ accountId: ADM });
  });
  afterAll(() => t.close());

  const body = (email: string, password?: string) => ({ fullName: 'Nora Directe', email, habilitations: { admin: false, projects: [{ code: 'RISE', pmo: true }] }, ...(password !== undefined ? { password } : {}) });

  it('crée un compte actif, sans e-mail, mot de passe à changer à la première connexion', async () => {
    const email = 'nora.directe@example.com';
    const before = mailer.outbox.length;
    const r = (await sup.post(`${A}/accounts/with-password`, body(email, PWD)).expect(201)).body;
    expect(r).toMatchObject({ email, status: 'ACTIVE', mustChangePassword: true, inviteSent: null, profiles: ['PMO'] });
    expect(mailer.outbox.length).toBe(before);
    const acc = await t.db.account.findUniqueOrThrow({ where: { email } });
    expect(acc.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await t.db.passwordToken.count({ where: { accountId: acc.id } })).toBe(0);
    // Journal d'audit : la création est tracée, jamais le mot de passe.
    const audit = await t.db.auditEntry.findFirstOrThrow({ where: { entityId: acc.id, action: 'Création d’un compte avec mot de passe' } });
    expect(JSON.stringify(audit)).not.toContain(PWD);
    // Première connexion : changement obligatoire.
    const l = await login(email, PWD).expect(200);
    expect(l.body.mustChangePassword).toBe(true);
  });

  it('refuse un mot de passe faible, un doublon, et l’Admin (403)', async () => {
    const weak = await sup.post(`${A}/accounts/with-password`, body('faible@example.com', 'court')).expect(400);
    expect(weak.body.fields.password).toMatch(/Règles non respectées/);
    await sup.post(`${A}/accounts/with-password`, body('sans.mdp@example.com')).expect(400);
    expect((await sup.post(`${A}/accounts/with-password`, body('nora.directe@example.com', PWD)).expect(409)).body.code).toBe('DUPLICATE');
    const r = await adm.post(`${A}/accounts/with-password`, body('par.admin@example.com', PWD)).expect(403);
    expect(r.body.message).toBe('Modification réservée au Super Admin');
    expect(await t.db.account.count({ where: { email: { in: ['faible@example.com', 'sans.mdp@example.com', 'par.admin@example.com'] } } })).toBe(0);
  });

  it('définit le mot de passe d’un invité : actif, lien d’invitation annulé', async () => {
    const email = 'invite.bloque@example.com';
    const inv = (await sup.post(`${A}/accounts`, body(email)).expect(201)).body;
    expect(inv.status).toBe('INVITED');
    await adm.post(`${A}/accounts/${inv.id}/password`, { password: PWD }).expect(403);
    await sup.post(`${A}/accounts/${inv.id}/password`, { password: 'court' }).expect(400);
    const r = (await sup.post(`${A}/accounts/${inv.id}/password`, { password: PWD }).expect(200)).body;
    expect(r).toMatchObject({ status: 'ACTIVE', mustChangePassword: true });
    expect(await t.db.passwordToken.count({ where: { accountId: inv.id, usedAt: null } })).toBe(0);
    expect(await t.db.auditEntry.count({ where: { entityId: inv.id, action: 'Mot de passe défini par le Super Admin' } })).toBe(1);
    expect((await login(email, PWD).expect(200)).body.mustChangePassword).toBe(true);
    // Compte déjà actif : refusé.
    expect((await sup.post(`${A}/accounts/${inv.id}/password`, { password: PWD }).expect(409)).body.code).toBe('NOT_INVITED');
  });

  it('suspendu puis réactivé sans jamais s’être connecté : reste actif (mot de passe défini)', async () => {
    const r = (await sup.post(`${A}/accounts/with-password`, body('reactive@example.com', PWD)).expect(201)).body;
    await sup.post(`${A}/accounts/${r.id}/suspend`, {}).expect(200);
    expect((await sup.post(`${A}/accounts/${r.id}/reactivate`, {}).expect(200)).body.status).toBe('ACTIVE');
  });
});
