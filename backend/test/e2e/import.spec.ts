import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { buildWorkbook, validAtlas } from '../fixtures/excel';

const URL = '/api/projects/ATLAS/referential/import';

describe('Étape 9 — import Excel du Référentiel (§ 13.9)', () => {
  let t: TestCtx;
  let token: string;
  const post = (buf: Buffer, q = '') =>
    request(t.app.getHttpServer()).post(URL + q).set('Authorization', `Bearer ${token}`).attach('file', buf, 'ref.xlsx');

  beforeAll(async () => {
    t = await setup();
    token = await t.token(WHO.pmo); // u2 : PMO sur RISE et ATLAS
  });
  afterAll(() => t.close());

  it('fichier vide → erreurs sur les champs obligatoires, rien n’est créé', async () => {
    const r = await post(await buildWorkbook(), '?dryRun=true').expect(200);
    expect(r.body.imported).toBe(false);
    const msgs = r.body.errors.filter((e: any) => e.sheet === '05 Projet').map((e: any) => e.message);
    expect(msgs).toEqual(expect.arrayContaining(['« Code projet » est obligatoire', '« Nom du projet » est obligatoire', '« Directeur de programme » est obligatoire']));
    expect(r.body.errors[0]).toEqual({ sheet: expect.any(String), row: expect.any(Number), column: expect.any(String), message: expect.any(String) });
  });

  it('onglet manquant → erreur de structure', async () => {
    const r = await post(await buildWorkbook({ dropSheets: ['09 Chantiers'] }), '?dryRun=true').expect(200);
    expect(r.body.errors).toEqual([expect.objectContaining({ sheet: '09 Chantiers', message: 'Onglet « 09 Chantiers » manquant' })]);
  });

  it('dryRun n’écrit rien et annonce les créations', async () => {
    const f = validAtlas();
    const r = await post(await buildWorkbook(f), '?dryRun=true').expect(200);
    expect(r.body.errors).toEqual([]);
    expect(r.body.created).toMatchObject({ persons: 3, phases: 2, workstreams: 1, milestones: 2 });
    expect(r.body.warnings.some((w: any) => w.sheet === '12 Jalons' && /hors de la période/.test(w.message))).toBe(true);
    expect(await t.db.person.count({ where: { projectId: 'ATLAS' } })).toBe(0);
  });

  it('une erreur annule tout l’import (422, rien n’est créé)', async () => {
    const f = validAtlas();
    f.rows['13 Livrables'][0]['Responsable'] = 'Personne Inconnue';
    const r = await post(await buildWorkbook(f)).expect(422);
    expect(r.body.code).toBe('IMPORT_REJECTED');
    expect(r.body.errors[0]).toMatchObject({ sheet: '13 Livrables', message: expect.stringMatching(/inconnue/) });
    expect(await t.db.person.count({ where: { projectId: 'ATLAS' } })).toBe(0);
    expect(await t.db.team.count({ where: { projectId: 'ATLAS' } })).toBe(0);
  });

  it('sous-phase hors de sa phase, couleur et fréquence inconnues → erreurs', async () => {
    const f = validAtlas();
    f.rows['12 Jalons'][0]['Phase'] = '2 · Realize';
    f.rows['10 Instances'][0]['Couleur'] = 'Fuchsia';
    const r = await post(await buildWorkbook(f), '?dryRun=true').expect(200);
    const m = r.body.errors.map((e: any) => e.message);
    expect(m).toEqual(expect.arrayContaining([expect.stringMatching(/n'appartient pas à la phase/), 'Couleur « Fuchsia » inconnue']));
  });

  it('mode réel : crée le référentiel, les habilitations Responsable et l’historique (origine IMPORT)', async () => {
    const r = await post(await buildWorkbook(validAtlas())).expect(200);
    expect(r.body.imported).toBe(true);
    const ws = await t.db.workstream.findMany({ where: { projectId: 'ATLAS' } });
    expect(ws.map((w) => w.code)).toEqual(['C1']);
    const ms = await t.db.milestone.findMany({ where: { projectId: 'ATLAS' }, orderBy: { code: 'asc' } });
    expect(ms.map((m) => m.code)).toEqual(['J01', 'J02']);
    const hab = await t.db.habilitation.findMany({ where: { projectId: 'ATLAS', profile: 'RESPONSABLE' } });
    expect(hab).toHaveLength(1);
    const body = await t.db.governanceBody.findFirst({ where: { projectId: 'ATLAS' }, include: { members: true } });
    expect(body).toMatchObject({ color: '#10233A', frequency: 'MONTHLY', level: 'STRATEGIC' });
    expect(body!.members.map((m) => m.role).sort()).toEqual(['CHAIR', 'MEMBER']);
    const audits = await t.db.auditEntry.count({ where: { projectId: 'ATLAS', origin: 'IMPORT' } });
    expect(audits).toBeGreaterThan(10);
    // Référentiel désormais non vide : un nouvel import est refusé.
    await post(await buildWorkbook(validAtlas()), '?dryRun=true').expect(409);
  });

  it('import réservé au PMO', async () => {
    const lec = await t.token(WHO.lecteurC3);
    await request(t.app.getHttpServer()).post('/api/projects/RISE/referential/import').set('Authorization', `Bearer ${lec}`).attach('file', await buildWorkbook(), 'x.xlsx').expect(403);
  });
});
