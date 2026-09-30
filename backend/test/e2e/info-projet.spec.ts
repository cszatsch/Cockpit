import { setup, TestCtx, WHO } from '../helpers';

const R = '/api/projects/RISE';

/** Objet « Info projet » du Référentiel (décision du 30/09/2026) : rubriques de l'onglet Fiche projet. */
describe('Cockpit — objet Info projet', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('lecture : huit rubriques, dont celles autrefois écrites dans l’écran (programme, enjeux, pays, entités)', async () => {
    const info = (await (await t.as(WHO.lecteurC3)).get(`${R}/project/info`).expect(200)).body;
    expect(Object.keys(info)).toEqual(['identity', 'brands', 'pitch', 'stakes', 'scope', 'systems', 'geo', 'legal']);
    expect(info.identity[0]).toEqual(['Raison sociale', 'AMC Corp']);
    expect(info.pitch).toMatch(/^Programme de transformation digitale/);
    expect(info.stakes).toHaveLength(4);
    expect(info.stakes[0]).not.toMatch(/^[·•]/);
    expect(info.geo).toHaveLength(10);
    expect(info.legal).toHaveLength(9);
    // Le bootstrap porte les mêmes rubriques (bloc referential), avec les données de présentation.
    const b = (await (await t.as(WHO.pmo)).get(`${R}/bootstrap`).expect(200)).body;
    expect(b.referential.geo).toEqual(info.geo);
    expect(b.referential.network.length).toBeGreaterThan(0);
  });

  it('écriture : PMO seulement ; objet complet, autres clés du bloc conservées ; audit par rubrique', async () => {
    const pmo = await t.as(WHO.pmo);
    const cur = (await pmo.get(`${R}/project/info`).expect(200)).body;
    await (await t.as(WHO.respC5)).put(`${R}/project/info`, cur).expect(403);
    await pmo.put(`${R}/project/info`, { ...cur, stakes: ['  '] }).expect(400);
    const next = { ...cur, stakes: [...cur.stakes, 'Réduire le coût de possession du SI'], geo: cur.geo.filter((g: string) => g !== 'UAE') };
    expect((await pmo.put(`${R}/project/info`, next).expect(200)).body.stakes).toHaveLength(5);
    const after = (await pmo.get(`${R}/project/info`).expect(200)).body;
    expect(after.geo).toHaveLength(9);
    expect(after.identity).toEqual(cur.identity);
    const b = (await pmo.get(`${R}/bootstrap`).expect(200)).body;
    expect(b.referential.lots.length).toBeGreaterThan(0); // données de présentation intactes
    const audit = await t.db.auditEntry.findMany({ where: { entityType: 'PROJECT_INFO' } });
    expect(audit.map((a) => a.field).sort()).toEqual(['geo', 'stakes']);
  });

  it('dictionnaire : la vue infos_projet donne une ligne par élément, dans l’ordre de l’objet', async () => {
    const rows = await t.db.$queryRawUnsafe<any[]>(`SELECT rubrique, ordre_rubrique, ordre, libelle, valeur FROM jev_cockpit.infos_projet v JOIN jev_cockpit.projets p ON p.id = v.projet_id WHERE p.code = 'RISE' ORDER BY ordre_rubrique, ordre`);
    const info = (await (await t.as(WHO.pmo)).get(`${R}/project/info`).expect(200)).body;
    const count = (r: string) => rows.filter((x) => x.rubrique === r).length;
    expect(count('Périmètre géographique')).toBe(info.geo.length);
    expect(count('Programme en une phrase')).toBe(1);
    expect(rows[0]).toMatchObject({ rubrique: 'Le client', libelle: 'Raison sociale', valeur: 'AMC Corp' });
    expect(rows.find((x) => x.rubrique === 'Marques du groupe').libelle).toBeNull();
  });
});
