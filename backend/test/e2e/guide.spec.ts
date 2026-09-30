import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { cockpitGuidePdf, guidePdf, makePdf } from '../pdf-fixture';
import { GUIDE_BUSY, GUIDE_PDF_ONLY, GUIDE_SCANNED, GUIDE_TOO_BIG, nextGuideVersion } from '../../src/domain/guide';
import { PDF_UNREADABLE } from '../../src/core/pdf-text';
import { GuideIndexService } from '../../src/admin/guide-index.service';
import { GuideSearchService } from '../../src/admin/guide-search.service';
import { StorageService } from '../../src/core/storage.service';
import { PrismaService } from '../../src/core/prisma.service';
import { LlmService } from '../../src/core/llm.service';
import { RAG_DEFAULTS } from '../../src/domain/jev-rag';

const G = '/api/admin/guides';
const DEF = { k: 8, keep: 4, thr: 0.58, tv: 10, tr: 8, tw: 30 };

/**
 * Guide utilisateur de la Console et du Cockpit (décisions du 30/09/2026, maquette « Guide utilisateur Console
 * Cockpit ») : un guide en vigueur par application ; dépôt contrôlé (PDF réel, 10 Mo, texte), version 1.0 puis +0.1
 * en vigueur tout de suite, indexation en tâche de fond (l'ancien index sert jusqu'au nouveau) ; téléchargement tracé
 * avant l'envoi ; réglages de Jev par application ; aucune donnée partagée entre les applications.
 */
describe('Console — guide utilisateur (Console et Cockpit)', () => {
  let t: TestCtx;
  let token: string;
  let index: GuideIndexService;
  let storage: StorageService;
  const http = () => request(t.app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const getFile = (app: string) => auth(http().get(`${G}/${app}/file`)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); });
  const deposit = (app: string, buf: Buffer, name = 'Guide.pdf') => auth(http().post(`${G}/${app}`)).attach('file', buf, { filename: name, contentType: 'application/pdf' });
  const data = async (app: string) => (await auth(http().get(`${G}/${app}`)).expect(200)).body;
  const chunksOf = async (app: string) => (await t.db.$queryRawUnsafe<Array<{ upload_id: string; n: number }>>('SELECT c.upload_id, count(*)::int AS n FROM guide_chunks c JOIN guide_uploads u ON u.id = c.upload_id WHERE u.app = $1 GROUP BY c.upload_id', app));

  beforeAll(async () => {
    t = await setup();
    token = await t.token(WHO.admin);
    index = t.app.get(GuideIndexService);
    storage = t.app.get(StorageService);
  });
  afterAll(() => t.close());

  it('règle de version : 1.0 au premier dépôt, puis incrément mineur (3.2 → 3.3, 3.9 → 3.10)', () => {
    expect(nextGuideVersion(null)).toBe('1.0');
    expect(nextGuideVersion('3.2')).toBe('3.3');
    expect(nextGuideVersion('3.9')).toBe('3.10');
  });

  it('aucun guide : les deux applications vides (tableaux vides, index null, réglages par défaut) ; téléchargement impossible, aucune trace', async () => {
    const all = (await auth(http().get(G)).expect(200)).body;
    for (const app of ['console', 'cockpit']) expect(all[app]).toEqual({ versions: [], downloads: [], index: null, lastError: null, settings: DEF });
    await getFile('console').expect(404);
    await getFile('cockpit').expect(404);
    await auth(http().get(`${G}/autre`)).expect(404);
    expect(await t.db.guideDownload.count()).toBe(0);
  });

  it('fichiers refusés avec un message clair (côté serveur), tracés dans l’application concernée ; réservé aux administrateurs', async () => {
    expect((await deposit('cockpit', Buffer.from('pas un pdf'), 'guide.pdf').expect(422)).body.message).toBe(GUIDE_PDF_ONLY);
    // Type réel contrôlé (signature %PDF-) : un texte nommé .pdf est refusé.
    expect((await deposit('cockpit', Buffer.from('texte'), 'note.pdf').expect(422)).body.message).toBe(GUIDE_PDF_ONLY);
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024)]);
    expect((await deposit('cockpit', big, 'lourd.pdf').expect(422)).body.message).toBe(GUIDE_TOO_BIG);
    expect((await deposit('cockpit', Buffer.from('%PDF-1.4\nfichier tronqué'), 'abime.pdf').expect(422)).body.message).toBe(PDF_UNREADABLE);
    expect((await deposit('cockpit', makePdf([[], []], { drawingOnly: true }), 'scan.pdf').expect(422)).body.message).toBe(GUIDE_SCANNED);
    await auth(http().post(`${G}/cockpit`)).expect(400);
    const pmo = await t.token(WHO.pmo);
    await http().post(`${G}/cockpit`).set('Authorization', `Bearer ${pmo}`).attach('file', cockpitGuidePdf(), 'guide.pdf').expect(403);
    expect(await t.db.guideUpload.count({ where: { app: 'cockpit', status: 'FAILED' } })).toBe(5);
    expect(await t.db.guideUpload.count({ where: { app: 'console' } })).toBe(0);
    expect(await t.db.guideVersion.count()).toBe(0);
  });

  it('premier dépôt Cockpit : v1.0 en vigueur aussitôt, indexation « en cours » puis « Indexé » ; la Console reste vide', async () => {
    const r = (await deposit('cockpit', cockpitGuidePdf('A'), 'Guide Cockpit A.pdf').expect(202)).body;
    expect(r).toMatchObject({ v: '1.0', status: 'INDEXING', pages: 3, chunks: expect.any(Number) });
    const during = await data('cockpit');
    expect(during.versions).toEqual([expect.objectContaining({ v: '1.0', by: expect.any(String), size: cockpitGuidePdf('A').length, fileName: 'Guide Cockpit A.pdf' })]);
    expect(during.index).toMatchObject({ status: 'run' });
    await index.idle();
    const after = await data('cockpit');
    expect(after.index).toEqual({ status: 'ok', pages: 3, chunks: r.chunks, model: 'text-embedding-3-large', dims: 3072 });
    expect(await chunksOf('cockpit')).toEqual([{ upload_id: r.uploadId, n: r.chunks }]);
    expect(await data('console')).toMatchObject({ versions: [], downloads: [], index: null });
    expect(await chunksOf('console')).toEqual([]);
    expect(await t.db.auditEntry.count({ where: { action: 'Publication du guide utilisateur du Cockpit' } })).toBe(1);
  });

  it('téléchargement : trace (utilisateur, horodatage serveur, application, version) enregistrée AVANT l’envoi du PDF ; 0, 1 puis 30 téléchargements', async () => {
    expect((await data('cockpit')).downloads).toEqual([]);
    // La trace est écrite AVANT l'envoi : si elle ne peut pas être enregistrée, le fichier n'est pas envoyé.
    const prisma = t.app.get(PrismaService);
    const create = jest.spyOn(prisma.guideDownload, 'create').mockRejectedValueOnce(new Error('base indisponible'));
    const refused = await getFile('cockpit');
    expect(refused.status).toBe(500);
    expect((refused.body as Buffer).subarray(0, 5).toString()).not.toBe('%PDF-');
    create.mockRestore();
    const r = await getFile('cockpit').expect(200);
    expect(r.headers['content-disposition']).toBe('attachment; filename="Guide utilisateur Cockpit v1.0.pdf"');
    expect((r.body as Buffer).equals(cockpitGuidePdf('A'))).toBe(true);
    const d1 = (await data('cockpit')).downloads;
    expect(d1).toEqual([{ user: expect.any(String), role: 'Administrateur', at: new Date(process.env.DEMO_NOW!).toISOString(), version: '1.0' }]);
    expect(await t.db.guideDownload.findFirst({ where: { app: 'cockpit' } })).toMatchObject({ app: 'cockpit' });
    for (let i = 0; i < 29; i++) await getFile('cockpit').expect(200);
    expect((await data('cockpit')).downloads).toHaveLength(30);
    expect((await data('console')).downloads).toEqual([]);
  });

  it('remplacements : v1.1 puis v1.2 en vigueur aussitôt, fichiers précédents plus servis ; l’ancien index sert jusqu’au nouveau', async () => {
    const before = await chunksOf('cockpit');
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const llm = t.app.get(LlmService);
    const real = llm.embedTexts.bind(llm);
    const spy = jest.spyOn(llm, 'embedTexts').mockImplementationOnce(async (...a: Parameters<typeof real>) => { await gate; return real(...a); });
    const v11 = (await deposit('cockpit', cockpitGuidePdf('B'), 'Guide Cockpit B.pdf').expect(202)).body;
    expect(v11.v).toBe('1.1');
    // Pendant l'indexation : v1.1 en vigueur et servie, index « en cours », l'ancien index utilisé par la recherche.
    expect((await data('cockpit')).index).toMatchObject({ status: 'run' });
    expect((await getFile('cockpit').expect(200)).body.equals(cockpitGuidePdf('B'))).toBe(true);
    expect(await chunksOf('cockpit')).toEqual(before);
    const s = t.app.get(GuideSearchService);
    const found = await s.search('cockpit', 'créer une action', { ...RAG_DEFAULTS, minSimilarity: 0 });
    expect(found.extracts.length).toBeGreaterThan(0);
    // Un seul dépôt à la fois par application ; l'autre application n'est pas bloquée.
    expect((await deposit('cockpit', cockpitGuidePdf('C'), 'C.pdf').expect(409)).body.message).toBe(GUIDE_BUSY);
    await deposit('console', guidePdf('A'), 'Guide Console A.pdf').expect(202);
    release();
    await index.idle();
    spy.mockRestore();
    expect((await chunksOf('cockpit')).map((c) => c.upload_id)).toEqual([v11.uploadId]);
    const v12 = (await deposit('cockpit', cockpitGuidePdf('C'), 'Guide Cockpit C.pdf').expect(202)).body;
    await index.idle();
    const d = await data('cockpit');
    expect(d.versions.map((v: any) => v.v)).toEqual(['1.2', '1.1', '1.0']);
    expect(d.index).toMatchObject({ status: 'ok' });
    expect((await t.db.guideVersion.findMany({ where: { app: 'cockpit' }, orderBy: { seq: 'asc' } })).map((v) => v.storageKey === '')).toEqual([true, true, false]);
    expect((await chunksOf('cockpit')).map((c) => c.upload_id)).toEqual([v12.uploadId]);
    // La Console a sa propre série : v1.0.
    expect((await data('console')).versions.map((v: any) => v.v)).toEqual(['1.0']);
  });

  it('échec de l’indexation : la version reste en vigueur non indexée (motif), l’ancien index reste utilisé par Jev', async () => {
    const before = await chunksOf('console');
    const spy = jest.spyOn(t.app.get(LlmService), 'embedTexts').mockRejectedValueOnce(new Error('OpenRouter · 500 : panne simulée'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    await deposit('console', guidePdf('B'), 'Guide Console B.pdf').expect(202);
    await index.idle();
    spy.mockRestore(); err.mockRestore();
    const d = await data('console');
    expect(d.versions[0].v).toBe('1.1');
    expect(d.index).toBeNull();
    expect(d.lastError).toBe('Échec de l’indexation : OpenRouter · 500 : panne simulée');
    expect(await chunksOf('console')).toEqual(before);
    expect((await t.app.get(GuideSearchService).search('console', 'règle de rattrapage', { ...RAG_DEFAULTS, minSimilarity: 0 })).extracts.length).toBeGreaterThan(0);
  });

  it('réglages de Jev par application : valeurs par défaut, revalidation serveur des limites, aucun partage, audit', async () => {
    expect((await data('cockpit')).settings).toEqual(DEF);
    const bad = await auth(http().put(`${G}/cockpit/settings`)).send({ k: 31, keep: 4, thr: 0.96, tv: 0.5, tr: 8.5, tw: 121 }).expect(400);
    expect(bad.body.fields).toEqual({ k: 'entre 1 et 30', thr: 'entre 0 et 0,95', tv: 'entre 1 et 60', tr: 'nombre entier attendu', tw: 'entre 5 et 120' });
    expect((await auth(http().put(`${G}/cockpit/settings`)).send({ ...DEF, k: 3, keep: 4 }).expect(400)).body.fields).toEqual({ keep: 'au plus le nombre d’extraits recherchés' });
    await auth(http().put(`${G}/cockpit/settings`)).send({ ...DEF, autre: 1 }).expect(400);
    const ok = (await auth(http().put(`${G}/cockpit/settings`)).send({ k: 12, keep: 5, thr: 0.6, tv: 15, tr: 9, tw: 45 }).expect(200)).body;
    expect(ok.settings).toEqual({ k: 12, keep: 5, thr: 0.6, tv: 15, tr: 9, tw: 45 });
    expect(await t.app.get(GuideSearchService).settings('cockpit')).toEqual({ searchK: 12, keepK: 5, minSimilarity: 0.6, embedTimeoutMs: 15000, rerankTimeoutMs: 9000, llmTimeoutMs: 45000 });
    expect((await data('console')).settings).toEqual(DEF);
    expect(await t.db.auditEntry.count({ where: { action: 'Modification des réglages de recherche de Jev', target: 'Recherche dans le guide utilisateur du Cockpit' } })).toBe(1);
    const pmo = await t.token(WHO.pmo);
    await http().put(`${G}/cockpit/settings`).set('Authorization', `Bearer ${pmo}`).send(DEF).expect(403);
  });

  it('redémarrage pendant une indexation : le dépôt est clos en échec, le verrou de l’application libéré', async () => {
    await t.db.guideUpload.create({ data: { app: 'cockpit', at: new Date(), by: 'Test', fileName: 'Coupé.pdf', size: 10, status: 'INDEXING', step: 4 } });
    await index.recoverInterrupted();
    expect(await t.db.guideUpload.findFirstOrThrow({ where: { fileName: 'Coupé.pdf' } })).toMatchObject({ status: 'FAILED', error: expect.stringMatching(/redémarré/) });
    await deposit('cockpit', cockpitGuidePdf('D'), 'Guide Cockpit D.pdf').expect(202);
    await index.idle();
  });

  it('journal des téléchargements en ajout seul : une trace ne se modifie ni ne se supprime', async () => {
    const one = await t.db.guideDownload.findFirstOrThrow();
    await expect(t.db.guideDownload.update({ where: { id: one.id }, data: { version: '9.9' } })).rejects.toThrow(/append-only/);
    await expect(t.db.guideDownload.delete({ where: { id: one.id } })).rejects.toThrow(/append-only/);
  });

  it('fichier d’une version remplacée : plus servi (supprimé du stockage)', async () => {
    const old = await t.db.guideUpload.findFirstOrThrow({ where: { app: 'cockpit', fileName: 'Guide Cockpit A.pdf' } });
    expect(await storage.get(old.storageKey!)).toBeNull();
  });
});
