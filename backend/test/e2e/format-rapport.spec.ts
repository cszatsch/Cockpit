import JSZip from 'jszip';
import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { makePdf } from '../pdf-fixture';
import { makeFormatPptx, makePng, pptxIntegrity } from '../format-fixture';

const R = '/api/projects/RISE';
const binary = (res: any, cb: (e: Error | null, b: Buffer) => void) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };

/**
 * Format du rapport (étape B de « Créer un template », 02/10/2026) : chargement et analyse des pages modèles,
 * refus clairs, aperçu, contrôle des 4 pages, template enregistré avec son format, PowerPoint généré, suppression.
 */
describe('Cockpit — Format du rapport', () => {
  let t: TestCtx;
  let pmo: string;
  const http = () => request(t.app.getHttpServer());
  const up = (token: string, buf: Buffer, name: string) => http().post(`${R}/report-formats`).set('Authorization', `Bearer ${token}`).attach('file', buf, name);
  const get = (token: string, url: string) => http().get(`${R}${url}`).set('Authorization', `Bearer ${token}`);
  const post = (token: string, url: string, body: unknown) => http().post(`${R}${url}`).set('Authorization', `Bearer ${token}`).send(body as object);
  const all = (fileId: string, closing = fileId) => ({ cover: { fileId, slide: 1 }, divider: { fileId, slide: 2 }, standard: { fileId, slide: 3 }, closing: { fileId: closing, slide: closing === fileId ? 4 : 1 } });
  const tpl = (format: unknown) => ({ name: 'Support COPIL charté', version: '1.0', bodyId: 'g1', components: [{ id: 'jalons', scope: 'PROJECT' }, { id: 'risques', scope: 'PROJECT' }], ...(format !== undefined ? { format } : {}) });

  beforeAll(async () => {
    t = await setup();
    pmo = await t.token(WHO.pmo);
  });
  afterAll(() => t.close());

  it('PowerPoint chargé : analyse des 4 diapositives (format, fond, éléments, zones, polices) et alertes par type de page', async () => {
    const r = await up(pmo, await makeFormatPptx(), 'Charte ACME.pptx').expect(201);
    expect(r.body).toMatchObject({ id: expect.stringMatching(/^RF/), fileName: 'Charte ACME.pptx', kind: 'PPTX', format: '16:9 · 33,87 × 19,05 cm', slideCount: 4 });
    const [cover, , std] = r.body.slides;
    expect(cover).toMatchObject({ index: 1, label: 'Titre du rapport', summary: { background: 'uni #10233A', elements: ['1 logo', '1 bandeau'], zones: ['titre', 'sous-titre'], fonts: expect.arrayContaining(['Montserrat']) } });
    expect(cover.summary.typography.title).toBe('Montserrat · 40 pt · gras · #FFFFFF');
    expect(std.summary.zones).toEqual(['titre', 'texte', 'pagination', 'bas de page']);
    expect(cover.warnings.cover).toEqual([expect.stringMatching(/^Police introuvable : « Montserrat »/)]);
    expect((await t.db.reportFormatFile.findUnique({ where: { id: r.body.id } }))?.fileKey).toMatch(/^report-formats\/RISE\//);
    // Aperçu : SVG reconstitué, logo intégré.
    const p = await get(pmo, `/report-formats/${r.body.id}/slides/1/preview`).buffer(true).parse(binary).expect(200);
    expect(p.headers['content-type']).toMatch(/^image\/svg\+xml/);
    const svg = p.body.toString('utf8');
    expect(svg).toContain('fill="#10233A"');
    expect(svg).toContain('<image href="data:image/png;base64,');
    await get(pmo, `/report-formats/${r.body.id}/slides/9/preview`).expect(404);
  });

  it('fichiers refusés avec un message clair : format non pris en charge, .ppt, contenu trompeur, illisible, protégé, image trop petite', async () => {
    const cases: Array<[Buffer, string, RegExp]> = [
      [Buffer.from('texte'), 'note.docx', /^Format non pris en charge/],
      [Buffer.from('texte'), 'ancien.ppt', /^Ancien format PowerPoint \(\.ppt\)/],
      [makePng(1280, 720), 'modele.pptx', /^Le contenu ne correspond pas à l'extension \.pptx \(fichier PNG\)/],
      [Buffer.from('PK\u0003\u0004 abîmé'), 'abime.pptx', /^Fichier PowerPoint illisible ou endommagé/],
      [Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]), 'secret.pptx', /protégé par un mot de passe/],
      [makePng(320, 180), 'logo.png', /^Image trop petite \(320 px de large\)/],
    ];
    for (const [buf, name, re] of cases) {
      const r = await up(pmo, buf, name).expect(400);
      expect(r.body).toMatchObject({ code: 'FORMAT_INVALID', message: expect.stringMatching(re), fields: { file: expect.stringMatching(re) } });
    }
    await http().post(`${R}/report-formats`).set('Authorization', `Bearer ${pmo}`).expect(400);
  });

  it('PDF et image acceptés en complément : extraction partielle signalée', async () => {
    const pdf = await up(pmo, makePdf([[{ text: 'Titre de couverture', size: 32, y: 500 }, { text: 'Sous-titre du comité', size: 14, y: 450 }]]), 'Couverture.pdf').expect(201);
    expect(pdf.body).toMatchObject({ kind: 'PDF', slideCount: 1, slides: [{ label: 'Titre de couverture', summary: { zones: ['titre', 'texte'] } }] });
    expect(pdf.body.slides[0].warnings.cover[0]).toMatch(/^Extraction partielle depuis un PDF/);
    const img = await up(pmo, makePng(1280, 720, '10233A'), 'Fond.png').expect(201);
    expect(img.body).toMatchObject({ kind: 'IMAGE', format: '16:9 · 33,87 × 19,05 cm', slideCount: 1 });
    expect(img.body.slides[0].warnings.standard[0]).toMatch(/^Image : la page sert de fond plein écran/);
    const p = await get(pmo, `/report-formats/${img.body.id}/slides/1/preview`).buffer(true).parse(binary).expect(200);
    expect(p.body.toString('utf8')).toContain('url(#bg)');
  });

  it('contrôle des 4 pages : manquantes, dimensions différentes, puis complet', async () => {
    const a = (await up(pmo, await makeFormatPptx(), 'A.pptx').expect(201)).body.id;
    const b43 = (await up(pmo, await makeFormatPptx({ size: { cx: 9144000, cy: 6858000 } }), 'B.pptx').expect(201)).body.id;
    const partial = await post(pmo, '/report-formats/check', { cover: { fileId: a, slide: 1 } }).expect(200);
    expect(partial.body).toMatchObject({ complete: false, errors: { divider: 'Page intercalaire manquante', standard: 'Page standard manquante', closing: 'Page de clôture manquante' } });
    const mixed = await post(pmo, '/report-formats/check', { ...all(a), closing: { fileId: b43, slide: 4 } }).expect(200);
    expect(mixed.body.complete).toBe(false);
    expect(mixed.body.errors.closing).toMatch(/dimensions 4:3 · 25,40 × 19,05 cm différentes de la page de couverture/);
    const ok = await post(pmo, '/report-formats/check', all(a)).expect(200);
    expect(ok.body).toMatchObject({ complete: true, errors: {}, pages: { cover: { fileName: 'A.pptx', slide: 1, kind: 'PPTX', warnings: [expect.stringMatching(/^Police introuvable/)] } } });
    await post(pmo, '/report-formats/check', { cover: { fileId: a, slide: 0 } }).expect(400);
  });

  it('template enregistré avec son format ; PowerPoint généré à la charte, avec les données du projet', async () => {
    const a = (await up(pmo, await makeFormatPptx(), 'Charte.pptx').expect(201)).body.id;
    const b = (await up(pmo, await makeFormatPptx({ accent: 'C0392B', font: 'Lato', embedFont: true }), 'Charte rouge.pptx').expect(201)).body.id;
    // Format incomplet : refusé.
    const bad = await post(pmo, '/report-templates', tpl({ cover: { fileId: a, slide: 1 } })).expect(400);
    expect(bad.body).toMatchObject({ message: 'Format du rapport incomplet', fields: { divider: 'Page intercalaire manquante' } });
    const created = await post(pmo, '/report-templates', tpl(all(a, b))).expect(201);
    for (let k = 0; k < 600 && (await get(pmo, `/report-templates/${created.body.id}/service`)).body.status === 'PENDING'; k++) await new Promise((r) => setTimeout(r, 100));
    expect(created.body.format).toMatchObject({
      cover: { fileId: a, fileName: 'Charte.pptx', slide: 1, kind: 'PPTX' }, divider: { fileId: a, fileName: 'Charte.pptx', slide: 2, kind: 'PPTX' },
      standard: { fileId: a, fileName: 'Charte.pptx', slide: 3, kind: 'PPTX' }, closing: { fileId: b, fileName: 'Charte rouge.pptx', slide: 1, kind: 'PPTX' },
    });
    // Les éléments extraits sont enregistrés avec le template.
    const row = await t.db.reportTemplate.findUnique({ where: { id: created.body.id } });
    expect((row!.format as any).pages.cover.analysis).toMatchObject({ background: { type: 'solid', color: '10233A' }, typography: { title: { font: 'Montserrat', size: 40 } } });
    const boot = await get(pmo, '/bootstrap').expect(200);
    expect(boot.body.templates.find((x: any) => x.id === created.body.id).format.closing).toMatchObject({ fileId: b, fileName: 'Charte rouge.pptx', slide: 1, kind: 'PPTX' });

    const res = await get(pmo, `/report-templates/${created.body.id}/pptx`).buffer(true).parse(binary).expect(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(res.headers['content-disposition']).toContain('Support%20COPIL%20chart%C3%A9%20v1.0.pptx');
    expect(await pptxIntegrity(res.body)).toEqual([]);
    const z = await JSZip.loadAsync(res.body);
    const slides = Object.keys(z.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    const xml = await Promise.all(slides.sort((x, y) => Number(x.match(/\d+/)![0]) - Number(y.match(/\d+/)![0])).map((f) => z.file(f)!.async('string')));
    expect(xml[0]).toContain('<a:t>Support COPIL charté</a:t>');
    expect(xml.some((x) => x.includes('<a:t>01 · Jalons</a:t>'))).toBe(true);
    // Une seule section (aucun composant n'en ouvre une autre) : une intercalaire, puis une page par composant.
    expect(xml.some((x) => x.includes('<a:t>02 · '))).toBe(false);
    const risk = (await t.db.risk.findMany({ where: { projectId: 'RISE', status: { not: 'CLOSED' } } })).sort((a, b) => b.p * b.i - a.p * a.i)[0];
    expect(xml.some((x) => x.includes(`<a:t>${risk.code}</a:t>`))).toBe(true);
    // Clôture importée de l'autre fichier : deuxième masque et police incorporée.
    expect(Object.keys(z.files).filter((f) => /^ppt\/slideMasters\/[^/]+\.xml$/.test(f))).toHaveLength(2);
    expect(await z.file('ppt/presentation.xml')!.async('string')).toContain('<p:font typeface="Lato"/>');

    // Fichier utilisé par le template : suppression refusée ; fichier libre : supprimé.
    const del = await http().delete(`${R}/report-formats/${a}`).set('Authorization', `Bearer ${pmo}`).expect(409);
    expect(del.body).toMatchObject({ code: 'IN_USE', usages: [{ entityType: 'REPORT_TEMPLATE', id: created.body.id, label: 'Support COPIL charté' }] });
    const free = (await up(pmo, makePng(1280, 720), 'Libre.png').expect(201)).body.id;
    await http().delete(`${R}/report-formats/${free}`).set('Authorization', `Bearer ${pmo}`).expect(204);
    expect(await t.db.reportFormatFile.findUnique({ where: { id: free } })).toBeNull();

    // Retour à la présentation par défaut.
    const patched = await http().patch(`${R}/report-templates/${created.body.id}`).set('Authorization', `Bearer ${pmo}`).send({ format: null }).expect(200);
    expect(patched.body.format).toBeNull();
  });

  it('template sans format : PowerPoint à la présentation par défaut', async () => {
    const created = await post(pmo, '/report-templates', tpl(undefined)).expect(201);
    for (let k = 0; k < 600 && (await get(pmo, `/report-templates/${created.body.id}/service`)).body.status === 'PENDING'; k++) await new Promise((r) => setTimeout(r, 100));
    expect(created.body.format).toBeNull();
    const res = await get(pmo, `/report-templates/${created.body.id}/pptx`).buffer(true).parse(binary).expect(200);
    expect(await pptxIntegrity(res.body)).toEqual([]);
    const z = await JSZip.loadAsync(res.body);
    expect(await z.file('ppt/slides/slide1.xml')!.async('string')).toContain('<a:t>Support COPIL charté</a:t>');
  });

  it('droits : un Lecteur consulte mais ne charge ni ne supprime de fichier de format', async () => {
    const lecteur = await t.token(WHO.lecteurC3);
    await up(lecteur, await makeFormatPptx(), 'x.pptx').expect(403);
    const id = (await up(pmo, makePng(1280, 720), 'Fond.png').expect(201)).body.id;
    await get(lecteur, `/report-formats/${id}`).expect(200);
    await http().delete(`${R}/report-formats/${id}`).set('Authorization', `Bearer ${lecteur}`).expect(403);
    await http().get('/api/projects/RISE/report-formats/inconnu').set('Authorization', `Bearer ${pmo}`).expect(404);
  });
});
