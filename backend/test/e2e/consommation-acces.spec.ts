import { PlatformUsageService } from '../../src/admin/platform-usage.service';
import { setup, TestCtx, WHO } from '../helpers';

const A = '/api/admin/consumption';
const at = (s: string) => new Date(s);

/**
 * Consommation et coûts · Console › Accès (brief du 08/10/2026) : définitions, cohérence des totaux, filtres,
 * hausses inhabituelles, tableau et export, droits « Voir les coûts » et « Voir les données individuelles ».
 */
describe('Consommation et coûts · Accès', () => {
  let t: TestCtx;
  let svc: PlatformUsageService;
  const X = 'acc-usage-x', Y = 'acc-usage-y';

  beforeAll(async () => {
    t = await setup();
    svc = t.app.get(PlatformUsageService);
    const db = t.db;
    // Une personne du référentiel, dans une équipe, liée au compte X par son e-mail.
    await db.team.create({ data: { id: 'team-usage', projectId: 'RISE', name: 'Équipe Usage' } });
    const p1 = await db.person.create({ data: { id: 'p-usage-x', projectId: 'RISE', firstName: 'Xavier', lastName: 'Usage', email: 'x.usage@example.com', teamId: 'team-usage' } });
    await db.account.create({ data: { id: X, email: p1!.email.toLowerCase(), fullName: 'Xavier Usage', status: 'ACTIVE', personId: p1!.id, createdAt: at('2020-01-01T00:00:00Z') } });
    await db.account.create({ data: { id: Y, email: 'y.usage@example.com', fullName: 'Yasmine Usage', status: 'ACTIVE', createdAt: at('2020-01-02T00:00:00Z') } });
    // X, jeudi 10 septembre 2026 (heure de Paris = UTC+2) : session 9:00 → 11:00 UTC.
    const s = await db.authSession.create({ data: { accountId: X, createdAt: at('2026-09-10T09:00:00Z'), lastSeenAt: at('2026-09-10T11:00:00Z'), revokedAt: at('2026-09-10T11:00:00Z'), surface: 'APP' } });
    // Événements 9:00, 9:02, 9:10, 9:30 → 2 + 5 + 5 + 5 = 17 min de temps actif.
    for (const m of ['09:00', '09:02', '09:10', '09:30']) await db.usageEvent.create({ data: { at: at(`2026-09-10T${m}:00Z`), accountId: X, sessionId: s.id, feature: 'projets', kind: 'clic' } });
    await db.usageEvent.create({ data: { at: at('2026-09-10T10:00:00Z'), accountId: X, sessionId: s.id, feature: 'jev', kind: 'saisie' } });
    // Appels d'IA de X : 1,25 € (Jev) le 10 ; Y : 0,50 € le 3 août (période précédente du mois).
    const model = await db.aiModel.findFirst({ where: { category: 'LLM' } });
    const rec = (id: string, d: string, acc: string | null, cost: number, feature: string | null) =>
      db.usageRecord.create({ data: { id, at: at(d), functionId: 'guidage', modelId: model!.id, providerId: model!.providerId, tokensIn: 1000, tokensOut: 200, costEur: cost, source: 'JEV', accountId: acc, feature } });
    await rec('req_usage_x1', '2026-09-10T09:05:00Z', X, 1.25, 'jev');
    await rec('req_usage_y1', '2026-08-03T10:00:00Z', Y, 0.5, 'projets');
    // Projet RISE : un événement et un appel de X le 12 septembre (X est une personne du référentiel de RISE).
    await db.usageEvent.create({ data: { at: at('2026-09-12T09:00:00Z'), accountId: X, feature: 'rapports', kind: 'clic', projectId: 'RISE' } });
    await db.usageRecord.create({ data: { id: 'req_usage_x2', at: at('2026-09-12T09:01:00Z'), functionId: 'rapports', modelId: model!.id, providerId: model!.providerId, tokensIn: 10, tokensOut: 5, costEur: 0.01, source: 'JEV', accountId: X, feature: 'rapports', projectId: 'RISE' } });
    await db.authSession.create({ data: { accountId: Y, createdAt: at('2026-09-11T08:00:00Z'), lastSeenAt: at('2026-09-11T08:30:00Z'), revokedAt: at('2026-09-11T08:30:00Z'), surface: 'ADMIN' } });
    // Données historiques insérées après coup : recalcul complet.
    await db.usageSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: { aggregatedUntil: null } });
    await svc.aggregate();
  });
  afterAll(() => t.close());

  it('définitions : temps actif (5 min d’inactivité), temps connecté, taux d’activité, coût par heure active', async () => {
    const c = await t.as(WHO.admin);
    const r = (await c.get(`${A}/summary?gran=jour&start=2026-09-10&users=${X}`).expect(200)).body;
    expect(r.period).toMatchObject({ gran: 'jour', label: 'Jeudi 10 septembre 2026', vsLabel: 'mercredi 9' });
    // 17 min (projets) + 5 min (jev, dernier événement) = 22 min.
    expect(r.current).toMatchObject({ activeH: Math.round((22 / 60) * 100) / 100, connectedH: 2, sessions: 1, requests: 1, tokensIn: 1000, tokensOut: 200, costEur: 1.25, activeUsers: 1, events: 5 });
    expect(r.current.activityRate).toBeCloseTo(22 / 120, 2);
    expect(r.current.costPerActiveH).toBeCloseTo(1.25 / (22 / 60), 1);
    // Filtre de fonctionnalité : temps et coût de Jev seuls ; le temps connecté reste celui de l'utilisateur.
    const j = (await c.get(`${A}/summary?gran=jour&start=2026-09-10&users=${X}&feature=jev`).expect(200)).body;
    expect(j.current).toMatchObject({ activeH: Math.round((5 / 60) * 100) / 100, connectedH: 2, costEur: 1.25 });
    const p = (await c.get(`${A}/summary?gran=jour&start=2026-09-10&users=${X}&feature=projets`).expect(200)).body;
    expect(p.current).toMatchObject({ requests: 0, costEur: 0 });
  });

  it('cohérence : totaux de la synthèse = somme des séries = somme du tableau (Jour, Semaine, Mois)', async () => {
    const c = await t.as(WHO.admin);
    for (const [gran, start] of [['mois', '2026-09-01'], ['semaine', '2026-09-07'], ['jour', '2026-09-10']]) {
      const q = `gran=${gran}&start=${start}`;
      const s = (await c.get(`${A}/summary?${q}`).expect(200)).body.current;
      const pts = (await c.get(`${A}/series?${q}`).expect(200)).body.points;
      const sum = (k: string) => pts.reduce((n: number, x: any) => n + x[k], 0);
      expect(Math.abs(sum('activeH') - s.activeH)).toBeLessThan(0.01 * pts.length + 0.01);
      expect(Math.abs(sum('costEur') - s.costEur)).toBeLessThan(0.005 * pts.length + 0.01);
      let rows: any[] = [], page = 1, pages = 1;
      do { const u = (await c.get(`${A}/users?${q}&page=${page}`).expect(200)).body; rows = rows.concat(u.rows); pages = u.pages; page++; } while (page <= pages);
      expect(Math.abs(rows.reduce((n, x) => n + x.costEur, 0) - s.costEur)).toBeLessThan(0.005 * rows.length + 0.01);
      expect(Math.abs(rows.reduce((n, x) => n + x.activeH, 0) - s.activeH)).toBeLessThan(0.01 * rows.length + 0.01);
    }
  });

  it('comparaison N-1 : repères présents, écarts justes ; désactivée : aucun repère', async () => {
    const c = await t.as(WHO.admin);
    const on = (await c.get(`${A}/series?gran=mois&start=2026-09-01&users=${Y}`).expect(200)).body;
    expect(on.period.vsLabel).toBe('août 2026');
    expect(on.points[2]).toMatchObject({ prevCostEur: 0.5 });
    const s = (await c.get(`${A}/summary?gran=mois&start=2026-09-01&users=${Y}`).expect(200)).body;
    expect(s.previous.costEur).toBe(0.5);
    const off = (await c.get(`${A}/series?gran=mois&start=2026-09-01&compare=0`).expect(200)).body;
    expect(off.points.every((x: any) => !('prevActiveH' in x) && !('prevCostEur' in x))).toBe(true);
  });

  it('filtres : équipe, utilisateurs, fournisseur et modèle (indicateurs IA seulement), niveau Équipe', async () => {
    const c = await t.as(WHO.admin);
    const opts = (await c.get(`${A}/options`).expect(200)).body;
    const team = 'Équipe Usage';
    expect(opts.teams).toContain(team);
    expect(opts.users.find((u: any) => u.id === X).team).toBe(team);
    const s = (await c.get(`${A}/summary?gran=jour&start=2026-09-10&scope=team&teams=${encodeURIComponent(team)}`).expect(200)).body.current;
    expect(s.costEur).toBeGreaterThanOrEqual(1.25);
    const other = (await c.get(`${A}/summary?gran=jour&start=2026-09-10&provider=__aucun__&users=${X}`).expect(200)).body.current;
    expect(other).toMatchObject({ requests: 0, costEur: 0, connectedH: 2 });
    expect(other.activeH).toBeGreaterThan(0);
    const b = (await c.get(`${A}/breakdown?by=feature&gran=jour&start=2026-09-10&users=${X}`).expect(200)).body;
    expect(b.rows.map((r: any) => r.id)).toEqual(['projets', 'jev']);
    expect(b.rows.find((r: any) => r.id === 'jev')).toMatchObject({ costEur: 1.25, name: 'Jev · assistant' });
  });

  it('filtre Projet : temps actif et IA du projet, utilisateurs qui y ont accès', async () => {
    const c = await t.as(WHO.admin);
    expect((await c.get(`${A}/options`).expect(200)).body.projects.map((p: any) => p.code)).toContain('RISE');
    const q = `gran=jour&start=2026-09-12`;
    const all = (await c.get(`${A}/summary?${q}&users=${X}`).expect(200)).body.current;
    const rise = (await c.get(`${A}/summary?${q}&users=${X}&projects=RISE`).expect(200)).body.current;
    expect(rise).toMatchObject({ activeH: Math.round((5 / 60) * 100) / 100, requests: 1, costEur: 0.01 });
    expect(all.costEur).toBeGreaterThanOrEqual(rise.costEur);
    // Le 10 septembre, l'activité de X est sans projet (Console ou antérieure) : rien pour RISE.
    expect((await c.get(`${A}/summary?gran=jour&start=2026-09-10&users=${X}&projects=RISE`).expect(200)).body.current).toMatchObject({ activeH: 0, requests: 0, costEur: 0, connectedH: 2 });
    // Y n'a pas accès à RISE : hors sélection.
    expect((await c.get(`${A}/summary?gran=mois&start=2026-09-01&users=${Y}&projects=RISE`).expect(200)).body.current).toMatchObject({ connectedH: 0, sessions: 0 });
    const rows = (await c.get(`${A}/users?gran=mois&start=2026-09-01&projects=RISE&q=usage`).expect(200)).body.rows;
    expect(rows.map((r: any) => r.name)).toEqual(['Xavier Usage']);
  });

  it('hausses inhabituelles : point > facteur × moyenne des jours ouvrés (facteur réglable)', async () => {
    const c = await t.as(WHO.admin);
    const pts = (await c.get(`${A}/series?gran=mois&start=2026-09-01&users=${X}`).expect(200)).body.points;
    expect(pts.find((x: any) => x.t === '2026-09-10').unusual).toBe(true);
    expect(pts.filter((x: any) => x.unusual)).toHaveLength(1);
    await c.put(`${A}/settings`, { unusualFactor: 4.9 }).expect(200);
    const after = (await c.get(`${A}/series?gran=mois&start=2026-09-01&users=${X}`).expect(200)).body.points;
    // Moyenne des 22 jours ouvrés : 1,25 / 22 ; 1,25 > 4,9 × 0,057 : toujours signalé ; facteur 1,1 minimum.
    expect(after.find((x: any) => x.t === '2026-09-10').unusual).toBe(true);
    await c.put(`${A}/settings`, { unusualFactor: 30 }).expect(400);
    await c.put(`${A}/settings`, { unusualFactor: 1.6 }).expect(200);
  });

  it('tableau : tri, filtre texte, pagination ; export CSV de la sélection, journalisé', async () => {
    const c = await t.as(WHO.admin);
    const q = `gran=mois&start=2026-09-01`;
    const byName = (await c.get(`${A}/users?${q}&sort=name&dir=asc&q=usage`).expect(200)).body;
    expect(byName.rows.map((r: any) => r.name)).toEqual(['Xavier Usage', 'Yasmine Usage']);
    expect(byName.rows[0]).toMatchObject({ requests: 2, costEur: 1.26, sessions: 1 });
    expect(byName.rows[0].trend).toHaveLength(30);
    const r = await c.get(`${A}/export.csv?${q}&sort=name&dir=desc&q=usage`).expect(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    const lines = r.text.replace('﻿', '').trim().split('\r\n');
    expect(r.text.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe('Utilisateur;Équipe;Temps actif (h);Temps connecté (h);Sessions;Durée moyenne (min);Requêtes;Tokens entrée;Tokens sortie;Coût (€);Évolution du coût (%)');
    expect(lines.slice(1).map((l) => l.split(';')[0])).toEqual(['Yasmine Usage', 'Xavier Usage']);
    const log = await t.db.auditEntry.findFirst({ where: { action: 'Export de la consommation (Accès)' }, orderBy: { at: 'desc' } });
    expect(log).toMatchObject({ accountId: 'u1', target: 'Septembre 2026 · 2 ligne(s)' });
    expect((log as any).newValue ?? (log as any).details ?? null).toBeDefined();
  });

  it('droits : sans « Voir les coûts », aucun montant (API et export) ; sans « Voir les données individuelles », pseudonymes et niveau Utilisateur refusé', async () => {
    const c = await t.as(WHO.admin);
    await c.put(`/api/admin/admins/u1/consumption-rights`, { seeCosts: false }).expect(403); // ses propres droits
    await t.db.adminGrant.update({ where: { accountId: 'u1' }, data: { seeCosts: false } });
    const s = (await c.get(`${A}/summary?gran=mois&start=2026-09-01`).expect(200)).body;
    expect(s.rights).toEqual({ costs: false, individual: true });
    expect('costEur' in s.current || 'costPerActiveH' in s.current).toBe(false);
    const pts = (await c.get(`${A}/series?gran=mois&start=2026-09-01`).expect(200)).body.points;
    expect(pts.some((x: any) => 'costEur' in x || 'prevCostEur' in x || x.unusual)).toBe(false);
    const u = (await c.get(`${A}/users?gran=mois&start=2026-09-01&q=usage`).expect(200)).body.rows;
    expect(u.some((x: any) => 'costEur' in x || 'costEvolution' in x)).toBe(false);
    const b = (await c.get(`${A}/breakdown?by=team&gran=mois&start=2026-09-01`).expect(200)).body;
    expect(b.rows.some((x: any) => 'costEur' in x) || 'avgCostPerActiveH' in b).toBe(false);
    const csv = (await c.get(`${A}/export.csv?gran=mois&start=2026-09-01&q=usage`).expect(200)).text;
    expect(csv).not.toMatch(/Coût/);
    await t.db.adminGrant.update({ where: { accountId: 'u1' }, data: { seeCosts: true, seeIndividual: false } });
    const a = (await c.get(`${A}/users?gran=mois&start=2026-09-01&sort=name&dir=asc`).expect(200)).body.rows;
    expect(a.every((x: any) => x.id === null && (/^Utilisateur \d{2,}$/.test(x.name) || x.name === 'Tâches automatiques'))).toBe(true);
    await c.get(`${A}/summary?gran=mois&start=2026-09-01&scope=user&users=${X}`).expect(403);
    await c.get(`${A}/users?gran=mois&start=2026-09-01&users=${X}`).expect(403);
    expect((await c.get(`${A}/options`).expect(200)).body.users).toEqual([]);
    const csv2 = (await c.get(`${A}/export.csv?gran=mois&start=2026-09-01`).expect(200)).text;
    expect(csv2).not.toMatch(/Xavier|Yasmine/);
    const bu = (await c.get(`${A}/breakdown?by=user&gran=mois&start=2026-09-01`).expect(200)).body.rows;
    expect(bu.every((x: any) => /^Utilisateur \d{2,}$/.test(x.name) || x.name === 'Tâches automatiques')).toBe(true);
    await t.db.adminGrant.update({ where: { accountId: 'u1' }, data: { seeCosts: true, seeIndividual: true } });
    // Un autre administrateur règle ces droits (journalisé).
    await t.db.adminGrant.upsert({ where: { accountId: X }, create: { accountId: X }, update: {} });
    expect((await c.put(`/api/admin/admins/${X}/consumption-rights`, { seeCosts: false }).expect(200)).body).toEqual({ accountId: X, seeCosts: false, seeIndividual: true });
    await t.db.adminGrant.delete({ where: { accountId: X } });
    // Un PMO n'a pas accès à la Console.
    await (await t.as(WHO.pmo)).get(`${A}/summary`).expect(403);
  });

  it('collecte : événements du Cockpit et de la Console (fonctionnalité connue, date récente) ; appel d’IA attribué au compte', async () => {
    const pmo = await t.as(WHO.pmo);
    const now = new Date().toISOString();
    const r = (await pmo.post('/api/me/activity', { project: 'RISE', events: [{ at: now, feature: 'projets', kind: 'clic' }, { at: now, feature: 'inconnue' }, { at: '2020-01-01T00:00:00Z', feature: 'projets' }] }).expect(201)).body;
    expect(r).toEqual({ recorded: 1 });
    expect((await t.db.usageEvent.findFirst({ orderBy: { id: 'desc' }, where: { feature: 'projets' } }))!.projectId).toBe('RISE');
    const adm = await t.as(WHO.admin);
    expect((await adm.post('/api/admin/me/activity', { events: [{ at: now, feature: 'console', kind: 'page' }] }).expect(201)).body).toEqual({ recorded: 1 });
    await adm.post('/api/admin/me/activity', { events: [{ at: now, feature: 'console', extra: 1 }] }).expect(400);
    // Appel d'IA fait pendant une requête : compte et fonctionnalité de la requête (Jev de la Console).
    const before = await t.db.usageRecord.count({ where: { accountId: 'u1' } });
    await adm.post('/api/admin/assistant/messages', { text: 'Où se règle le serveur SMTP ?', page: 'overview' });
    const recs = await t.db.usageRecord.findMany({ where: { accountId: 'u1' }, orderBy: { at: 'desc' } });
    if (recs.length > before) expect(recs[0].feature).toBe('jev');
  });

  it('usage réel seulement (10/10/2026) : ni compte ni projet de démonstration, ni session automatique, ni appel simulé', async () => {
    const db = t.db, D = 'acc-usage-demo';
    const model = await db.aiModel.findFirst({ where: { category: 'LLM' } });
    const rec = (id: string, d: string, acc: string, cost: number, extra: Record<string, unknown> = {}) =>
      db.usageRecord.create({ data: { id, at: at(d), functionId: 'guidage', modelId: model!.id, providerId: model!.providerId, tokensIn: 100, tokensOut: 20, costEur: cost, source: 'JEV', accountId: acc, feature: 'jev', ...extra } });
    // Dimanche 20 septembre 2026. Compte de démonstration : session et appel d'IA.
    await db.account.create({ data: { id: D, email: 'demo.usage@example.com', fullName: 'Démo Usage', status: 'ACTIVE', demo: true, createdAt: at('2020-01-03T00:00:00Z') } });
    await db.authSession.create({ data: { accountId: D, createdAt: at('2026-09-20T08:00:00Z'), lastSeenAt: at('2026-09-20T09:00:00Z'), revokedAt: at('2026-09-20T09:00:00Z'), surface: 'APP' } });
    await rec('req_usage_demo1', '2026-09-20T08:10:00Z', D, 0.4);
    // X par un outil automatique (recette navigateur) : session et événement.
    const auto = await db.authSession.create({ data: { accountId: X, device: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36', createdAt: at('2026-09-20T10:00:00Z'), lastSeenAt: at('2026-09-20T10:30:00Z'), revokedAt: at('2026-09-20T10:30:00Z'), surface: 'APP' } });
    await db.usageEvent.create({ data: { at: at('2026-09-20T10:05:00Z'), accountId: X, sessionId: auto.id, feature: 'projets', kind: 'clic' } });
    await db.authSession.create({ data: { accountId: X, device: 'curl/8.19.0', createdAt: at('2026-09-20T10:40:00Z'), lastSeenAt: at('2026-09-20T10:40:00Z'), surface: 'APP' } });
    // X : un appel simulé par le bouchon, un appel réel, puis activité et appel sur un projet de démonstration.
    await rec('req_usage_sim1', '2026-09-20T11:00:00Z', X, 0.3, { simulated: true });
    await rec('req_usage_real1', '2026-09-20T12:00:00Z', X, 0.2);
    await db.project.update({ where: { id: 'RISE' }, data: { demo: true } });
    try {
      await db.usageEvent.create({ data: { at: at('2026-09-20T13:00:00Z'), accountId: X, feature: 'rapports', kind: 'clic', projectId: 'RISE' } });
      await rec('req_usage_demo2', '2026-09-20T13:01:00Z', X, 0.7, { projectId: 'RISE' });
      await db.usageSettings.update({ where: { id: 'default' }, data: { aggregatedUntil: null } });
      await svc.aggregate();
      const c = await t.as(WHO.admin);
      const r = (await c.get(`${A}/summary?gran=jour&start=2026-09-20`).expect(200)).body.current;
      // Seul l'appel réel de X compte ; aucune connexion ni événement réels ce jour-là.
      expect(r).toMatchObject({ requests: 1, costEur: 0.2, sessions: 0, events: 0, activeH: 0, connectedH: 0 });
      const o = (await c.get(`${A}/options`).expect(200)).body;
      expect(o.users.map((u: any) => u.id)).not.toContain(D);
      expect(o.projects.map((p: any) => p.code)).not.toContain('RISE');
    } finally {
      await db.project.update({ where: { id: 'RISE' }, data: { demo: false } });
      await db.usageSettings.update({ where: { id: 'default' }, data: { aggregatedUntil: null } });
      await svc.aggregate();
    }
  });
});
