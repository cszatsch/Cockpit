import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { AuthController } from '../../src/core/auth/auth.controller';
import { ApiCardsService } from '../../src/admin/api-cards.service';
import { LlmClient } from '../../src/core/llm-client';
import { TodayService } from '../../src/core/today.service';
import { encryptSecret } from '../../src/core/crypto';
import { JEV_DAILY_QUESTIONS_MAX, jevQuotaMessage } from '../../src/domain/hardening';

/** Audit de sécurité du 18/10/2026, lot 7 : configuration et exposition. */
describe('Audit 18/10/2026 — configuration et exposition', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('connexion de développement : refusée hors de la boucle locale', async () => {
    const ctl = t.app.get(AuthController);
    await expect(ctl.devLogin({ accountId: 'u1' }, { socket: { remoteAddress: '10.0.0.5' }, headers: {} })).rejects.toMatchObject({ status: 404 });
    await expect(ctl.devLogin({ accountId: 'u1' }, { socket: { remoteAddress: '::ffff:192.168.1.20' }, headers: {} })).rejects.toMatchObject({ status: 404 });
    await request(t.app.getHttpServer()).post('/api/auth/dev-login').send({ accountId: 'u1' }).expect(200);
  });

  it('proxy des widgets : HTML refusé (502), en-têtes nosniff et sandbox sur toute réponse', async () => {
    const svc = t.app.get(ApiCardsService);
    svc.resolveOffline = true;
    svc.lookupImpl = async () => ['93.184.216.34'];
    let type = 'text/html; charset=utf-8';
    svc.fetchImpl = (async () => new Response(type.includes('html') ? '<script>alert(1)</script>' : '{"ok":true}', { status: 200, headers: { 'Content-Type': type } })) as typeof fetch;
    const c = await t.as(WHO.pmo);
    const html = await c.get('/api/widgets/proxy/open-meteo?latitude=1&longitude=2').expect(502);
    expect(html.body.code).toBe('UPSTREAM_CONTENT_REFUSED');
    expect(JSON.stringify(html.body)).not.toContain('<script>');
    expect(html.headers['x-content-type-options']).toBe('nosniff');
    type = 'application/json';
    const ok = await c.get('/api/widgets/proxy/open-meteo?latitude=3&longitude=4').expect(200);
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(ok.headers['content-security-policy']).toContain('sandbox');
  });

  it('relais Cloud Run : adresse transmise retenue seulement s’il envoie le secret déclaré (RELAIS_SECRET)', async () => {
    const before = process.env.RELAIS_SECRET;
    process.env.RELAIS_SECRET = 'secret-du-relais-de-test';
    try {
      const login = (headers: Record<string, string>) =>
        request(t.app.getHttpServer()).post('/api/auth/login').set(headers).send({ email: `inconnu.${Date.now()}.${Math.random()}@example.com`, password: 'mauvais', surface: 'app' });
      await login({ 'X-Rise-Relais': 'secret-du-relais-de-test', 'X-Rise-Client-Ip': '198.51.100.9, 203.0.113.5' }).expect(401);
      expect(await t.db.loginThrottle.findUnique({ where: { key: 'ip:203.0.113.5' } })).toBeTruthy();
      await login({ 'X-Rise-Relais': 'faux', 'X-Rise-Client-Ip': '203.0.113.77' }).expect(401);
      expect(await t.db.loginThrottle.findUnique({ where: { key: 'ip:203.0.113.77' } })).toBeNull();
    } finally {
      if (before === undefined) delete process.env.RELAIS_SECRET;
      else process.env.RELAIS_SECRET = before;
    }
  });

  it(`Jev : ${JEV_DAILY_QUESTIONS_MAX} questions par compte et par jour, Cockpit et Console`, async () => {
    const day = t.app.get(TodayService).today();
    await t.db.jevQuota.create({ data: { accountId: 'u1', day, count: JEV_DAILY_QUESTIONS_MAX } });
    const r = await (await t.as(WHO.admin)).post('/api/admin/assistant/messages', { context: { section: 'apis' }, text: 'Bonjour' }).expect(429);
    expect(r.body).toMatchObject({ code: 'JEV_QUOTA', message: jevQuotaMessage() });
    const pmo = (await t.db.account.findFirstOrThrow({ where: { personId: 'p01' } })).id;
    await t.db.jevQuota.create({ data: { accountId: pmo, day, count: JEV_DAILY_QUESTIONS_MAX } });
    await (await t.as(WHO.pmo)).post('/api/projects/RISE/assistant/messages', { context: { space: 'pilotage', tab: 'risques' }, text: 'Bonjour' }).expect(429);
    // Un autre compte n'est pas touché ; son compteur avance d'une question.
    await (await t.as(WHO.respC5)).post('/api/projects/RISE/assistant/messages', { context: { space: 'pilotage', tab: 'risques' }, text: 'Bonjour' }).expect(200);
    const resp = (await t.db.account.findFirstOrThrow({ where: { personId: 'p06' } })).id;
    expect((await t.db.jevQuota.findUniqueOrThrow({ where: { accountId_day: { accountId: resp, day } } })).count).toBe(1);
  });

  it('plafond mensuel d’un fournisseur atteint : aucun appel payant, message clair', async () => {
    await t.db.provider.updateMany({ where: { id: { in: ['anthropic', 'openai'] } }, data: { status: 'OK', monthlyCapEur: 1 } });
    await t.db.provider.update({ where: { id: 'anthropic' }, data: { keyCipher: encryptSecret('sk-ant-test-0000000000000000AbCd') } });
    await t.db.provider.update({ where: { id: 'openai' }, data: { keyCipher: encryptSecret('sk-proj-test-000000000000000WxYz') } });
    await t.db.modelAssignment.update({ where: { functionId: 'guidage' }, data: { primaryModelId: 'haiku', fallbackModelId: 'gpt5mini' } });
    await t.db.skill.updateMany({ where: { n: { in: ['Guidage console', 'Guidage Console'] } }, data: { n: 'Guidage console', on: true } });
    const now = new Date();
    for (const [providerId, modelId] of [['anthropic', 'haiku'], ['openai', 'gpt5mini']]) {
      await t.db.usageRecord.create({ data: { at: now, functionId: 'guidage', modelId, providerId, tokensIn: 1, tokensOut: 1, costEur: 2, source: 'JEV' } as any });
    }
    const client = t.app.get(LlmClient);
    const calls: string[] = [];
    client.live = true;
    client.fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response('{}', { status: 500 });
    }) as any;
    try {
      await t.db.jevQuota.deleteMany({});
      const r = await (await t.as(WHO.admin)).post('/api/admin/assistant/messages', { context: { section: 'apis' }, text: 'Où règle-t-on le quota d’une carte ?' });
      expect(calls).toEqual([]);
      expect(JSON.stringify(r.body)).toContain('plafond mensuel de');
    } finally {
      client.live = false;
      client.fetchImpl = (...a) => fetch(...a);
    }
  });
});
