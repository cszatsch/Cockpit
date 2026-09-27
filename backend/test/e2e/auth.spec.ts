import request from 'supertest';
import { setup, TestCtx } from '../helpers';
import { createApp } from '../../src/app.factory';
import { MailerService } from '../../src/core/mailer.service';
import { hashPassword } from '../../src/core/auth/password';
import { createInitialAdmin, INITIAL_ADMIN } from '../../src/core/auth/initial-admin';
import { IDLE_MINUTES, INVALID_CREDENTIALS, FORGOT_NEUTRAL, MAX_FAILURES, SERVER_IDLE_GRACE_MINUTES } from '../../src/core/auth/policy';

/** Mots de passe de test (conformes aux règles), propres à cette suite. */
const PMO_PWD = 'Pilotage-Test-2026!';
const ADMIN_PWD = 'Console-Test-2026!';
const NEW_PWD = 'Nouveau-Secret-2026#';

type Jar = Record<string, string>;

/** Cookies posés par une réponse (nom → valeur) et leurs attributs bruts. */
function cookiesOf(r: request.Response): { jar: Jar; raw: string[] } {
  const raw = ([] as string[]).concat((r.headers['set-cookie'] as unknown as string[]) ?? []);
  const jar: Jar = {};
  for (const c of raw) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    jar[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  }
  return { jar, raw };
}
/** Jeton du lien contenu dans un e-mail. */
const tokenOf = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1];
const cookieHeader = (jar: Jar) => Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');

describe('Authentification (spécification AUTH)', () => {
  let t: TestCtx;
  let mailer: MailerService;
  const server = () => t.app.getHttpServer();

  const login = (email: string, password: string, surface: 'app' | 'admin' = 'app') =>
    request(server()).post('/api/auth/login').send({ email, password, surface });

  /** Connexion réussie : cookies de session et en-têtes prêts à l'emploi. */
  async function signIn(email: string, password: string, surface: 'app' | 'admin' = 'app') {
    const r = await login(email, password, surface).expect(200);
    const { jar } = cookiesOf(r);
    const csrf = jar[surface === 'admin' ? 'rise_admin_csrf' : 'rise_csrf'];
    const h = { Cookie: cookieHeader(jar), 'X-CSRF-Token': csrf, ...(surface === 'admin' ? { 'X-Rise-Surface': 'admin' } : {}) };
    return { r, jar, csrf, h };
  }

  beforeAll(async () => {
    t = await setup();
    mailer = t.app.get(MailerService);
    await t.db.account.update({ where: { id: 'u2' }, data: { passwordHash: await hashPassword(PMO_PWD) } });
    await t.db.account.update({ where: { id: 'u1' }, data: { passwordHash: await hashPassword(ADMIN_PWD) } });
  });
  afterAll(() => t.close());
  // Chaque test repart sans compteur d'échecs (toutes les requêtes viennent de la même IP).
  beforeEach(() => t.db.loginThrottle.deleteMany());

  const pmo = async () => (await t.db.account.findUniqueOrThrow({ where: { id: 'u2' } })).email;
  const admin = async () => (await t.db.account.findUniqueOrThrow({ where: { id: 'u1' } })).email;

  describe('connexion', () => {
    it('ouvre une session par cookie HttpOnly, Secure, SameSite=Strict', async () => {
      const r = await login(await pmo(), PMO_PWD).expect(200);
      expect(r.body).toMatchObject({ mustChangePassword: false, redirect: '/', idleMinutes: IDLE_MINUTES.APP });
      expect(r.body.user.roleLabel).toContain('PMO');
      const { raw } = cookiesOf(r);
      const session = raw.find((c) => c.startsWith('rise_session='))!;
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/Secure/i);
      expect(session).toMatch(/SameSite=Strict/i);
      expect(raw.find((c) => c.startsWith('rise_csrf='))).not.toMatch(/HttpOnly/i);
    });

    it('le cookie donne accès à l’API ; une écriture sans jeton anti-CSRF est refusée', async () => {
      const { h } = await signIn(await pmo(), PMO_PWD);
      await request(server()).get('/api/me').set('Cookie', h.Cookie).expect(200);
      const r = await request(server()).post('/api/auth/keepalive').set('Cookie', h.Cookie).expect(403);
      expect(r.body.code).toBe('CSRF');
      await request(server()).post('/api/auth/keepalive').set(h).expect(200);
    });

    it('message générique, identique pour un mot de passe faux et une adresse inconnue', async () => {
      const a = await login(await pmo(), 'Mauvais-Mot-2026!').expect(401);
      const b = await login('personne.inconnue@exemple.fr', 'Mauvais-Mot-2026!').expect(401);
      expect(a.body).toEqual({ code: 'INVALID_CREDENTIALS', message: INVALID_CREDENTIALS, remaining: MAX_FAILURES - 1 });
      expect(b.body).toEqual(a.body);
    });

    it('vérifie le format de l’adresse côté serveur', async () => {
      const r = await login('pas-une-adresse', 'x').expect(400);
      expect(r.body.fields.email).toBeTruthy();
    });

    it('bloque 15 minutes après 5 échecs, même avec le bon mot de passe ensuite', async () => {
      const email = await pmo();
      for (let i = 1; i < MAX_FAILURES; i++) {
        const r = await login(email, 'Mauvais-Mot-2026!').expect(401);
        expect(r.body.remaining).toBe(MAX_FAILURES - i);
      }
      const locked = await login(email, 'Mauvais-Mot-2026!').expect(423);
      expect(locked.body.code).toBe('ACCOUNT_LOCKED');
      expect(locked.body.retryAfter).toBe(15 * 60);
      await login(email, PMO_PWD).expect(423);
      const audit = await t.db.auditEntry.findFirst({ where: { entityId: 'u2', action: { contains: 'Blocage temporaire' } } });
      expect(audit?.severity).toBe('SENSITIVE');
      // Fin du blocage : la connexion redevient possible.
      await t.db.loginThrottle.updateMany({ data: { lockedUntil: new Date(Date.now() - 1000) } });
      await login(email, PMO_PWD).expect(200);
    });

    it('bloque aussi une adresse inconnue, avec la même réponse', async () => {
      for (let i = 1; i < MAX_FAILURES; i++) await login('fantome@exemple.fr', 'Mauvais-Mot-2026!').expect(401);
      const r = await login('fantome@exemple.fr', 'Mauvais-Mot-2026!').expect(423);
      expect(r.body.retryAfter).toBe(15 * 60);
    });

    it('refuse un compte suspendu avec le message générique', async () => {
      const u11 = await t.db.account.update({ where: { id: 'u11' }, data: { passwordHash: await hashPassword(PMO_PWD) } });
      const r = await login(u11.email, PMO_PWD).expect(401);
      expect(r.body.message).toBe(INVALID_CREDENTIALS);
    });
  });

  describe('console', () => {
    it('refuse la console à un compte sans droit d’administration (403) et journalise la tentative', async () => {
      const r = await login(await pmo(), PMO_PWD, 'admin').expect(403);
      expect(r.body.code).toBe('ADMIN_REQUIRED');
      expect(cookiesOf(r).raw).toHaveLength(0);
      const audit = await t.db.auditEntry.findFirst({ where: { entityId: 'u2', action: 'Tentative d’accès à la console refusée' } });
      expect(audit).toBeTruthy();
    });

    it('un administrateur obtient une session de console, distincte de celle de l’application', async () => {
      const { h, r } = await signIn(await admin(), ADMIN_PWD, 'admin');
      expect(r.body.redirect).toBe('/console');
      expect(r.body.idleMinutes).toBe(IDLE_MINUTES.ADMIN);
      await request(server()).get('/api/admin/accounts').set(h).expect(200);
      // Une session de l'application ne donne pas accès à l'API de la console.
      const app = await signIn(await admin(), ADMIN_PWD, 'app');
      await request(server()).get('/api/admin/accounts').set('Cookie', app.h.Cookie).expect(401);
    });

    it('GET /session ne reconnaît la console que pour un administrateur', async () => {
      const a = await signIn(await admin(), ADMIN_PWD, 'admin');
      const s = await request(server()).get('/api/auth/session?surface=admin').set('Cookie', a.h.Cookie).expect(200);
      expect(s.body).toMatchObject({ authenticated: true, mustChangePassword: false });
      expect(s.body.user.isAdmin).toBe(true);
      const none = await request(server()).get('/api/auth/session?surface=admin').expect(200);
      expect(none.body.authenticated).toBe(false);
    });
  });

  describe('session', () => {
    it('expire après l’inactivité de la surface (30 min pour l’application)', async () => {
      const { h, r } = await signIn(await pmo(), PMO_PWD);
      const sid = (await t.db.authSession.findFirstOrThrow({ where: { accountId: 'u2', revokedAt: null }, orderBy: { createdAt: 'desc' } })).id;
      expect(r.status).toBe(200);
      await t.db.authSession.update({ where: { id: sid }, data: { lastSeenAt: new Date(Date.now() - (IDLE_MINUTES.APP + SERVER_IDLE_GRACE_MINUTES + 1) * 60_000) } });
      const e = await request(server()).get('/api/me').set('Cookie', h.Cookie).expect(401);
      expect(e.body.code).toBe('SESSION_EXPIRED');
      expect((await t.db.authSession.findUniqueOrThrow({ where: { id: sid } })).revokedAt).not.toBeNull();
    });

    it('« Rester connecté » renouvelle le jeton ; l’ancien cookie est invalidé (rotation)', async () => {
      const { h } = await signIn(await pmo(), PMO_PWD);
      const k = await request(server()).post('/api/auth/keepalive').set(h).expect(200);
      const next = cookiesOf(k).jar;
      expect(next.rise_session).toBeTruthy();
      await request(server()).get('/api/me').set('Cookie', h.Cookie).expect(401);
      await request(server()).get('/api/me').set('Cookie', cookieHeader({ ...next })).expect(200);
    });

    it('la déconnexion ferme la session et efface les cookies', async () => {
      const { h } = await signIn(await pmo(), PMO_PWD);
      const r = await request(server()).post('/api/auth/logout').set(h).expect(204);
      expect(cookiesOf(r).raw.some((c) => c.startsWith('rise_session=;'))).toBe(true);
      await request(server()).get('/api/me').set('Cookie', h.Cookie).expect(401);
    });
  });

  describe('mot de passe oublié', () => {
    const waitMail = async (to: string, n: number) => {
      for (let i = 0; i < 40 && mailer.outbox.filter((m) => m.to.includes(to)).length < n; i++) await new Promise((r) => setTimeout(r, 50));
      return mailer.outbox.filter((m) => m.to.includes(to));
    };

    it('répond toujours 202 avec le même message neutre', async () => {
      const a = await request(server()).post('/api/auth/forgot').send({ email: 'inconnu@exemple.fr' }).expect(202);
      const b = await request(server()).post('/api/auth/forgot').send({ email: await pmo() }).expect(202);
      expect(a.body).toEqual({ message: FORGOT_NEUTRAL });
      expect(b.body).toEqual(a.body);
    });

    it('lien à usage unique : réinitialise, ferme les sessions, puis n’est plus valide', async () => {
      const email = await pmo();
      const before = (await waitMail(email, 1)).length;
      expect(before).toBeGreaterThanOrEqual(1);
      const mail = mailer.outbox.filter((m) => m.to.includes(email)).pop()!;
      expect(mail.text).toContain('/mot-de-passe/reinitialiser?token=');
      expect(mail.text).toContain('30 minutes');
      const token = tokenOf(mail.text);
      const stored = await t.db.passwordToken.findFirstOrThrow({ where: { accountId: 'u2', usedAt: null } });
      expect(stored.tokenHash).not.toContain(token); // stocké haché
      const v = await request(server()).get('/api/auth/reset/verify').query({ token }).expect(200);
      expect(v.body).toMatchObject({ valid: true, email, surface: 'app' });
      expect(new Date(v.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);

      // Renvoi limité : une seconde demande dans la minute n'envoie rien.
      await request(server()).post('/api/auth/forgot').send({ email }).expect(202);
      await new Promise((r) => setTimeout(r, 300));
      expect(mailer.outbox.filter((m) => m.to.includes(email)).length).toBe(before);

      const open = await signIn(email, PMO_PWD);
      const weak = await request(server()).post('/api/auth/reset').send({ token, password: 'court' }).expect(400);
      expect(weak.body.fields.password).toMatch(/Règles/);
      const same = await request(server()).post('/api/auth/reset').send({ token, password: PMO_PWD }).expect(400);
      expect(same.body.fields.password).toMatch(/différent du précédent/);
      const pwned = await request(server()).post('/api/auth/reset').send({ token, password: 'Password123!' }).expect(400);
      expect(pwned.body.fields.password).toMatch(/compromis/);

      const ok = await request(server()).post('/api/auth/reset').send({ token, password: NEW_PWD }).expect(200);
      expect(ok.body).toEqual({ surface: 'app', loginUrl: '/connexion' });
      await request(server()).get('/api/me').set('Cookie', open.h.Cookie).expect(401);
      await request(server()).post('/api/auth/reset').send({ token, password: 'Encore-Autre-2026!' }).expect(410);
      expect((await request(server()).get('/api/auth/reset/verify').query({ token })).body.valid).toBe(false);
      await login(email, PMO_PWD).expect(401);
      await login(email, NEW_PWD).expect(200);
    });

    it('un lien expiré n’est plus valide', async () => {
      const email = await admin();
      await request(server()).post('/api/auth/forgot').send({ email, surface: 'admin' }).expect(202);
      const token = tokenOf((await waitMail(email, 1)).pop()!.text);
      expect((await request(server()).get('/api/auth/reset/verify').query({ token })).body).toMatchObject({ valid: true, surface: 'admin' });
      await t.db.passwordToken.updateMany({ where: { accountId: 'u1' }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await request(server()).get('/api/auth/reset/verify').query({ token })).body).toEqual({ valid: false, surface: 'admin' });
      await request(server()).post('/api/auth/reset').send({ token, password: NEW_PWD }).expect(410);
    });
  });

  describe('invitation depuis la console', () => {
    it('le lien d’invitation fait choisir un mot de passe et active le compte', async () => {
      const a = await t.as({ accountId: 'u1' });
      const created = await a.post('/api/admin/accounts', { fullName: 'Inès Test', email: 'ines.test@exemple.fr', profile: 'pmo', projectCodes: ['RISE'] }).expect(201);
      expect(created.body.status).toBe('INVITED');
      const mail = mailer.outbox.filter((m) => m.to.includes('ines.test@exemple.fr')).pop()!;
      const token = tokenOf(mail.text);
      await login('ines.test@exemple.fr', NEW_PWD).expect(401);
      const v = await request(server()).get('/api/auth/reset/verify').query({ token }).expect(200);
      expect(v.body).toMatchObject({ valid: true, purpose: 'INVITE', firstName: 'Inès' });
      await request(server()).post('/api/auth/reset').send({ token, password: NEW_PWD }).expect(200);
      expect((await t.db.account.findUniqueOrThrow({ where: { email: 'ines.test@exemple.fr' } })).status).toBe('ACTIVE');
      await login('ines.test@exemple.fr', NEW_PWD).expect(200);
    });

    it('aucune route d’inscription publique', async () => {
      await request(server()).post('/api/auth/register').send({ email: 'x@exemple.fr', password: NEW_PWD }).expect(404);
      await request(server()).post('/api/admin/accounts').send({ fullName: 'X', email: 'x@exemple.fr', profile: 'lec', projectCodes: ['RISE'] }).expect(401);
    });
  });

  describe('changement de mot de passe depuis le profil', () => {
    const OTHER_PWD = 'Profil-Change-2026%';

    it('exige le mot de passe actuel, ferme les autres sessions et garde la session courante', async () => {
      const email = 'ines.test@exemple.fr';
      const other = await signIn(email, NEW_PWD);
      const me = await signIn(email, NEW_PWD);
      const wrong = await request(server()).post('/api/auth/password').set(me.h).send({ currentPassword: 'Faux-Mot-2026!', password: OTHER_PWD }).expect(400);
      expect(wrong.body.fields.currentPassword).toBe('Mot de passe actuel incorrect');
      await request(server()).post('/api/auth/password').set(me.h).send({ password: OTHER_PWD }).expect(400);
      const weak = await request(server()).post('/api/auth/password').set(me.h).send({ currentPassword: NEW_PWD, password: 'court' }).expect(400);
      expect(weak.body.fields.password).toMatch(/Règles/);

      const ok = await request(server()).post('/api/auth/password').set(me.h).send({ currentPassword: NEW_PWD, password: OTHER_PWD }).expect(200);
      expect(Date.now() - Date.parse(ok.body.user.passwordChangedAt)).toBeLessThan(60_000);
      const rotated = cookieHeader(cookiesOf(ok).jar);
      await request(server()).get('/api/me').set('Cookie', rotated).expect(200);
      await request(server()).get('/api/me').set('Cookie', me.h.Cookie).expect(401); // ancien jeton (rotation)
      await request(server()).get('/api/me').set('Cookie', other.h.Cookie).expect(401); // autre session fermée
      const s = await request(server()).get('/api/auth/session?surface=app').set('Cookie', rotated).expect(200);
      expect(s.body.user.passwordChangedAt).toBe(ok.body.user.passwordChangedAt);
      await login(email, NEW_PWD).expect(401);
      await login(email, OTHER_PWD).expect(200);
      const audit = await t.db.auditEntry.findFirst({ where: { action: 'Changement du mot de passe', target: 'Inès Test' } });
      expect(audit?.severity).toBe('SENSITIVE');
    });

    it('l’ancienne demande simulée de la console n’existe plus', async () => {
      const a = await t.as({ accountId: 'u1' });
      await a.post('/api/admin/me/password-reset').expect(404);
    });
  });

  describe('compte initial', () => {
    it('refuse sans variable d’environnement ou avec un mot de passe faible', async () => {
      delete process.env.RISE_INITIAL_ADMIN_PASSWORD;
      expect(await createInitialAdmin(t.db)).toBe('missing-password');
      expect(await createInitialAdmin(t.db, 'faible')).toBe('weak-password');
    });

    it('crée Cédric Schmitz (admin + PMO), haché, changement obligatoire à la première connexion', async () => {
      const provisional = 'Provisoire-Initial-2026!';
      expect(await createInitialAdmin(t.db, provisional)).toBe('created');
      expect(await createInitialAdmin(t.db, provisional)).toBe('exists');
      const acc = await t.db.account.findUniqueOrThrow({ where: { email: INITIAL_ADMIN.email } });
      expect(acc).toMatchObject({ fullName: 'Cédric Schmitz', status: 'ACTIVE', mustChangePassword: true });
      expect(acc.passwordHash).toMatch(/^\$argon2id\$/);
      expect(acc.passwordHash).not.toContain(provisional);
      expect(await t.db.adminGrant.findUnique({ where: { accountId: acc.id } })).toBeTruthy();
      expect(await t.db.habilitation.count({ where: { accountId: acc.id, profile: 'PMO' } })).toBe(await t.db.project.count());

      // Première connexion : session limitée au changement de mot de passe.
      const { r, h } = await signIn(INITIAL_ADMIN.email, provisional, 'admin');
      expect(r.body.mustChangePassword).toBe(true);
      expect(r.body.user).toMatchObject({ firstName: 'Cédric', roleLabel: 'Administrateur · PMO' });
      const blocked = await request(server()).get('/api/admin/accounts').set(h).expect(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      await request(server()).post('/api/auth/password').set(h).send({ password: provisional }).expect(400);
      const ok = await request(server()).post('/api/auth/password').set(h).send({ password: NEW_PWD }).expect(200);
      const rotated = { ...h, Cookie: cookieHeader(cookiesOf(ok).jar) };
      await request(server()).get('/api/admin/accounts').set(rotated).expect(200);
      expect((await t.db.account.findUniqueOrThrow({ where: { id: acc.id } })).mustChangePassword).toBe(false);
      await login(INITIAL_ADMIN.email, provisional, 'admin').expect(401);
    });
  });

  describe('pages', () => {
    let pages: Awaited<ReturnType<typeof createApp>>;
    beforeAll(async () => {
      process.env.FRONTEND_DIR = require('path').resolve(__dirname, '../../../frontends');
      pages = await createApp({ logger: false });
      await pages.init();
      process.env.FRONTEND_DIR = '';
    });
    afterAll(() => pages.close());

    it('sert les deux écrans de connexion à leur adresse', async () => {
      const a = await request(pages.getHttpServer()).get('/connexion').expect(200);
      expect(a.text).toContain('surface="app"');
      expect(a.headers['x-frame-options']).toBe('DENY');
      const b = await request(pages.getHttpServer()).get('/console/connexion').expect(200);
      expect(b.text).toContain('surface="admin"');
    });

    it('renvoie vers la connexion sans session, et la console vers sa propre connexion', async () => {
      const a = await request(pages.getHttpServer()).get('/?project=RISE').expect(302);
      expect(a.headers.location).toBe('/connexion?suite=%2F%3Fproject%3DRISE');
      expect((await request(pages.getHttpServer()).get('/console').expect(302)).headers.location).toBe('/console/connexion');
      expect((await request(pages.getHttpServer()).get('/console/utilisateurs').expect(302)).headers.location).toBe('/console/connexion');
    });

    it('sert le Cockpit et la Console aux sessions de leur surface', async () => {
      const email = await admin();
      const app = await request(pages.getHttpServer()).post('/api/auth/login').send({ email, password: ADMIN_PWD, surface: 'app' }).expect(200);
      const appCookie = cookieHeader(cookiesOf(app).jar);
      expect((await request(pages.getHttpServer()).get('/').set('Cookie', appCookie).expect(200)).text).toContain('api.js');
      // La session de l'application n'ouvre pas la console.
      await request(pages.getHttpServer()).get('/console').set('Cookie', appCookie).expect(302);
      const adm = await request(pages.getHttpServer()).post('/api/auth/login').send({ email, password: ADMIN_PWD, surface: 'admin' }).expect(200);
      const r = await request(pages.getHttpServer()).get('/console').set('Cookie', cookieHeader(cookiesOf(adm).jar)).expect(200);
      expect(r.text).toContain('admin-api.js');
    });
  });
});
