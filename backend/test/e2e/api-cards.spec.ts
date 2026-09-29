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
    expect(r.body.map((c: any) => c.id).sort()).toEqual(['open-meteo', 'open-meteo-geocodage', 'rss-bbc', 'rss-le-monde', 'rss-lequipe'].sort());
    expect(Object.fromEntries(r.body.filter((c: any) => c.feed).map((c: any) => [c.id, c.enabled]))).toEqual({ 'rss-bbc': true, 'rss-le-monde': true, 'rss-lequipe': true });
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
    const p1 = await pmo.get('/api/widgets/proxy/openweather?lat=48.8').set('X-RISE-Widget', 'Météo · ville').expect(200);
    expect(p1.body).toEqual({ temp: 18 });
    await pmo.get('/api/widgets/proxy/openweather?lat=48.8').expect(200); // cache : pas de nouvel appel
    expect(seen.length).toBe(n0 + 1);
    expect(seen.at(-1)!.url).toContain('lat=48.8');
    expect((await t.db.apiCard.findUniqueOrThrow({ where: { id: 'openweather' } })).widgets).toEqual(['meteo']); // ancien libellé du Cockpit → identifiant du catalogue
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

  it('service lent : délai propre à la carte, dernière réponse servie si l’appel échoue, un seul appel en cours', async () => {
    const pmo = await t.as(WHO.pmo);
    expect((await admin.patch(`${AC}/rss-bbc`, { timeoutMs: 45000 }).expect(200)).body.timeoutMs).toBe(45000);
    await admin.patch(`${AC}/rss-bbc`, { timeoutMs: 120000 }).expect(400);
    const q = '/api/widgets/proxy/rss-bbc?query=France&format=json';
    let calls = 0;
    upstream = (u) => (u.includes('bbci') ? (calls++, { status: 200, body: '{"articles":[{"title":"A"}]}' }) : { status: 200, body: '{}' });
    await admin.post(`${AC}/rss-bbc/test`).expect(200); // le contrôle précédent l'a laissée en erreur
    calls = 0;
    const [a, b] = await Promise.all([pmo.get(q).expect(200), pmo.get(q).expect(200)]);
    expect(calls).toBe(1);
    // Une seule réponse vient d'un appel réel ; l'autre partage l'appel en cours ou lit le cache frais.
    expect([a.headers['x-rise-cache'], b.headers['x-rise-cache']]).toContain('miss');
    svc.forget('rss-bbc');
    // Le cache frais est vidé mais la dernière réponse reste en réserve : un échec (429, 5xx, délai) la sert.
    (svc as any).cache.set('rss-bbc?format=json&query=France', { until: 0, staleUntil: Date.now() + 60_000, r: { code: 200, ms: 20, body: '{"articles":[{"title":"A"}]}', contentType: 'application/json' } });
    upstream = () => ({ status: 429, body: 'Please limit requests to one every 5 seconds' });
    const s = await pmo.get(q).expect(200);
    expect(s.headers['x-rise-cache']).toBe('stale');
    expect(s.body.articles[0].title).toBe('A');
  });

  it('flux RSS : articles d’un flux, agrégation des flux actifs (Les Échos désactivée), flux en échec signalé', async () => {
    const pmo = await t.as(WHO.pmo);
    const rss = (title: string, items: Array<[string, string, string]>) => `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title>${items.map(([t, u, d]) => `<item><title><![CDATA[${t}]]></title><link>${u}</link><pubDate>${d}</pubDate><description>&lt;p&gt;Résumé&lt;/p&gt;</description></item>`).join('')}</channel></rss>`;
    upstream = (u) =>
      u.includes('lemonde') ? { status: 200, body: rss('Le Monde', [['Titre LM', 'https://www.lemonde.fr/1', 'Mon, 28 Sep 2026 10:00:00 GMT']]) }
      : u.includes('bbci') ? { status: 200, body: rss('BBC', [['Title BBC', 'https://www.bbc.co.uk/1', 'Mon, 28 Sep 2026 12:00:00 GMT']]) }
      : u.includes('lequipe') ? { status: 500, body: 'panne' }
      : { status: 200, body: '{}' };
    for (const id of ['rss-le-monde', 'rss-bbc', 'rss-lequipe', 'open-meteo']) await admin.post(`${AC}/${id}/test`).expect(200); // état remis à jour après le contrôle précédent
    const one = await pmo.get('/api/widgets/feeds/rss-le-monde').expect(200);
    expect(one.body).toMatchObject({ source: 'Le Monde', title: 'Le Monde', items: [{ title: 'Titre LM', url: 'https://www.lemonde.fr/1', summary: 'Résumé', source: 'Le Monde' }] });
    const all = await pmo.get('/api/widgets/feeds?limit=5').set('X-RISE-Widget', 'Actualités').expect(200);
    expect(all.body.items.map((i: any) => i.source + ' · ' + i.title)).toEqual(['BBC News · Title BBC', 'Le Monde · Titre LM']);
    expect(Object.fromEntries(all.body.sources.map((x: any) => [x.id, x.ok]))).toEqual({ 'rss-bbc': true, 'rss-lequipe': false, 'rss-le-monde': true });
    // Une carte JSON n'est pas un flux.
    expect((await pmo.get('/api/widgets/feeds/open-meteo').expect(502)).body.code).toBe('NOT_A_FEED');
  });

  it('actualités agrégées : GNews, NewsData.io, Finnhub et flux RSS ramenés à une même forme ; économie à part', async () => {
    const pmo = await t.as(WHO.pmo);
    for (const [name, category, endpoint] of [
      ['GNews', 'Actualités', 'https://gnews.io/api/v4/top-headlines?lang=fr&apikey={key}'],
      ['NewsData.io', 'Actualités', 'https://newsdata.io/api/1/latest?language=fr&apikey={key}'],
      ['Finnhub', 'Finance', 'https://finnhub.io/api/v1/news?category=general&token={key}'],
    ]) await admin.post(AC, { name, category, endpoint, key: `cle-test-${name}-0001` }).expect(201);
    upstream = (u) =>
      u.includes('gnews.io') ? { status: 200, body: JSON.stringify({ articles: [{ title: 'G1', url: 'https://g.fr/1', publishedAt: '2026-09-28T12:00:00Z', source: { name: 'Le Figaro' } }] }) }
      : u.includes('newsdata.io') ? { status: 200, body: JSON.stringify({ status: 'success', results: [{ title: 'N1', link: 'https://n.fr/1', pubDate: '2026-09-28 13:00:00', source_name: 'Ouest-France' }] }) }
      : u.includes('finnhub.io') ? { status: 200, body: JSON.stringify([{ headline: 'F1', url: 'https://f.com/1', datetime: 1790600000, source: 'Reuters' }]) }
      : u.includes('lemonde') ? { status: 200, body: '<rss version="2.0"><channel><title>LM</title><item><title>R1</title><link>https://lm.fr/1</link><pubDate>Mon, 28 Sep 2026 11:00:00 GMT</pubDate></item></channel></rss>' }
      : { status: 503, body: 'indisponible' };
    for (const id of ['gnews', 'newsdata-io', 'finnhub', 'rss-le-monde']) await admin.post(`${AC}/${id}/test`).expect(200);
    (svc as any).cache.clear(); // réponses des tests précédents (cache de 30 min des actualités)
    const a = await pmo.get('/api/widgets/news?limit=5').expect(200);
    expect(a.body.items.map((i: any) => `${i.source} (${i.via}) · ${i.title}`)).toEqual(['Ouest-France (NewsData.io) · N1', 'Le Figaro (GNews) · G1', 'Le Monde (Le Monde) · R1']);
    expect(Object.fromEntries(a.body.sources.map((x: any) => [x.id, x.format]))).toMatchObject({ gnews: 'gnews', 'newsdata-io': 'newsdata', 'rss-le-monde': 'rss' });
    const e = await pmo.get('/api/widgets/news?category=economie').expect(200);
    expect(e.body.items.map((i: any) => i.title)).toEqual(['F1']);
    await pmo.get('/api/widgets/news?category=sport').expect(422);
  });

  it('v3c : catalogue des widgets, association, tag libre, clé dans le PATCH, endpoint modifié, latence médiane', async () => {
    const cat = (await admin.get('/api/admin/widgets').expect(200)).body;
    expect(cat).toHaveLength(22);
    expect(cat.find((w: any) => w.id === 'news')).toEqual({ id: 'news', g: '◉', n: 'Actualité', cat: 'Contexte', apiCard: true, tags: ['Actualités'] });
    expect(cat.filter((w: any) => w.apiCard).map((w: any) => w.id)).toEqual(['news', 'meteo', 'trafic']);
    await (await t.as(WHO.pmo)).get('/api/admin/widgets').expect(403);
    // Tag créé à la volée.
    const c = await admin.post(AC, { name: 'Pappers', category: 'Entreprises', endpoint: 'https://api.pappers.fr/v2/entreprise', key: 'cle-pappers-0001', keyExpiresAt: '2027-01-31' }).expect(201);
    expect(c.body).toMatchObject({ id: 'pappers', category: 'Entreprises', keyLast4: '0001', latencyMedian24h: null, lastTest: null });
    expect((await admin.post(AC, { name: 'X', category: '', endpoint: 'https://api.exemple.fr/x' }).expect(400)).body.fields.category).toBeDefined();
    // Associer / dissocier.
    expect((await admin.put(`${AC}/pappers/widgets`, { ids: ['meteo', 'news', 'meteo'] }).expect(200)).body.widgets).toEqual(['meteo', 'news']);
    expect((await admin.put(`${AC}/pappers/widgets`, { ids: ['inconnu'] }).expect(422)).body.fields.ids).toBe('inconnu');
    // Carte API requise : un widget alimenté par les données du projet ne peut pas être associé.
    expect((await admin.put(`${AC}/pappers/widgets`, { ids: ['ai'] }).expect(422)).body.fields.ids).toBe('ai');
    expect((await admin.put(`${AC}/pappers/widgets`, { ids: ['meteo'] }).expect(200)).body.widgets).toEqual(['meteo']);
    expect((await t.db.auditEntry.findFirst({ where: { action: 'Widgets alimentés par une carte API' }, orderBy: { at: 'desc' } }))!.target).toBe('Pappers · dissociée de Actualité');
    // Test en 401, puis nouvelle clé dans le PATCH : l'erreur est levée, seuls les 4 derniers caractères reviennent.
    upstream = () => ({ status: 401, body: '{"error":"invalid_api_key"}' });
    expect((await admin.post(`${AC}/pappers/test`).expect(200)).body.code).toBe(401);
    expect((await admin.get(AC).expect(200)).body.find((x: any) => x.id === 'pappers')).toMatchObject({ status: 'err', statusNote: 'Clé refusée · 401' });
    const k = await admin.patch(`${AC}/pappers`, { key: 'NOUVELLE-cle-pappers-9C4D' }).expect(200);
    expect(k.body).toMatchObject({ keyLast4: '9C4D', status: 'ok' });
    expect(JSON.stringify(k.body)).not.toContain('NOUVELLE-cle-pappers');
    upstream = () => ({ status: 200, body: '{"ok":true}' });
    expect((await admin.post(`${AC}/pappers/test`).expect(200)).body.code).toBe(200);
    const v1 = (await admin.get(AC).expect(200)).body.find((x: any) => x.id === 'pappers');
    expect(v1.latencyMedian24h).toEqual(expect.any(Number));
    expect(v1.lastTest).toMatchObject({ code: 200 });
    // Endpoint modifié : latence et dernière réponse effacées.
    const ep = await admin.patch(`${AC}/pappers`, { endpoint: 'https://api.pappers.fr/v2/recherche' }).expect(200);
    expect(ep.body).toMatchObject({ latencyMs: null, latencyMedian24h: null, lastTest: null });
    // Retrait de la clé.
    expect((await admin.patch(`${AC}/pappers`, { key: null }).expect(200)).body).toMatchObject({ keyLast4: null, keyExpiresAt: null });
    expect(await t.db.auditEntry.count({ where: { action: 'Rotation de la clé d’une carte API', target: { contains: '••••9C4D' } } })).toBe(1);
  });

  it('suppression, même d’une carte qui alimente un widget (widgets cités dans la trace) ; aucune réponse de la console ne contient une clé', async () => {
    await admin.del(`${AC}/openweather`).expect(204);
    expect((await t.db.auditEntry.findFirst({ where: { action: 'Suppression d’une carte API', entityId: 'openweather' } }))!.target).toBe('OpenWeather · widgets impactés : Météo · <ville>');
    await admin.post(AC, { name: 'Libre', category: 'Autre', endpoint: 'https://api.exemple.fr/v1', key: 'cle-libre-0000' }).expect(201);
    await admin.del(`${AC}/libre`).expect(204);
    expect(await t.db.auditEntry.count({ where: { action: 'Suppression d’une carte API' } })).toBe(2);
    const all = [await admin.get(AC), await admin.get('/api/admin/notifications'), await admin.get('/api/admin/audit')];
    for (const r of all) for (const k of [KEY, 'NOUVELLE-cle-7B21', 'news-key-51B2', 'cle-libre-0000']) expect(JSON.stringify(r.body)).not.toContain(k);
  });
});
