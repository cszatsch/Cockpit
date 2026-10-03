import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { analyzeImage, analyzePptx } from '../../src/core/report-format-read';
import { composeTemplate, fillChartXml, FillData, fillTemplate, TemplateFieldMissing, TemplateManifest } from '../../src/core/report-template';
import { COMPONENT_IDS, ComponentConfig, configErrors, fieldName, indicatorsOf, pagesOf, periodOf, periodRange, reportPlan, sectionsOf } from '../../src/domain/report-components';
import { makeFormatPptx, makePng, pptxIntegrity, withLegacyParts } from '../format-fixture';
import { actionBuckets, ActionsData, DashboardData, DECISION_STALE_DAYS, DecisionsData, drawActions, drawDashboard, drawDecisions, focusPhase, gapTone, sortActions, sortPending } from '../../src/core/report-draw-pilotage';
import { BarometerData, Draw, drawBarometer, drawGantt, drawMilestones, drawPlanTable, drawRisks, foldPlan, GANTT_MAX_ROWS, GanttData, GanttRow, isLate, MILESTONES_MAX, MilestonesData, milestoneStates, RisksData, wrapText } from '../../src/core/report-draw';
import { designTokens, scoreTone, statusTone, timeRatio, timeScale, typeScale } from '../../src/domain/report-design';

/** Étapes 3 à 6 de « Créer un template » (03/10/2026) : catalogue, périodes, sections, template et publications. */
describe('Template de rapport — règles', () => {
  it('périodes recalculées à chaque publication à partir de la date du jour', () => {
    expect(periodRange('month', '2026-09-26')).toMatchObject({ start: '2026-09-01', end: '2026-09-30', label: '1 sept. 2026 → 30 sept. 2026' });
    expect(periodRange('quarter', '2026-11-03')).toMatchObject({ start: '2026-10-01', end: '2026-12-31' });
    expect(periodRange('last6', '2026-09-26')).toMatchObject({ start: '2026-04-01', end: '2026-09-30' });
    expect(periodRange('next30', '2026-09-26')).toMatchObject({ start: '2026-09-26', end: '2026-10-26' });
    // Périodes propres à certains composants (étape 4, 04/10/2026).
    expect(periodRange('prevMonth', '2026-09-26')).toMatchObject({ start: '2026-08-01', end: '2026-08-31' });
    expect(periodRange('last12', '2026-09-26')).toMatchObject({ start: '2025-10-01', end: '2026-09-30' });
    expect(periodRange('next60', '2026-09-26')).toMatchObject({ start: '2026-09-26', end: '2026-11-25' });
    expect(periodRange('all', '2026-09-26')).toEqual({ start: null, end: null, label: 'toutes dates' });
  });

  it('sections : le premier composant et chaque composant marqué ouvrent une page intercalaire', () => {
    const comps: ComponentConfig[] = [{ id: 'synthese', scope: 'PROJECT' }, { id: 'jalons', scope: 'PROJECT' }, { id: 'barometre', scope: 'PROJECT', newSection: true, sectionTitle: 'Climat' }, { id: 'risques', scope: 'PROJECT' }];
    const s = sectionsOf(comps);
    expect(s.map((x) => [x.title, x.components.map((c) => c.key)])).toEqual([['Synthèse de situation', ['c01', 'c02']], ['Climat', ['c03', 'c04']]]);
    expect(pagesOf(comps)).toBe(2 + 2 + 4);
    expect(pagesOf([])).toBe(2);
  });

  it('plan du rapport connu avant la génération : pages (type, libellé) et structure (sections, page de chaque composant)', () => {
    const p = reportPlan([{ id: 'synthese', scope: 'PROJECT' }, { id: 'risques', scope: 'PROJECT' }, { id: 'barometre', scope: 'PROJECT', newSection: true, sectionTitle: 'Climat' }]);
    expect(p.slides.map((s) => s.label)).toEqual(['Couverture', 'Intercalaire · Synthèse de situation', 'Synthèse de situation', 'Risques et problèmes', 'Intercalaire · Climat', 'Baromètre du projet', 'Clôture']);
    expect(p.structure).toEqual([{ num: 1, title: 'Synthèse de situation', components: [{ key: 'c01', name: 'Synthèse de situation', page: 3 }, { key: 'c02', name: 'Risques et problèmes', page: 4 }] }, { num: 2, title: 'Climat', components: [{ key: 'c03', name: 'Baromètre du projet', page: 6 }] }]);
    expect(reportPlan([]).slides.map((s) => s.kind)).toEqual(['cover', 'closing']);
  });

  it('indicateurs et période : défauts du composant, ordre du catalogue, période seulement si le composant en a une', () => {
    expect(indicatorsOf({ id: 'jalons', scope: 'PROJECT' })).toEqual(['code', 'name', 'date', 'baseline', 'slip', 'kpis']);
    expect(indicatorsOf({ id: 'jalons', scope: 'PROJECT', indicators: ['slip', 'code'] })).toEqual(['code', 'slip']);
    expect(periodOf({ id: 'jalons', scope: 'PROJECT' })).toBe('next90');
    expect(periodOf({ id: 'planning', scope: 'PROJECT', period: 'month' })).toBe('all');
    expect(configErrors([{ id: 'jalons', scope: 'PROJECT', indicators: ['inconnu'] }])).toEqual({ 'components.0': 'Jalons : indicateur inconnu (inconnu)' });
    expect(configErrors([{ id: 'jalons', scope: 'PROJECT', indicators: [] }])).toEqual({ 'components.0': 'Jalons : choisissez au moins un indicateur' });
    expect(configErrors([{ id: 'barometre', scope: 'PROJECT', period: 'next30' }])).toEqual({ 'components.0': 'Baromètre du projet : période non proposée pour ce composant' });
    expect(configErrors([{ id: 'barometre', scope: 'PROJECT', period: 'last12' }])).toEqual({});
    expect(configErrors([{ id: 'synthese', scope: 'PROJECT', indicators: ['status', 'golive', 'risks_open', 'risks_critical', 'actions_late'] }])).toEqual({ 'components.0': 'Synthèse de situation : 4 indicateurs au plus sur une page' });
    expect(fieldName('c02.table')).toBe('rise:c02.table');
  });

  it('graphique : cache des catégories et des valeurs réécrit, valeur manquante laissée vide', () => {
    const xml = '<c:barChart><c:ser><c:idx val="0"/><c:cat><c:strRef><c:f>x</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>y</c:f></c:numRef></c:val></c:ser></c:barChart>';
    const out = fillChartXml(xml, ['avr.', 'mai'], [{ values: [3.5, null] }]);
    expect(out).toContain('<c:f>Sheet1!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>avr.</c:v></c:pt><c:pt idx="1"><c:v>mai</c:v></c:pt>');
    expect(out).toContain('<c:f>Sheet1!$B$2:$B$3</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>3.5</c:v></c:pt></c:numCache>');
  });
});

describe('Template de rapport — composition et publications', () => {
  const all = COMPONENT_IDS.map((id, i) => ({ id, scope: 'PROJECT' as const, newSection: i === 4 }));
  const tokens = { titre: 'Support COPIL', date: '26 sept. 2026', projet: 'RISE', comite: 'COPIL' };
  const values = (m: TemplateManifest, rows: number, v = '12'): FillData => {
    const d: FillData = { text: {}, tables: {}, charts: {} };
    for (const f of m.fields) {
      if (f.kind === 'text') d.text[f.id] = [`${f.id} = ${v}`];
      if (f.kind === 'table') d.tables[f.id] = Array.from({ length: rows }, (_, i) => f.columns!.map((c) => `${c}-${i + 1}-${v}`));
      if (f.kind === 'chart') d.charts[f.id] = { categories: ['avr.', 'mai', 'juin'], series: f.series!.map((s) => ({ name: s, values: [1, 2, Number(v)] })) };
    }
    return d;
  };
  const shapes = async (buf: Buffer) => {
    const z = await JSZip.loadAsync(buf);
    const files = Object.keys(z.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((x, y) => Number(/\d+/.exec(x)![0]) - Number(/\d+/.exec(y)![0]));
    return { z, files, names: await Promise.all(files.map(async (f) => [...(await z.file(f)!.async('string')).matchAll(/<p:cNvPr\b[^>]*\bname="([^"]*)"/g)].map((x) => x[1]).join('|'))) };
  };

  it('structure figée : couverture, intercalaires, une page par composant, clôture ; zones variables nommées et au manifeste', async () => {
    const buf = await makeFormatPptx();
    const a = await analyzePptx(buf);
    const src = (n: number) => ({ fileId: 'A', kind: 'PPTX' as const, buf, analysis: a, slide: n });
    const { buf: tpl, manifest } = await composeTemplate({ cover: src(1), divider: src(2), standard: src(3), closing: src(4) }, { title: 'Support COPIL', sections: sectionsOf(all), tokens });
    expect(await pptxIntegrity(tpl)).toEqual([]);
    expect(manifest.pages.map((p) => p.kind)).toEqual(['cover', 'divider', 'standard', 'standard', 'standard', 'standard', 'divider', 'standard', 'standard', 'standard', 'standard', 'standard', 'closing']);
    expect(manifest.pages.length).toBe(pagesOf(all));
    const ids = manifest.fields.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['report.subtitle', 'c01.caption', 'c01.kpi.status', 'c01.text', 'c02.board', 'c03.board', 'c04.board', 'c05.board', 'c06.board', 'c07.board', 'c07.chart', 'c08.board', 'c09.kpi.committed']));
    expect(ids.filter((x) => /\.(table|chart)$/.test(x))).toEqual(['c07.chart']); // planches : plus de tableau ni de graphique en barres
    expect(new Set(ids.map((id, i) => `${id}@${manifest.fields[i].slide}`)).size).toBe(ids.length); // identifiants uniques par page
    const { names } = await shapes(tpl);
    const { files } = await shapes(tpl);
    for (const f of manifest.fields) expect(names[files.indexOf(f.slide)]).toContain(fieldName(f.id));
    const z = await JSZip.loadAsync(tpl);
    // Graphique natif (évolution du baromètre) : partie graphique + classeur incorporé.
    expect(Object.keys(z.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(1);
    expect(Object.keys(z.files).filter((f) => /^ppt\/embeddings\/.+\.xlsx$/.test(f))).toHaveLength(1);
    // Système de design au manifeste : police et accent repris de la page modèle.
    expect(manifest.design).toMatchObject({ font: expect.any(String), accent: expect.stringMatching(/^[0-9A-F]{6}$/) });
  });

  it('publication d’une version antérieure aux planches : seules les valeurs changent (pages, formes, design identiques) ; lignes de tableau variables au style conservé', async () => {
    const buf = await makeFormatPptx();
    const a = await analyzePptx(buf);
    const src = (n: number) => ({ fileId: 'A', kind: 'PPTX' as const, buf, analysis: a, slide: n });
    const { buf: tpl, manifest } = await withLegacyParts(() => composeTemplate({ cover: src(1), divider: src(2), standard: src(3), closing: src(4) }, { title: 'Support COPIL', sections: sectionsOf(all), tokens }));
    const p1 = await fillTemplate(tpl, manifest, values(manifest, 6, '12'));
    const p2 = await fillTemplate(p1, manifest, values(manifest, 2, '47'));
    for (const b of [p1, p2]) expect(await pptxIntegrity(b)).toEqual([]);
    const [s0, s1, s2] = [await shapes(tpl), await shapes(p1), await shapes(p2)];
    expect(s1.files).toEqual(s0.files);
    expect(s2.names).toEqual(s0.names); // mêmes formes, mêmes noms, même ordre
    const tbl = manifest.fields.find((f) => f.id === 'c05.table')!;
    const t1 = await s1.z.file(tbl.slide)!.async('string'), t2 = await s2.z.file(tbl.slide)!.async('string');
    expect((t1.match(/<a:tr\b/g) ?? []).length).toBe(7);
    expect((t2.match(/<a:tr\b/g) ?? []).length).toBe(3);
    expect(t2).toContain('<a:t>code-2-47</a:t>');
    expect(t2).not.toContain('12</a:t>');
    // Style : filets fins sous chaque ligne, en-tête souligné d'un filet d'encre ; même rendu d'une publication à l'autre.
    const lines = (x: string) => new Set([...x.matchAll(/<a:lnB w="(\d+)"/g)].map((m) => m[1]));
    expect(lines(t2)).toEqual(lines(t1));
    // Texte des zones et données du graphique (cache et classeur incorporé).
    const chart = manifest.fields.find((f) => f.id === 'c07.chart')!;
    expect(await s2.z.file(chart.chart!)!.async('string')).toContain('<c:pt idx="2"><c:v>47</c:v></c:pt>');
    const rels = await s2.z.file(chart.chart!.replace('charts/', 'charts/_rels/') + '.rels')!.async('string');
    const emb = /Target="\.\.\/embeddings\/([^"]+)"/.exec(rels)![1];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await s2.z.file(`ppt/embeddings/${emb}`)!.async('nodebuffer') as any);
    expect(wb.getWorksheet('Sheet1')!.getRow(4).values).toEqual([undefined, 'juin', 47]);
    expect(await s2.z.file(manifest.fields.find((f) => f.id === 'c01.caption')!.slide)!.async('string')).toContain('<a:t>c01.caption = 47</a:t>');
    // Masques, médias et thème inchangés.
    const parts = (z: JSZip) => Object.keys(z.files).filter((f) => /^ppt\/(slideMasters|slideLayouts|media|theme)\//.test(f)).sort();
    expect(parts(s2.z)).toEqual(parts(s0.z));
  });

  it('tableau (version antérieure aux planches) : texte trop long abrégé sur une ligne ; lignes au-delà de la capacité non écrites', async () => {
    const { buf: tpl, manifest } = await withLegacyParts(() => composeTemplate(null, { title: 'T', sections: sectionsOf([{ id: 'actions', scope: 'PROJECT' }]), tokens }));
    const f = manifest.fields.find((x) => x.id === 'c01.table')!;
    const d: FillData = { text: {}, tables: { 'c01.table': Array.from({ length: f.capacity! + 5 }, (_, i) => f.columns!.map((c) => (c === 'name' ? 'x'.repeat(400) : `${c}${i}`))) }, charts: {} };
    const out = await fillTemplate(tpl, manifest, d);
    const xml = await (await JSZip.loadAsync(out)).file(f.slide)!.async('string');
    expect((xml.match(/<a:tr\b/g) ?? []).length).toBe(f.capacity! + 1);
    expect(xml).toMatch(/x{10,}…<\/a:t>/);
    expect(xml).not.toContain('x'.repeat(400));
  });

  it('zone variable absente (template modifié à la main) : erreur explicite', async () => {
    const { buf: tpl, manifest } = await withLegacyParts(() => composeTemplate(null, { title: 'T', sections: sectionsOf([{ id: 'actions', scope: 'PROJECT' }]), tokens }));
    const z = await JSZip.loadAsync(tpl);
    const f = manifest.fields.find((x) => x.id === 'c01.table')!;
    z.file(f.slide, (await z.file(f.slide)!.async('string')).replace('name="rise:c01.table"', 'name="Tableau"'));
    const broken = await z.generateAsync({ type: 'nodebuffer' });
    await expect(fillTemplate(broken, manifest, values(manifest, 1))).rejects.toThrow(TemplateFieldMissing);
  });

  it('présentation par défaut et page image : template intègre', async () => {
    const def = await composeTemplate(null, { title: 'T', sections: sectionsOf(all), tokens });
    expect(await pptxIntegrity(await fillTemplate(def.buf, def.manifest, values(def.manifest, 3)))).toEqual([]);
    const img = makePng(1280, 720, '10233A'), ia = analyzeImage(img);
    const s = { fileId: 'I', kind: 'IMAGE' as const, buf: img, analysis: ia, slide: 1 };
    const im = await composeTemplate({ cover: s, divider: s, standard: s, closing: s }, { title: 'T', sections: sectionsOf(all.slice(0, 3)), tokens });
    expect(await pptxIntegrity(await fillTemplate(im.buf, im.manifest, values(im.manifest, 3)))).toEqual([]);
    expect(im.manifest.fields.map((f) => f.id)).toEqual(expect.arrayContaining(['report.subtitle', 'report.date', 'c02.board', 'c03.board']));
  });
});

/** Système de design et planches (03/10/2026) : Gantt, planning en tableau au-delà de 25 lignes, baromètre. */
describe('Rapport — système de design', () => {
  const tk = designTokens({ primary: '0EA5E9', secondary: '0F6E9A', text: '000000', font: 'Poppins', head: 'Poppins', size: 11 });
  const phase = (i: number, status: GanttRow['status'], start: string, end: string, progress: number, current = false): GanttRow => ({ level: 0, code: String(i), name: `Phase ${i}`, start, end, status, progress, current });
  const plan: GanttData = {
    today: '2026-10-03',
    rows: [phase(1, 'DONE', '2025-01-01', '2025-12-31', 100), phase(2, 'IN_PROGRESS', '2026-01-01', '2026-12-31', 48, true), phase(3, 'PLANNED', '2027-01-01', '2027-06-30', 0)],
    milestones: [{ code: 'J01', label: 'Lancement', iso: '2025-01-15', row: 0 }, { code: 'J04', label: 'Fin de la migration', iso: '2026-10-14', row: 1 }],
  };
  const box = { x: 0, y: 0, w: 10 * 914400, h: 5 * 914400 };

  it('jetons : encre adoucie, teintes dérivées de l\'accent, échelle typographique', () => {
    expect(tk.ink).toBe('1E2124');
    expect(tk.accentSoft).toMatch(/^[0-9A-F]{6}$/);
    expect(typeScale(tk).hero).toBeGreaterThan(typeScale(tk).stat);
    expect(statusTone('Terminé')).toBe('ok');
    expect(statusTone('Bloqué')).toBe('risk');
    expect(scoreTone(25)).toBe('risk');
  });

  it('frise : pas adapté à la durée (mois, trimestres, semestres), repères d\'année', () => {
    expect(timeScale('2026-01-10', '2026-09-20')).toMatchObject({ unit: 'month', start: '2026-01-01', end: '2026-10-01' });
    expect(timeScale('2025-01-01', '2027-06-30').unit).toBe('quarter');
    const sc = timeScale('2023-06-01', '2028-06-30');
    expect(sc.unit).toBe('half');
    expect(sc.ticks.filter((k) => k.year).map((k) => k.year)).toEqual(['2023', '2024', '2025', '2026', '2027', '2028']);
    expect(timeRatio('2026-04-01', { start: '2026-01-01', end: '2026-07-01' })).toBeCloseTo(0.497, 2);
  });

  it('Gantt : phase en cours mise en avant, avancement dans la barre, repère du jour, prochain jalon nommé', () => {
    const xml = drawGantt(new Draw(tk), box, plan);
    expect(xml).toContain("Aujourd'hui · 3 oct.");
    expect(xml).toContain('>Phase en cours<');
    expect(xml).toContain('>Phase 2<');
    expect(xml).toContain('>48 %<');
    expect(xml).toContain('>14 oct. 2026<');
    expect(xml).toContain('dans 11 jours');
    expect(xml).toContain(`val="${tk.accent}"`); // barre d'avancement de la phase en cours
    expect((xml.match(/prst="diamond"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('Gantt : phase non terminée dont la fin est passée → en retard (rouge)', () => {
    const late: GanttData = { ...plan, rows: [phase(1, 'IN_PROGRESS', '2026-01-01', '2026-09-01', 70, true)] };
    expect(isLate(late.rows[0], late.today)).toBe(true);
    expect(drawGantt(new Draw(tk), box, late)).toContain(`val="${tk.risk}"`);
  });

  it('planning en tableau au-delà de 25 lignes : sous-phases des phases terminées regroupées', () => {
    const rows: GanttRow[] = [];
    for (let p = 1; p <= 4; p++) {
      rows.push(phase(p, p < 4 ? 'DONE' : 'IN_PROGRESS', '2025-01-01', '2026-12-31', p < 4 ? 100 : 30, p === 4));
      for (let k = 1; k <= 8; k++) rows.push({ level: 1, code: `${p}.${k}`, name: `Sous-phase ${p}.${k}`, start: '2025-01-01', end: '2026-12-31', status: p < 4 ? 'DONE' : 'PLANNED', progress: p < 4 ? 100 : 0, current: false });
    }
    expect(rows.length).toBeGreaterThan(GANTT_MAX_ROWS);
    const folded = foldPlan({ ...plan, rows });
    expect(folded.rows).toHaveLength(4 + 8);
    expect(folded.rows[0].folded).toBe(8);
    const xml = drawPlanTable(new Draw(tk), box, folded);
    expect(xml).toContain('8 sous-phases terminées');
    expect(xml).toContain('>Sous-phase 4.8<');
    expect(xml).not.toContain('>Sous-phase 1.1<');
  });

  it('baromètre : score et écart, avis, domaines triés, points clés ; blocs masqués selon les indicateurs', () => {
    const b: BarometerData = {
      month: 'juil.', score: 5.9, prevScore: 5.1, prevMonth: 'mai', respondents: 33, population: 40,
      sentiment: { positive: 55, neutral: 24, negative: 21 }, prevPositive: 37,
      domains: [{ name: 'Achats', score: 3, prev: 4.5, resp: 4 }, { name: 'Logistique', score: 7.7, prev: 6.1, resp: 6 }, { name: 'DSI', score: 5, prev: 5, resp: 3 }],
      themes: [{ label: 'Le progrès est réel', tone: 'OK' }, { label: 'Reprise des données', tone: 'RISK' }],
      questions: [{ label: 'Lisibilité de la trajectoire', score: 5.6, delta: 0.8 }],
      show: { score: true, sentiment: true, domains: true, themes: true },
    };
    const xml = drawBarometer(new Draw(tk), box, b);
    expect(xml).toContain('>5,9<');
    expect(xml).toContain('▲ +0,8');
    expect(xml).toContain('33');
    expect(xml).toContain('>55 %<');
    expect(xml).toContain('▲ +18 pt');
    expect(xml.indexOf('>Logistique<')).toBeLessThan(xml.indexOf('>Achats<'));
    expect(xml).toContain('▼ -1,5');
    expect(xml).toContain('= stable');
    expect(xml.indexOf('Reprise des données')).toBeLessThan(xml.indexOf('Le progrès est réel')); // risques d'abord
    const only = drawBarometer(new Draw(tk), box, { ...b, show: { score: true, sentiment: false, domains: false, themes: false } });
    expect(only).not.toContain('Avis des répondants');
    expect(only).not.toContain('Score par domaine');
  });

  it('publication : la planche est redessinée dans son groupe nommé, même cadre', async () => {
    const { buf: tpl, manifest } = await composeTemplate(null, { title: 'T', sections: sectionsOf([{ id: 'planning', scope: 'PROJECT' }, { id: 'barometre', scope: 'PROJECT' }]), tokens: { titre: 'T', date: '3 oct. 2026', projet: 'RISE', comite: 'COPIL' } });
    const f = manifest.fields.find((x) => x.id === 'c01.board')!;
    expect(f).toMatchObject({ kind: 'board', board: 'planning' });
    const out = await fillTemplate(tpl, manifest, { text: {}, tables: {}, charts: {}, boards: { 'c01.board': plan } });
    expect(await pptxIntegrity(out)).toEqual([]);
    const xml = await (await JSZip.loadAsync(out)).file(f.slide)!.async('string');
    expect((xml.match(/name="rise:c01\.board"/g) ?? []).length).toBe(1);
    expect(xml).toContain('>Phase 2<');
    const again = await fillTemplate(out, manifest, { text: {}, tables: {}, charts: {}, boards: { 'c01.board': { ...plan, today: '2026-11-20' } } });
    const x2 = await (await JSZip.loadAsync(again)).file(f.slide)!.async('string');
    expect(x2).toContain("Aujourd'hui · 20 nov.");
    expect(x2).not.toContain("Aujourd'hui · 3 oct.");
  });
});

/** Jalons en frise, risques en matrice et tableau (03/10/2026). */
describe('Rapport — jalons et risques', () => {
  const tk = designTokens({ primary: '0EA5E9', secondary: '0F6E9A', text: '000000', font: 'Poppins', head: 'Poppins', size: 11 });
  const box = { x: 0, y: 0, w: 10.4 * 914400, h: 4.8 * 914400 };
  const ms: MilestonesData = {
    today: '2026-10-03',
    rows: [
      { code: 'J01', name: 'Fin de la recette Finance', iso: '2026-09-19', baseline: '2026-09-19', phase: 'Deploy' },
      { code: 'J04', name: 'Fin de la migration Run 3', iso: '2026-10-14', baseline: '2026-10-14', phase: 'Deploy' },
      { code: 'J05', name: 'Fin des tests 2-à-2', iso: '2026-11-15', baseline: '2026-10-30', phase: 'Deploy' },
    ],
    show: { code: true, name: true, date: true, baseline: true, slip: true, phase: false, kpis: true },
  };

  it('états : franchi (date passée), prochain, glissé (après sa référence)', () => {
    expect(milestoneStates(ms.rows, ms.today)).toEqual(['done', 'next', 'late']);
  });

  it('frise : un cercle par jalon, prochain nommé avec son délai, glissement en rouge, indicateurs sur cartes', () => {
    const xml = drawMilestones(new Draw(tk), box, ms);
    expect((xml.match(/prst="ellipse"/g) ?? []).length).toBe(3);
    expect(xml).toContain('>Prochain<');
    expect(xml).toContain('dans 11 jours');
    expect(xml).toContain('>Glissé<');
    expect(xml).toContain('+16 j');
    expect(xml).not.toContain('Réf. 19 sept.'); // date tenue : pas de mention de référence
    expect(xml).toContain('>Jalons franchis<');
    expect(xml).toContain('>1 / 3<');
    expect(xml).toContain(`val="${tk.ink}"`); // cartes sombres
    const many: MilestonesData = { ...ms, rows: Array.from({ length: 20 }, (_, i) => ({ code: `J${i + 1}`, name: `Jalon ${i + 1}`, iso: `2026-${String(1 + Math.floor(i / 2)).padStart(2, '0')}-${i % 2 ? '20' : '05'}`, baseline: null, phase: null })) };
    const x2 = drawMilestones(new Draw(tk), box, many);
    expect((x2.match(/prst="ellipse"/g) ?? []).length).toBe(MILESTONES_MAX);
    expect(x2).toMatch(/Non affichés : \d+ jalons? (antérieurs?|ultérieurs?)/);
  });

  it('texte coupé en lignes, dernière ligne abrégée « … »', () => {
    const l = wrapText('Solution CRM incomplète — 79 user stories à repositionner, capacité 40 US sur 2 sprints', 2 * 914400, 10, 2);
    expect(l).toHaveLength(2);
    expect(l[1].endsWith('…')).toBe(true);
    expect(wrapText('Court', 2 * 914400, 10, 2)).toEqual(['Court']);
  });

  const risks: RisksData = {
    today: '2026-10-03',
    rows: [
      { code: 'R01', name: 'Reprise des données', p: 5, i: 5, plan: 'Replanification du Run 3', owner: 'Karim Benali', ws: 'Migration', due: '2026-10-14', status: 'En traitement' },
      { code: 'R03', name: 'Solution CRM incomplète', p: 4, i: 5, plan: null, owner: 'Olivier Chevalier', ws: 'Ventes', due: '2026-09-26', status: 'Ouvert' },
      { code: 'R04', name: 'Faisabilité du Go-Live', p: 4, i: 4, plan: 'Report du Go-Live', owner: 'Laurent Garnier', ws: null, due: null, status: 'Ouvert' },
      { code: 'R05', name: 'Tests insuffisants', p: 4, i: 4, plan: 'Planning resserré', owner: 'Karim Benali', ws: null, due: null, status: 'Ouvert' },
    ],
    show: { matrix: true, code: true, name: true, score: true, p: true, i: true, plan: true, owner: true, due: true, status: false },
  };

  it('risques : matrice 5 × 5 (codes dans les cases, légende par niveau) et tableau (criticité, plan, échéance échue)', () => {
    const xml = drawRisks(new Draw(tk), box, risks);
    expect(xml).toContain('Matrice des risques P × I');
    expect(xml).toContain('>R04<');
    expect(xml).toContain('>R05<');
    expect(xml).toContain('>Critique <');
    expect(xml).toContain('2 risques');
    expect(xml).toContain('Aucun plan approuvé — à qualifier');
    expect(xml).toContain('>P5 × I5<');
    expect(xml).toContain('>échue<');
    expect(xml).toContain(`val="${tk.risk}"`);
    const noMatrix = drawRisks(new Draw(tk), box, { ...risks, show: { ...risks.show, matrix: false, status: true } });
    expect(noMatrix).not.toContain('Matrice des risques');
    expect(noMatrix).toContain('>Statut<');
  });

  it('risques au-delà de la page : « … et N autres risques (tous dans la matrice) »', () => {
    const rows = Array.from({ length: 20 }, (_, k) => ({ ...risks.rows[0], code: `R${k}` }));
    expect(drawRisks(new Draw(tk), box, { ...risks, rows })).toMatch(/… et \d+ autres risques \(tous dans la matrice\)/);
  });
});

describe('Rapport — échéancier des actions, arbitrages, tableau de bord', () => {
  const tk = designTokens({ primary: '0EA5E9', secondary: '0F6E9A', text: '000000', font: 'Poppins', head: 'Poppins', size: 11 });
  const IN = 914400;
  const box = { x: IN, y: 2 * IN, w: 11.4 * IN, h: 4.9 * IN };
  /** Toutes les formes dessinées restent dans le cadre de la planche (aucun débordement). */
  const inside = (xml: string) => [...xml.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)].every((m) => +m[1] >= box.x - 1 && +m[2] >= box.y - 1 && +m[1] + +m[3] <= box.x + box.w + 1 && +m[2] + +m[4] <= box.y + box.h + 1);
  const actions: ActionsData = {
    today: '2026-10-03',
    rows: [
      { code: 'A-49', name: 'Recetter les rôles et autorisations', owner: 'Marc Delorme', ws: 'Pilotage', due: '2026-10-10', status: 'OPEN', prio: 'MEDIUM', source: null },
      { code: 'A-41', name: 'Replanifier le Run 3', owner: 'Karim Benali', ws: 'Migration', due: '2026-08-27', status: 'IN_PROGRESS', prio: 'HIGH', source: 'R01' },
      { code: 'A-50', name: 'Documenter les interfaces', owner: 'Léa Fontaine', ws: null, due: null, status: 'BLOCKED', prio: 'LOW', source: null },
      { code: 'A-47', name: 'Livrer les modules de formation', owner: 'Isabelle Perrin', ws: 'Conduite', due: '2026-12-15', status: 'OPEN', prio: 'MEDIUM', source: 'R07' },
    ],
    show: { code: true, name: true, owner: true, due: true, status: true, prio: false, kpis: true },
  };

  it('actions : ordre d’urgence (retards d’abord), répartition par échéance (retard, sous 14 jours, plus tard, sans)', () => {
    expect(sortActions(actions.rows, actions.today).map((r) => r.code)).toEqual(['A-41', 'A-49', 'A-47', 'A-50']);
    expect(actionBuckets(actions.rows, actions.today)).toEqual({ late: 1, soon: 1, later: 1, none: 1 });
  });

  it('échéancier : frise centrée sur aujourd’hui (retard en rouge, délai), origine de l’action, panneau des retards ; dans le cadre', () => {
    const xml = drawActions(new Draw(tk), box, actions);
    expect(xml).toContain('>Retard<');
    expect(xml).toContain('>À venir<');
    expect(xml).toContain('Aujourd’hui · 3 oct.');
    expect(xml).toContain('>37 j<');
    expect(xml).toContain('>7 j<');
    expect(xml).toContain('sans échéance');
    expect(xml).toContain('issue de R01');
    expect(xml).toContain('>Bloquée<');
    expect(xml).toContain('la plus ancienne : A-41, 37 j');
    expect(xml).toContain(`val="${tk.risk}"`);
    expect(xml).toContain(`val="${tk.watch}"`);
    expect(inside(xml)).toBe(true);
    const many = drawActions(new Draw(tk), box, { ...actions, rows: Array.from({ length: 30 }, (_, k) => ({ ...actions.rows[0], code: `A-${k}` })) });
    expect(many).toMatch(/… et \d+ autres actions ouvertes \(comptées à droite\)/);
    expect(inside(many)).toBe(true);
    const empty = drawActions(new Draw(tk), box, { ...actions, rows: [] });
    expect(empty).toContain('Aucune action ouverte');
    expect(empty).not.toContain('En retard');
  });

  const decisions: DecisionsData = {
    today: '2026-10-03',
    pending: [
      { code: 'D-006', title: 'Plan de reprise des recettes Finance', status: 'DRAFT', created: '2026-09-12', decided: null, body: 'Comité de chantier', bodyShort: 'Chantier', decision: null, impact: null, expected: null },
      { code: 'D-009', title: 'Prioriser les 79 user stories CRM', status: 'TO_ARBITRATE', created: '2026-09-20', decided: null, body: 'Comité de projet', bodyShort: 'COPROJ', decision: null, impact: null, expected: 'au COPROJ du 7 oct.' },
      { code: 'D-005', title: 'Articles de remplacement CRM', status: 'IN_REVIEW', created: '2026-08-27', decided: null, body: "Comité d'arbitrage", bodyShort: 'Arbitrage', decision: null, impact: null, expected: null },
    ],
    taken: [{ code: 'D-007', title: 'Confirmer ou reporter le Go-Live', status: 'ARBITRATED', created: '2026-09-13', decided: '2026-09-26', body: 'Comité de pilotage', bodyShort: 'COPIL', decision: 'Go-Live reporté au 1er avril 2027', impact: 'Chemin critique à recaler', expected: null }],
    last: [], period: '1 sept. → 30 sept. 2026',
    show: { code: true, name: true, status: true, date: true, body: true, decision: true, impact: false },
  };

  it('arbitrages : à arbitrer d’abord puis les plus anciennes ; étape, attente (rouge au-delà de 30 j), séance attendue ; décisions prises en fil', () => {
    expect(sortPending(decisions.pending).map((r) => r.code)).toEqual(['D-009', 'D-005', 'D-006']);
    const xml = drawDecisions(new Draw(tk), box, decisions);
    expect(xml).toContain('>décisions en attente<');
    expect(xml).toContain('>dont 1 à arbitrer<');
    expect(xml).toContain('>À arbitrer<');
    expect(xml).toContain('attendue au COPROJ du 7 oct.');
    expect(xml).toContain('>37 j<'); // D-005 : attente ≥ DECISION_STALE_DAYS
    expect(DECISION_STALE_DAYS).toBe(30);
    expect(xml).toContain('Go-Live reporté au 1er avril 2027');
    expect(xml).not.toContain('Chemin critique à recaler'); // impact en option
    expect(xml).toContain('sur la période · 1 sept. → 30 sept. 2026');
    expect(inside(xml)).toBe(true);
    // Aucune décision prise sur la période : les dernières sont rappelées ; rien du tout : un seul message.
    const recall = drawDecisions(new Draw(tk), box, { ...decisions, taken: [], last: decisions.taken });
    expect(recall).toContain('Aucune décision prise sur la période.');
    expect(recall).toContain('>Dernière décision prise<');
    const none = drawDecisions(new Draw(tk), box, { ...decisions, pending: [], taken: [], last: [] });
    expect(none).toContain('Aucune décision prise à ce jour.');
    expect(none).not.toContain('sur la période.');
    expect(none).toContain('>rien à arbitrer<');
  });

  const dash: DashboardData = {
    today: '2026-10-03',
    phases: [
      { code: '4', name: 'Realize', start: '2025-09-01', end: '2026-02-28', status: 'DONE', progress: 100, planned: 100 },
      { code: '5', name: 'Deploy', start: '2026-02-01', end: '2027-06-30', status: 'IN_PROGRESS', progress: 40, planned: 47 },
      { code: '6', name: 'Run', start: '2027-07-01', end: '2028-06-30', status: 'PLANNED', progress: 0, planned: 0 },
    ],
    tiles: [{ id: 'risks_open', label: 'Risques ouverts', value: '7', note: 'dont 3 critiques', tone: 'risk' }, { id: 'decisions_pending', label: 'Décisions en attente', value: '5', note: 'dont 1 à arbitrer', tone: 'watch' }],
    golive: '2027-04-01', next: { code: 'J04', name: 'Fin de la migration Run 3', iso: '2026-10-14' },
    show: { progress: true, planned: true, risks_open: true, actions_open: false, milestones_late: false, decisions_pending: true },
  };

  it('tableau de bord : phase en cours (réel, prévu, écart en points), repères, chemin des phases, tuiles qualifiées ; dans le cadre', () => {
    expect(focusPhase(dash.phases)!.name).toBe('Deploy');
    expect([gapTone(1), gapTone(-3), gapTone(-7)]).toEqual(['ok', 'watch', 'risk']);
    const xml = drawDashboard(new Draw(tk), box, dash);
    expect(xml).toContain('Phase en cours · 2 / 3');
    expect(xml).toContain('>40<');
    expect(xml).toContain('prévu à date 47 %');
    expect(xml).toContain('▼ −7 pts');
    expect(xml).toContain('>Go-live prévu<');
    expect(xml).toContain('>1 avr. 2027<');
    expect(xml).toContain('Prochain jalon · J04');
    expect(xml).toContain('>Chemin des phases<');
    expect(xml).toContain('>terminée<');
    expect(xml).toContain('>Santé du projet<');
    expect(xml).toContain('>dont 3 critiques<');
    expect(inside(xml)).toBe(true);
    // Tuiles seules (sans avancement) : une ligne, valeurs en grand.
    const only = drawDashboard(new Draw(tk), box, { ...dash, show: { ...dash.show, progress: false, planned: false } });
    expect(only).not.toContain('Phase en cours');
    expect(only).not.toContain('Santé du projet');
    expect(inside(only)).toBe(true);
  });

  it('publication : planches redessinées dans leur groupe, rapport intègre', async () => {
    const { buf: tpl, manifest } = await composeTemplate(null, { title: 'T', sections: sectionsOf([{ id: 'dashboard', scope: 'PROJECT' }, { id: 'actions', scope: 'PROJECT' }, { id: 'decisions', scope: 'PROJECT' }]), tokens: { date: '3 oct. 2026' } });
    expect(manifest.fields.filter((f) => f.kind === 'board').map((f) => [f.id, f.board])).toEqual([['c01.board', 'dashboard'], ['c02.board', 'actions'], ['c03.board', 'decisions']]);
    const out = await fillTemplate(tpl, manifest, { text: {}, tables: {}, charts: {}, boards: { 'c01.board': dash, 'c02.board': actions, 'c03.board': decisions } });
    expect(await pptxIntegrity(out)).toEqual([]);
    const z = await JSZip.loadAsync(out);
    const xml = await z.file(manifest.fields.find((f) => f.id === 'c02.board')!.slide)!.async('string');
    expect(xml).toContain('name="rise:c02.board"');
    expect(xml).toContain('>37 j<');
  });
});
