import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { guidePdf, makePdf } from '../pdf-fixture';
import { makeDocx, makePptx, makeXlsx, protectedOffice } from '../office-fixture';
import { KbService } from '../../src/cockpit/documents/kb.service';
import { LlmService } from '../../src/core/llm.service';
import { StorageService } from '../../src/core/storage.service';
import { ApiError } from '../../src/core/errors';
import { KB_EMPTY, KB_FORMAT_REFUSED, KB_PROTECTED, KB_SCANNED, KB_TOO_BIG, KB_MAX_BYTES, kbMismatch, kbOldFormat } from '../../src/domain/kb-documents';

const R = '/api/projects/RISE';

/**
 * Base de connaissance du Cockpit (décisions du 30/09/2026) : dépôt PDF / Word / PowerPoint / Excel, contrôles,
 * extraction, résumé, découpage et vectorisation (hors ligne : résumé et vecteurs simulés), suppression, doublons,
 * échec sans donnée partielle, historique, recherche sur plusieurs documents.
 */
describe('Cockpit — Base de connaissance', () => {
  let t: TestCtx;
  let kb: KbService;
  let pmoToken: string;
  const http = () => request(t.app.getHttpServer());
  const as = (token: string) => ({
    up: (buf: Buffer, name: string, fields: Record<string, string> = {}) => { let r = http().post(`${R}/documents`).set('Authorization', `Bearer ${token}`); for (const [k, v] of Object.entries(fields)) r = r.field(k, v); return r.attach('file', buf, name); },
    get: (url: string) => http().get(`${R}/documents${url}`).set('Authorization', `Bearer ${token}`),
    del: (id: string) => http().delete(`${R}/documents/${id}`).set('Authorization', `Bearer ${token}`),
  });
  const chunksOf = (documentId: string) => t.db.kbChunk.findMany({ where: { documentId }, orderBy: { position: 'asc' } });
  const vectorsOf = async (documentId: string) => (await t.db.$queryRawUnsafe<Array<{ n: number }>>('SELECT count(*)::int AS n FROM kb_chunks WHERE document_id = $1 AND embedding IS NOT NULL', documentId))[0].n;

  beforeAll(async () => {
    t = await setup();
    kb = t.app.get(KbService);
    pmoToken = await t.token(WHO.pmo);
  });
  afterAll(() => t.close());

  it('un fichier de chaque format : texte extrait, résumé, extraits et métadonnées ; repères propres au format', async () => {
    const pmo = as(pmoToken);
    const files: Array<[Buffer, string, string]> = [
      [guidePdf('KB'), 'Guide de recette.pdf', 'PDF'],
      [await makeDocx([{ h: 'Contexte', paras: ['Le lot Ventes remplace l’outil de gestion des opportunités.'] }, { h: 'Exigences', level: 2, table: [['Exigence', 'Priorité'], ['EX-01 Saisie mobile des opportunités', 'Haute']] }]), 'Spécifications CRM.docx', 'DOCX'],
      [await makePptx([{ title: 'COPIL n°19', lines: ['Go-Live reporté au 1er avril 2027'], notes: ['Rappeler la répétition générale.'] }, { title: 'Risques', lines: ['R01 bascule des données clients'] }]), 'Support COPIL 19.pptx', 'PPTX'],
      [await makeXlsx([{ name: 'Interfaces', rows: [['Interface', 'Statut'], ['CRM → ERP', 'En recette'], ['ERP → BI', 'Livrée']] }]), 'Suivi des interfaces.xlsx', 'XLSX'],
    ];
    for (const [buf, name, format] of files) {
      const up = await pmo.up(buf, name, { type: 'Référence' }).expect(201);
      expect(up.body).toMatchObject({ n: name.replace(/\.[^.]+$/, ''), ext: 'PENDING', format, type: 'Référence', uploadedBy: expect.any(String), progress: 5 });
      await kb.idle();
      const d = (await pmo.get(`/${up.body.id}`).expect(200)).body;
      expect(d).toMatchObject({ ext: 'SUCCEEDED', progress: 100, error: null, summary: expect.any(String), description: expect.any(String), chunkCount: expect.any(Number), embeddingModel: expect.any(String) });
      const chunks = await chunksOf(up.body.id);
      expect(chunks.length).toBe(d.chunkCount);
      expect(await vectorsOf(up.body.id)).toBe(chunks.length);
      for (const c of chunks) expect(c.metadata).toMatchObject({ document: d.n, deposeLe: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), description: d.description });
      if (format === 'PDF') expect(chunks[0]).toMatchObject({ pageStart: expect.any(Number), metadata: expect.objectContaining({ section: expect.any(String), page: expect.any(Number) }) });
      if (format === 'DOCX') expect(chunks.map((c) => c.section)).toContain('Contexte › Exigences');
      if (format === 'DOCX') expect(chunks.map((c) => c.content).join('\n')).toContain('Exigence : EX-01 Saisie mobile des opportunités ; Priorité : Haute');
      if (format === 'PPTX') expect(chunks.map((c) => [c.slide, (c.metadata as any).diapositive])).toEqual([[1, 1], [2, 2]]);
      if (format === 'PPTX') expect(chunks[0].content).toContain('Notes de l’orateur : Rappeler la répétition générale.');
      if (format === 'XLSX') expect(chunks[0]).toMatchObject({ sheet: 'Interfaces', rowStart: 2, rowEnd: 3, metadata: expect.objectContaining({ onglet: 'Interfaces' }) });
    }
    // Consommation : synthèse (résumé) et vectorisation, source Cockpit, projet renseigné.
    const usage = await t.db.usageRecord.findMany({ where: { functionId: { in: ['doc_syn', 'doc_vec'] }, source: 'COCKPIT', projectId: 'RISE' } });
    expect(new Set(usage.map((u) => u.functionId))).toEqual(new Set(['doc_syn', 'doc_vec']));
    // Historique : dépôt puis indexation.
    const h = (await pmo.get('/history').expect(200)).body;
    expect(h.filter((e: any) => e.action === 'DEPOT')).toHaveLength(4);
    expect(h.filter((e: any) => e.action === 'INDEXE')).toHaveLength(4);
    // Fichiers rangés dans le dossier dédié.
    const doc = await t.db.document.findFirst({ where: { n: 'Spécifications CRM' } });
    expect(doc!.fileKey).toMatch(/^base-connaissance\/RISE\//);
  });

  it('fichiers refusés avec un message clair, tracés, sans document ni fichier créé : format, taille, vide, protégé, ancien format, extension trompeuse, PDF scanné', async () => {
    const pmo = as(pmoToken);
    const before = await t.db.document.count();
    const cases: Array<[Buffer, string, string]> = [
      [Buffer.from('MZ binaire'), 'outil.exe', KB_FORMAT_REFUSED],
      [Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(KB_MAX_BYTES)]), 'lourd.pdf', KB_TOO_BIG],
      [protectedOffice(), 'budget protégé.xlsx', KB_PROTECTED],
      [Buffer.from('ancien'), 'note.doc', kbOldFormat('.doc')],
      [Buffer.from('ceci est du texte'), 'faux.pdf', kbMismatch('.pdf')],
      [makePdf([[], []], { drawingOnly: true }), 'scan.pdf', KB_SCANNED],
    ];
    for (const [buf, name, msg] of cases) expect((await pmo.up(buf, name).expect(422)).body.message).toBe(msg);
    // Fichier vide : refusé aussi.
    expect((await pmo.up(Buffer.alloc(0), 'vide.docx')).body.message).toMatch(new RegExp(`${KB_EMPTY}|Fichier manquant`));
    expect(await t.db.document.count()).toBe(before);
    const refus = (await pmo.get('/history').expect(200)).body.filter((e: any) => e.action === 'REFUS');
    expect(refus.map((e: any) => e.detail)).toEqual(expect.arrayContaining(cases.map((c) => c[2])));
    // Profils : un Lecteur ne dépose pas et ne voit pas l'historique.
    const lec = as(await t.token(WHO.lecteurC3));
    await lec.up(await makeDocx([{ paras: ['x'] }]), 'x.docx').expect(403);
    await lec.get('/history').expect(403);
  });

  it('doublons : contenu identique refusé ; même nom → remplacer (v2, ancienne version et ses vecteurs supprimés après indexation) ou garder les deux', async () => {
    const pmo = as(pmoToken);
    const v1 = await makeDocx([{ h: 'Plan', paras: ['Bascule le 14 octobre, répétition le 1er octobre.'] }]);
    const a = (await pmo.up(v1, 'Plan de bascule.docx').expect(201)).body;
    await kb.idle();
    await http().put(`${R}/documents/${a.id}/links`).set('Authorization', `Bearer ${pmoToken}`).send({ links: [{ entityType: 'RISK', entityId: 'R01' }] }).expect(200);
    // Même contenu, autre nom : refusé.
    const same = await pmo.up(v1, 'Copie du plan.docx').expect(409);
    expect(same.body).toMatchObject({ code: 'DUPLICATE_CONTENT', message: expect.stringContaining('« Plan de bascule »') });
    // Même nom, contenu différent : choix demandé.
    const v2 = await makeDocx([{ h: 'Plan', paras: ['Bascule décalée au 21 octobre, répétition le 8 octobre.'] }]);
    const ask = await pmo.up(v2, 'Plan de bascule.docx').expect(409);
    expect(ask.body).toMatchObject({ code: 'DUPLICATE_NAME', existing: { id: a.id, n: 'Plan de bascule', v: 'v1', canReplace: true } });
    // Remplacer : l'ancienne version reste en place jusqu'à l'indexation de la nouvelle.
    const oldKey = (await t.db.document.findUnique({ where: { id: a.id } }))!.fileKey!;
    const b = (await pmo.up(v2, 'Plan de bascule.docx', { replaceId: a.id }).expect(201)).body;
    expect(b).toMatchObject({ n: 'Plan de bascule', v: 'v2' });
    await kb.idle();
    expect(await t.db.document.findUnique({ where: { id: a.id } })).toBeNull();
    expect(await t.db.kbChunk.count({ where: { documentId: a.id } })).toBe(0);
    expect(await t.app.get(StorageService).get(oldKey)).toBeNull();
    expect((await pmo.get(`/${b.id}`).expect(200)).body).toMatchObject({ ext: 'SUCCEEDED', v: 'v2', links: [{ entityType: 'RISK', entityId: 'R01' }] });
    // Garder les deux : nom distingué.
    const v3 = await makeDocx([{ h: 'Plan', paras: ['Variante de bascule en deux vagues.'] }]);
    const c = (await pmo.up(v3, 'Plan de bascule.docx', { keepBoth: 'true' }).expect(201)).body;
    expect(c.n).toBe('Plan de bascule (2)');
    await kb.idle();
    const h = (await pmo.get('/history').expect(200)).body;
    expect(h.some((e: any) => e.action === 'REMPLACEMENT' && e.documentId === b.id)).toBe(true);
  });

  it('échec du traitement (vectorisation) : aucune donnée partielle, document « en échec » avec le motif, erreur tracée', async () => {
    const pmo = as(pmoToken);
    const spy = jest.spyOn(t.app.get(LlmService), 'embedTexts').mockRejectedValueOnce(new ApiError(503, 'AI_UNAVAILABLE', 'Vectorisation indisponible : délai dépassé'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const up = (await pmo.up(await makeXlsx([{ name: 'Risques', rows: [['Code', 'Libellé'], ['R01', 'Bascule des données']] }]), 'Registre des risques.xlsx').expect(201)).body;
    await kb.idle();
    spy.mockRestore();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('Vectorisation indisponible'));
    err.mockRestore();
    const d = (await pmo.get(`/${up.id}`).expect(200)).body;
    expect(d).toMatchObject({ ext: 'FAILED', error: expect.stringContaining('Vectorisation indisponible : délai dépassé'), summary: null, description: null, chunkCount: null, hasFile: true });
    expect(await t.db.kbChunk.count({ where: { documentId: up.id } })).toBe(0);
    expect((await pmo.get('/history').expect(200)).body.find((e: any) => e.documentId === up.id && e.action === 'ECHEC')).toMatchObject({ status: 'ECHEC', detail: expect.stringContaining('délai dépassé') });
    // Un document en échec ne bloque pas un nouveau dépôt du même fichier.
    await pmo.up(await makeXlsx([{ name: 'Risques', rows: [['Code', 'Libellé'], ['R01', 'Bascule des données']] }]), 'Registre des risques.xlsx', { keepBoth: 'true' }).expect(201);
    await kb.idle();
  });

  it('suppression : fichier, résumé et tous les vecteurs ; réservée au PMO et à l’auteur du dépôt ; tracée', async () => {
    const pmo = as(pmoToken);
    const resp = as(await t.token(WHO.respC5));
    const other = as(await t.token(WHO.respC1));
    const mine = (await resp.up(await makePptx([{ title: 'Atelier C5', lines: ['Compte rendu de l’atelier'] }]), 'Atelier C5.pptx').expect(201)).body;
    await kb.idle();
    expect(await vectorsOf(mine.id)).toBeGreaterThan(0);
    const key = (await t.db.document.findUnique({ where: { id: mine.id } }))!.fileKey!;
    await other.del(mine.id).expect(403);
    await as(await t.token(WHO.lecteurC3)).del(mine.id).expect(403);
    await resp.del(mine.id).expect(204);
    expect(await t.db.document.findUnique({ where: { id: mine.id } })).toBeNull();
    expect(await vectorsOf(mine.id)).toBe(0);
    expect(await t.app.get(StorageService).get(key)).toBeNull();
    const h = (await pmo.get('/history').expect(200)).body.find((e: any) => e.documentId === mine.id && e.action === 'SUPPRESSION');
    expect(h).toMatchObject({ document: 'Atelier C5', status: 'SUPPRIME' });
    // Le PMO supprime aussi un document de démonstration (sans auteur).
    const demo = await t.db.document.findFirst({ where: { projectId: 'RISE', uploadedById: null } });
    await pmo.del(demo!.id).expect(204);
  });

  it('recherche sur plusieurs documents : les résultats citent le bon document et son repère ; documents Restreints exclus pour un Lecteur', async () => {
    const pmo = as(pmoToken);
    const docs: Array<[Buffer, string, Record<string, string>]> = [
      [await makeDocx([{ h: 'Formation', paras: ['Les utilisateurs clés suivront une formation au nouveau CRM en novembre, animée par le service formation.'] }]), 'Plan de formation.docx', {}],
      [await makeXlsx([{ name: 'Budget', rows: [['Poste', 'Montant'], ['Licences logicielles annuelles', '120000'], ['Hébergement cloud', '45000']] }]), 'Budget prévisionnel.xlsx', {}],
      [await makePptx([{ title: 'Contrat', lines: ['Pénalités de retard du prestataire intégrateur plafonnées à dix pour cent'] }]), 'Clauses contractuelles.pptx', { conf: 'RESTRICTED', type: 'Contractuel' }],
    ];
    for (const [buf, name, f] of docs) await pmo.up(buf, name, f).expect(201);
    await kb.idle();
    const ask = async (q: string, token = pmoToken) => (await as(token).get(`/search?q=${encodeURIComponent(q)}`).expect(200)).body;
    const r1 = await ask('formation des utilisateurs clés au nouveau CRM');
    expect(r1.results[0]).toMatchObject({ document: 'Plan de formation', location: 'Section : Formation', similarity: expect.any(Number) });
    const r2 = await ask('montant des licences logicielles annuelles');
    expect(r2.results[0]).toMatchObject({ document: 'Budget prévisionnel', sheet: 'Budget', location: 'Onglet Budget · lignes 2-3' });
    const r3 = await ask('pénalités de retard du prestataire intégrateur');
    expect(r3.results[0]).toMatchObject({ document: 'Clauses contractuelles', slide: 1 });
    // Restreint : invisible d'un Lecteur (liste, fiche, recherche).
    const lecToken = await t.token(WHO.lecteurC3);
    const r4 = await ask('pénalités de retard du prestataire intégrateur', lecToken);
    expect(r4.results.every((x: any) => x.document !== 'Clauses contractuelles')).toBe(true);
    const list = (await as(lecToken).get('').expect(200)).body;
    expect(list.some((d: any) => d.n === 'Clauses contractuelles')).toBe(false);
  });
});
