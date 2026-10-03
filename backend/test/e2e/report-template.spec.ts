import JSZip from 'jszip';
import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { makeFormatPptx, pptxIntegrity } from '../format-fixture';
import { StorageService } from '../../src/core/storage.service';
import { LlmService } from '../../src/core/llm.service';

const R = '/api/projects/RISE';
const binary = (res: any, cb: (e: Error | null, b: Buffer) => void) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };
const slideXml = async (buf: Buffer) => {
  const z = await JSZip.loadAsync(buf);
  const files = Object.keys(z.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
  return { z, files, xml: await Promise.all(files.map((f) => z.file(f)!.async('string'))) };
};
const names = (xml: string) => [...xml.matchAll(/<p:cNvPr\b[^>]*\bname="([^"]*)"/g)].map((m) => m[1]);

/**
 * Étapes 3 à 6 de « Créer un template » (03/10/2026) : catalogue, aperçu du rapport complet, publication du template
 * de référence (version), publications suivantes (valeurs seules), anomalies avant génération, nouvelles versions.
 */
describe('Cockpit — Templates de rapport : versions et publications', () => {
  let t: TestCtx;
  let pmo: string;
  let fileId: string;
  const http = () => request(t.app.getHttpServer());
  const get = (url: string) => http().get(`${R}${url}`).set('Authorization', `Bearer ${pmo}`);
  const post = (url: string, body: unknown) => http().post(`${R}${url}`).set('Authorization', `Bearer ${pmo}`).send(body as object);
  const patch = (url: string, body: unknown) => http().patch(`${R}${url}`).set('Authorization', `Bearer ${pmo}`).send(body as object);
  const format = () => ({ cover: { fileId, slide: 1 }, divider: { fileId, slide: 2 }, standard: { fileId, slide: 3 }, closing: { fileId, slide: 4 } });
  const comps = [
    { id: 'synthese', scope: 'PROJECT' },
    { id: 'risques', scope: 'PROJECT', indicators: ['code', 'name', 'score'] },
    { id: 'barometre', scope: 'PROJECT', period: 'last6', newSection: true, sectionTitle: 'Climat et pilotage' },
    { id: 'jalons', scope: 'PROJECT', period: 'all' },
    { id: 'budget', scope: 'PROJECT' },
  ];

  beforeAll(async () => {
    t = await setup();
    pmo = await t.token(WHO.pmo);
    fileId = (await http().post(`${R}/report-formats`).set('Authorization', `Bearer ${pmo}`).attach('file', await makeFormatPptx(), 'Charte.pptx').expect(201)).body.id;
  });
  afterAll(() => t.close());

  it('catalogue : nature, indicateurs proposés et périodes des composants', async () => {
    const r = await get('/report-components').expect(200);
    expect(r.body.components.find((c: any) => c.id === 'barometre')).toMatchObject({ nature: 'Graphique', parts: ['chart'], periodic: true, defaultPeriod: 'last6', indicators: [{ id: 'score', label: 'Score global' }, { id: 'respondents', label: 'Répondants' }] });
    expect(r.body.components.find((c: any) => c.id === 'risques')).toMatchObject({ nature: 'Tableau', periodic: false });
    expect(r.body.periods.map((p: any) => p.id)).toEqual(['all', 'month', 'quarter', 'last3', 'last6', 'next30', 'next90']);
  });

  it('aperçu : rapport complet au format défini (couverture, intercalaires, pages, clôture), vignettes et anomalies', async () => {
    const r = await post('/report-templates/preview', { name: 'Support COPIL', version: '1.0', bodyId: 'g1', components: comps, format: format() }).expect(200);
    expect(r.body.pages).toBe(2 + 2 + comps.length);
    expect(r.body.slides.map((s: any) => s.label)).toEqual(['Couverture', 'Intercalaire · Synthèse de situation', 'Synthèse de situation', 'Risques et problèmes', 'Intercalaire · Climat et pilotage', 'Baromètre du projet', 'Jalons', 'Budget', 'Clôture']);
    expect(r.body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'warning', component: 'c05', message: expect.stringMatching(/^Budget : /) })]));
    const svg = await get(`/report-previews/${r.body.id}/slides/4`).buffer(true).parse(binary).expect(200);
    expect(svg.headers['content-type']).toMatch(/^image\/svg\+xml/);
    const top = (await t.db.risk.findMany({ where: { projectId: 'RISE', status: { not: 'CLOSED' } } })).sort((a, b) => b.p * b.i - a.p * a.i)[0];
    expect(svg.body.toString('utf8')).toContain(`>${top.code}</text>`);
    await get(`/report-previews/${r.body.id}/slides/99`).expect(404);
    await get('/report-previews/inconnu/slides/1').expect(404);
    const bad = await post('/report-templates/preview', { name: 'X', components: [{ id: 'jalons', scope: 'PROJECT', indicators: ['nimporte'] }] }).expect(400);
    expect(bad.body.fields).toEqual({ 'components.0': 'Jalons : indicateur inconnu (nimporte)' });
  });

  it('publication : PowerPoint de référence (v1) enregistré ; chaque publication rouvre ce template, seules les valeurs changent', async () => {
    const created = await post('/report-templates', { name: 'Support COPIL', version: '1.0', bodyId: 'g1', components: comps, format: format() }).expect(201);
    expect(created.body).toMatchObject({ pages: 9, publishedVersion: { seq: 1, label: '1.0', pages: 9 } });
    const id = created.body.id;
    const ref = (await get(`/report-templates/${id}/versions/1/file`).buffer(true).parse(binary).expect(200)).body as Buffer;
    expect(await pptxIntegrity(ref)).toEqual([]);
    const p1 = (await get(`/report-templates/${id}/pptx`).buffer(true).parse(binary).expect(200)).body as Buffer;
    expect(await pptxIntegrity(p1)).toEqual([]);
    const [a, b] = [await slideXml(ref), await slideXml(p1)];
    expect(b.files).toEqual(a.files);
    expect(b.xml.map(names)).toEqual(a.xml.map(names));
    // Nouvelle donnée : une ligne de plus dans le tableau des risques, rien d'autre ne bouge.
    const before = (b.xml[3].match(/<a:tr\b/g) ?? []).length;
    await t.db.risk.create({ data: { id: 'R-TPL', projectId: 'RISE', code: 'R99', n: 'Risque ajouté pour la publication', p: 5, i: 5, ownerId: 'p01', wsId: (await t.db.workstream.findFirstOrThrow({ where: { projectId: 'RISE' } })).id } });
    const p2 = (await get(`/report-templates/${id}/pptx`).buffer(true).parse(binary).expect(200)).body as Buffer;
    const c = await slideXml(p2);
    expect(c.xml.map(names)).toEqual(a.xml.map(names));
    expect((c.xml[3].match(/<a:tr\b/g) ?? []).length).toBe(before + 1);
    expect(c.xml[3]).toContain('<a:t>R99</a:t>');
    // Graphique natif du baromètre : données mises à jour dans le cache (pas d'image).
    const chartPath = Object.keys(c.z.files).find((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))!;
    const surveys = await t.db.barometerSurvey.findMany({ where: { projectId: 'RISE' }, orderBy: { month: 'asc' } });
    const last = surveys.filter((s) => s.overallScore !== null).pop()!;
    expect(await c.z.file(chartPath)!.async('string')).toContain(`<c:v>${last.overallScore}</c:v>`);
    expect(Object.keys(c.z.files).some((f) => f.startsWith('ppt/media/') && /\.(png|jpe?g)$/.test(f) && f.includes('chart'))).toBe(false);
    await t.db.risk.delete({ where: { id: 'R-TPL' } });
  });

  it('anomalies avant génération : avertissements listés ; périmètre disparu ou template endommagé → génération refusée (422)', async () => {
    const created = await post('/report-templates', { name: 'Flash phase', version: '1.0', bodyId: 'g1', components: [{ id: 'jalons', scope: 'PHASE', targetId: (await t.db.phase.findFirstOrThrow({ where: { projectId: 'RISE' } })).id, period: 'all' }, { id: 'budget', scope: 'PROJECT' }] }).expect(201);
    const id = created.body.id;
    const ok = await get(`/report-templates/${id}/check`).expect(200);
    expect(ok.body).toMatchObject({ version: { seq: 1 }, errors: 0, warnings: expect.any(Number) });
    expect(ok.body.issues.every((i: any) => i.severity === 'warning')).toBe(true);
    // Périmètre de la version publiée qui n'existe plus.
    const v = await t.db.reportTemplateVersion.findFirstOrThrow({ where: { templateId: id } });
    await t.db.reportTemplateVersion.update({ where: { id: v.id }, data: { structure: { ...(v.structure as any), components: [{ id: 'jalons', scope: 'PHASE', targetId: 'disparue' }] } } });
    const ko = await get(`/report-templates/${id}/check`).expect(200);
    expect(ko.body).toMatchObject({ errors: 1, issues: [{ severity: 'error', component: 'c01', message: "Jalons : le périmètre ciblé (phase) n'existe plus. Modifiez le template et publiez une nouvelle version." }] });
    const refused = await get(`/report-templates/${id}/pptx`).expect(422);
    expect(refused.body).toMatchObject({ code: 'REPORT_DATA_INVALID', issues: [expect.objectContaining({ severity: 'error' })] });
    // Template endommagé : zone variable retirée du fichier.
    await t.db.reportTemplateVersion.update({ where: { id: v.id }, data: { structure: v.structure as any } });
    const storage = t.app.get(StorageService);
    const z = await JSZip.loadAsync((await storage.get(v.fileKey))!);
    const slide = (v.manifest as any).fields.find((f: any) => f.id === 'c01.table').slide;
    z.file(slide, (await z.file(slide)!.async('string')).replace('name="rise:c01.table"', 'name="Tableau"'));
    const key = await storage.put('report-templates/RISE', await z.generateAsync({ type: 'nodebuffer' }), '.pptx');
    await t.db.reportTemplateVersion.update({ where: { id: v.id }, data: { fileKey: key } });
    const damaged = await get(`/report-templates/${id}/pptx`).expect(422);
    expect(damaged.body).toMatchObject({ code: 'TEMPLATE_DAMAGED', message: expect.stringMatching(/^Zone « c01\.table » introuvable dans le template/) });
  });

  it('versionnement : modifier la structure publie une nouvelle version ; changer l’état actif non ; anciennes versions gardées', async () => {
    const created = await post('/report-templates', { name: 'Support versionné', version: '2.0', bodyId: 'g1', components: comps.slice(0, 2), format: format() }).expect(201);
    const id = created.body.id;
    const v2 = await patch(`/report-templates/${id}`, { components: [...comps.slice(0, 2), { id: 'decisions', scope: 'PROJECT', period: 'quarter' }] }).expect(200);
    expect(v2.body).toMatchObject({ version: '2.1', pages: 6, publishedVersion: { seq: 2, label: '2.1', pages: 6 } });
    await http().patch(`${R}/report-templates/${id}/active`).set('Authorization', `Bearer ${pmo}`).send({ active: false }).expect(200);
    const same = await patch(`/report-templates/${id}`, { name: 'Support versionné' }).expect(200);
    expect(same.body.publishedVersion.seq).toBe(2);
    const list = await get(`/report-templates/${id}/versions`).expect(200);
    expect(list.body.map((v: any) => [v.seq, v.label, v.pages])).toEqual([[2, '2.1', 6], [1, '2.0', 5]]);
    const old = (await get(`/report-templates/${id}/versions/1/file`).buffer(true).parse(binary).expect(200)).body as Buffer;
    expect((await slideXml(old)).files).toHaveLength(5);
    const boot = await get('/bootstrap').expect(200);
    expect(boot.body.templates.find((x: any) => x.id === id)).toMatchObject({ version: '2.1', publishedVersion: 2, comps: expect.arrayContaining([expect.objectContaining({ id: 'decisions', period: 'quarter' })]) });
  });

  it('template antérieur aux versions : version 1 publiée à sa première utilisation', async () => {
    const seed = await t.db.reportTemplate.findFirstOrThrow({ where: { projectId: 'RISE', NOT: { id: { startsWith: 'T-' } } } });
    expect(await t.db.reportTemplateVersion.count({ where: { templateId: seed.id } })).toBe(0);
    const res = await get(`/report-templates/${seed.id}/pptx`).buffer(true).parse(binary).expect(200);
    expect(await pptxIntegrity(res.body)).toEqual([]);
    expect(await t.db.reportTemplateVersion.count({ where: { templateId: seed.id } })).toBe(1);
  });

  describe('pages modèles remplies et IA (Opus 5.5 simulé)', () => {
    let filledId: string;
    let llm: LlmService;
    const ok = (text: string) => ({ text, modelId: 'claude-opus-5-5', providerId: 'anthropic', tokensIn: 100, tokensOut: 50, costEur: 0.01, fallbackUsed: false, ms: 10 });
    const live = (reply: (input: any) => string) => { jest.spyOn(llm, 'isLive').mockReturnValue(true); return jest.spyOn(llm, 'complete').mockImplementation(async (input: any) => ok(reply(input)) as any); };
    const keys = (prompt: string) => [...prompt.matchAll(/"key": "(c\d+)"/g)].map((m) => m[1]);
    beforeAll(async () => {
      llm = t.app.get(LlmService);
      filledId = (await http().post(`${R}/report-formats`).set('Authorization', `Bearer ${pmo}`).attach('file', await makeFormatPptx({ filled: true }), 'Charte remplie.pptx').expect(201)).body.id;
    });
    afterEach(() => jest.restoreAllMocks());
    const fmt = (roles?: Record<string, Record<string, string>>) => Object.fromEntries(['cover', 'divider', 'standard', 'closing'].map((k, i) => [k, { fileId: filledId, slide: i + 1, ...(roles?.[k] ? { roles: roles[k] } : {}) }]));

    it('rôles proposés : règles hors ligne, IA quand elle est disponible, gardés avec le fichier', async () => {
      const rules = await post(`/report-formats/${filledId}/slides/3/roles`, { kind: 'standard' }).expect(200);
      expect(rules.body).toMatchObject({ source: 'regles', error: null });
      expect(rules.body.shapes.map((s: any) => s.name)).toEqual(['Barre latérale', 'Text 5', 'Text 6', 'Text 7', 'Carte 6', 'Carte 7', 'Carte 8', 'Text 48', 'Text 1']);
      const byName = (b: any) => Object.fromEntries(b.shapes.map((s: any) => [s.name, b.roles[s.id]]));
      expect(byName(rules.body)).toMatchObject({ 'Text 6': 'title', 'Carte 6': 'example', 'Text 48': 'footer' });
      const call = live((input) => { const ids = [...input.prompt.matchAll(/"id": "(\d+)"/g)].map((m: any) => m[1]); return JSON.stringify({ roles: Object.fromEntries(ids.map((id: string, i: number) => [id, i === 2 ? 'title' : i === 4 ? 'client' : 'fixed'])) }); });
      const ia = await post(`/report-formats/${filledId}/slides/1/roles`, { kind: 'cover' }).expect(200);
      expect(ia.body).toMatchObject({ source: 'ia', note: null });
      expect(byName(ia.body)).toMatchObject({ 'Text 1': 'title', 'Text 3': 'client' });
      expect(call).toHaveBeenCalledWith(expect.objectContaining({ functionId: 'rapports' }));
      await post(`/report-formats/${filledId}/slides/1/roles`, { kind: 'cover' }).expect(200);
      expect(call).toHaveBeenCalledTimes(1); // proposition gardée
      const svg = await http().post(`${R}/report-formats/${filledId}/slides/3/preview`).set('Authorization', `Bearer ${pmo}`).send({ roles: rules.body.roles }).buffer(true).parse(binary).expect(200);
      expect(svg.body.toString('utf8')).toContain('Exemple retiré');
      const bad = await post('/report-formats/check', fmt({ standard: Object.fromEntries(Object.keys(rules.body.roles).map((id) => [id, 'fixed'])) })).expect(200);
      expect(bad.body.errors.standard).toBe('Page standard : désignez la zone de titre (la forme qui recevra le titre)');
    });

    it('rôles validés appliqués ; titres-messages et synthèse rédigés par l’IA, contrôlés, corrigés à la seconde demande', async () => {
      const std = (await post(`/report-formats/${filledId}/slides/3/roles`, { kind: 'standard' }).expect(200)).body;
      const footer = std.shapes.find((s: any) => s.name === 'Text 48').id;
      const roles = { standard: { ...std.roles, [footer]: 'example' } };
      if (!(await t.db.skill.findFirst({ where: { n: 'Rapports' } }))) await t.db.skill.create({ data: { n: 'Rapports', t: 'Écrire un titre qui dit le message.', on: true, position: 99 } });
      let n = 0;
      const call = live((input) => {
        n++;
        const k = keys(input.prompt);
        // Première réponse : un titre cite un nombre absent des données ; la seconde le corrige.
        if (n === 1) return JSON.stringify({ titres: Object.fromEntries(k.map((x, i) => [x, i === 0 ? 'Situation maîtrisée' : '99 risques à traiter'])), synthese: ['Le projet est actif.'] });
        return JSON.stringify({ titres: Object.fromEntries(k.slice(1).map((x) => [x, 'Les risques critiques dominent'])) });
      });
      const created = await post('/report-templates', { name: 'Charte remplie', version: '1.0', bodyId: 'g1', components: [{ id: 'synthese', scope: 'PROJECT' }, { id: 'risques', scope: 'PROJECT' }], format: fmt(roles) }).expect(201);
      expect(call).toHaveBeenCalledTimes(2);
      expect(call.mock.calls[1][0].prompt).toContain('nombre absent des données (99)');
      expect(call.mock.calls[0][0].system).toContain('Skill « Rapports »');
      const file = (await get(`/report-templates/${created.body.id}/versions/1/file`).buffer(true).parse(binary).expect(200)).body as Buffer;
      const { xml } = await slideXml(file);
      expect(xml[2]).toContain('<a:t>Situation maîtrisée</a:t>');
      expect(xml[2]).toContain('<a:t>Le projet est actif.</a:t>');
      expect(xml[3]).toContain('<a:t>Les risques critiques dominent</a:t>');
      expect(xml[3]).not.toContain('Deux chantiers transverses'); // bas de page passé en exemple par l'utilisateur
      expect(xml[3]).not.toContain('12,8 M€');
      expect(xml[0]).toContain('<a:t>Charte remplie</a:t>');
      // Réponses toujours refusées : textes par défaut et avertissement.
      jest.restoreAllMocks();
      live(() => '{"titres": {"c01": "987 alertes", "c02": "987 alertes"}, "synthese": []}');
      const chk = await get(`/report-templates/${created.body.id}/check`).expect(200);
      expect(chk.body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'warning', message: expect.stringMatching(/^Rédaction par l'IA : \d texte\(s\) refusé\(s\) au contrôle/) })]));
      const pub = (await get(`/report-templates/${created.body.id}/pptx`).buffer(true).parse(binary).expect(200)).body as Buffer;
      expect((await slideXml(pub)).xml[3]).toContain('<a:t>Risques et problèmes</a:t>');
    });
  });
});
