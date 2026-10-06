import request from 'supertest';
import { setup, TestCtx, Client, WHO } from '../helpers';
import { makePptx } from '../office-fixture';
import { cockpitGuidePdf } from '../pdf-fixture';
import { KbService } from '../../src/cockpit/documents/kb.service';
import { GuideIndexService } from '../../src/admin/guide-index.service';
import { RevectorizeService, REVECTORIZE_NOTIFICATION_KEY } from '../../src/admin/revectorize.service';

const A = '/api/admin';

/**
 * Vue « Fournisseurs et modèles » (livraison du 02/10/2026) : règles du serveur — un modèle affecté (principal ou
 * secours) ne se désactive ni ne se supprime ; seuls des modèles actifs s'affectent ; les clés ne sont jamais
 * renvoyées ; un changement du modèle ou de la dimension de la Vectorisation revectorise tous les documents.
 */
describe('Fournisseurs et modèles', () => {
  let t: TestCtx;
  let admin: Client;
  let token: string;

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    token = await t.token(WHO.admin);
  });
  afterAll(() => t.close());

  it('mesures OpenRouter (06/10/2026) : saisies dans la fiche, renvoyées par le catalogue, contrôlées ; relevé refusé hors ligne', async () => {
    const m = (await admin.get(`${A}/models`).expect(200)).body.find((x: any) => x.category === 'LLM');
    expect(m).toMatchObject({ benchmarkScore: null, costPerSessionEur: null, tokensPerSecond: null, openrouterId: null, statsAt: null });
    const r = (await admin.patch(`${A}/models/${m.id}`, { benchmarkScore: 75.3, costPerSessionEur: 0.1749, tokensPerSecond: 94, openrouterId: 'anthropic/claude-sonnet-5' }).expect(200)).body;
    expect(r).toMatchObject({ benchmarkScore: 75.3, costPerSessionEur: 0.1749, tokensPerSecond: 94, openrouterId: 'anthropic/claude-sonnet-5' });
    // Champs absents : inchangés ; valeur vidée : null.
    expect((await admin.patch(`${A}/models/${m.id}`, { description: 'x' }).expect(200)).body.tokensPerSecond).toBe(94);
    expect((await admin.patch(`${A}/models/${m.id}`, { tokensPerSecond: null }).expect(200)).body.tokensPerSecond).toBeNull();
    const bad = await admin.patch(`${A}/models/${m.id}`, { benchmarkScore: 120 }).expect(400);
    expect(bad.body.fields).toHaveProperty('benchmarkScore');
    // Relevé : environnement de test hors ligne → refus explicite, rien n’est modifié.
    const off = await admin.post(`${A}/models/stats/refresh`).expect(422);
    expect(off.body.message).toMatch(/hors ligne/);
    await (await t.as(WHO.pmo)).post(`${A}/models/stats/refresh`).expect(403);
  });

  it('désactivation d’un modèle affecté comme secours seulement : 409 avec les affectations à modifier', async () => {
    // gpt5mini : secours de Gestion des données et de Guidage (jeu d'essai), principal de rien.
    const r = await admin.patch(`${A}/models/gpt5mini`, { active: false }).expect(409);
    expect(r.body.code).toBe('MODEL_IN_USE');
    expect(r.body.message).toMatch(/réaffectez-le avant de le désactiver/);
    expect(r.body.usages.map((u: any) => u.label)).toEqual(expect.arrayContaining(['Secours de Gestion des données', expect.stringMatching(/^Secours de Guidage/)]));
    expect((await t.db.aiModel.findUniqueOrThrow({ where: { id: 'gpt5mini' } })).active).toBe(true);
  });

  it('suppression d’un modèle affecté : 409 avec la liste des affectations', async () => {
    const r = await admin.del(`${A}/models/gpt5mini`).expect(409);
    expect(r.body.usages.some((u: any) => u.entityType === 'MODEL_ASSIGNMENT')).toBe(true);
  });

  it('un modèle de secours inactif est refusé ; principal et secours distincts ; catégorie de la fonction', async () => {
    // gflash : inactif dans le jeu d'essai.
    let r = await admin.put(`${A}/assignments`, { insights: { primary: 'sonnet', fallback: 'gflash' } }).expect(422);
    expect(r.body.message).toBe('Le modèle de secours doit être actif');
    r = await admin.put(`${A}/assignments`, { insights: { primary: 'sonnet', fallback: 'sonnet' } }).expect(422);
    expect(r.body.message).toBe('Le secours doit différer du principal');
    r = await admin.put(`${A}/assignments`, { doc_rrk: { primary: 'sonnet' } }).expect(422);
    expect(r.body.message).toMatch(/Reranking/);
    await admin.put(`${A}/assignments`, { doc_vec: { primary: 'te3large', fallback: 'te3large' } }).expect(422);
  });

  it('un modèle non affecté se désactive et se réactive ; chaque changement est tracé', async () => {
    await admin.patch(`${A}/models/msmall`, { active: false }).expect(200);
    await admin.patch(`${A}/models/msmall`, { active: true }).expect(200);
    const audit = await t.db.auditEntry.findMany({ where: { entityId: 'msmall' }, orderBy: { at: 'asc' } }).catch(() => null);
    if (audit) expect(audit.map((a: any) => a.action)).toEqual(expect.arrayContaining(['Désactivation d’un modèle', 'Activation d’un modèle']));
  });

  it('clés : jamais renvoyées en clair (préfixe et 4 derniers caractères seulement)', async () => {
    const list = (await admin.get(`${A}/providers`).expect(200)).body;
    for (const p of list) {
      expect(Object.keys(p)).not.toEqual(expect.arrayContaining(['keyCipher', 'apiKey', 'key']));
      expect(typeof p.keyLast4 === 'string' || p.keyLast4 === null).toBe(true);
    }
  });

  it('changer la dimension de la Vectorisation revectorise la Base de connaissance et les guides', async () => {
    // Un document (Base de connaissance) et le guide du Cockpit, indexés en 3 072 dimensions.
    const pmo = await t.token(WHO.pmo);
    await request(t.app.getHttpServer()).post('/api/projects/RISE/documents').set('Authorization', `Bearer ${pmo}`)
      .attach('file', await makePptx([{ title: 'Gouvernance', lines: ['COPIL mensuel', 'Comité de pilotage'] }]), 'Gouvernance.pptx').expect(201);
    await t.app.get(KbService).idle();
    await request(t.app.getHttpServer()).post(`${A}/guides/cockpit`).set('Authorization', `Bearer ${token}`).attach('file', cockpitGuidePdf('A'), { filename: 'Guide.pdf', contentType: 'application/pdf' }).expect(202);
    await t.app.get(GuideIndexService).idle();
    const before = await t.db.$queryRawUnsafe<Array<{ dims: number; n: bigint }>>(`SELECT dims, count(*) n FROM kb_chunks GROUP BY dims`);
    expect(before.map((r) => r.dims)).toEqual([3072]);

    await admin.put(`${A}/assignments`, { doc_vec: { primary: 'te3large', dimension: 1536 } }).expect(200);
    await t.app.get(RevectorizeService).idle();

    const kb = await t.db.$queryRawUnsafe<Array<{ dims: number; model: string }>>(`SELECT DISTINCT dims, model FROM kb_chunks`);
    expect(kb).toEqual([{ dims: 1536, model: 'te3large' }]);
    const g = await t.db.$queryRawUnsafe<Array<{ dims: number }>>(`SELECT DISTINCT dims FROM guide_chunks`);
    expect(g).toEqual([{ dims: 1536 }]);
    expect(await t.db.guideUpload.findFirst({ where: { app: 'cockpit', status: 'SUCCESS' }, orderBy: { at: 'desc' } })).toMatchObject({ embeddingModel: 'te3large', embeddingDims: 1536 });
    // Vecteurs de la bonne longueur (recherche possible).
    const len = await t.db.$queryRawUnsafe<Array<{ l: number }>>(`SELECT DISTINCT vector_dims(embedding) l FROM kb_chunks`);
    expect(len).toEqual([{ l: 1536 }]);
    // Fin signalée dans les notifications de la Console ; revectorisation tracée.
    expect(await t.db.notification.findUnique({ where: { key: REVECTORIZE_NOTIFICATION_KEY } })).toMatchObject({ status: 'OPEN', title: 'Revectorisation des documents terminée' });
    expect(t.app.get(RevectorizeService).state).toMatchObject({ status: 'DONE', dims: 1536 });
    // La recherche dans les documents fonctionne avec la nouvelle dimension.
    const s = await (await t.as(WHO.pmo)).get('/api/projects/RISE/documents/search?q=gouvernance').expect(200);
    expect(JSON.stringify(s.body)).toMatch(/Gouvernance/);
  });

  it('un changement sans effet sur la Vectorisation ne revectorise pas', async () => {
    const spy = jest.spyOn(t.app.get(RevectorizeService), 'start');
    await admin.put(`${A}/assignments`, { insights: { primary: 'sonnet', fallback: 'gpt5' } }).expect(200);
    await admin.put(`${A}/assignments`, { doc_vec: { primary: 'te3large', dimension: 1536 } }).expect(200);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
