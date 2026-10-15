import { setup, TestCtx, WHO } from '../helpers';

/**
 * Arbitrage d'une décision depuis Pilotage › Décisions (correctif du 15/10/2026) : l'écran envoie le statut, l'option
 * retenue, le texte et la date en une fois ; le statut seul est refusé (texte obligatoire) ; la fiche arbitrée est ensuite
 * en lecture seule.
 */
describe('Arbitrage d’une décision (statut, option, texte et date en un envoi)', () => {
  let t: TestCtx;
  beforeAll(async () => { t = await setup(); });
  afterAll(() => t.close());
  const R = '/api/projects/RISE/decisions';

  it('statut seul refusé ; statut + option + texte + date accepté ; ensuite lecture seule', async () => {
    const c = await t.as(WHO.pmo);
    const rows = (await c.get(R).expect(200)).body;
    const d = (rows.items || rows).find((x: any) => x.status !== 'ARBITRATED' && !x.decL);
    expect(d).toBeDefined();
    // Séance prévue d'une décision ouverte (15/10/2026) : une séance du projet, puis retour à « prochaine séance » (null).
    const ses = (await t.db.session.findFirst({ where: { projectId: 'RISE', status: 'PLANNED' }, orderBy: { dateIso: 'asc' } }))!;
    expect((await c.patch(`${R}/${d.id}`, { expectedSessionId: ses.id }).expect(200)).body.expectedSessionId).toBe(ses.id);
    expect((await c.patch(`${R}/${d.id}`, { expectedSessionId: null }).expect(200)).body.expectedSessionId).toBeNull();
    // Ancien envoi de l'écran : refusé, la décision reste ouverte (cause du retour à « À arbitrer »).
    const bad = await c.patch(`${R}/${d.id}`, { status: 'ARBITRATED', ddIso: '2026-09-26' }).expect(422);
    expect(bad.body.fields.decL).toBeDefined();
    // Envoi de la fenêtre « Arbitrer » : accepté, option et texte enregistrés.
    const ok = await c.patch(`${R}/${d.id}`, { status: 'ARBITRATED', opt: 'A', decL: 'Option A · Externalisation retenue', ddIso: '2026-09-26' }).expect(200);
    const after = (await c.get(R).expect(200)).body;
    const x = (after.items || after).find((y: any) => y.id === d.id);
    expect(x).toMatchObject({ status: 'ARBITRATED', opt: 'A', decL: 'Option A · Externalisation retenue', ddIso: '2026-09-26' });
    expect(ok.body).toBeDefined();
    // Fiche arbitrée : lecture seule (l'option ne se change plus après coup).
    await c.patch(`${R}/${d.id}`, { opt: 'B' }).expect(409);
  });

  it('remplacement : arbitrer une décision qui en remplace une autre passe l’ancienne à « Remplacée » (modification et création)', async () => {
    const c = await t.as(WHO.pmo);
    const list = async () => { const r = (await c.get(R).expect(200)).body; return r.items || r; };
    const arb = (await list()).filter((x: any) => x.status === 'ARBITRATED');
    expect(arb.length).toBeGreaterThanOrEqual(2);
    const [old1, old2] = arb;
    const base = { p: 3, wsId: old1.wsId, bodyId: old1.bodyId };
    // 1. Nouvelle décision ouverte liée à old1, puis arbitrée (envoi de la fenêtre « Arbitrer ») : old1 → Remplacée.
    const n1 = (await c.post(R, { ...base, t: 'Revenir sur ' + old1.code, status: 'IN_REVIEW', supersedes: old1.id }).expect(201)).body;
    expect(n1.supersedes).toBe(old1.id);
    expect((await list()).find((x: any) => x.id === old1.id).status).toBe('ARBITRATED');
    await c.patch(`${R}/${n1.id}`, { status: 'ARBITRATED', opt: 'B', decL: 'Option B retenue', ddIso: '2026-09-26', supersedes: old1.id }).expect(200);
    expect((await list()).find((x: any) => x.id === old1.id).status).toBe('SUPERSEDED');
    // 2. Décision créée directement arbitrée (Saisir sans Jev) qui remplace old2 : old2 → Remplacée.
    await c.post(R, { ...base, t: 'Revenir sur ' + old2.code, status: 'ARBITRATED', decL: 'Nouveau choix', ddIso: '2026-09-26', supersedes: old2.id }).expect(201);
    expect((await list()).find((x: any) => x.id === old2.id).status).toBe('SUPERSEDED');
    // Une décision ne se remplace pas elle-même.
    await c.patch(`${R}/${n1.id}`, { supersedes: n1.id }).expect((r: any) => expect([400, 409]).toContain(r.status));
  });
});
