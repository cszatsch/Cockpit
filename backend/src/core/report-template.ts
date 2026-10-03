import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { Box, builtInFormat, DEFAULT_SIZE, estimatedZones, exampleArea, FormatAnalysis, PageKind, RoleMap, ShapeRole, SlideAnalysis, suggestRoles, TextStyle } from '../domain/report-format';
import { COMPONENTS, DASHBOARD_SERIES, fieldName, indicatorsOf, KPI_MAX, Section } from '../domain/report-components';
import { relsPath, resolvePath } from './ooxml';
import { contrastOn } from './report-format-read';
import { BarometerData, COLUMN_KIND, Draw, GanttData, TableColumn, barometerLayout, drawBarometer, drawGantt, drawPlanTable, GANTT_MAX_ROWS, kpiCards, synthesisParas, tableHeaderRow, tableRow } from './report-draw';
import { DesignTokens, designTokens, typeScale } from '../domain/report-design';
import { applyRoles, topLevelShapes, Assembler, Fill, fillPptxSlide, RoleValues, maxId, PageSource, readRels, RelRow, relsXml, relTarget, runProps, setText, Src, syntheticSlide, textBox, tokens, XML_DECL, xmlEsc } from './report-format-write';

/**
 * Template PowerPoint d'un rapport de comité (étapes 4 à 6 de « Créer un template », 03/10/2026).
 *
 * Composition (une fois, à la publication) : couverture, une page intercalaire par section, une page standard par
 * composant, clôture, copiées des pages modèles ; sur chaque page standard, les éléments du composant (indicateurs,
 * tableau, graphique natif, texte) sont posés dans la zone de contenu, avec la charte extraite. Chaque zone variable
 * porte un nom stable `rise:{id}` (ex. `rise:c02.table`) et figure au manifeste avec sa source de données.
 *
 * Remplissage (à chaque publication) : le template est rouvert, seules les valeurs changent : texte des zones, lignes
 * des tableaux (nombre variable, style conservé), données des graphiques (cache et classeur incorporé).
 */

export interface TemplateField {
  id: string;
  kind: 'text' | 'table' | 'chart' | 'board';
  /** Partie de la diapositive dans le paquet (ex. `ppt/slides/slide3.xml`). */
  slide: string;
  component?: string;
  columns?: string[];
  capacity?: number;
  rowH?: number;
  rowTpl?: [string, string];
  /** Largeur des colonnes (EMU) et taille du texte (pt) : une cellule tient sur une ligne. */
  widths?: number[];
  size?: number;
  /** Zone occupée par l'élément (contrôle visuel). */
  area?: Box;
  /** Tableau (03/10/2026) : colonnes typées, lignes dessinées selon le système de design. */
  cols?: TableColumn[];
  /** Planche redessinée à chaque publication. */
  board?: 'planning' | 'barometer';
  show?: { score: boolean; sentiment: boolean; domains: boolean; themes: boolean };
  /** Texte : nombre de caractères qui tiennent dans la zone (taille et corps de la forme). */
  maxChars?: number;
  chart?: string;
  chartType?: 'bar' | 'line';
  series?: string[];
}
export interface TemplatePage { slide: string; kind: PageKind; section?: number; component?: string }
export interface TemplateManifest { schema: 1; pages: TemplatePage[]; fields: TemplateField[]; /** Jetons du système de design (03/10/2026). */ design?: DesignTokens }
export interface ComposeInput { title: string; sections: Section[]; tokens: Record<string, string> }
export interface FillData {
  text: Record<string, string[]>;
  tables: Record<string, string[][]>;
  charts: Record<string, { categories: string[]; series: Array<{ name: string; values: Array<number | null> }> }>;
  /** Données des planches (Gantt, planning en tableau, baromètre). */
  boards?: Record<string, unknown>;
}

/** Zone variable absente du template (fichier modifié à la main ou endommagé). */
export class TemplateFieldMissing extends Error {
  constructor(readonly field: string) { super(`Zone « ${field} » introuvable dans le template`); }
}

const CHART_CT = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
const XLSX_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const C_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';

// ───────────── Charte des éléments posés ─────────────

export interface Design { primary: string; secondary: string; text: string; muted: string; light: string; font: string; size: number; caption: TextStyle }
const mix = (hex: string, other: string, k: number) => [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k) + parseInt(other.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
/** Couleur « neutre » (gris, quasi noir ou blanc) : saturation faible ou luminosité extrême. */
export const neutral = (hex: string) => {
  const v = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(...v), mn = Math.min(...v), l = (mx + mn) / 2;
  const sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
  return sat < 0.25 || l < 0.06 || l > 0.96;
};

/**
 * Couleurs et police des éléments posés : couleurs réellement utilisées par les pages modèles (page standard d'abord,
 * puis couverture et intercalaire), sinon accents du thème ; texte et police du corps de la page standard.
 */
export function designOf(a: FormatAnalysis, s: SlideAnalysis, others: SlideAnalysis[] = []): Design {
  const used = [...s.palette, ...others.flatMap((o) => o.palette)].filter((c, i, all) => all.indexOf(c) === i && !neutral(c));
  // Palette = couleurs utilisées puis thème : on ne garde que la partie « utilisée » (avant les accents du thème).
  const themeColors = new Set(Object.values(a.theme?.colors ?? {}));
  const brand = used.filter((c) => !themeColors.has(c) || [s, ...others].some((x) => x.elements.some((e) => e.fill?.color === c) || x.background.color === c || x.zones.some((z) => z.style.color === c)));
  const primary = brand[0] ?? a.theme?.colors.accent1 ?? '1D8F86';
  const secondary = brand.find((c) => c !== primary) ?? (a.theme?.colors.accent2 !== primary ? a.theme?.colors.accent2 : undefined) ?? 'F7A41C';
  const text = s.typography.body?.color ?? s.typography.title?.color ?? '1F2124';
  const font = s.typography.body?.font ?? a.theme?.minor ?? 'Calibri';
  const size = Math.min(14, Math.max(10, s.typography.body?.size ?? 12));
  return { primary, secondary, text, muted: mix(text, 'FFFFFF', 0.35), light: mix(primary, 'FFFFFF', 0.9), font, size, caption: { font, size: Math.max(9, size - 2), bold: false, italic: false, color: mix(text, 'FFFFFF', 0.35) } };
}

// ───────────── Éléments : indicateurs, tableau, graphique ─────────────

const rect = (id: number, name: string, b: Box, fill: string, geom = 'rect') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEsc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${b.x}" y="${b.y}"/><a:ext cx="${b.w}" cy="${b.h}"/></a:xfrm><a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;

/** Tuiles d'indicateurs : fond clair, valeur (zone variable) et libellé fixe. */
function kpiTiles(next: () => number, key: string, area: Box, items: Array<{ id: string; label: string }>, d: Design): string {
  const n = items.length, gap = Math.round(area.w * 0.02), tw = Math.floor((area.w - gap * (n - 1)) / n);
  return items.map((it, i) => {
    const b = { x: area.x + i * (tw + gap), y: area.y, w: tw, h: area.h };
    const pad = Math.round(b.h * 0.12);
    const value = { x: b.x + pad, y: b.y + pad, w: b.w - 2 * pad, h: Math.round(b.h * 0.5) };
    const label = { x: b.x + pad, y: value.y + value.h, w: b.w - 2 * pad, h: b.h - value.h - 2 * pad };
    return rect(next(), `Tuile ${it.label}`, b, d.light, 'roundRect')
      + textBox(next(), fieldName(`${key}.kpi.${it.id}`), value, { font: d.font, size: Math.min(28, Math.max(16, Math.round(b.h / 12700 / 3))), bold: true, italic: false, color: d.primary }, ['—'], { anchor: 'b' })
      + textBox(next(), `Libellé ${it.label}`, label, { font: d.font, size: Math.max(9, d.size - 1), bold: false, italic: false, color: d.text }, [it.label]);
  }).join('');
}

const COL_WEIGHT: Record<string, number> = { name: 3.2, code: 0.9, status: 1.2, owner: 1.5, phase: 1.4, body: 1.2, start: 1.3, end: 1.3, date: 1.3, baseline: 1.3, due: 1.3, progress: 1.2, slip: 0.9 };
const cellXml = (text: string, st: { fill: string; color: string; bold: boolean; size: number; font: string; line: string }) =>
  `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>${runProps({ font: st.font, size: st.size, bold: st.bold, italic: false, color: st.color })}<a:t>${text}</a:t></a:r></a:p></a:txBody><a:tcPr marL="68580" marR="68580" marT="34290" marB="34290" anchor="ctr"><a:lnL w="0"><a:noFill/></a:lnL><a:lnR w="0"><a:noFill/></a:lnR><a:lnT w="0"><a:noFill/></a:lnT><a:lnB w="6350"><a:solidFill><a:srgbClr val="${st.line}"/></a:solidFill></a:lnB><a:solidFill><a:srgbClr val="${st.fill}"/></a:solidFill></a:tcPr></a:tc>`;
/** Marqueur de cellule des gabarits de ligne (stockés au manifeste, en JSON). */
const CELL = '{{cellule}}';

/** Tableau natif : en-tête aux couleurs de la charte, lignes alternées ; gabarits de ligne gardés au manifeste. */
function tableFrame(id: number, name: string, area: Box, columns: Array<{ id: string; label: string }>, d: Design) {
  const rowH = Math.round(d.size * 2.1 * 12700);
  const capacity = Math.max(3, Math.floor(area.h / rowH) - 1);
  const weights = columns.map((c) => COL_WEIGHT[c.id] ?? 1), sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.floor((area.w * w) / sum));
  const base = { font: d.font, size: d.size, line: mix(d.text, 'FFFFFF', 0.8) };
  const header = `<a:tr h="${rowH}">${columns.map((c) => cellXml(xmlEsc(c.label), { ...base, fill: d.primary, color: contrastOn(d.primary), bold: true })).join('')}</a:tr>`;
  const row = (fill: string) => `<a:tr h="${rowH}">${columns.map(() => cellXml(CELL, { ...base, fill, color: d.text, bold: false })).join('')}</a:tr>`;
  const rowTpl: [string, string] = [row('FFFFFF'), row(d.light)];
  const xml = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${xmlEsc(name)}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${area.x}" y="${area.y}"/><a:ext cx="${area.w}" cy="${rowH}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${widths.map((w) => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${header}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  return { xml, rowH, capacity, rowTpl, widths };
}

const colLetter = (i: number) => String.fromCharCode(66 + i);
const catXml = (cats: string[]) => `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${cats.length + 1}</c:f><c:strCache><c:ptCount val="${cats.length}"/>${cats.map((c, i) => `<c:pt idx="${i}"><c:v>${xmlEsc(c)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`;
const valXml = (i: number, vals: Array<number | null>) => `<c:val><c:numRef><c:f>Sheet1!$${colLetter(i)}$2:$${colLetter(i)}$${vals.length + 1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, k) => (v === null || v === undefined || Number.isNaN(v) ? '' : `<c:pt idx="${k}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numCache></c:numRef></c:val>`;

/** Graphique natif PowerPoint (histogramme groupé ou courbes), données dans un classeur incorporé. */
/** `bare` : axe des valeurs et quadrillage retirés (valeurs portées par les étiquettes) ; `min` / `max` : échelle fixe. */
interface ChartOpts { legend: boolean; labels: boolean; single: boolean; bare?: boolean; min?: number; max?: number }
function chartXml(type: 'bar' | 'line', series: string[], d: Design, opts: ChartOpts = { legend: true, labels: type === 'bar', single: false }): string {
  const colors = [d.primary, d.secondary, mix(d.text, 'FFFFFF', 0.4), mix(d.primary, '000000', 0.3)];
  const dl = (pos: string) => `<c:dLbls><c:numFmt formatCode="0.0" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000" b="1"><a:solidFill><a:srgbClr val="${d.text}"/></a:solidFill><a:latin typeface="${xmlEsc(d.font)}"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr><c:dLblPos val="${pos}"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
  const txPr = (sz: number) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"><a:solidFill><a:srgbClr val="${d.text}"/></a:solidFill><a:latin typeface="${xmlEsc(d.font)}"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`;
  const ser = series.map((name, i) => {
    const tx = `<c:tx><c:strRef><c:f>Sheet1!$${colLetter(i)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEsc(name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`;
    const c = colors[i % colors.length];
    return type === 'bar'
      ? `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}<c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>${catXml(['—'])}${valXml(i, [0])}</c:ser>`
      : `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}<c:spPr><a:ln w="${opts.single ? 34925 : 28575}" cap="rnd"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="${opts.single ? 8 : 6}"/><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="22225"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></a:ln></c:spPr></c:marker>${opts.labels ? dl('t') : ''}${catXml(['—'])}${valXml(i, [0])}<c:smooth val="0"/></c:ser>`;
  }).join('');
  const plot = type === 'bar'
    ? `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls><c:gapWidth val="80"/><c:overlap val="-10"/><c:axId val="50010001"/><c:axId val="50010002"/></c:barChart>`
    : `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/><c:axId val="50010001"/><c:axId val="50010002"/></c:lineChart>`;
  const grid = mix(d.text, 'FFFFFF', 0.88);
  return `${XML_DECL}<c:chartSpace xmlns:c="${C_NS}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:date1904 val="0"/><c:lang val="fr-FR"/><c:roundedCorners val="0"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>${plot}<c:catAx><c:axId val="50010001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${grid}"/></a:solidFill></a:ln></c:spPr>${txPr(1000)}<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/>${opts.max !== undefined ? `<c:max val="${opts.max}"/>` : ''}${opts.min !== undefined ? `<c:min val="${opts.min}"/>` : ''}</c:scaling><c:delete val="${opts.bare ? 1 : 0}"/><c:axPos val="l"/>${opts.bare ? '' : `<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${grid}"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>`}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(1000)}<c:crossAx val="50010001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${opts.legend ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr(1000)}</c:legend>` : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(1100)}<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
}

/** Classeur incorporé du graphique : catégories en colonne A, une colonne par série (Feuil « Sheet1 »). */
export async function chartWorkbook(categories: string[], series: Array<{ name: string; values: Array<number | null> }>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['', ...series.map((s) => s.name)]);
  categories.forEach((c, i) => ws.addRow([c, ...series.map((s) => s.values[i] ?? null)]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ───────────── Composition ─────────────

/** Zone de contenu de la page standard : zone de texte de la page modèle, sinon proportions usuelles. */
function contentArea(s: SlideAnalysis, kind: PageSource['kind'], size: { cx: number; cy: number }): Box {
  const z = s.zones.find((x) => x.role === 'body') ?? s.zones.find((x) => x.role === 'chart' || x.role === 'table');
  if (z) return { ...z.box };
  const title = s.zones.find((x) => x.role === 'title');
  const est = estimatedZones('standard', size).find((x) => x.role === 'body')!.box;
  if (title && kind === 'PPTX') { const y = title.box.y + title.box.h + Math.round(size.cy * 0.03); return { x: title.box.x, y, w: Math.max(title.box.w, est.w), h: Math.max(size.cy * 0.3, size.cy * 0.9 - y) }; }
  return est;
}

/** Caractères qui tiennent dans une forme : largeur / (0,5 corps) par ligne, hauteur / (1,2 corps) lignes. */
export function capacity(sp: string): number | null {
  const e = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(sp);
  if (!e) return null;
  const sz = Number(/<a:rPr\b[^>]*\bsz="(\d+)"/.exec(sp)?.[1] ?? /<a:defRPr\b[^>]*\bsz="(\d+)"/.exec(sp)?.[1] ?? 1800) / 100;
  const perLine = Math.floor(Number(e[1]) / (sz * 0.5 * 12700)), lines = Math.max(1, Math.floor(Number(e[2]) / (sz * 1.2 * 12700)));
  return Math.max(10, perLine * lines);
}

/** Construit le template : pages copiées des modèles, éléments des composants posés, zones variables nommées. */
export async function composeTemplate(pages: Record<PageKind, PageSource> | null, input: ComposeInput): Promise<{ buf: Buffer; manifest: TemplateManifest }> {
  const def = builtInFormat();
  const src: Record<PageKind, PageSource> = pages ?? (Object.fromEntries((['cover', 'divider', 'standard', 'closing'] as PageKind[]).map((k, i) => [k, { fileId: 'builtin', kind: 'PDF', buf: null, analysis: def.analysis, slide: i + 1 }])) as Record<PageKind, PageSource>);
  const baseRef = (['cover', 'standard', 'divider', 'closing'] as PageKind[]).map((k) => src[k]).find((p) => p.kind === 'PPTX' && p.buf);
  const size = baseRef?.analysis.size ?? src.cover.analysis.size ?? DEFAULT_SIZE;
  const asm = new Assembler();
  await asm.init(baseRef?.fileId ?? null, baseRef?.buf ?? null, size);
  const cache = new Map<string, Src>();
  const blank = await asm.blankLayout();
  const imageMedia = new Map<string, string>();
  const manifest: TemplateManifest = { schema: 1, pages: [], fields: [] };
  let page = 0;
  /** Rôles de chaque page : validés à l'étape B, sinon proposés par règles. */
  const rolesOf = (k: PageKind): RoleMap | null => { const p = src[k], s = p.analysis.slides[p.slide - 1]; return p.kind === 'PPTX' && s.shapes ? p.roles ?? suggestRoles(k, s.shapes, size) : null; };

  /**
   * Page copiée du modèle : rôles appliqués (exemple retiré, texte réécrit dans les formes existantes), puis zones
   * PowerPoint remplies ; `extra` ajoute des éléments (et leurs relations) avant l'écriture.
   */
  const emit = async (kind: PageKind, f: Omit<Fill, 'page' | 'date'>, rv: RoleValues['values'], meta: Omit<TemplatePage, 'slide' | 'kind'> = {}, extra?: (xml: string, rels: RelRow[], done: Set<ShapeRole>) => Promise<string>) => {
    page++;
    const p = src[kind];
    const s = p.analysis.slides[p.slide - 1];
    const names = { date: fieldName('report.date'), ...(f.names ?? {}) };
    const fill: Fill = { ...f, date: input.tokens.date ?? '', page, names };
    let xml: string, rels: RelRow[];
    let done = new Set<ShapeRole>();
    if (p.kind === 'PPTX' && p.buf) {
      const sp = await asm.source(p.fileId, p.buf, cache);
      const t = await asm.templateSlide(sp, p.slide);
      xml = t.xml;
      const roles = rolesOf(kind);
      if (roles) {
        const r = applyRoles(xml, roles, { values: { date: fill.date, pageNumber: String(page), project: input.tokens.projet, client: input.tokens.client, committee: input.tokens.comite, ...rv }, names: { title: names.title, subtitle: names.subtitle, date: names.date, period: fieldName('report.period') } });
        xml = r.xml;
        done = r.done;
      }
      xml = fillPptxSlide(xml, kind, s, { ...fill, title: done.has('title') ? undefined : fill.title, subtitle: done.has('subtitle') ? undefined : fill.subtitle }, size);
      rels = t.rels;
    } else {
      rels = [{ id: 'rId1', type: 'slideLayout', target: blank, external: false }];
      let bgRid: string | null = null;
      if (p.kind === 'IMAGE' && p.buf) {
        if (!imageMedia.has(p.fileId)) imageMedia.set(p.fileId, asm.addMedia(p.buf, p.buf[0] === 0x89 ? 'png' : 'jpeg'));
        rels.push({ id: 'rId2', type: 'image', target: imageMedia.get(p.fileId)!, external: false });
        bgRid = 'rId2';
      }
      xml = syntheticSlide(kind, s, fill, size, bgRid);
    }
    xml = tokens(xml, { ...input.tokens, section: f.title ?? '', page: String(page) });
    if (extra) xml = await extra(xml, rels, done);
    const path = asm.addSlide(xml, rels);
    manifest.pages.push({ slide: path, kind, ...meta });
    return path;
  };

  await emit('cover', { title: input.title, subtitle: '—', names: { subtitle: fieldName('report.subtitle') } }, { title: input.title, subtitle: '—', period: '—' });
  const stdSrc = src.standard, std = stdSrc.analysis.slides[stdSrc.slide - 1];
  const d = designOf(stdSrc.analysis, std, (['cover', 'divider'] as PageKind[]).map((k) => src[k].analysis.slides[src[k].slide - 1]));
  // Système de design des éléments posés (jetons gardés au manifeste : les publications redessinent avec les mêmes).
  // Polices réellement employées par la page (le thème du fichier peut en annoncer d'autres) : titre et texte courant.
  const shapes = (std.shapes ?? []).filter((x) => x.font && !x.font.startsWith('+') && x.text.trim());
  const stdRoleMap = rolesOf('standard'), roleOf = (id: string) => stdRoleMap?.[id];
  const headFont = (shapes.find((x) => roleOf(x.id) === 'title') ?? [...shapes].sort((p, q) => (q.size ?? 0) - (p.size ?? 0))[0])?.font ?? std.typography.title?.font ?? null;
  const counts = new Map<string, number>();
  for (const x of shapes) counts.set(x.font!, (counts.get(x.font!) ?? 0) + x.text.length);
  const bodyFont = [...counts.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? d.font;
  const tk = designTokens({ primary: d.primary, secondary: d.secondary, text: d.text, font: bodyFont, head: headFont, size: d.size });
  manifest.design = tk;
  d.font = tk.font; // graphiques natifs et éléments hérités : même police que le reste
  const divRoles = rolesOf('divider'), stdRoles = rolesOf('standard');
  const hasNumber = !!divRoles && Object.values(divRoles).includes('sectionNumber');
  for (const [si, sec] of input.sections.entries()) {
    const num = String(si + 1).padStart(2, '0'), comps = sec.components.map((c) => COMPONENTS[c.id].label).join(' · ');
    await emit('divider', { title: `${num} · ${sec.title}`, subtitle: comps }, { title: hasNumber ? sec.title : `${num} · ${sec.title}`, sectionNumber: String(si + 1), subtitle: comps, section: sec.title }, { section: si });
    for (const c of sec.components) {
      const cdef = COMPONENTS[c.id];
      const inds = indicatorsOf(c).map((id) => cdef.indicators.find((x) => x.id === id)!);
      const fields: TemplateField[] = [];
      const titleName = fieldName(`${c.key}.title`), captionName = fieldName(`${c.key}.caption`);
      const path = await emit('standard', { title: cdef.label, dropBody: true, names: { title: titleName, subtitle: captionName } }, { title: cdef.label, subtitle: '—', section: sec.title }, { section: si, component: c.key }, async (xml, rels, done) => {
        let id = maxId(xml) + 1;
        const next = () => id++;
        // Zone de contenu : place libérée par le contenu d'exemple, sinon zone de texte du modèle ou proportions usuelles.
        const freed = stdRoles && std.shapes ? exampleArea(std.shapes, stdRoles) : null;
        const head = std.shapes && stdRoles ? Math.max(0, ...std.shapes.filter((x) => ['title', 'subtitle', 'section'].includes(stdRoles[x.id])).map((x) => x.box.y + x.box.h)) : 0;
        let area = freed ? { ...freed, y: Math.max(freed.y, head + Math.round(size.cy * 0.02)) } : contentArea(std, stdSrc.kind, size);
        if (freed) area = { ...area, h: freed.y + freed.h - area.y };
        const add: string[] = [];
        const gap = Math.round(size.cy * 0.02);
        let r: Box = area;
        if (!done.has('subtitle')) {
          const capH = Math.round(Math.min(area.h * 0.12, d.caption.size! * 2.2 * 12700));
          add.push(textBox(next(), captionName, { ...area, h: capH }, d.caption, ['—']));
          r = { x: area.x, y: area.y + capH + gap / 2, w: area.w, h: area.h - capH - gap / 2 };
        }
        const kpis = cdef.parts.includes('kpi') ? inds.filter((x) => !(c.id === 'dashboard' && DASHBOARD_SERIES.includes(x.id))).slice(0, KPI_MAX) : [];
        const second = cdef.parts.find((x) => x !== 'kpi');
        const series = c.id === 'dashboard' ? inds.filter((x) => DASHBOARD_SERIES.includes(x.id)) : inds;
        const hasSecond = !!second && (second !== 'chart' || series.length > 0);
        const draw = new Draw(tk, next());
        const addChart = async (box: Box, type: 'bar' | 'line', names: string[], opts: ChartOpts) => {
          const chartPath = asm.addPart('ppt/charts', 'chart', 'xml', chartXml(type, names, d, opts), CHART_CT);
          const emb = asm.addPart('ppt/embeddings', 'Microsoft_Excel_Worksheet', 'xlsx', await chartWorkbook(['—'], names.map((x) => ({ name: x, values: [0] }))), XLSX_CT, true);
          asm.zip.file(relsPath(chartPath), relsXml([{ id: 'rId1', type: 'package', target: relTarget(chartPath, emb), external: false }]));
          const rid = `rId${Math.max(0, ...rels.map((x) => Number(x.id.replace(/\D/g, '')) || 0)) + 1}`;
          rels.push({ id: rid, type: 'chart', target: chartPath, external: false });
          add.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${draw.id()}" name="${fieldName(`${c.key}.chart`)}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></p:xfrm><a:graphic><a:graphicData uri="${C_NS}"><c:chart xmlns:c="${C_NS}" r:id="${rid}"/></a:graphicData></a:graphic></p:graphicFrame>`);
          return chartPath;
        };
        if (kpis.length) {
          const kh = hasSecond ? Math.round(Math.min(r.h * 0.32, size.cy * 0.19)) : Math.round(Math.min(r.h, size.cy * 0.22));
          add.push(kpiCards(draw, { ...r, h: kh }, kpis.map((k) => ({ id: k.id, label: k.label, field: `${c.key}.kpi.${k.id}` }))));
          r = { ...r, y: r.y + kh + gap, h: r.h - kh - gap };
        }
        if (second === 'text') {
          add.push(draw.text(r, [{ runs: [{ t: '—', size: tk.base, color: tk.ink }] }], 't', fieldName(`${c.key}.text`)));
        } else if (second === 'table') {
          const rowH = Math.round(Math.max(tk.base * 2.25, 20) * 12700);
          const cols: TableColumn[] = (() => { const w = inds.map((x) => COL_WEIGHT[x.id] ?? 1), sum = w.reduce((a, b) => a + b, 0); return inds.map((x, k) => ({ id: x.id, label: x.label, width: Math.floor((r.w * w[k]) / sum), align: ['score', 'slip', 'progress', 'p', 'i', 'start', 'end', 'date', 'baseline', 'due'].includes(x.id) ? 'r' : 'l', kind: COLUMN_KIND[x.id] ?? 'text' })); })();
          const capacity = Math.max(3, Math.floor(r.h / rowH) - 1);
          add.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${draw.id()}" name="${fieldName(`${c.key}.table`)}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${r.x}" y="${r.y}"/><a:ext cx="${r.w}" cy="${rowH}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${cols.map((x) => `<a:gridCol w="${x.width}"/>`).join('')}</a:tblGrid>${tableHeaderRow(draw, cols, rowH)}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`);
          fields.push({ id: `${c.key}.table`, kind: 'table', slide: '', component: c.key, columns: inds.map((x) => x.id), cols, capacity, rowH, widths: cols.map((x) => x.width), size: typeScale(tk).small, area: r });
        } else if (second === 'board') {
          // Planche redessinée à chaque publication (Gantt, planning en tableau, tableau de bord du baromètre).
          const board = c.id === 'barometre' ? 'barometer' : 'planning';
          const show = { score: inds.some((x) => x.id === 'score'), sentiment: inds.some((x) => x.id === 'sentiment'), domains: inds.some((x) => x.id === 'domains'), themes: inds.some((x) => x.id === 'themes') };
          add.push(draw.group(fieldName(`${c.key}.board`), r, draw.sp({ box: { x: r.x, y: r.y, w: 1, h: 1 } })));
          fields.push({ id: `${c.key}.board`, kind: 'board', slide: '', component: c.key, board, area: r, ...(board === 'barometer' ? { show } : {}) });
          if (board === 'barometer' && show.score) {
            const L = barometerLayout(r, show);
            const chartPath = await addChart(L.chart, 'line', ['Score global'], { legend: false, labels: true, single: true, bare: true, min: 0, max: 10 });
            fields.push({ id: `${c.key}.chart`, kind: 'chart', slide: '', component: c.key, chart: chartPath, chartType: 'line', series: ['score'] });
          }
        } else if (second === 'chart' && series.length) {
          const type = cdef.chart ?? 'bar';
          const chartPath = await addChart(r, type, series.map((x) => x.label), { legend: series.length > 1, labels: true, single: series.length === 1 });
          fields.push({ id: `${c.key}.chart`, kind: 'chart', slide: '', component: c.key, chart: chartPath, chartType: type, series: series.map((x) => x.id) });
        }
        id = draw.n;
        return xml.replace(/<\/p:spTree>/, `${add.join('')}</p:spTree>`);
      });
      fields.forEach((f) => manifest.fields.push({ ...f, slide: path }));
    }
  }
  await emit('closing', {}, {});
  // Zones de texte variables : toutes les formes nommées `rise:…` des pages (titre-message, légende, indicateurs,
  // texte, sous-titre, date, période), en plus des tableaux et graphiques déjà déclarés.
  const buf = await asm.finish();
  const z = await JSZip.loadAsync(buf);
  const known = new Set(manifest.fields.map((f) => `${f.id}@${f.slide}`));
  const text: TemplateField[] = [];
  for (const pg of manifest.pages) {
    const xml = await z.file(pg.slide)!.async('string');
    for (const m of xml.matchAll(/<p:sp(?:\s[^>]*)?>(?:(?!<\/p:sp>)[\s\S])*?<\/p:sp>/g)) {
      const id = /<p:cNvPr\b[^>]*\bname="rise:([^"]+)"/.exec(m[0])?.[1];
      if (!id) continue;
      const k = `${id}@${pg.slide}`;
      if (known.has(k)) continue;
      known.add(k);
      text.push({ id, kind: 'text', slide: pg.slide, ...(/^c\d+\./.test(id) ? { component: id.split('.')[0] } : {}), ...(capacity(m[0]) ? { maxChars: capacity(m[0])! } : {}) });
    }
  }
  manifest.fields.push(...text);
  return { buf, manifest };
}

// ───────────── Remplissage ─────────────

const each = (xml: string, re: RegExp, name: string, fn: (block: string) => string) => {
  let found = false;
  const out = xml.replace(re, (b) => (b.includes(`name="${name}"`) ? ((found = true), fn(b)) : b));
  return { out, found };
};
const SP = /<p:sp(?:\s[^>]*)?>(?:(?!<\/p:sp>)[\s\S])*?<\/p:sp>/g;
const FRAME = /<p:graphicFrame(?:\s[^>]*)?>[\s\S]*?<\/p:graphicFrame>/g;

/** Lignes d'un tableau remplacées (gabarits alternés), hauteur du cadre ajustée ; en-tête et colonnes inchangés. */
function fillTable(frame: string, f: TemplateField, rows: string[][], design?: DesignTokens): string {
  // Une ligne par cellule (hauteur fixe : la page garde sa structure) ; texte trop long abrégé « … ».
  const fit = (v: string, j: number) => { const n = f.widths && f.size ? Math.max(4, Math.floor((f.widths[j] - 91440) / (f.size * 0.52 * 12700))) : 200; return v.length > n ? v.slice(0, n - 1).trimEnd() + '…' : v; };
  const kept = rows.slice(0, f.capacity);
  const body = f.cols && design
    ? kept.map((r) => { const d = new Draw(design); const muted = /^(…|Aucune donnée)/.test(String(r[0] ?? '')); return tableRow(d, f.cols!, r.map((v, j) => fit(String(v ?? ''), j)), f.rowH!, { muted }); }).join('')
    : kept.map((r, i) => f.rowTpl![i % 2].split(CELL).reduce((acc, part, j) => (j ? acc + xmlEsc(fit(String(r[j - 1] ?? ''), j - 1)) + part : part), '')).join('');
  const header = /<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/.exec(frame)![0];
  const out = frame.replace(/(<a:tblGrid>[\s\S]*?<\/a:tblGrid>)[\s\S]*?(<\/a:tbl>)/, `$1${header}${body}$2`);
  return out.replace(/(<p:xfrm>[\s\S]*?<a:ext cx="\d+" cy=")\d+(")/, `$1${f.rowH! * (1 + Math.min(rows.length, f.capacity!))}$2`);
}

/** Données d'un graphique natif : catégories et valeurs de chaque série (cache), classeur incorporé régénéré. */
export function fillChartXml(xml: string, categories: string[], series: Array<{ values: Array<number | null> }>): string {
  let i = 0;
  return xml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (ser) => {
    const s = series[i] ?? { values: categories.map(() => null) };
    const out = ser.replace(/<c:cat>[\s\S]*?<\/c:cat>/, catXml(categories)).replace(/<c:val>[\s\S]*?<\/c:val>/, valXml(i, s.values));
    i++;
    return out;
  });
}

/** Publication : le template est rouvert et seules les valeurs des zones variables changent. */
export async function fillTemplate(buf: Buffer, manifest: TemplateManifest, data: FillData): Promise<Buffer> {
  const z = await JSZip.loadAsync(buf);
  const slides = new Map<string, string>();
  const get = async (p: string) => { if (!slides.has(p)) { const f = z.file(p); if (!f) throw new TemplateFieldMissing(p); slides.set(p, await f.async('string')); } return slides.get(p)!; };
  for (const f of manifest.fields) {
    const xml = await get(f.slide);
    const name = fieldName(f.id);
    let r: { out: string; found: boolean };
    if (f.kind === 'text') {
      const lines = data.text[f.id];
      if (!lines) continue;
      // Synthèse (03/10/2026) : message principal puis faits en liste, typographiés par le système de design.
      if (manifest.design && /^c\d+\.text$/.test(f.id)) {
        const d = new Draw(manifest.design);
        r = each(xml, SP, name, (sp) => sp.replace(/<p:txBody>[\s\S]*<\/p:txBody>/, `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${synthesisParas(d, lines).map((x) => d.para(x)).join('')}</p:txBody>`));
      } else r = each(xml, SP, name, (sp) => setText(sp, lines.length ? lines : ['']));
    } else if (f.kind === 'table') {
      const rows = data.tables[f.id];
      if (!rows) continue;
      r = each(xml, FRAME, name, (fr) => fillTable(fr, f, rows, manifest.design));
    } else if (f.kind === 'board') {
      const b = data.boards?.[f.id];
      if (b === undefined) continue;
      // Planche redessinée dans son cadre, avec les mêmes jetons de design (identifiant de groupe conservé).
      const span = topLevelShapes(xml).find((x) => x.tag === 'p:grpSp' && new RegExp(`<p:cNvPr\\b[^>]*\\bname="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(xml.slice(x.start, x.end)));
      if (!span || !manifest.design) { r = { out: xml, found: false }; }
      else {
        const d = new Draw(manifest.design, 6000);
        const a = f.area!;
        const kids = f.board === 'barometer' ? drawBarometer(d, a, b as BarometerData) : (b as GanttData).rows.length > GANTT_MAX_ROWS || (b as { mode?: string }).mode === 'table' ? drawPlanTable(d, a, b as GanttData) : drawGantt(d, a, b as GanttData);
        r = { out: xml.slice(0, span.start) + d.group(name, a, kids, Number(span.id) || d.id()) + xml.slice(span.end), found: true };
      }
    } else {
      const c = data.charts[f.id];
      if (!c) continue;
      let rid: string | null = null;
      r = each(xml, FRAME, name, (fr) => { rid = /<c:chart\b[^>]*r:id="([^"]+)"/.exec(fr)?.[1] ?? null; return fr; });
      if (r.found) {
        const rel = (await readRels(z, f.slide)).find((x) => x.id === rid);
        const chartPath = rel ? resolvePath(f.slide, rel.target) : f.chart!;
        const cf = z.file(chartPath);
        if (!cf) throw new TemplateFieldMissing(f.id);
        z.file(chartPath, fillChartXml(await cf.async('string'), c.categories, c.series));
        const pkg = (await readRels(z, chartPath)).find((x) => x.type === 'package');
        if (pkg) z.file(resolvePath(chartPath, pkg.target), await chartWorkbook(c.categories, c.series));
      }
    }
    if (!r.found) throw new TemplateFieldMissing(f.id);
    slides.set(f.slide, r.out);
  }
  for (const [p, xml] of slides) z.file(p, xml);
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

// ───────────── Contrôle visuel ─────────────

/**
 * Contrôle visuel automatique d'un rapport généré : un élément posé par le générateur (zone `rise:…`, tuile) ne doit
 * ni recouvrir un texte du modèle, ni sortir de la page ; un texte posé doit tenir dans sa zone (estimation : largeur
 * moyenne d'un caractère 0,5 corps, interligne 1,2). Avertissements, avec le numéro de page.
 */
export async function visualCheck(buf: Buffer, manifest: TemplateManifest): Promise<Array<{ severity: 'warning'; message: string; component?: string }>> {
  const z = await JSZip.loadAsync(buf);
  const pres = await z.file('ppt/presentation.xml')!.async('string');
  const [W, H] = (/<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(pres) ?? ['', '12192000', '6858000']).slice(1).map(Number);
  const out: Array<{ severity: 'warning'; message: string; component?: string }> = [];
  for (const [i, pg] of manifest.pages.entries()) {
    const xml = await z.file(pg.slide)!.async('string');
    const shapes = topLevelShapes(xml).map((s) => {
      const b = xml.slice(s.start, s.end);
      const m = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(b);
      const name = /<p:cNvPr\b[^>]*\bname="([^"]*)"/.exec(b)?.[1] ?? '';
      const text = [...b.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((x) => x[1]).join(' ').trim();
      const paras = [...b.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((p) => [...p[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((x) => x[1]).join(''));
      const sz = Number(/<a:rPr\b[^>]*\bsz="(\d+)"/.exec(b)?.[1] ?? 1800) / 100;
      return { name, text, paras, sz, tag: s.tag, box: m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null };
    }).filter((s) => s.box);
    const ours = (n: string) => n.startsWith('rise:') || n.startsWith('Tuile ') || n.startsWith('Libellé ');
    const page = `Page ${i + 1}`;
    const comp = pg.component;
    for (const a of shapes.filter((s) => ours(s.name))) {
      const b = a.box!;
      if (b.x < -W * 0.01 || b.y < -H * 0.01 || b.x + b.w > W * 1.01 || b.y + b.h > H * 1.01) out.push({ severity: 'warning', component: comp, message: `${page} : « ${a.name.replace('rise:', '')} » sort de la page.` });
      for (const o of shapes.filter((s) => !ours(s.name) && s.text)) {
        const c = o.box!;
        const ix = Math.max(0, Math.min(b.x + b.w, c.x + c.w) - Math.max(b.x, c.x)), iy = Math.max(0, Math.min(b.y + b.h, c.y + c.h) - Math.max(b.y, c.y));
        if (ix * iy > 0.15 * Math.min(b.w * b.h, c.w * c.h)) out.push({ severity: 'warning', component: comp, message: `${page} : « ${a.name.replace('rise:', '')} » recouvre le texte du modèle « ${o.text.slice(0, 40)} ».` });
      }
      if (a.tag === 'p:sp' && a.text) {
        const cpl = Math.max(4, Math.floor(b.w / (a.sz * 0.5 * 12700)));
        const lines = a.paras.reduce((n, p) => n + Math.max(1, Math.ceil(p.length / cpl)), 0);
        if (lines * a.sz * 1.2 * 12700 > b.h * 1.1 + a.sz * 12700) out.push({ severity: 'warning', component: comp, message: `${page} : le texte de « ${a.name.replace('rise:', '')} » dépasse probablement de sa zone (${lines} lignes).` });
      }
    }
  }
  return out;
}
