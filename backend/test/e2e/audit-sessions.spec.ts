import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { setup, TestCtx, WHO } from '../helpers';
import { SHARE_SECRETS_SUPER_ADMIN } from '../../src/admin/share.service';

/** Audit de sécurité du 18/10/2026, lot 4 : sessions et connexion. */
describe('Audit 18/10/2026 — sessions et connexion', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('jeton d’une session par cookie : refusé en Bearer et en ?access_token=, ancien rang refusé partout', async () => {
    const jwt = t.app.get(JwtService);
    const session = await t.db.authSession.create({ data: { accountId: 'u1', device: 'test', surface: 'APP', rotation: 1 } });
    const current = await jwt.signAsync({ sub: 'u1', sid: session.id, rot: 1 });
    const stale = await jwt.signAsync({ sub: 'u1', sid: session.id, rot: 0 });
    const server = t.app.getHttpServer();
    await request(server).get('/api/me').set('Cookie', `rise_session=${current}`).expect(200);
    await request(server).get('/api/me').set('Cookie', `rise_session=${stale}`).expect(401);
    for (const tok of [current, stale]) {
      await request(server).get('/api/me').set('Authorization', `Bearer ${tok}`).expect(401);
      await request(server).get('/api/me?access_token=' + encodeURIComponent(tok)).expect(401);
      await request(server).get('/api/admin/accounts').set('Authorization', `Bearer ${tok}`).expect(401);
    }
    // Session de développement (sans surface) : toujours acceptée en Bearer.
    await (await t.as(WHO.admin)).get('/api/me').expect(200);
  });

  it('Partager Cockpit : un Admin qui n’est pas Super Admin ne met ni clé ni SMTP dans un paquet', async () => {
    await t.db.account.create({ data: { id: 'acc-audit-admin', email: 'admin.audit@example.com', fullName: 'Alice Admin', status: 'ACTIVE' } });
    await t.db.adminGrant.create({ data: { accountId: 'acc-audit-admin' } });
    const adm = await t.as({ accountId: 'acc-audit-admin' });
    const body = (o: Record<string, unknown>) => ({
      data: 'demo', projects: [], keys: [], smtp: false, files: true, code: true,
      recipient: { name: 'Antoine Mercier', email: 'antoine.mercier@example.com' }, prefill: { enabled: false, profiles: [] }, update: 'keep', ...o,
    });
    const keyed = await t.db.provider.findFirst({ where: { keyCipher: { not: null } } });
    expect(keyed).toBeTruthy();
    const r = await adm.post('/api/admin/share/packages', body({ keys: [keyed!.id] })).expect(403);
    expect(r.body.message).toBe(SHARE_SECRETS_SUPER_ADMIN);
    expect(await t.db.sharePackage.count()).toBe(0);
  });
});
