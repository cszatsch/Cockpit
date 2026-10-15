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
});
