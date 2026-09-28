import { setup, TestCtx, Client, WHO } from '../helpers';
import { LlmService } from '../../src/core/llm.service';

const A = '/api/admin';

/** Journal des appels (spécification JOURNAL) : modèle de données, routes et recette § 6. */
describe('Console — Journal des appels', () => {
  let t: TestCtx;
  let admin: Client;
  // Les appels faits pendant le test sont datés du jour réel : la période couvre le mois de démonstration et aujourd'hui.
  const FROM = '2026-09-01';
  const TO = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const range = `from=${FROM}&to=${TO}`;
  const llm = () => t.app.get(LlmService);
  /**
   * Appel du journal correspondant à une ligne de consommation, cherché page à page par son identifiant
   * (d'autres appels peuvent suivre : rédaction d'une notification budgétaire, par exemple).
   */
  const findCall = async (fn: string, id: string) => {
    let cursor: string | null = null;
    do {
      const page: any = (await admin.get(`${A}/usage/calls?${range}&fn=${fn}&limit=100${cursor ? `&cursor=${cursor}` : ''}`).expect(200)).body;
      const hit = page.items.find((c: any) => c.id === id);
      if (hit) return hit;
      cursor = page.nextCursor;
    } while (cursor);
    throw new Error(`appel ${id} absent du journal`);
  };
  const lastRecord = (functionId: string, modelId: string) => t.db.usageRecord.findFirstOrThrow({ where: { functionId, modelId, id: { startsWith: 'req_' } }, orderBy: { at: 'desc' } });

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
  });
  afterAll(() => t.close());

  it('recette 1 : un appel crée une ligne avec identifiant req_, tarifs figés, durée, et le bon coût', async () => {
    const r = await llm().complete({ functionId: 'insights', prompt: 'Synthèse du projet', source: 'COCKPIT' });
    const c = await findCall('insights', (await lastRecord('insights', r.modelId)).id);
    const m = await t.db.aiModel.findUniqueOrThrow({ where: { id: r.modelId } });
    expect(c).toMatchObject({ fn: 'insights', step: 'insights', model: m.id, modelName: m.name, provider: m.providerId, fallback: false, tokensIn: r.tokensIn, tokensOut: r.tokensOut, priceIn: m.priceInPerMTok, priceOut: m.priceOutPerMTok });
    expect(c.id).toMatch(/^req_[0-9a-f]{12}$/);
    expect(typeof c.durationMs).toBe('number');
    // Recalcul à la main.
    expect(c.costEur).toBeCloseTo((r.tokensIn * m.priceInPerMTok! + r.tokensOut * m.priceOutPerMTok!) / 1e6, 6);
    // Ni prompt ni réponse dans le journal.
    expect(JSON.stringify(c)).not.toContain('Synthèse du projet');
  });

  it('recette 5 : un changement de tarif au catalogue ne change pas le coût des appels passés', async () => {
    const rec = await t.db.usageRecord.findFirstOrThrow({ where: { functionId: 'insights', id: { startsWith: 'req_' } }, orderBy: { at: 'desc' } });
    const before = await findCall('insights', rec.id);
    await t.db.aiModel.update({ where: { id: before.model }, data: { priceInPerMTok: 999, priceOutPerMTok: 999 } });
    const after = await findCall('insights', rec.id);
    expect(after).toMatchObject({ id: before.id, costEur: before.costEur, priceIn: before.priceIn, priceOut: before.priceOut });
    await t.db.aiModel.update({ where: { id: before.model }, data: { priceInPerMTok: before.priceIn, priceOutPerMTok: before.priceOut } });
  });

  it('recette 4 : appel servi par le secours : fallback et modèle de secours', async () => {
    const asg = await t.db.modelAssignment.findUniqueOrThrow({ where: { functionId: 'guidage' } });
    const primary = await t.db.aiModel.findUniqueOrThrow({ where: { id: asg.primaryModelId } });
    await t.db.provider.update({ where: { id: primary.providerId }, data: { status: 'ERROR' } });
    await llm().complete({ functionId: 'guidage', prompt: 'Question', source: 'COCKPIT' });
    await t.db.provider.update({ where: { id: primary.providerId }, data: { status: 'OK' } });
    const c = await findCall('guidage', (await lastRecord('guidage', asg.fallbackModelId!)).id);
    expect(c).toMatchObject({ fn: 'guidage', fallback: true, model: asg.fallbackModelId });
  });

  it('usage/daily : un point par jour, jours vides inclus', async () => {
    const days = (await admin.get(`${A}/usage/daily?from=2026-10-01&to=2026-10-05`).expect(200)).body;
    expect(days).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((date) => ({ date, tokensIn: 0, tokensOut: 0, costIn: 0, costOut: 0, calls: 0 })));
    const month = (await admin.get(`${A}/usage/daily`).expect(200)).body;
    expect(month[0].date).toBe('2026-09-01');
    expect(month[month.length - 1].date).toBe(process.env.DEMO_TODAY);
  });

  it('recette 2 : coûts entrée + sortie = dépense de « Vue générale des coûts » ; jetons et appels = consommation', async () => {
    const days = (await admin.get(`${A}/usage/daily`).expect(200)).body;
    const month = (await admin.get(`${A}/usage/month`).expect(200)).body;
    const sum = (k: string) => days.reduce((a: number, d: any) => a + d[k], 0);
    expect(Math.round((sum('costIn') + sum('costOut')) * 100) / 100).toBeCloseTo(month.spent, 2);
    const usage = (await admin.get(`${A}/usage?from=2026-09-01&to=${process.env.DEMO_TODAY}&groupBy=day`).expect(200)).body;
    expect(sum('calls')).toBe(usage.totals.calls);
    expect(sum('tokensIn')).toBe(usage.totals.tokensIn);
    expect(sum('tokensOut')).toBe(usage.totals.tokensOut);
    for (const d of days) expect(d.costIn).toBeGreaterThanOrEqual(0), expect(d.costOut).toBeGreaterThanOrEqual(-1e-9);
  });

  it('recette 3 : filtre Guidage console : graphique, total et journal ne montrent que guidage', async () => {
    const n = await t.db.usageRecord.count({ where: { functionId: 'guidage', at: { gte: new Date(`${FROM}T00:00:00+02:00`) } } });
    const days = (await admin.get(`${A}/usage/daily?${range}&fn=guidage`).expect(200)).body;
    expect(days.reduce((a: number, d: any) => a + d.calls, 0)).toBe(n);
    const page = (await admin.get(`${A}/usage/calls?${range}&fn=guidage&limit=100`).expect(200)).body;
    expect(page.total).toBe(n);
    expect(page.items.every((c: any) => c.fn === 'guidage')).toBe(true);
  });

  it('Documents regroupe ses trois étapes ; filtre fournisseur', async () => {
    const docs = (await admin.get(`${A}/usage/calls?${range}&fn=docs&limit=100`).expect(200)).body;
    expect(docs.total).toBeGreaterThan(0);
    expect(new Set(docs.items.map((c: any) => c.step))).toEqual(new Set(docs.items.map((c: any) => c.step).filter((s: string) => ['doc_vec', 'doc_rrk', 'doc_syn'].includes(s))));
    expect(docs.items.every((c: any) => c.fn === 'docs')).toBe(true);
    const oa = (await admin.get(`${A}/usage/calls?${range}&provider=openai&limit=100`).expect(200)).body;
    expect(oa.items.every((c: any) => c.provider === 'openai')).toBe(true);
    expect(oa.total).toBe(await t.db.usageRecord.count({ where: { providerId: 'openai', at: { gte: new Date(`${FROM}T00:00:00+02:00`) } } }));
  });

  it('pagination par curseur : du plus récent au plus ancien, sans doublon ni oubli', async () => {
    const seen: any[] = [];
    let cursor: string | null = null;
    let total = 0;
    do {
      const q: string = `${A}/usage/calls?${range}&fn=crud&limit=10${cursor ? `&cursor=${cursor}` : ''}`;
      const page: any = (await admin.get(q).expect(200)).body;
      total = page.total;
      expect(page.items.length).toBeLessThanOrEqual(10);
      seen.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    expect(total).toBeGreaterThan(10);
    expect(seen).toHaveLength(total);
    expect(new Set(seen.map((c) => c.id)).size).toBe(total);
    for (let i = 1; i < seen.length; i++) expect(seen[i - 1].at >= seen[i].at).toBe(true);
  });

  it('recette 6 : export CSV : BOM, « ; », virgule décimale, autant de lignes que total, colonnes du journal', async () => {
    const res = await admin.get(`${A}/usage/calls.csv?${range}&fn=insights`).buffer(true).parse((r, cb) => { let s = ''; r.setEncoding('utf8'); r.on('data', (c: string) => (s += c)); r.on('end', () => cb(null, s)); }).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const body: string = res.body;
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const lines = body.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Date;Heure;Fonction;Fournisseur;Modèle;Secours;Tokens;Tokens entrée;Tokens sortie;Tarif entrée (€/M);Tarif sortie (€/M);Coût (€);Requête;Durée (ms)');
    const total = (await admin.get(`${A}/usage/calls?${range}&fn=insights&limit=1`).expect(200)).body.total;
    expect(lines.length - 1).toBe(total);
    const cells = lines[1].split(';');
    expect(cells[2]).toBe('Insights');
    expect(cells[11]).toMatch(/^\d+,\d{6}$/);
  });

  it('paramètres contrôlés ; lecture réservée aux administrateurs', async () => {
    await admin.get(`${A}/usage/calls?fn=inconnue`).expect(400);
    await admin.get(`${A}/usage/calls?cursor=pas-un-curseur`).expect(400);
    await admin.get(`${A}/usage/calls?limit=0`).expect(400);
    await admin.get(`${A}/usage/daily?from=2026-09-30&to=2026-09-01`).expect(400);
    const pmo = await t.as(WHO.pmo);
    await pmo.get(`${A}/usage/calls`).expect(403);
    await pmo.get(`${A}/usage/daily`).expect(403);
  });
});
