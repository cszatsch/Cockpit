import net from 'net';
import { setup, TestCtx, Client, WHO } from '../helpers';
import { smtpProbe } from '../../src/core/smtp-probe';
import { decryptSecret } from '../../src/core/crypto';

const S = '/api/admin/settings/smtp';
const PASS = 'mot-de-passe-de-test-4F2A';

/** Faux serveur SMTP en clair : EHLO, AUTH PLAIN / LOGIN, MAIL, RCPT, DATA ; authentification exigée avant MAIL FROM. */
function fakeSmtp(opts: { silent?: boolean } = {}) {
  const received: Array<{ from: string; to: string[]; data: string }> = [];
  const server = net.createServer((sock) => {
    if (opts.silent) return; // n'envoie jamais d'accueil (serveur qui attend TLS dès la connexion)
    let buf = '', authed = false, inData = false, cur = { from: '', to: [] as string[], data: '' }, loginStep = 0, loginUser = '';
    const say = (l: string) => sock.write(l + '\r\n');
    say('220 faux-smtp ESMTP prêt');
    sock.on('data', (c) => {
      buf += c.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; received.push(cur); cur = { from: '', to: [], data: '' }; say('250 2.0.0 OK mis en file'); } else cur.data += line + '\n';
          continue;
        }
        if (loginStep === 1) { loginUser = Buffer.from(line, 'base64').toString(); loginStep = 2; say('334 UGFzc3dvcmQ6'); continue; }
        if (loginStep === 2) { loginStep = 0; authed = loginUser === 'envoi@exemple.fr' && Buffer.from(line, 'base64').toString() === PASS; say(authed ? '235 2.7.0 Accepted' : '535 5.7.8 Username and Password not accepted.'); continue; }
        const [cmd] = line.split(' ');
        switch (cmd.toUpperCase()) {
          case 'EHLO': say('250-faux-smtp'); say('250-AUTH PLAIN LOGIN'); say('250 8BITMIME'); break;
          case 'AUTH': {
            const [, mech, arg] = line.split(' ');
            if (mech === 'LOGIN') { loginStep = 1; say('334 VXNlcm5hbWU6'); break; }
            const [, u, p] = Buffer.from(arg ?? '', 'base64').toString().split('\u0000');
            authed = u === 'envoi@exemple.fr' && p === PASS;
            say(authed ? '235 2.7.0 Accepted' : '535-5.7.8 Username and Password not accepted.\r\n535 5.7.8 https://aide.exemple.fr');
            break;
          }
          case 'MAIL':
            if (!authed) { say('530 5.7.0 Authentication Required.'); break; }
            if (/refuse@/.test(line)) { say('553 5.1.2 The sender address is not valid'); break; }
            cur.from = /<([^>]*)>/.exec(line)?.[1] ?? ''; say('250 2.1.0 OK'); break;
          case 'RCPT': cur.to.push(/<([^>]*)>/.exec(line)?.[1] ?? ''); say('250 2.1.5 OK'); break;
          case 'DATA': inData = true; say('354 Go ahead'); break;
          case 'RSET': cur = { from: '', to: [], data: '' }; say('250 2.0.0 OK'); break;
          case 'QUIT': say('221 2.0.0 Au revoir'); sock.end(); break;
          default: say('502 5.5.1 Unrecognized command');
        }
      }
    });
    sock.on('error', () => {});
  });
  return new Promise<{ port: number; received: typeof received; close: () => Promise<void> }>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as net.AddressInfo).port, received, close: () => new Promise((r) => server.close(() => r())) })),
  );
}

describe('Console — serveur d’envoi SMTP (spécification SMTP § 5 à § 7)', () => {
  let t: TestCtx;
  let admin: Client;
  let srv: Awaited<ReturnType<typeof fakeSmtp>>;
  const draft = () => ({ host: '127.0.0.1', port: srv.port, enc: 'none', auth: true, user: 'envoi@exemple.fr', from: 'envoi@exemple.fr' });

  // Indépendant du .env local (chargé par le client Prisma) : aucune variable SMTP_* pendant ces tests.
  const saved: Record<string, string | undefined> = {};
  beforeAll(async () => {
    t = await setup(); // (le client Prisma charge le .env à sa création : variables effacées ensuite)
    for (const k of Object.keys(process.env).filter((k) => k.startsWith('SMTP_'))) { saved[k] = process.env[k]; delete process.env[k]; }
    admin = await t.as(WHO.admin);
    srv = await fakeSmtp();
  });
  afterAll(async () => {
    Object.assign(process.env, saved);
    await t.db.smtpSettings.deleteMany({});
    await srv.close();
    await t.close();
  });

  it('lecture : valeurs de l’environnement tant que rien n’est enregistré, jamais de mot de passe ; réservé à l’Admin', async () => {
    await (await t.as(WHO.pmo)).get(S).expect(403);
    const r = await admin.get(S).expect(200);
    // From : SMTP_FROM, sinon l'adresse de MAIL_FROM, sinon l'identifiant.
    expect(r.body).toEqual({ host: 'smtp.gmail.com', port: 587, enc: 'starttls', auth: true, user: '', from: process.env.MAIL_FROM ? expect.stringContaining('@') : '', hasPassword: false, lastTest: null, lastOkAt: null, source: 'environnement' });
  });

  it('enregistrement : validation, mot de passe chiffré et jamais renvoyé ; champ vide = mot de passe conservé', async () => {
    const bad = await admin.put(S, { ...draft(), host: 'smtp', port: 0, from: 'x', password: PASS }).expect(400);
    expect(Object.keys(bad.body.fields).sort()).toEqual(['from', 'host', 'port']);
    expect((await admin.put(S, { ...draft(), password: '' }).expect(400)).body.fields.password).toBeDefined();
    const r = await admin.put(S, { ...draft(), password: PASS }).expect(200);
    expect(r.body).toMatchObject({ host: '127.0.0.1', port: srv.port, enc: 'none', hasPassword: true, source: 'console' });
    expect(JSON.stringify(r.body)).not.toContain(PASS);
    const row = await t.db.smtpSettings.findUniqueOrThrow({ where: { id: 'smtp' } });
    expect(row.passwordEncrypted).not.toContain(PASS);
    expect(decryptSecret(row.passwordEncrypted!)).toBe(PASS);
    await admin.put(S, { ...draft(), password: '' }).expect(200);
    expect(decryptSecret((await t.db.smtpSettings.findUniqueOrThrow({ where: { id: 'smtp' } })).passwordEncrypted!)).toBe(PASS);
    const audit = await t.db.auditEntry.findMany({ where: { entityType: 'SmtpSettings' } });
    expect(audit.length).toBe(2);
    expect(audit[0]).toMatchObject({ severity: 'SENSITIVE', action: 'Modification du serveur d’envoi SMTP' });
    expect(JSON.stringify(audit)).not.toContain(PASS);
  });

  it('test de connexion : vrai dialogue, étape en échec et code SMTP réel ; le dernier test des réglages enregistrés est conservé', async () => {
    const ok = await admin.post(`${S}/test`, draft()).expect(200);
    expect(ok.body).toMatchObject({ ok: true, step: null, code: '250 2.1.0 OK' });
    expect(ok.body.ms).toEqual(expect.any(Number));
    expect(ok.body.connectMs).toEqual(expect.any(Number));
    expect((await admin.get(S).expect(200)).body).toMatchObject({ lastTest: { ok: true }, lastOkAt: expect.any(String) });
    expect((await admin.post(`${S}/test`, { ...draft(), password: 'court' }).expect(200)).body).toMatchObject({ ok: false, step: 'auth', code: '535 5.7.8 Username and Password not accepted.' });
    expect((await admin.post(`${S}/test`, { ...draft(), auth: false }).expect(200)).body).toMatchObject({ ok: false, step: 'auth', code: '530 5.7.0 Authentication Required.' });
    expect((await admin.post(`${S}/test`, { ...draft(), from: 'refuse@exemple.fr' }).expect(200)).body).toMatchObject({ ok: false, step: 'from', code: '553 5.1.2 The sender address is not valid' });
    const closed = await admin.post(`${S}/test`, { ...draft(), port: 1 }).expect(200);
    expect(closed.body).toMatchObject({ ok: false, step: 'connect' });
    expect(closed.body.code).toMatch(/ECONNREFUSED/);
    expect(JSON.stringify(closed.body)).not.toContain(PASS);
    await (await t.as(WHO.pmo)).post(`${S}/test`, draft()).expect(403);
  });

  it('dialogue : hôte introuvable (connexion), serveur muet (chiffrement attendu dès l’ouverture), LOGIN', async () => {
    const dns = await smtpProbe({ ...draft(), host: 'smtp.introuvable.invalid' } as any, PASS, { connectTimeoutMs: 5000 });
    expect(dns).toMatchObject({ ok: false, step: 'connect' });
    expect(dns.code).toMatch(/ENOTFOUND|EAI_AGAIN/);
    const mute = await fakeSmtp({ silent: true });
    const m = await smtpProbe({ ...draft(), port: mute.port } as any, PASS, { replyTimeoutMs: 300 });
    expect(m).toMatchObject({ ok: false, step: 'tls', code: 'Greeting never received' });
    await mute.close();
  });

  it('e-mail de test envoyé par le serveur ; canal E-mail des règles de notification branché sur ce serveur', async () => {
    const n0 = srv.received.length;
    const r = await admin.post(`${S}/test-email`, { to: 'destinataire@exemple.fr', settings: { ...draft(), password: '' } }).expect(200);
    expect(r.body).toMatchObject({ ok: true, to: 'destinataire@exemple.fr' });
    expect(srv.received.length).toBe(n0 + 1);
    expect(srv.received.at(-1)).toMatchObject({ from: 'envoi@exemple.fr', to: ['destinataire@exemple.fr'] });
    expect(srv.received.at(-1)!.data).toMatch(/RISE Cockpit/);
    expect((await admin.post(`${S}/test-email`, { to: 'x@exemple.fr', settings: { ...draft(), port: 1 } }).expect(422)).body.message).toMatch(/Échec de l’envoi/);
    // Canal E-mail : « M'envoyer un test » d'une règle part par le serveur SMTP enregistré.
    const n1 = srv.received.length;
    const sent = await admin.post('/api/admin/notification-rules/n4/test').expect(200);
    expect(sent.body.find((d: any) => d.channel === 'EMAIL')).toMatchObject({ status: 'OK' });
    expect(srv.received.slice(n1).some((m) => m.to.includes('julien.morel@example.com'))).toBe(true);
  });
});
