import request from 'supertest';
import { setup, TestCtx, Client, WHO } from '../helpers';
import { ApiCardsService } from '../../src/admin/api-cards.service';
import { InboxService } from '../../src/admin/inbox.service';

const AC = '/api/admin/api-cards';
const KEY = 'SECRET-cle-openweather-9F3A';

/** Registre des cartes API (spécification REGISTRE API § 4 à § 9). */
describe('Console — registre des cartes API', () => {
  let t: TestCtx;
  let admin: Client;
  let svc: ApiCardsService;
  const seen: Array<{ url: string; headers: Record<string, string> }> = [];
  let upstream: (url: string) => { status: number; body: string } = () => ({ status: 200, body: '{"ok":true}' });

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    svc = t.app.get(ApiCardsService);
    svc.resolveOffline = true;
    // Résolution DNS simulée : « rebond.exemple.fr » pointe vers une adresse privée.
    svc.lookupImpl = async (host) => (host === 'rebond.exemple.fr' ? ['10.0.0.8'] : ['93.184.216.34']);
    svc.fetchImpl = (async (url: any, init: any) => {
      seen.push({ url: String(url), headers: init?.headers ?? {} });
      const r = upstream(String(url));
      return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
  });
  afterAll(() => t.close());

  it('liste : cartes initiales des widgets Météo et Actualités, sans clé', async () => {
    const r = await admin.get(AC).expect(200);
    expect(r.body.map((c: any) => c.id).sort()).toEqual(['gdelt', 'open-meteo', 'open-meteo-geocodage']);
    expect(r.body[0]).toMatchObject({ keyLast4: null, enabled: true, status: 'ok' });
    expect(r.body[0].latency24h).toHaveLength(24);
    await (await t.as(WHO.pmo)).get(AC).expect(403);
  });

  it('création : validations (nom, https, IP privée, rebond DNS, clé ≥ 8, quota) ; la clé n’est jamais renvoyée ni tracée', async () => {
    const ok = { name: 'OpenWeather', category: 'Météo', endpoint: 'https://api.openweathermap.org/data/3.0/onecall?appid={key}', key: KEY, keyExpiresAt: '2027-03-15', quotaLimit: 4 };
    for (const [patch, field] of [
      [{ endpoint: 'http://api.openweathermap.org/x' }, 'endpoint'],
      [{ endpoint: 'https://192.168.1.20/api' }, 'endpoint'],
      [{ endpoint: 'https://169.254.169.254/latest/meta-data' }, 'endpoint'],
      [{ endpoint: 'https://localhost:8443/x' }, 'endpoint'],
      [{ endpoint: 'https://rebond.exemple.fr/x' }, 'endpoint'],
      [{ key: 'court' }, 'key'],
      [{ name: '' }, 'name'],
      [{ quotaLimit: 0 }, 'quotaLimit'],
    ] as const) {
      const r = await admin.post(AC, { ...ok, ...patch }).expect(422);
      expect(Object.keys(r.body.fields)).toContain(field);
    }
    const c = await admin.post(AC, ok).expect(201);
    expect(c.body).toMatchObject({ id: 'openweather', keyLast4: '9F3A', keyExpiresAt: '2027-03-15', quotaLimit: 4, quotaUsed: 0 });
    expect(JSON.stringify(c.body)).not.toContain(KEY);
    const row = await t.db.apiCard.findUniqueOrThrow({ where: { id: 'openweather' } });
    expect(row.keyEncrypted).not.toContain(KEY);
    const audit = await t.db.auditEntry.findFirstOrThrow({ where: { action: 'Création d’une carte API' } });
    expect(JSON.stringify(audit)).not.toContain(KEY);
    expect(audit.newValue).toMatchObject({ card_id: 'openweather' });
  });

  it('test manuel : appel réel côté serveur, clé ajoutée par le serveur et masquée dans la réponse ; une erreur passe la carte en erreur', async () => {
    upstream = (u) => ({ status: 200, body: JSON.stringify({ echo: u, temp: 17 }) });
    const r = await admin.post(`${AC}/openweather/test`).expect(200);
    expect(r.body.code).toBe(200);
    expect(seen.at(-1)!.url).toContain(`appid=${encodeURIComponent(KEY)}`);
    expect(r.body.body).not.toContain(KEY);
    expect(r.body.body).toContain('••••9F3A');
    upstream = () => ({ status: 401, body: '{"error":"invalid_api_key"}' });
    await admin.post(`${AC}/openweather/test`).expect(200);
    const card = (await admin.get(AC).expect(200)).body.find((c: any) => c.id === 'openweather');
    expect(card).toMatchObject({ status: 'err', statusNote: 'Clé refusée · 401', lastTest: { code: 401 } });
    expect(await t.db.auditEntry.count({ where: { action: 'Test manuel d’une carte API', entityId: 'openweather' } })).toBe(2);
  });

  it('proxy : 503 si en erreur ou désactivée ; rotation de clé ; quota (429) ; cache ; widget enregistré', async () => {
    const pmo = await t.as(WHO.pmo);
    await pmo.get('/api/widgets/proxy/openweather?lat=48.8').expect(503);

    const rot = await admin.put(`${AC}/openweather/key`, { key: 'NOUVELLE-cle-7B21' }).expect(200);
    expect(rot.body).toMatchObject({ keyLast4: '7B21', status: 'ok' });
    const ra = await t.db.auditEntry.findFirstOrThrow({ where: { action: 'Rotation de la clé d’une carte API' } });
    expect(ra.target).toContain('••••9F3A → ••••7B21');
    expect(JSON.stringify(ra)).not.toContain('NOUVELLE-cle');
    await admin.put(`${AC}/openweather/key`, { key: 'court' }).expect(422);

    upstream = () => ({ status: 200, body: '{"temp":18}' });
    const n0 = seen.length;
    const p1 = await pmo.get('/api/widgets/proxy/openweather?lat=48.8').set('X-RISE-Widget', 'Météo du site').expect(200);
    expect(p1.body).toEqual({ temp: 18 });
    await pmo.get('/api/widgets/proxy/openweather?lat=48.8').expect(200); // cache : pas de nouvel appel
    expect(seen.length).toBe(n0 + 1);
    expect(seen.at(-1)!.url).toContain('lat=48.8');
    expect((await t.db.apiCard.findUniqueOrThrow({ where: { id: 'openweather' } })).widgets).toContain('Météo du site');
    // Quota de 4 appels par jour : déjà 2 tests + 1 appel du proxy ; le 4e passe, le 5e est refusé.
    await pmo.get('/api/widgets/proxy/openweather?lat=1').expect(200);
    await pmo.get('/api/widgets/proxy/openweather?lat=2').expect(429);

    await admin.patch(`${AC}/openweather`, { enabled: false }).expect(200);
    expect((await pmo.get('/api/widgets/proxy/openweather?lat=48.8').expect(503)).body.code).toBe('CARD_DISABLED');
    await admin.patch(`${AC}/openweather`, { enabled: true }).expect(200);
    expect(await t.db.auditEntry.count({ where: { action: { in: ['Activation d’une carte API', 'Désactivation d’une carte API'] } } })).toBe(2);
    await request(t.app.getHttpServer()).get('/api/widgets/proxy/openweather').expect(401);
  });

  it('contrôle de santé et notifications : erreur, échéance J-7 puis J-1, quota ≥ 85 %', async () => {
    const inbox = t.app.get(InboxService);
    await admin.post(AC, { name: 'NewsAPI', category: 'Actualités', endpoint: 'https://newsapi.org/v2/top-headlines', key: 'news-key-51B2', keyExpiresAt: '2026-10-03' }).expect(201);
    upstream = (u) => (u.includes('newsapi') ? { status: 200, body: '{}' } : { status: 500, body: 'panne' });
    expect(await svc.healthCheck()).toBeGreaterThanOrEqual(4);
    // La clé de NewsAPI part dans l'en-tête X-Api-Key (pas de marqueur {key} dans l'endpoint).
    expect(seen.find((s) => s.url.includes('newsapi'))!.headers['X-Api-Key']).toBe('news-key-51B2');
    const list = (await admin.get('/api/admin/notifications').expect(200)).body.items;
    expect(list.find((i: any) => i.title === 'Clé NewsAPI : expire dans 7 j')).toMatchObject({ type: 'warn', target: 'apis' });
    expect(list.find((i: any) => i.title === 'Carte API Open-Meteo · prévisions en erreur')).toMatchObject({ type: 'err', actLabel: 'Voir la carte' });
    expect(list.find((i: any) => /^Quota OpenWeather à \d+ %$/.test(i.title))).toBeTruthy();
    await admin.patch(`${AC}/newsapi`, { keyExpiresAt: '2026-09-27' }).expect(200);
    await inbox.sync();
    const n = await t.db.notification.findUniqueOrThrow({ where: { key: 'apicard:newsapi:exp' } });
    expect(n).toMatchObject({ level: '1', readAt: null, title: 'Clé NewsAPI : expire dans 1 j' });
  });

  it('suppression refusée tant qu’un widget consomme la carte ; aucune réponse de la console ne contient une clé', async () => {
    expect((await admin.del(`${AC}/openweather`).expect(409)).body.code).toBe('IN_USE');
    await admin.post(AC, { name: 'Libre', category: 'Autre', endpoint: 'https://api.exemple.fr/v1', key: 'cle-libre-0000' }).expect(201);
    await admin.del(`${AC}/libre`).expect(204);
    expect(await t.db.auditEntry.count({ where: { action: 'Suppression d’une carte API' } })).toBe(1);
    const all = [await admin.get(AC), await admin.get('/api/admin/notifications'), await admin.get('/api/admin/audit')];
    for (const r of all) for (const k of [KEY, 'NOUVELLE-cle-7B21', 'news-key-51B2', 'cle-libre-0000']) expect(JSON.stringify(r.body)).not.toContain(k);
  });
});
