import { setup, TestCtx, WHO } from '../helpers';

// Jours fériés (16/10/2026) : table de référence remplie au démarrage, route du widget, vue du Jev du Cockpit qui relit
// le pays et la période du projet à chaque lecture (rien à réactualiser quand le projet bouge).
describe('Jours fériés : table de référence, route et vue de Jev', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  const view = (where = '') => t.db.$queryRawUnsafe<any[]>(`SELECT date, nom, jour_semaine, effet, jour_pont, jours_ouvres_perdus FROM jev_cockpit.jours_feries WHERE projet_id = 'RISE' ${where} ORDER BY date`);

  it('table complétée au démarrage (pays, régions, années) ; route du widget', async () => {
    expect(await t.db.publicHoliday.count({ where: { country: 'FR', region: '', date: { gte: '2026-01-01', lte: '2026-12-31' } } })).toBe(11);
    expect(await t.db.publicHoliday.count({ where: { country: 'FR', region: 'AM', date: { gte: '2026-01-01', lte: '2026-12-31' } } })).toBe(13);
    const c = await t.as(WHO.pmo);
    const r = (await c.get('/api/holidays?country=FR&from=2026-11-01&to=2026-12-31').expect(200)).body;
    expect(r.available).toBe(true);
    expect(r.items.map((x: any) => x.date + ' ' + x.name)).toEqual(['2026-11-01 Toussaint', '2026-11-11 Armistice 1918', '2026-12-25 Noël']);
    const us = (await c.get('/api/holidays?country=US&from=2026-07-01&to=2026-07-31').expect(200)).body;
    expect(us.items).toEqual([{ date: '2026-07-03', name: "Fête de l'Indépendance", observedFrom: '2026-07-04' }]);
    expect((await c.get('/api/holidays?country=MA&from=2026-01-01&to=2026-12-31').expect(200)).body).toMatchObject({ available: false, items: [] });
    await c.get('/api/holidays?country=France&from=2026-01-01&to=2026-12-31').expect(400);
  });

  it('vue jev_cockpit.jours_feries : effet calculé, et projet décalé ou pays changé pris en compte sans mise à jour', async () => {
    const p = await t.db.project.findUniqueOrThrow({ where: { id: 'RISE' } });
    await t.db.project.update({ where: { id: 'RISE' }, data: { startDate: '2026-01-01', targetEndDate: '2027-06-30', country: 'France' } });
    const rows = await view();
    expect(rows[0]).toMatchObject({ date: '2026-01-01', nom: "Jour de l'an", jour_semaine: 'jeudi', effet: 'PONT', jour_pont: '2026-01-02', jours_ouvres_perdus: 1 });
    expect(rows.find((x) => x.date === '2026-11-01')).toMatchObject({ effet: 'WEEKEND', jours_ouvres_perdus: 0, jour_pont: null });
    expect(rows.find((x) => x.date === '2026-11-11')).toMatchObject({ jour_semaine: 'mercredi', effet: 'JOUR_PERDU' });
    expect(rows[rows.length - 1].date <= '2027-06-30').toBe(true);
    // Projet raccourci : la vue relit la date de fin, sans régénération.
    await t.db.project.update({ where: { id: 'RISE' }, data: { targetEndDate: '2026-06-30' } });
    expect((await view()).every((x) => x.date <= '2026-06-30')).toBe(true);
    // Pays changé : calendrier belge (21 juillet).
    await t.db.project.update({ where: { id: 'RISE' }, data: { targetEndDate: '2026-12-31', country: 'Belgique' } });
    expect((await view()).some((x) => x.date === '2026-07-21' && x.nom === 'Fête nationale')).toBe(true);
    // Pays sans calendrier : aucune ligne.
    await t.db.project.update({ where: { id: 'RISE' }, data: { country: 'Maroc' } });
    expect(await view()).toEqual([]);
    await t.db.project.update({ where: { id: 'RISE' }, data: { startDate: p.startDate, targetEndDate: p.targetEndDate, country: p.country } });
  });

  it('dictionnaire : la vue est décrite pour Jev', async () => {
    const f = await t.db.dictionnaireTable.findFirst({ where: { espace: 'cockpit', nom: 'jours_feries' }, include: { colonnes: true } });
    expect(f?.colonnes.map((c) => c.nom)).toEqual(expect.arrayContaining(['date', 'nom', 'effet', 'jour_pont', 'jours_ouvres_perdus']));
  });
});
