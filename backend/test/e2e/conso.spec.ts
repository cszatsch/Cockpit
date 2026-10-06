import { setup, TestCtx, Client, WHO } from '../helpers';
import { UsageService, billedInOf } from '../../src/admin/usage.service';

const A = '/api/admin';

/** Consommation et coûts (CONSO - specification.md, 02/10/2026) : statut sur la projection, bandeau, tuiles, calcul d'un appel. */
describe('Console — Consommation et coûts', () => {
  let t: TestCtx;
  let admin: Client;
  const range = `from=2030-03-01&to=2030-03-02`;

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
  });
  afterAll(() => t.close());

  it('statut : projection ≥ plafond → Dépassement projeté ; projection > seuil → Alerte projetée ; sinon Sous le plafond', () => {
    expect(UsageService.status(null, 80, 50, 500)).toBe('NO_LIMIT');
    expect(UsageService.status(100, 80, 1, 100)).toBe('EXCEEDED'); // égalité : dépassement
    expect(UsageService.status(100, 80, 1, 80.01)).toBe('ALERT');
    expect(UsageService.status(100, 80, 1, 80)).toBe('UNDER'); // au seuil exactement : pas encore d'alerte
    expect(UsageService.status(100, 80, 95, 79)).toBe('UNDER'); // la dépense seule ne déclenche plus l'alerte
  });

  it('mois : jetons du mois, dépense cumulée jour par jour depuis le 1er, modèles de chaque ligne budgétaire', async () => {
    const m = (await admin.get(`${A}/usage/month`).expect(200)).body;
    expect(m.dailyCumul[0].date).toBe(m.monthStart);
    expect(m.dailyCumul[m.dailyCumul.length - 1]).toEqual({ date: m.today, spent: m.spent });
    for (let i = 1; i < m.dailyCumul.length; i++) expect(m.dailyCumul[i].spent).toBeGreaterThanOrEqual(m.dailyCumul[i - 1].spent);
    const tok = await t.db.usageRecord.aggregate({ where: { at: { gte: new Date('2026-08-31T22:00:00Z'), lt: new Date('2026-09-26T22:00:00Z') } }, _sum: { tokensIn: true, tokensOut: true } });
    expect(m.tokensMonth).toBe((tok._sum.tokensIn ?? 0) + (tok._sum.tokensOut ?? 0));
    const asg = await t.db.modelAssignment.findUniqueOrThrow({ where: { functionId: 'insights' } });
    const model = await t.db.aiModel.findUniqueOrThrow({ where: { id: asg.primaryModelId! } });
    expect(m.byFunction.find((f: any) => f.functionId === 'insights').models).toEqual([model.name]);
    expect(m.byFunction.find((f: any) => f.functionId === 'docs').models.length).toBeGreaterThanOrEqual(1); // trois étapes, modèles distincts
  });

  it('ligne budgétaire « Initialisation projet » : tuile, plafond, journal filtré et export', async () => {
    const m = (await admin.get(`${A}/usage/month`).expect(200)).body;
    expect(m.byFunction.map((f: any) => f.functionId)).toContain('init_projet');
    expect(m.thresholds.find((x: any) => x.id === 'init_projet')).toMatchObject({ name: 'Initialisation projet' });
    const mod = await t.db.aiModel.findFirstOrThrow({ where: { category: 'LLM' } });
    await t.db.usageRecord.create({ data: { id: 'req_conso_init01', functionId: 'init_projet', modelId: mod.id, providerId: mod.providerId, requests: 0, fallbackUsed: false, source: 'IMPORT', priceIn: 3, priceOut: 15, at: new Date('2030-03-01T09:00:00Z'), tokensIn: 2000, tokensOut: 300, costEur: (2000 * 3 + 300 * 15) / 1e6 } as any });
    const page = (await admin.get(`${A}/usage/calls?${range}&fn=init_projet&limit=10`).expect(200)).body;
    expect(page.items.map((c: any) => c.id)).toEqual(['req_conso_init01']);
    const csv = (await admin.get(`${A}/usage/calls.csv?${range}&fn=init_projet`).expect(200)).text;
    expect(csv).toContain('Initialisation projet');
    await admin.put(`${A}/budget-thresholds/init_projet`, { limitEur: 15, warnPct: 80, enabled: true }).expect(200);
  });

  it('recette 5 : le calcul affiché d’un appel retombe exactement sur son coût (cache compris, et appels antérieurs)', async () => {
    const m = await t.db.aiModel.findFirstOrThrow({ where: { category: 'LLM' } });
    const [pin, pout] = [3, 15];
    // Appel avec cache : 10 000 jetons dont 6 000 lus (10 %) et 1 000 écrits (125 %) → 3 000 + 600 + 1 250 = 4 850 facturés.
    const cost = (4850 * pin + 400 * pout) / 1e6;
    const base = { functionId: 'guidage', modelId: m.id, providerId: m.providerId, requests: 0, fallbackUsed: false, source: 'JEV', priceIn: pin, priceOut: pout };
    await t.db.usageRecord.create({ data: { ...base, id: 'req_conso_cache01', at: new Date('2030-03-01T10:00:00Z'), tokensIn: 10000, tokensOut: 400, costEur: cost, cacheReadTokens: 6000, cacheWriteTokens: 1000 } as any });
    // Appel antérieur à l'enregistrement du cache : jetons facturés déduits du coût stocké.
    await t.db.usageRecord.create({ data: { ...base, id: 'req_conso_ancien1', at: new Date('2030-03-01T11:00:00Z'), tokensIn: 10000, tokensOut: 400, costEur: cost } as any });
    // Appel sans cache : jetons facturés = jetons d'entrée.
    await t.db.usageRecord.create({ data: { ...base, id: 'req_conso_simple1', at: new Date('2030-03-01T12:00:00Z'), tokensIn: 1234, tokensOut: 56, costEur: (1234 * pin + 56 * pout) / 1e6 } as any });
    const page = (await admin.get(`${A}/usage/calls?${range}&limit=10`).expect(200)).body;
    const by = Object.fromEntries(page.items.map((c: any) => [c.id, c]));
    expect(by.req_conso_cache01).toMatchObject({ cacheRead: 6000, cacheWrite: 1000, billedIn: 4850 });
    expect(by.req_conso_ancien1.billedIn).toBeCloseTo(4850, 6);
    expect(by.req_conso_simple1.billedIn).toBe(1234);
    for (const c of page.items) expect(Math.round((c.billedIn * c.priceIn + c.tokensOut * c.priceOut) / 1e3)).toBe(Math.round(c.costEur * 1e3));
    expect(billedInOf({ tokensIn: 10, tokensOut: 0, costEur: 0, priceIn: null, priceOut: null, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeNull();
  });

  it('recette 6 : l’export CSV contient exactement les appels du journal affiché (période et fonction)', async () => {
    const page = (await admin.get(`${A}/usage/calls?${range}&fn=guidage&limit=100`).expect(200)).body;
    const res = await admin.get(`${A}/usage/calls.csv?${range}&fn=guidage`).expect(200);
    const lines = String(res.text).replace(/^﻿/, '').trim().split(/\r?\n/);
    expect(lines.length - 1).toBe(page.total);
    expect(lines[0]).toContain(';');
    for (const c of page.items) expect(lines.some((l) => l.includes(c.id))).toBe(true);
    await t.db.usageRecord.deleteMany({ where: { id: { startsWith: 'req_conso_' } } });
  });

  it('recette 3 : plafond et seuil d’une ligne enregistrés, statut recalculé, modification auditée', async () => {
    await admin.put(`${A}/budget-thresholds/insights`, { limitEur: 0.01, warnPct: 55, enabled: true }).expect(200);
    const m = (await admin.get(`${A}/usage/month`).expect(200)).body;
    const th = m.thresholds.find((x: any) => x.id === 'insights');
    expect(th).toMatchObject({ limitEur: 0.01, warnPct: 55 });
    expect(th.status).toBe(UsageService.status(0.01, 55, th.spent, th.projection));
    const a = await t.db.auditEntry.findFirstOrThrow({ where: { entityType: 'BudgetThreshold', entityId: 'insights' }, orderBy: { at: 'desc' } });
    expect(a.action).toBe('Modification d’un plafond budgétaire IA');
    await admin.put(`${A}/budget-thresholds/insights`, { limitEur: 10, warnPct: 52, enabled: true }).expect(400); // pas de 5
    await admin.put(`${A}/budget-thresholds/insights`, { limitEur: 10, warnPct: 45, enabled: true }).expect(400); // 50 % minimum
  });

  it('réservé à l’administrateur', async () => {
    const pmo = await t.as(WHO.pmo);
    await pmo.get(`${A}/usage/month`).expect(403);
    await pmo.put(`${A}/budget-thresholds/all`, { limitEur: 1, warnPct: 80, enabled: true }).expect(403);
    await pmo.get(`${A}/usage/calls?${range}`).expect(403);
  });
});
