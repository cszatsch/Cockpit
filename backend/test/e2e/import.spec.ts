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
    const r = await post(await buildWorkbook({ dropSheets: ['10 Chantiers'] }), '?dryRun=true').expect(200);
    expect(r.body.errors).toEqual([expect.objectContaining({ sheet: '10 Chantiers', message: 'Onglet « 10 Chantiers » manquant' })]);
  });

  it('dryRun n’écrit rien et annonce les créations', async () => {
    const f = validAtlas();
    const r = await post(await buildWorkbook(f), '?dryRun=true').expect(200);
    expect(r.body.errors).toEqual([]);
    expect(r.body.created).toMatchObject({ persons: 3, phases: 2, workstreams: 1, milestones: 2 });
    expect(r.body.warnings.some((w: any) => w.sheet === '13 Jalons' && /hors de la période/.test(w.message))).toBe(true);
    expect(await t.db.person.count({ where: { projectId: 'ATLAS' } })).toBe(0);
  });

  it('une erreur annule tout l’import (422, rien n’est créé)', async () => {
    const f = validAtlas();
    f.rows['14 Livrables'][0]['Responsable'] = 'Personne Inconnue';
    const r = await post(await buildWorkbook(f)).expect(422);
    expect(r.body.code).toBe('IMPORT_REJECTED');
    expect(r.body.errors[0]).toMatchObject({ sheet: '14 Livrables', message: expect.stringMatching(/inconnue/) });
    expect(await t.db.person.count({ where: { projectId: 'ATLAS' } })).toBe(0);
    expect(await t.db.team.count({ where: { projectId: 'ATLAS' } })).toBe(0);
  });

  it('sous-phase hors de sa phase, couleur et fréquence inconnues → erreurs', async () => {
    const f = validAtlas();
    f.rows['13 Jalons'][0]['Phase'] = '2 · Realize';
    f.rows['11 Instances'][0]['Couleur'] = 'Fuchsia';
    const r = await post(await buildWorkbook(f), '?dryRun=true').expect(200);
    const m = r.body.errors.map((e: any) => e.message);
    expect(m).toEqual(expect.arrayContaining([expect.stringMatching(/n'appartient pas à la phase/), 'Couleur « Fuchsia » inconnue']));
  });

  it('ancien modèle (sans « 06 Info projet » ou sans les colonnes des rattachements) → refusé avec un message explicite (D5)', async () => {
    const r1 = await post(await buildWorkbook({ ...validAtlas(), dropSheets: ['06 Info projet'] }), '?dryRun=true').expect(200);
    expect(r1.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ sheet: '06 Info projet', message: expect.stringMatching(/^Ancien modèle de fichier : téléchargez le modèle à jour .*onglet « 06 Info projet » absent/) })]));
    // Numérotation d'avant le 07/10/2026 (05b Info projet, 06 Lots…) : un seul message.
    const r0 = await post(await buildWorkbook({ renameSheets: { '06 Info projet': '05b Info projet', '07 Lots': '06 Lots', '14 Livrables': '13 Livrables' } }), '?dryRun=true').expect(200);
    expect(r0.body.errors).toEqual([expect.objectContaining({ sheet: '06 Info projet', message: expect.stringMatching(/^Ancien modèle de fichier/) })]);
    const r2 = await post(await buildWorkbook({ dropHeaders: { '10 Chantiers': ['Sous-phases', 'Dépendances'] } }), '?dryRun=true').expect(200);
    expect(r2.body.errors).toEqual([expect.objectContaining({ sheet: '10 Chantiers', message: expect.stringMatching(/Ancien modèle.*colonnes « Sous-phases », « Dépendances » absentes/) })]);
  });

  it('Info projet : « Programme en une phrase » et un enjeu obligatoires (D1), libellé des rubriques en paires, rubrique inconnue', async () => {
    const f = validAtlas();
    f.rows['06 Info projet'] = [
      { Rubrique: 'Périmètre fonctionnel', Valeur: 'Finance' },
      { Rubrique: 'Budget', Valeur: '3 M€' },
      { Rubrique: 'Le client', Libellé: 'Pays', Valeur: 'Belgique' },
      { Rubrique: 'Marques du groupe', Libellé: 'x', Valeur: 'Brand X' },
    ];
    const r = await post(await buildWorkbook(f), '?dryRun=true').expect(200);
    const m = r.body.errors.filter((e: any) => e.sheet === '06 Info projet').map((e: any) => e.message);
    expect(m).toEqual(expect.arrayContaining([
      '« Programme en une phrase » est obligatoire (une ligne)', '« Enjeux stratégiques » est obligatoire (au moins une ligne)',
      '« Libellé » est obligatoire pour la rubrique « Périmètre fonctionnel »', 'Rubrique « Budget » inconnue (liste dans l’onglet Références)',
      '« Pays » est déjà repris de l’onglet 05 Projet (rubrique « Le client »)',
    ]));
    expect(r.body.warnings.some((w: any) => /Libellé ignoré/.test(w.message))).toBe(true);
  });

  it('Chantiers : phase ou sous-phase inconnue, sous-phase hors des phases, auto-dépendance, « Tous » combiné ; dépendances réciproques admises', async () => {
    const f = validAtlas();
    f.rows['10 Chantiers'] = [
      { Nom: 'Comptabilité', Responsable: 'Sophie Marchand', Phases: '1 ; 9', 'Sous-phases': '2.1 ; 7.7', Dépendances: 'Comptabilité ; Trésorerie' },
      { Nom: 'Trésorerie', Responsable: 'Sophie Marchand', Dépendances: 'Tous ; Fiscalité' },
      { Nom: 'Fiscalité', Responsable: 'Sophie Marchand', Dépendances: 'C4' },
      { Nom: 'Consolidation', Responsable: 'Sophie Marchand', Dépendances: 'Fiscalité' },
    ];
    f.rows['13 Jalons'][0]['Chantier'] = null;
    f.rows['14 Livrables'][0]['Chantier'] = null;
    const r = await post(await buildWorkbook(f), '?dryRun=true').expect(200);
    const m = r.body.errors.filter((e: any) => e.sheet === '10 Chantiers').map((e: any) => `${e.row}${e.column} ${e.message}`);
    expect(m).toEqual(expect.arrayContaining([
      '9H Phase « 9 » inconnue (onglet 08 Phases)',
      '9I Sous-phase 2.1 hors des phases du chantier : sa phase « 2 · Realize » n’est pas dans la colonne Phases',
      '9I Sous-phase « 7.7 » inconnue (onglet 09 Sous-phases)',
      '9J Le chantier « Comptabilité » dépend de lui-même',
      '10J « Tous » ne se combine pas avec d’autres chantiers',
    ]));
    // Fiscalité ↔ Consolidation : dépendances réciproques admises (07/10/2026).
    expect(m.filter((x: string) => /circulaire/.test(x))).toEqual([]);
  });

  it('mode réel : crée le référentiel, les habilitations Responsable et l’historique (origine IMPORT)', async () => {
    const r = await post(await buildWorkbook(validAtlas())).expect(200);
    expect(r.body.imported).toBe(true);
    const ws = await t.db.workstream.findMany({ where: { projectId: 'ATLAS' } });
    expect(ws.map((w) => w.code)).toEqual(['C1']);
    // Rattachements du chantier et Info projet (06/10/2026).
    const links = await t.db.workstream.findFirstOrThrow({ where: { projectId: 'ATLAS' }, include: { phases: { include: { phase: true } }, subphases: { include: { subphase: true } } } });
    expect(links.phases.map((p) => p.phase.code).sort()).toEqual(['1', '2']);
    expect(links.subphases.map((s) => s.subphase.code)).toEqual(['1.1']);
    const info = (await t.db.contentBlock.findUniqueOrThrow({ where: { projectId_key: { projectId: 'ATLAS', key: 'referential' } } })).data as any;
    expect(info).toMatchObject({ pitch: 'Refonte de la finance du groupe.', stakes: ['Clôturer en 5 jours'], geo: ['France'], identity: [['Raison sociale', 'AMC Corp'], ['Pays', 'France'], ['Effectifs', '1 750 collaborateurs']] });
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
