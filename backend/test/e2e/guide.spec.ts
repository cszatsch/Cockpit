import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { guidePdf, makePdf } from '../pdf-fixture';
import { GUIDE_BUSY, GUIDE_PDF_ONLY, GUIDE_SCANNED, GUIDE_TOO_BIG, nextGuideVersion } from '../../src/domain/guide';
import { PDF_UNREADABLE } from '../../src/core/pdf-text';
import { GuideIndexService } from '../../src/admin/guide-index.service';
import { StorageService } from '../../src/core/storage.service';
import { LlmService } from '../../src/core/llm.service';

const G = '/api/admin/guide';

/**
 * Guide utilisateur de la Console (décisions du 30/09/2026) : un seul guide ; dépôt contrôlé (PDF réel, 10 Mo, texte),
 * découpé en extraits et vectorisé (pgvector) en tâche de fond ; remplacement sûr (l'ancien guide reste en place tant
 * que le nouveau n'est pas indexé) ; historique des dépôts avec le modèle de vectorisation ; téléchargement tracé.
 */
describe('Console — guide utilisateur', () => {
  let t: TestCtx;
  let token: string;
  let index: GuideIndexService;
  let storage: StorageService;
  const http = () => request(t.app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const getFile = () => auth(http().get(`${G}/file`)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); });
  const deposit = (buf: Buffer, name = 'Guide.pdf') => auth(http().post(G)).attach('file', buf, { filename: name, contentType: 'application/pdf' });
  const chunkStats = async () => (await t.db.$queryRawUnsafe<Array<{ upload_id: string; n: number; dims: number }>>('SELECT upload_id, count(*)::int AS n, max(vector_dims(embedding))::int AS dims FROM guide_chunks GROUP BY upload_id'));

  beforeAll(async () => {
    t = await setup();
    token = await t.token(WHO.admin);
    index = t.app.get(GuideIndexService);
    storage = t.app.get(StorageService);
  });
  afterAll(() => t.close());

  it('règle de version : incrément mineur (3.2 → 3.3, 3.9 → 3.10), 1.0 pour le premier guide', () => {
    expect(nextGuideVersion(null)).toBe('1.0');
    expect(nextGuideVersion('3.2')).toBe('3.3');
    expect(nextGuideVersion('3.9')).toBe('3.10');
  });

  it('aucun guide : listes vides, état sans guide ; téléchargement impossible, aucune trace', async () => {
    expect((await auth(http().get(`${G}/versions`)).expect(200)).body).toEqual([]);
    expect((await auth(http().get(`${G}/downloads`)).expect(200)).body).toEqual([]);
    expect((await auth(http().get(`${G}/status`)).expect(200)).body).toEqual({ current: null, indexing: null, lastFailure: null });
    await auth(http().get(`${G}/file`)).expect(404);
    expect(await t.db.guideDownload.count()).toBe(0);
  });

  it('fichiers refusés avec un message clair et tracés dans l’historique : non-PDF, trop lourd, illisible, scanné ; réservé aux administrateurs', async () => {
    expect((await deposit(Buffer.from('pas un pdf'), 'guide.pdf').expect(422)).body.message).toBe(GUIDE_PDF_ONLY);
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024)]);
    expect((await deposit(big, 'lourd.pdf').expect(422)).body.message).toBe(GUIDE_TOO_BIG);
    expect((await deposit(Buffer.from('%PDF-1.4\nfichier tronqué'), 'abime.pdf').expect(422)).body.message).toBe(PDF_UNREADABLE);
    expect((await deposit(makePdf([[], []], { drawingOnly: true }), 'scan.pdf').expect(422)).body.message).toBe(GUIDE_SCANNED);
    await auth(http().post(G)).expect(400);
    const pmo = await t.token(WHO.pmo);
    await http().post(G).set('Authorization', `Bearer ${pmo}`).attach('file', guidePdf(), 'guide.pdf').expect(403);
    const ups = (await auth(http().get(`${G}/uploads`)).expect(200)).body;
    expect(ups.map((u: any) => [u.fileName, u.status])).toEqual([['scan.pdf', 'FAILED'], ['abime.pdf', 'FAILED'], ['lourd.pdf', 'FAILED'], ['guide.pdf', 'FAILED']]);
    expect(ups[0]).toMatchObject({ error: GUIDE_SCANNED, pages: 2 });
    expect(await t.db.guideVersion.count()).toBe(0);
    expect((await auth(http().get(`${G}/status`)).expect(200)).body.lastFailure).toMatchObject({ fileName: 'scan.pdf', error: GUIDE_SCANNED });
  });

  it('vectorisation sans modèle de secours : refusé à l’affectation', async () => {
    const r = await auth(http().put('/api/admin/assignments')).send({ doc_vec: { primary: 'te3large', fallback: 'te3large-bis' } }).expect(422);
    expect(r.body.message).toMatch(/pas de modèle de secours/);
  });

  it('premier dépôt : 202, indexation en tâche de fond, puis v1.0 en vigueur, extraits vectorisés (modèle et dimension tracés), index HNSW', async () => {
    const r = (await deposit(guidePdf('A'), 'Guide A.pdf').expect(202)).body;
    expect(r).toMatchObject({ status: 'INDEXING', pages: 3, chunks: expect.any(Number) });
    await index.idle();
    const st = (await auth(http().get(`${G}/status`)).expect(200)).body;
    expect(st.indexing).toBeNull();
    expect(st.lastFailure).toBeNull();
    expect(st.current).toMatchObject({ v: '1.0', fileName: 'Guide A.pdf', pages: 3, chunks: r.chunks, indexed: true, model: 'text-embedding-3-large', modelId: 'te3large', dims: 3072 });
    const stats = await chunkStats();
    expect(stats).toEqual([{ upload_id: r.uploadId, n: r.chunks, dims: 3072 }]);
    const c = await t.db.guideChunk.findFirstOrThrow({ where: { uploadId: r.uploadId, heading: '2.1 Règle de rattrapage' } });
    expect(c).toMatchObject({ sectionPath: 'Guide utilisateur › 2. Notifications › 2.1 Règle de rattrapage', pageStart: 3, pageEnd: 3 });
    expect(c.content).toContain('- Seul le plus récent envoi manqué part.');
    // 3 072 dimensions : index HNSW en demi-précision (halfvec), partiel sur la dimension.
    const idx = await t.db.$queryRawUnsafe<Array<{ indexdef: string }>>(`SELECT indexdef FROM pg_indexes WHERE indexname = 'guide_chunks_hnsw_3072'`);
    expect(idx[0]?.indexdef).toMatch(/USING hnsw .*halfvec\(3072\).*halfvec_cosine_ops.*WHERE \(dims = 3072\)/);
    const up = (await auth(http().get(`${G}/uploads`)).expect(200)).body[0];
    expect(up).toMatchObject({ fileName: 'Guide A.pdf', status: 'SUCCESS', version: '1.0', model: 'text-embedding-3-large', dims: 3072, chunks: r.chunks, pages: 3 });
    expect(await t.db.usageRecord.count({ where: { source: 'GUIDE', functionId: 'doc_vec' } })).toBeGreaterThan(0);
    expect(await t.db.auditEntry.count({ where: { action: 'Publication du guide utilisateur' } })).toBe(1);
  });

  it('téléchargement du guide en vigueur : trace enregistrée avant l’envoi', async () => {
    const r = await getFile().expect(200);
    expect(r.headers['content-disposition']).toBe('attachment; filename="Guide utilisateur Console v1.0.pdf"');
    expect((r.body as Buffer).equals(guidePdf('A'))).toBe(true);
    const d = (await auth(http().get(`${G}/downloads`)).expect(200)).body;
    expect(d[0]).toMatchObject({ role: 'Administrateur', version: '1.0', at: new Date(process.env.DEMO_NOW!).toISOString() });
  });

  it('échec pendant l’indexation : l’ancien guide (fichier et vecteurs) reste en place, l’échec est tracé', async () => {
    const before = await chunkStats();
    const cur = await t.db.guideVersion.findFirstOrThrow({ where: { v: '1.0' } });
    const spy = jest.spyOn(t.app.get(LlmService), 'embedTexts').mockRejectedValueOnce(new Error('OpenAI · 500 : panne simulée'));
    await deposit(guidePdf('B'), 'Guide B.pdf').expect(202);
    await index.idle();
    spy.mockRestore();
    expect(await chunkStats()).toEqual(before);
    expect(await t.db.guideVersion.count()).toBe(1);
    expect(await storage.get(cur.storageKey)).not.toBeNull();
    expect((await getFile().expect(200)).body.equals(guidePdf('A'))).toBe(true);
    const st = (await auth(http().get(`${G}/status`)).expect(200)).body;
    expect(st.current.v).toBe('1.0');
    expect(st.lastFailure).toMatchObject({ fileName: 'Guide B.pdf', error: 'Échec de l’indexation : OpenAI · 500 : panne simulée' });
    expect((await auth(http().get(`${G}/uploads`)).expect(200)).body[0]).toMatchObject({ status: 'FAILED', fileName: 'Guide B.pdf' });
    expect(await t.db.guideUpload.count({ where: { status: 'FAILED', storageKey: { not: null } } })).toBe(0);
  });

  it('un seul dépôt à la fois : 409 pendant une indexation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const llm = t.app.get(LlmService);
    const real = llm.embedTexts.bind(llm);
    const spy = jest.spyOn(llm, 'embedTexts').mockImplementationOnce(async (...a: Parameters<typeof real>) => { await gate; return real(...a); });
    await deposit(guidePdf('C'), 'Guide C.pdf').expect(202);
    const busy = await deposit(guidePdf('D'), 'Guide D.pdf').expect(409);
    expect(busy.body.message).toBe(GUIDE_BUSY);
    expect((await auth(http().get(`${G}/status`)).expect(200)).body.indexing).toMatchObject({ fileName: 'Guide C.pdf', step: 4, steps: 5, stepLabel: 'Vectorisation' });
    release();
    await index.idle();
    spy.mockRestore();
  });

  it('remplacement réussi : v1.1 en vigueur, ancien fichier et anciens vecteurs supprimés, historique complet', async () => {
    const v10 = await t.db.guideVersion.findFirstOrThrow({ where: { v: '1.0' } });
    const v11 = await t.db.guideVersion.findFirstOrThrow({ where: { v: '1.1' } });
    const up = await t.db.guideUpload.findFirstOrThrow({ where: { fileName: 'Guide C.pdf' } });
    expect(v11.uploadId).toBe(up.id);
    expect(v10.storageKey).toBe('');
    const stats = await chunkStats();
    expect(stats.map((s) => s.upload_id)).toEqual([up.id]);
    expect((await getFile().expect(200)).body.equals(guidePdf('C'))).toBe(true);
    const ups = (await auth(http().get(`${G}/uploads`)).expect(200)).body;
    expect(ups.slice(0, 3).map((u: any) => [u.fileName, u.status, u.version])).toEqual([['Guide C.pdf', 'SUCCESS', '1.1'], ['Guide B.pdf', 'FAILED', null], ['Guide A.pdf', 'SUCCESS', '1.0']]);
    const vers = (await auth(http().get(`${G}/versions`)).expect(200)).body;
    expect(vers.map((v: any) => v.v)).toEqual(['1.1', '1.0']);
    expect(vers[0]).toMatchObject({ model: 'text-embedding-3-large', dims: 3072, pages: 3 });
  });

  it('redémarrage pendant une indexation : le dépôt est clos en échec, le verrou libéré', async () => {
    await t.db.guideUpload.create({ data: { at: new Date(), by: 'Test', fileName: 'Coupé.pdf', size: 10, status: 'INDEXING', step: 4 } });
    await index.recoverInterrupted();
    expect(await t.db.guideUpload.findFirstOrThrow({ where: { fileName: 'Coupé.pdf' } })).toMatchObject({ status: 'FAILED', error: expect.stringMatching(/redémarré/) });
    expect((await auth(http().get(`${G}/status`)).expect(200)).body.indexing).toBeNull();
  });

  it('journal des téléchargements en ajout seul : une trace ne se modifie ni ne se supprime', async () => {
    const one = await t.db.guideDownload.findFirstOrThrow();
    await expect(t.db.guideDownload.update({ where: { id: one.id }, data: { version: '9.9' } })).rejects.toThrow(/append-only/);
    await expect(t.db.guideDownload.delete({ where: { id: one.id } })).rejects.toThrow(/append-only/);
  });
});
