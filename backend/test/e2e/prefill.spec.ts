import ExcelJS from 'exceljs';
import request from 'supertest';
import { LlmClient } from '../../src/core/llm-client';
import { encryptSecret } from '../../src/core/crypto';
import { PrefillService } from '../../src/admin/prefill.service';
import { StorageService } from '../../src/core/storage.service';
import { SHEETS } from '../../src/import/excel-reader';
import { setup, TestCtx, WHO } from '../helpers';
import { TEMPLATE } from '../fixtures/excel';
import { makeTextPdf } from '../fixtures/pdf';
import { orionAnswer } from '../fixtures/prefill-llm';
import { ORION_PAGES } from '../../scripts/prefill-exemple';

/**
 * Préremplissage du fichier d'initialisation depuis la proposition commerciale (07/10/2026) : critères d'acceptation
 * 1 à 6 et 8 (le 7, filtres de l'écran, est vérifié par la recette navigateur `test/browser/prefill.e2e.ts`).
 * Le modèle d'IA est un double de `fetch` (réponses de `test/fixtures/prefill-llm.ts`).
 */
const P = '/api/admin/projects/prefill';

describe('Initialisation d’un projet — préremplissage par IA', () => {
  let t: TestCtx;
  let tok: string;
  const prompts: string[] = [];
  let failOn: string | null = null;
  let delayMs = 0;

  const upload = (buf: Buffer, name: string) => request(t.app.getHttpServer()).post(`${P}/proposals`).set('Authorization', `Bearer ${tok}`).attach('file', buf, name);
  /** Flux SSE lu jusqu'à sa fin : `[{ type, ...data }]`. */
  const stream = async (taskId: string) => {
    const r = await request(t.app.getHttpServer()).get(`${P}/tasks/${taskId}/events`).set('Authorization', `Bearer ${tok}`).buffer(true)
      .parse((res, cb) => { let s = ''; res.setEncoding('utf8'); res.on('data', (c) => (s += c)); res.on('end', () => cb(null, s)); }).expect(200);
    expect(r.headers['content-type']).toMatch(/text\/event-stream/);
    return String(r.body).split('\n\n').filter((b) => b.startsWith('event: ')).map((b) => {
      const [ev, data] = b.split('\n');
      return { type: ev.slice(7), ...JSON.parse(data.slice(6)) };
    });
  };
  const start = async (buf = makeTextPdf(ORION_PAGES), name = 'Proposition commerciale ORION v3.pdf') => {
    const up = await upload(buf, name).expect(201);
    const a = await request(t.app.getHttpServer()).post(`${P}/proposals/${up.body.id}/analysis`).set('Authorization', `Bearer ${tok}`).expect(202);
    return { doc: up.body, taskId: a.body.tacheId as string };
  };

  beforeAll(async () => {
    t = await setup();
    tok = await t.token(WHO.admin);
    t.app.get(PrefillService).tickMs = 20;
    await t.db.provider.update({ where: { id: 'anthropic' }, data: { keyCipher: encryptSecret('sk-ant-test-0000000000000000AbCd'), status: 'OK' } });
    await t.db.provider.update({ where: { id: 'openai' }, data: { keyCipher: encryptSecret('sk-proj-test-000000000000000WxYz'), status: 'OK' } });
    const client = t.app.get(LlmClient);
    client.live = true;
    client.fetchImpl = (async (_url: string, init: any) => {
      const body = JSON.stringify(JSON.parse(init.body));
      const prompt = /ONGLET \d\d [^—]+—/.exec(body)?.[0] ?? '';
      prompts.push(prompt);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (failOn && prompt.includes(failOn)) return new Response(JSON.stringify({ error: { message: 'surcharge' } }), { status: 500 });
      const text = JSON.stringify(orionAnswer(prompt));
      return new Response(JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 2000, output_tokens: 300 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;
  });
  afterAll(() => t.close());
  beforeEach(() => { prompts.length = 0; failOn = null; delayMs = 0; });

  it('les 14 onglets, dans l’ordre, avec leur nombre de champs ; routes réservées à l’Administrateur', async () => {
    const r = await request(t.app.getHttpServer()).get(`${P}/tabs`).set('Authorization', `Bearer ${tok}`).expect(200);
    expect(r.body.map((x: any) => `${x.n} ${x.label}`)).toEqual([...SHEETS]);
    expect(r.body.find((x: any) => x.label === 'Projet').champs).toBe(14);
    expect(r.body.find((x: any) => x.label === 'Équipes').champs).toBe(2);
    const pmo = await t.token(WHO.pmo);
    await request(t.app.getHttpServer()).get(`${P}/tabs`).set('Authorization', `Bearer ${pmo}`).expect(403);
    await request(t.app.getHttpServer()).post(`${P}/proposals`).set('Authorization', `Bearer ${pmo}`).attach('file', makeTextPdf(ORION_PAGES), 'p.pdf').expect(403);
  });

  it('exemple ORION fourni avec l’application : déposé comme une proposition', async () => {
    const r = await request(t.app.getHttpServer()).post(`${P}/proposals/example`).set('Authorization', `Bearer ${tok}`).expect(201);
    expect(r.body).toMatchObject({ nom: 'Proposition commerciale ORION v3.pdf', pages: ORION_PAGES.length });
    await t.db.prefillDocument.deleteMany();
  });

  it('plusieurs fichiers (proposition et annexe) : lus comme un seul document, source « fichier, page » ; un fichier refusé fait refuser le dépôt', async () => {
    const send = (files: Array<[Buffer, string]>) => {
      let r = request(t.app.getHttpServer()).post(`${P}/proposals`).set('Authorization', `Bearer ${tok}`);
      for (const [b, n] of files) r = r.attach('files', b, n);
      return r;
    };
    const main = makeTextPdf(ORION_PAGES.slice(0, 4)), annexe = makeTextPdf(ORION_PAGES.slice(4));
    // Un fichier refusé (format, lecture) : tout le dépôt est refusé, le fichier en cause est nommé.
    const bad = await send([[main, 'Proposition.pdf'], [Buffer.from('x'), 'Budget.numbers']]).expect(422);
    expect(bad.body).toMatchObject({ code: 'FORMAT', fields: { fichier: 'Budget.numbers' }, message: expect.stringMatching(/^« Budget\.numbers » :/) });
    const scan = await send([[main, 'Proposition.pdf'], [makeTextPdf(ORION_PAGES, { scanned: true }), 'Annexe scannée.pdf']]).expect(422);
    expect(scan.body).toMatchObject({ code: 'LECTURE', fields: { fichier: 'Annexe scannée.pdf' } });
    expect((await send(Array.from({ length: 11 }, (_, i) => [main, `p${i}.pdf`] as [Buffer, string])).expect(422)).body.code).toBe('FORMAT');
    expect(await t.db.prefillDocument.count()).toBe(0);

    const up = await send([[main, 'Proposition.pdf'], [annexe, 'Annexe planning.pdf']]).expect(201);
    expect(up.body).toMatchObject({ nom: 'Proposition.pdf', pages: ORION_PAGES.length, fichiers: [{ nom: 'Proposition.pdf', pages: 4 }, { nom: 'Annexe planning.pdf', pages: ORION_PAGES.length - 4 }] });
    expect(up.body.taille).toBe(main.length + annexe.length);
    const bodies: string[] = [];
    const client = t.app.get(LlmClient), fetch0 = client.fetchImpl;
    client.fetchImpl = (async (u: string, init: any) => { bodies.push(init.body); return fetch0(u, init); }) as any;
    const a = await request(t.app.getHttpServer()).post(`${P}/proposals/${up.body.id}/analysis`).set('Authorization', `Bearer ${tok}`).expect(202);
    const events = await stream(a.body.tacheId);
    client.fetchImpl = fetch0;
    expect(events[events.length - 1].type).toBe('termine');
    // Le modèle reçoit les deux fichiers, pages numérotées à la suite avec leur fichier d'origine.
    expect(bodies[0]).toContain('DOCUMENTS : 2 fichiers lus comme un seul document (Proposition.pdf ; Annexe planning.pdf)');
    expect(bodies[0]).toContain('=== PAGE 5 (Annexe planning.pdf, page 1) ===');
    const checks = (await request(t.app.getHttpServer()).get(`${P}/tasks/${a.body.tacheId}/checks`).set('Authorization', `Bearer ${tok}`).expect(200)).body;
    expect(checks.find((c: any) => c.champ === 'Fonction · Luc Nguyen')).toMatchObject({ page: 4, fichier: 'Proposition.pdf', pageFichier: 4 });
    expect(checks.find((c: any) => c.champ.startsWith('Date prévue'))).toMatchObject({ page: 7, fichier: 'Annexe planning.pdf', pageFichier: 3 });
    const task = await t.db.prefillTask.findUniqueOrThrow({ where: { id: a.body.tacheId } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await t.app.get(StorageService).get(task.excelKey!))!);
    const ws = wb.getWorksheet('13 Jalons')!;
    const note = [...Array(10).keys()].map((i) => ws.getCell(`I${9 + i}`).note as any).find(Boolean);
    expect(typeof note === 'string' ? note : note.texts.map((x: any) => x.text).join('')).toContain('Source : Annexe planning.pdf, page 3');
    // Les deux fichiers et le texte sont supprimés dès l'Excel généré.
    const d = await t.db.prefillDocument.findUniqueOrThrow({ where: { id: up.body.id } });
    expect((d.files as any[]).every((f) => f.cle === null) && d.textKey === null).toBe(true);
    await t.db.prefillDocument.deleteMany();
  });

  it('skill « Préremplissage d’un projet » : jointe aux consignes de chaque onglet, même désactivée ; une modification s’applique à l’analyse suivante', async () => {
    const skill = await t.db.skill.findFirstOrThrow({ where: { n: 'Préremplissage d’un projet' } });
    expect(skill.on).toBe(false);
    const bodies: string[] = [];
    const client = t.app.get(LlmClient), fetch0 = client.fetchImpl;
    client.fetchImpl = (async (u: string, init: any) => { bodies.push(init.body); return fetch0(u, init); }) as any;
    try {
      await stream((await start()).taskId);
      expect(bodies).toHaveLength(14);
      expect(bodies.every((b) => b.includes('## Skill : Préremplissage d’un projet') && b.includes('une équipe correspond à une société qui participe au projet'))).toBe(true);
      // Modifiée dans Console › Skills : la nouvelle version sert dès l'analyse suivante.
      await request(t.app.getHttpServer()).put(`/api/assistant/skills/${skill.id}`).set('Authorization', `Bearer ${tok}`).send({ n: skill.n, t: '01 ÉQUIPES — Consigne modifiée pour le test.' }).expect(200);
      bodies.length = 0;
      await stream((await start()).taskId);
      expect(bodies[0]).toContain('Consigne modifiée pour le test.');
      expect(bodies[0]).not.toContain('une équipe correspond à une société qui participe au projet');
    } finally {
      client.fetchImpl = fetch0;
      await t.db.skill.update({ where: { id: skill.id }, data: { t: skill.t } });
      await t.db.prefillDocument.deleteMany();
    }
  });

  it('critère 2 : .numbers ou .xlsx → erreur FORMAT, sans analyse', async () => {
    const before = await t.db.usageRecord.count({ where: { functionId: 'init_projet' } });
    for (const name of ['Budget ORION.numbers', 'Budget ORION.xlsx']) {
      const r = await upload(Buffer.from('PK\u0003\u0004 contenu'), name).expect(422);
      expect(r.body).toMatchObject({ code: 'FORMAT', message: expect.stringMatching(/PDF, DOCX ou PPTX/) });
    }
    // Extension acceptée mais contenu d'un autre type : refusé sur la signature.
    expect((await upload(Buffer.from('ceci n’est pas un PDF'), 'faux.pdf').expect(422)).body.code).toBe('FORMAT');
    expect(await t.db.prefillDocument.count()).toBe(0);
    expect(prompts).toHaveLength(0);
    expect(await t.db.usageRecord.count({ where: { functionId: 'init_projet' } })).toBe(before);
  });

  it('critère 3 : PDF protégé ou scanné sans texte → erreur LECTURE', async () => {
    for (const o of [{ protected: true }, { scanned: true }]) {
      const r = await upload(makeTextPdf(ORION_PAGES, o), 'Proposition ORION scannée.pdf').expect(422);
      expect(r.body.code).toBe('LECTURE');
    }
    expect(prompts).toHaveLength(0);
  });

  it('critères 1 et 6 : PDF texte → succès partiel ; Excel conforme au modèle ; compteurs identiques à l’écran et dans l’Excel', async () => {
    const { doc, taskId } = await start();
    expect(doc).toMatchObject({ id: expect.any(String), nom: 'Proposition commerciale ORION v3.pdf', taille: expect.any(Number), pages: ORION_PAGES.length });
    const events = await stream(taskId);
    const done = events.filter((e) => e.type === 'onglet_termine');
    expect(done.map((e) => e.ongletIndex)).toEqual([...Array(14).keys()]);
    expect(events.some((e) => e.type === 'progression' && e.pagesTotal === ORION_PAGES.length)).toBe(true);
    expect(events[events.length - 1]).toMatchObject({ type: 'termine', resultat: 'partiel', dureeSecondes: expect.any(Number) });
    expect(done.find((e) => e.ongletIndex === 10)).toMatchObject({ statut: 'non_trouve', aVerifier: 1, trouves: 0 });
    expect(done.find((e) => e.ongletIndex === 1)).toMatchObject({ statut: 'rempli', attendus: 6, trouves: 6, aVerifier: 0 });

    // Temps restant lissé : jamais en hausse.
    const etas = events.filter((e) => e.type === 'progression').map((e) => e.resteSecondes);
    etas.forEach((x, i) => { if (i) expect(x).toBeLessThanOrEqual(etas[i - 1]); });

    const checks = (await request(t.app.getHttpServer()).get(`${P}/tasks/${taskId}/checks`).set('Authorization', `Bearer ${tok}`).expect(200)).body;
    expect(checks.length).toBe(done.reduce((n, e) => n + e.aVerifier, 0));
    expect(checks.filter((c: any) => c.ongletIndex === 10)).toEqual([expect.objectContaining({ champ: 'Onglet entier', type: 'manquant' })]);
    const nf = checks.find((c: any) => c.champ === 'Fonction · Luc Nguyen');
    expect(nf).toMatchObject({ onglet: '03 Personnes', type: 'incertain', confiance: 58, motif: 'Deux intitulés différents dans le document.', page: 4, valeur: 'Directeur des opérations' });
    expect(checks.every((c: any) => c.type === 'manquant' || (c.confiance < 70 && c.motif && c.page))).toBe(true);

    const x = await request(t.app.getHttpServer()).get(`${P}/tasks/${taskId}/excel`).set('Authorization', `Bearer ${tok}`).buffer(true)
      .parse((res, cb) => { const b: Buffer[] = []; res.on('data', (c) => b.push(c)); res.on('end', () => cb(null, Buffer.concat(b))); }).expect(200);
    expect(x.headers['content-disposition']).toContain(encodeURIComponent('Proposition commerciale ORION v3 · prérempli.xlsx'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.body);
    const tpl = new ExcelJS.Workbook();
    await tpl.xlsx.readFile(TEMPLATE);
    // Même structure que le modèle : onglets, en-têtes, validations.
    expect(wb.worksheets.map((w) => w.name)).toEqual(tpl.worksheets.map((w) => w.name));
    for (const s of SHEETS) {
      // En-têtes (ligne 8) ; « 05 Projet » est un formulaire : libellés de la colonne B.
      if (s === '05 Projet') expect(wb.getWorksheet(s)!.getColumn(2).values).toEqual(tpl.getWorksheet(s)!.getColumn(2).values);
      else expect(wb.getWorksheet(s)!.getRow(8).values).toEqual(tpl.getWorksheet(s)!.getRow(8).values);
      expect(Object.keys((wb.getWorksheet(s) as any).dataValidations.model).length).toBe(Object.keys((tpl.getWorksheet(s) as any).dataValidations.model).length);
    }
    // Cellules à vérifier : fond ambre et commentaire (motif, confiance, page) ; autant que de lignes « À vérifier ».
    let notes = 0, amber = 0;
    const filled: Record<number, number> = {};
    wb.worksheets.forEach((w) => w.eachRow({ includeEmpty: true }, (row) => row.eachCell({ includeEmpty: true }, (c) => {
      if (c.note) notes++;
      if ((c.fill as any)?.fgColor?.argb === 'FFFFE3AD') amber++;
    })));
    expect(notes).toBe(checks.length);
    expect(amber).toBe(checks.length);
    const luc = wb.getWorksheet('03 Personnes')!;
    const lucRow = [...Array(20).keys()].map((i) => 9 + i).find((r) => luc.getCell(`B${r}`).value === 'Luc Nguyen')!;
    const note = luc.getCell(`E${lucRow}`).note as any;
    expect(typeof note === 'string' ? note : note.texts.map((x: any) => x.text).join('')).toBe('À vérifier : Deux intitulés différents dans le document.\nConfiance : 58 %\nSource : page 4');
    // Champs trouvés de l'écran = cellules remplies de l'onglet dans l'Excel (onglet 01 : 4 équipes × Nom et Description).
    const eq = wb.getWorksheet('01 Équipes')!;
    for (let r = 9; r < 20; r++) for (const col of ['B', 'C']) if (eq.getCell(`${col}${r}`).value) filled[1] = (filled[1] ?? 0) + 1;
    expect(filled[1]).toBe(done[0].trouves);
    // Le document et son texte sont supprimés dès l'Excel généré.
    const d = await t.db.prefillDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(d.fileKey).toBeNull();
    expect(d.textKey).toBeNull();
  });

  it('critère 8 : une fois vérifié, l’Excel prérempli s’importe sans erreur par le parcours existant', async () => {
    const { taskId } = await start();
    await stream(taskId);
    const task = await t.db.prefillTask.findUniqueOrThrow({ where: { id: taskId } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await t.app.get(StorageService).get(task.excelKey!))!);
    // Relecture du PMO : champs manquants complétés (onglets non trouvés laissés vides).
    const checks = (await request(t.app.getHttpServer()).get(`${P}/tasks/${taskId}/checks`).set('Authorization', `Bearer ${tok}`).expect(200)).body;
    const fix: Record<string, (row: number) => string | Date> = {
      Email: (r) => `personne${r}@amc-corp.example`, Responsable: () => 'Claire Dumont', Échéance: () => new Date(Date.UTC(2027, 5, 30)), 'Sous-phase': () => '2.2 · Plan projet détaillé',
    };
    const ws3 = wb.getWorksheet('03 Personnes')!, ws14 = wb.getWorksheet('14 Livrables')!;
    for (const c of checks.filter((x: any) => x.type === 'manquant' && x.champ !== 'Onglet entier')) {
      const head = c.champ.split(' · ')[0];
      const ws = c.onglet === '03 Personnes' ? ws3 : c.onglet === '14 Livrables' ? ws14 : null;
      if (!ws) continue;
      const col = Object.entries(ws.getRow(8).values as any).find(([, v]) => v === head)![0];
      for (let r = 9; r < 40; r++) if (ws.getRow(r).getCell(2).value && !ws.getRow(r).getCell(+col).value) ws.getRow(r).getCell(+col).value = fix[head](r) as any;
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await request(t.app.getHttpServer()).post('/api/admin/projects/import/validate').set('Authorization', `Bearer ${tok}`).attach('file', buf, 'ORION vérifié.xlsx').expect(200);
    expect(r.body.issues.filter((i: any) => i.lvl === 'err')).toEqual([]);
    expect(r.body).toMatchObject({ ok: true, missing: [] });
    expect(r.body.sheets['Chantiers'].rows.find((x: any) => x[1] === 'Données et migration')[6]).toBe('Ventes et CRM ; Service client');
    expect(r.body.sheets['Info projet'].rows.length).toBeGreaterThanOrEqual(7);
  });

  it('critère 4 : interruption à l’onglet 07 → 6 onglets conservés ; « Reprendre » repart de l’onglet 07', async () => {
    failOn = 'ONGLET 07 Lots';
    const { taskId } = await start();
    const events = await stream(taskId);
    expect(events.filter((e) => e.type === 'onglet_termine')).toHaveLength(6);
    expect(events[events.length - 1]).toEqual({ type: 'erreur', code: 'ANALYSE', ongletIndex: 6, ongletsConserves: 6 });
    expect((await t.db.prefillTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe('FAILED');
    failOn = null;
    prompts.length = 0;
    const r = await request(t.app.getHttpServer()).post(`${P}/tasks/${taskId}/resume`).set('Authorization', `Bearer ${tok}`).expect(202);
    expect(r.body).toEqual({ tacheId: taskId, ongletIndex: 6 });
    const after = await stream(taskId);
    expect(prompts[0]).toContain('ONGLET 07 Lots');
    expect(prompts.some((p) => /ONGLET 0[1-6] /.test(p))).toBe(false);
    expect(after.filter((e) => e.type === 'onglet_termine').map((e) => e.ongletIndex)).toEqual([...Array(14).keys()]);
    expect(after[after.length - 1]).toMatchObject({ type: 'termine', resultat: 'partiel' });
  });

  it('critère 5 : « Annuler » arrête la tâche côté serveur ; document et texte supprimés', async () => {
    delayMs = 150;
    const { doc, taskId } = await start();
    await new Promise((r) => setTimeout(r, 400));
    await request(t.app.getHttpServer()).delete(`${P}/tasks/${taskId}`).set('Authorization', `Bearer ${tok}`).expect(204);
    const n = prompts.length;
    await new Promise((r) => setTimeout(r, 600));
    expect(prompts.length).toBeLessThanOrEqual(n + 1);
    const task = await t.db.prefillTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.status).toBe('CANCELLED');
    expect(task.excelKey).toBeNull();
    expect((await t.db.prefillDocument.findUniqueOrThrow({ where: { id: doc.id } })).textKey).toBeNull();
    expect(await stream(taskId)).toEqual([...task.tabs as any[]].map((x: any) => expect.objectContaining({ type: 'onglet_termine', ongletIndex: x.ongletIndex })).concat([{ type: 'annule' }]));
    await request(t.app.getHttpServer()).get(`${P}/tasks/${taskId}/excel`).set('Authorization', `Bearer ${tok}`).expect(409);
  });

  it('confidentialité : journal sans contenu ; purge à l’échéance (24 h par défaut)', async () => {
    const audits = await t.db.auditEntry.findMany({ where: { entityType: 'PREFILL' } });
    expect(audits.length).toBeGreaterThan(3);
    const text = JSON.stringify(audits.map((a) => a.newValue));
    for (const secret of ['vision client unique', 'Luc Nguyen', 'Claire Dumont', '1 240 000']) expect(text).not.toContain(secret);
    expect(Object.keys((audits.find((a) => a.action === 'Préremplissage : analyse terminée')!.newValue as any)).sort()).toEqual(['duree', 'nom', 'pages', 'statut', 'taille']);
    const docs = await t.db.prefillDocument.findMany();
    expect(docs[0].expiresAt.getTime() - docs[0].createdAt.getTime()).toBeGreaterThan(23.9 * 3600_000);
    const n = await t.app.get(PrefillService).purgeExpired(new Date(Date.now() + 25 * 3600_000));
    expect(n).toBe(docs.length);
    expect(await t.db.prefillTask.count()).toBe(0);
  });
});
