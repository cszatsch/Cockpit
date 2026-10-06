import ExcelJS from 'exceljs';
import request from 'supertest';
import { LlmClient } from '../../src/core/llm-client';
import { encryptSecret } from '../../src/core/crypto';
import { PrefillService } from '../../src/admin/prefill.service';
import { StorageService } from '../../src/core/storage.service';
import { SHEETS } from '../../src/import/excel-reader';
import { setup, TestCtx, WHO } from '../helpers';
import { buildWorkbook, validAtlas } from '../fixtures/excel';
import { makeTextPdf } from '../fixtures/pdf';
import { orionAnswer } from '../fixtures/prefill-llm';
import { ORION_PAGES } from '../../scripts/prefill-exemple';

/**
 * Initialisation d'un projet, point d'entrée unique (maquette « Initialisation projet v3 », 07/10/2026) : un seul dépôt,
 * le format du fichier décide du traitement. Critères d'acceptation 1 à 9 du brief, sauf le 7 (glisser-déposer : la
 * voie s'allume selon le type), vérifié par la recette navigateur `test/browser/prefill.e2e.ts`.
 * Le modèle d'IA est un double de `fetch` (réponses de `test/fixtures/prefill-llm.ts`) : aucun appel réel.
 */
const P = '/api/admin/projects/init';

describe('Initialisation d’un projet — écran unique (maquette v3)', () => {
  let t: TestCtx;
  let tok: string;
  const prompts: string[] = [];
  let failOn: string | null = null;
  let delayMs = 0;

  const http = () => request(t.app.getHttpServer());
  const upload = (buf: Buffer, name: string) => http().post(`${P}/files`).set('Authorization', `Bearer ${tok}`).attach('files', buf, name);
  const get = (path: string) => http().get(`${P}${path}`).set('Authorization', `Bearer ${tok}`);
  /** Flux SSE lu jusqu'à sa fin : `[{ type, ...data }]`. */
  const stream = async (taskId: string) => {
    const r = await get(`/tasks/${taskId}/events`).buffer(true)
      .parse((res, cb) => { let s = ''; res.setEncoding('utf8'); res.on('data', (c) => (s += c)); res.on('end', () => cb(null, s)); }).expect(200);
    return String(r.body).split('\n\n').filter((b) => b.startsWith('event: ')).map((b) => {
      const [ev, data] = b.split('\n');
      return { type: ev.slice(7), ...JSON.parse(data.slice(6)) };
    });
  };
  /** Dépôt puis traitement (analyse ou contrôle selon le type reconnu) ; flux lu jusqu'à la fin. */
  const run = async (buf: Buffer, name: string) => {
    const up = await upload(buf, name).expect(201);
    const taskId = (await http().post(`${P}/files/${up.body.id}/processing`).set('Authorization', `Bearer ${tok}`).expect(202)).body.tacheId as string;
    return { doc: up.body, taskId, events: await stream(taskId) };
  };
  const binary = (r: request.Test) => r.buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); });

  beforeAll(async () => {
    t = await setup();
    tok = await t.token(WHO.admin);
    t.app.get(PrefillService).tickMs = 20;
    await t.db.provider.update({ where: { id: 'anthropic' }, data: { keyCipher: encryptSecret('sk-ant-test-0000000000000000AbCd'), status: 'OK' } });
    await t.db.provider.update({ where: { id: 'openai' }, data: { keyCipher: encryptSecret('sk-proj-test-000000000000000WxYz'), status: 'OK' } });
    const client = t.app.get(LlmClient);
    client.live = true;
    client.fetchImpl = (async (_url: string, init: any) => {
      const prompt = /ONGLET \d\d [^—]+—/.exec(JSON.stringify(JSON.parse(init.body)))?.[0] ?? '';
      prompts.push(prompt);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (failOn && prompt.includes(failOn)) return new Response(JSON.stringify({ error: { message: 'surcharge' } }), { status: 500 });
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(orionAnswer(prompt)) }], usage: { input_tokens: 2000, output_tokens: 300 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;
  });
  afterAll(() => t.close());
  beforeEach(() => { prompts.length = 0; failOn = null; delayMs = 0; });

  it('14 onglets, numérotation et nombre de champs fixes ; routes réservées à l’Administrateur', async () => {
    const r = await get('/tabs').expect(200);
    expect(r.body.map((x: any) => `${x.n} ${x.label}`)).toEqual([...SHEETS]);
    expect(r.body.map((x: any) => x.champs)).toEqual([2, 2, 5, 4, 14, 3, 6, 7, 7, 8, 6, 3, 8, 6]);
    const pmo = await t.token(WHO.pmo);
    for (const path of ['/tabs', '/template', '/tasks/x/anomalies', '/tasks/x/report', '/tasks/x/preview']) await http().get(`${P}${path}`).set('Authorization', `Bearer ${pmo}`).expect(403);
    await http().post(`${P}/files`).set('Authorization', `Bearer ${pmo}`).attach('files', await buildWorkbook(validAtlas('ORION')), 'init.xlsx').expect(403);
  });

  it('modèle vierge : classeur du modèle, au nom de l’utilisateur et du jour', async () => {
    const r = await binary(get('/template')).expect(200);
    expect(decodeURIComponent(/filename\*=UTF-8''(.+)$/.exec(r.headers['content-disposition'])![1])).toMatch(/^.+ - Init projet Cockpit \d{6}\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body);
    expect(SHEETS.every((s) => wb.getWorksheet(s))).toBe(true);
  });

  it('critère 1 : un PDF texte aboutit au préremplissage ; l’Excel téléchargé s’ouvre et garde la structure du modèle', async () => {
    const { doc, taskId, events } = await run(makeTextPdf(ORION_PAGES), 'Proposition commerciale ORION v3.pdf');
    expect(doc).toMatchObject({ type: 'proposition', pages: ORION_PAGES.length });
    expect(events[events.length - 1]).toMatchObject({ type: 'termine', resultat: expect.stringMatching(/^(complet|partiel)$/) });
    const x = await binary(get(`/tasks/${taskId}/excel`)).expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.body);
    const tpl = new ExcelJS.Workbook();
    await tpl.xlsx.load((await binary(get('/template')).expect(200)).body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(tpl.worksheets.map((w) => w.name));
  });

  it('critère 2 : un XLSX conforme aboutit à « Fichier conforme » ; la prévisualisation s’ouvre et mène à la publication', async () => {
    const { doc, taskId, events } = await run(await buildWorkbook(validAtlas('ORION')), 'Référentiel ORION · initialisation.xlsx');
    expect(doc).toMatchObject({ type: 'excel', nom: 'Référentiel ORION · initialisation.xlsx' });
    expect(prompts).toHaveLength(0);
    const done = events.filter((e) => e.type === 'onglet_termine');
    expect(done.map((e) => e.ongletIndex)).toEqual([...Array(14).keys()]);
    expect(done.every((e) => e.anomaliesBloquantes === 0)).toBe(true);
    expect(events[events.length - 1]).toMatchObject({ type: 'termine', resultat: 'conforme' });
    // Avertissement (Go-Live hors de la période de sa phase) : affiché, sans bloquer.
    const anomalies = (await get(`/tasks/${taskId}/anomalies`).expect(200)).body;
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies.every((a: any) => a.gravite === 'avertissement')).toBe(true);
    expect(done.reduce((n, e) => n + e.avertissements, 0)).toBe(anomalies.length);
    const pv = (await get(`/tasks/${taskId}/preview`).expect(200)).body;
    expect(pv).toMatchObject({ ok: true, file: 'Référentiel ORION · initialisation.xlsx', missing: [], jobId: expect.any(String) });
    expect(pv.project.find((p: any) => p.l === 'Code projet').v).toBe('ORION');
    // Copie du dépôt supprimée : seul le fichier gardé pour la publication reste.
    expect((await t.db.prefillDocument.findUniqueOrThrow({ where: { id: doc.id } })).fileKey).toBeNull();
    await http().post('/api/admin/projects/import/commit').set('Authorization', `Bearer ${tok}`).send({ jobId: pv.jobId }).expect(202);
    for (let k = 0; k < 200 && (await t.db.projectImport.findUniqueOrThrow({ where: { id: pv.jobId } })).status !== 'IMPORTED'; k++) await new Promise((r) => setTimeout(r, 20));
    expect(await t.db.project.findUnique({ where: { code: 'ORION' } })).not.toBeNull();
    await get(`/tasks/${taskId}/preview`).expect(409);
  });

  it('critère 3 : un XLSX avec anomalies → liste avec les cellules exactes ; prévisualisation bloquée ; rapport aux mêmes compteurs', async () => {
    const x = validAtlas('VEGA');
    x.rows['03 Personnes'][1].Email = 'philippe.aubert@vega';
    x.rows['03 Personnes'][2].Équipe = 'Data & IA';
    const { doc, taskId, events } = await run(await buildWorkbook(x), 'Référentiel VEGA.xlsx');
    expect(events[events.length - 1]).toMatchObject({ type: 'termine', resultat: 'anomalies' });
    const anomalies = (await get(`/tasks/${taskId}/anomalies`).expect(200)).body;
    expect(anomalies).toContainEqual({ ongletIndex: 2, onglet: '03 Personnes', champ: 'Équipe', valeur: 'Data & IA', motif: 'Équipe « Data & IA » inconnue (onglet 01 Équipes).', gravite: 'bloquant', cellule: 'D11' });
    expect(anomalies).toContainEqual(expect.objectContaining({ onglet: '03 Personnes', champ: 'Email', valeur: 'philippe.aubert@vega', gravite: 'bloquant', cellule: 'C10' }));
    // Compteurs : écran (événements), liste et rapport identiques.
    const tab = events.find((e) => e.type === 'onglet_termine' && e.ongletIndex === 2);
    expect(tab).toMatchObject({ statut: 'anomalies', anomaliesBloquantes: 2 });
    const nb = anomalies.filter((a: any) => a.gravite === 'bloquant').length, nw = anomalies.length - nb;
    expect(events.filter((e) => e.type === 'onglet_termine').reduce((n, e) => n + e.anomaliesBloquantes, 0)).toBe(nb);
    await get(`/tasks/${taskId}/preview`).expect(409);
    expect(await t.db.projectImport.count({ where: { fileName: 'Référentiel VEGA.xlsx' } })).toBe(0);
    const r = await binary(get(`/tasks/${taskId}/report`)).expect(200);
    expect(decodeURIComponent(/filename\*=UTF-8''(.+)$/.exec(r.headers['content-disposition'])![1])).toBe('Référentiel VEGA · rapport de contrôle.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body);
    const ws = wb.getWorksheet('Rapport de contrôle')!;
    expect(ws.getCell('B5').value).toBe(nb);
    expect(ws.getCell('B6').value).toBe(nw);
    expect(ws.rowCount - 8).toBe(anomalies.length);
    expect([ws.getCell('A9').value, ws.getCell('B9').value, ws.getCell('E9').value, ws.getCell('F9').value]).toEqual([anomalies[0].onglet, anomalies[0].champ, 'Bloquant', anomalies[0].cellule]);
    expect((await t.db.prefillDocument.findUniqueOrThrow({ where: { id: doc.id } })).fileKey).toBeNull();
  });

  it('critère 4 : un fichier .numbers (ou dont la signature ne correspond pas) déclenche l’erreur de format, sans traitement', async () => {
    const before = await t.db.prefillDocument.count();
    for (const [buf, name] of [[Buffer.from('PK\u0003\u0004 numbers'), 'Budget ORION.numbers'], [Buffer.from('texte brut'), 'faux.xlsx'], [Buffer.from('ceci n’est pas un PDF'), 'faux.pdf']] as const) {
      const r = await upload(buf, name).expect(422);
      expect(r.body).toMatchObject({ code: 'FORMAT', message: expect.stringMatching(/PDF, DOCX, PPTX ou XLSX/) });
    }
    // Un Excel se dépose seul (pas avec une proposition).
    const both = await http().post(`${P}/files`).set('Authorization', `Bearer ${tok}`).attach('files', makeTextPdf(ORION_PAGES), 'p.pdf').attach('files', await buildWorkbook(validAtlas('ORION')), 'init.xlsx').expect(422);
    expect(both.body).toMatchObject({ code: 'FORMAT', fields: { fichier: 'init.xlsx' } });
    expect(await t.db.prefillDocument.count()).toBe(before);
    expect(prompts).toHaveLength(0);
  });

  it('critère 5 : un PDF scanné ou protégé, ou un Excel protégé par mot de passe, déclenche l’erreur de lecture', async () => {
    for (const o of [{ protected: true }, { scanned: true }]) expect((await upload(makeTextPdf(ORION_PAGES, o), 'Proposition ORION scannée.pdf').expect(422)).body.code).toBe('LECTURE');
    // Classeur chiffré : conteneur OLE (CFB), pas un ZIP.
    const cfb = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504)]);
    expect((await upload(cfb, 'Référentiel protégé.xlsx').expect(422)).body).toMatchObject({ code: 'LECTURE', fields: { fichier: 'Référentiel protégé.xlsx' } });
    expect(prompts).toHaveLength(0);
  });

  it('critère 6 : interruption simulée à l’onglet 07 → 6 onglets conservés ; « Reprendre » repart de l’onglet 07', async () => {
    failOn = 'ONGLET 07 Lots';
    const { taskId, events } = await run(makeTextPdf(ORION_PAGES), 'Proposition commerciale ORION v3.pdf');
    expect(events.filter((e) => e.type === 'onglet_termine').map((e) => e.ongletIndex).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(events[events.length - 1]).toEqual({ type: 'erreur', code: 'ANALYSE', ongletIndex: 6, ongletsConserves: 6 });
    failOn = null;
    prompts.length = 0;
    expect((await http().post(`${P}/tasks/${taskId}/resume`).set('Authorization', `Bearer ${tok}`).expect(202)).body).toEqual({ tacheId: taskId, ongletIndex: 6 });
    const after = await stream(taskId);
    expect(prompts[0]).toContain('ONGLET 07 Lots');
    expect(prompts.some((p) => /ONGLET 0[1-6] /.test(p))).toBe(false);
    expect(after[after.length - 1]).toMatchObject({ type: 'termine' });
  });

  it('critère 8 : l’Excel prérempli, relu et redéposé, suit la voie Excel sans retouche de structure', async () => {
    const a = await run(makeTextPdf(ORION_PAGES), 'Proposition commerciale ORION v3.pdf');
    const excel = (await binary(get(`/tasks/${a.taskId}/excel`)).expect(200)).body as Buffer;
    const { doc, taskId, events } = await run(excel, 'Proposition commerciale ORION v3 · prérempli.xlsx');
    expect(doc.type).toBe('excel');
    expect(events.filter((e) => e.type === 'onglet_termine')).toHaveLength(14);
    expect(events[events.length - 1]).toMatchObject({ type: 'termine', resultat: expect.stringMatching(/^(conforme|anomalies)$/) });
    const anomalies = (await get(`/tasks/${taskId}/anomalies`).expect(200)).body;
    // Aucune anomalie de structure (onglet absent, ancien modèle) : seules des données à compléter, chacune à sa cellule.
    expect(anomalies.filter((x: any) => x.champ === 'Onglet entier' || /Ancien modèle|manquant/.test(x.motif))).toEqual([]);
    expect(anomalies.filter((x: any) => !/^[A-Z]{1,3}\d+$/.test(x.cellule)).map((x: any) => x.motif)).toEqual(anomalies.filter((x: any) => x.cellule === '—').map((x: any) => x.motif));
  });

  it('critère 9 : « Annuler » arrête la tâche côté serveur ; réinitialiser une voie Excel oublie aussi le fichier gardé', async () => {
    delayMs = 150;
    const up = await upload(makeTextPdf(ORION_PAGES), 'Proposition commerciale ORION v3.pdf').expect(201);
    const taskId = (await http().post(`${P}/files/${up.body.id}/processing`).set('Authorization', `Bearer ${tok}`).expect(202)).body.tacheId;
    await new Promise((r) => setTimeout(r, 400));
    await http().delete(`${P}/tasks/${taskId}`).set('Authorization', `Bearer ${tok}`).expect(204);
    const n = prompts.length;
    await new Promise((r) => setTimeout(r, 600));
    expect(prompts.length).toBeLessThanOrEqual(n + 1);
    expect((await t.db.prefillTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe('CANCELLED');
    expect((await stream(taskId)).pop()).toEqual({ type: 'annule' });
    // Voie Excel conforme, puis réinitialisation : import gardé et fichier supprimés.
    delayMs = 0;
    const x = await run(await buildWorkbook(validAtlas('LYRA')), 'lyra.xlsx');
    const imp = (await t.db.prefillTask.findUniqueOrThrow({ where: { id: x.taskId } })).importId!;
    const key = (await t.db.projectImport.findUniqueOrThrow({ where: { id: imp } })).fileKey;
    await http().delete(`${P}/files/${x.doc.id}`).set('Authorization', `Bearer ${tok}`).expect(204);
    expect(await t.db.projectImport.findUnique({ where: { id: imp } })).toBeNull();
    expect(await t.app.get(StorageService).get(key)).toBeNull();
  });

  it('confidentialité : le journal de la voie Excel ne garde que des métadonnées', async () => {
    const audits = await t.db.auditEntry.findMany({ where: { entityType: 'PREFILL', action: { startsWith: 'Initialisation :' } } });
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['Initialisation : Excel déposé', 'Initialisation : contrôle terminé', 'Initialisation : Excel refusé', 'Initialisation : rapport de contrôle téléchargé']));
    const text = JSON.stringify(audits.map((a) => a.newValue));
    for (const secret of ['Laurent Garnier', 'philippe.aubert@vega', 'Data & IA']) expect(text).not.toContain(secret);
    for (const a of audits) expect(Object.keys(a.newValue as any).every((k) => ['nom', 'taille', 'type', 'duree', 'statut', 'bloquantes', 'avertissements', 'fichiers', 'analyses'].includes(k))).toBe(true);
  });
});
