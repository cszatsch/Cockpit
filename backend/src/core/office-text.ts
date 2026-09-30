import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { XMLParser } from 'fast-xml-parser';

/**
 * Lecture des documents Office (Base de connaissance du Cockpit, décision du 30/09/2026) : texte structuré, sans mise en
 * page. Word : titres (styles « Titre n » / « Heading n » ou niveau hiérarchique), paragraphes, puces, tableaux ;
 * PowerPoint : texte de chaque diapositive (titre, zones, tableaux) et notes de l'orateur ; Excel : chaque onglet,
 * ligne par ligne, « en-tête : valeur ».
 */

export class OfficeReadError extends Error {}

/** Nœud de l'arbre XML ordonné (`preserveOrder`) : `{ balise: enfants, ':@': attributs }` ou `{ '#text': … }`. */
type XNode = Record<string, any>;

const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', trimValues: false, processEntities: true, htmlEntities: true });
const tagOf = (n: XNode) => Object.keys(n).find((k) => k !== ':@') ?? '';
const kids = (n: XNode): XNode[] => (Array.isArray(n[tagOf(n)]) ? n[tagOf(n)] : []);
const attr = (n: XNode, a: string): string | undefined => n[':@']?.[a];
/** Premier descendant (profondeur d'abord) portant la balise. */
function find(n: XNode, tag: string): XNode | null {
  for (const c of kids(n)) {
    if (tagOf(c) === tag) return c;
    const f = find(c, tag);
    if (f) return f;
  }
  return null;
}
function findAll(n: XNode, tag: string, out: XNode[] = [], stopAt: string[] = []): XNode[] {
  for (const c of kids(n)) {
    const t = tagOf(c);
    if (t === tag) out.push(c);
    else if (!stopAt.includes(t)) findAll(c, tag, out, stopAt);
  }
  return out;
}
const root = (xml: string): XNode => ({ root: parser.parse(xml) });
const clean = (s: string) => s.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').trim();

async function zipOf(buf: Buffer): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(buf);
  } catch {
    throw new OfficeReadError('Fichier illisible : il est peut-être endommagé.');
  }
}
async function text(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  return f ? f.async('string') : null;
}

// ───────────── Word ─────────────

export type DocxBlock = { kind: 'heading'; level: number; text: string } | { kind: 'para' | 'item'; text: string; depth?: number } | { kind: 'table'; rows: string[][] };

/** Texte d'un paragraphe Word (runs, liens, tabulations, sauts de ligne). */
function runText(p: XNode): string {
  let s = '';
  const walk = (n: XNode) => {
    for (const c of kids(n)) {
      const t = tagOf(c);
      if (t === 'w:t') s += kids(c).map((x) => x['#text'] ?? '').join('');
      else if (t === 'w:tab') s += '\t';
      else if (t === 'w:br' || t === 'w:cr') s += attr(c, 'w:type') === 'page' ? '' : '\n';
      else if (t === 'w:pPr' || t === 'w:rPr' || t === 'w:del' || t === 'w:instrText') continue;
      else walk(c);
    }
  };
  walk(p);
  return clean(s);
}

export async function readDocx(buf: Buffer): Promise<DocxBlock[]> {
  const zip = await zipOf(buf);
  const doc = await text(zip, 'word/document.xml');
  if (!doc) throw new OfficeReadError('Fichier Word illisible (contenu principal absent).');
  // Niveaux de titre : style « heading n » / « Titre n », ou niveau hiérarchique (outlineLvl) du style.
  const levels = new Map<string, number>();
  const styles = await text(zip, 'word/styles.xml');
  if (styles) {
    for (const st of findAll(root(styles), 'w:style')) {
      const id = attr(st, 'w:styleId');
      const name = (attr(find(st, 'w:name') ?? {}, 'w:val') ?? '').toLowerCase();
      const outline = find(st, 'w:outlineLvl');
      const m = /^(?:heading|titre)\s*(\d)$/.exec(name);
      const lvl = m ? +m[1] : outline ? +(attr(outline, 'w:val') ?? 9) + 1 : name === 'title' || name === 'titre' ? 1 : null;
      if (id && lvl && lvl <= 9) levels.set(id, lvl);
    }
  }
  const body = find(root(doc), 'w:body');
  const out: DocxBlock[] = [];
  const para = (p: XNode) => {
    const t = runText(p);
    if (!t) return;
    const pPr = find(p, 'w:pPr');
    const style = pPr ? attr(find(pPr, 'w:pStyle') ?? {}, 'w:val') : undefined;
    const outline = pPr ? find(pPr, 'w:outlineLvl') : null;
    const lvl = (style && levels.get(style)) ?? (outline ? +(attr(outline, 'w:val') ?? 9) + 1 : null);
    if (lvl && lvl <= 9 && t.length <= 200) return out.push({ kind: 'heading', level: lvl, text: t });
    const num = pPr ? find(pPr, 'w:numPr') : null;
    if (num) return out.push({ kind: 'item', text: t, depth: +(attr(find(num, 'w:ilvl') ?? {}, 'w:val') ?? 0) + 1 });
    out.push({ kind: 'para', text: t });
  };
  const walk = (n: XNode) => {
    for (const c of kids(n)) {
      const t = tagOf(c);
      if (t === 'w:p') para(c);
      else if (t === 'w:tbl') {
        const rows = findAll(c, 'w:tr', [], ['w:tbl']).map((tr) => findAll(tr, 'w:tc', [], ['w:tbl']).map((tc) => findAll(tc, 'w:p').map(runText).filter(Boolean).join(' ')));
        if (rows.some((r) => r.some(Boolean))) out.push({ kind: 'table', rows });
      } else if (t === 'w:sdt' || t === 'w:sdtContent' || t === 'w:customXml' || t === 'w:ins') walk(c);
    }
  };
  if (body) walk(body);
  return out;
}

/** Tableau → lignes lisibles « en-tête : valeur ; … » (première ligne = en-têtes si elle en a l'air). */
export function tableLines(rows: string[][]): string[] {
  const filled = rows.filter((r) => r.some((c) => c.trim()));
  if (!filled.length) return [];
  const [head, ...rest] = filled;
  const headed = rest.length > 0 && head.filter(Boolean).length >= Math.min(2, head.length) && head.every((h) => h.length <= 80);
  if (!headed) return filled.map((r) => r.filter(Boolean).join(' ; '));
  return rest.map((r) => r.map((c, i) => (c ? (head[i] ? `${head[i]} : ${c}` : c) : '')).filter(Boolean).join(' ; ')).filter(Boolean);
}

// ───────────── PowerPoint ─────────────

export interface PptxSlide { n: number; title: string; lines: string[]; notes: string[]; hidden: boolean }

const relsOf = async (zip: JSZip, path: string): Promise<Map<string, { target: string; type: string }>> => {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const xml = await text(zip, `${dir}/_rels/${path.slice(path.lastIndexOf('/') + 1)}.rels`);
  const m = new Map<string, { target: string; type: string }>();
  if (!xml) return m;
  for (const r of findAll(root(xml), 'Relationship')) {
    const target = attr(r, 'Target') ?? '';
    m.set(attr(r, 'Id') ?? '', { target: resolve(dir, target), type: attr(r, 'Type') ?? '' });
  }
  return m;
};
function resolve(dir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = dir.split('/');
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
/** Paragraphes (a:p) d'une zone de texte, ou d'un tableau (une ligne par rangée). */
function drawingLines(n: XNode): string[] {
  const out: string[] = [];
  for (const c of kids(n)) {
    const t = tagOf(c);
    if (t === 'a:tbl') {
      const rows = findAll(c, 'a:tr').map((tr) => findAll(tr, 'a:tc').map((tc) => findAll(tc, 'a:p').map(aText).filter(Boolean).join(' ')));
      out.push(...tableLines(rows));
    } else if (t === 'a:p') {
      const s = aText(c);
      if (s) out.push(s);
    } else out.push(...drawingLines(c));
  }
  return out;
}
function aText(p: XNode): string {
  let s = '';
  const walk = (n: XNode) => {
    for (const c of kids(n)) {
      const t = tagOf(c);
      if (t === 'a:t') s += kids(c).map((x) => x['#text'] ?? '').join('');
      else if (t === 'a:br') s += '\n';
      else if (t !== 'a:rPr' && t !== 'a:pPr') walk(c);
    }
  };
  walk(p);
  return clean(s);
}
const phType = (sp: XNode) => attr(find(sp, 'p:ph') ?? {}, 'type');

export async function readPptx(buf: Buffer): Promise<PptxSlide[]> {
  const zip = await zipOf(buf);
  const pres = await text(zip, 'ppt/presentation.xml');
  if (!pres) throw new OfficeReadError('Fichier PowerPoint illisible (présentation absente).');
  const rels = await relsOf(zip, 'ppt/presentation.xml');
  const ids = findAll(root(pres), 'p:sldId').map((s) => attr(s, 'r:id') ?? '');
  const slides: PptxSlide[] = [];
  for (const [i, rid] of ids.entries()) {
    const path = rels.get(rid)?.target;
    const xml = path ? await text(zip, path) : null;
    if (!path || !xml) continue;
    const sld = find(root(xml), 'p:sld');
    const tree = sld ? find(sld, 'p:spTree') : null;
    let title = '';
    const lines: string[] = [];
    for (const sp of tree ? findAll(tree, 'p:sp').concat(findAll(tree, 'p:graphicFrame')) : []) {
      const type = phType(sp);
      if (type === 'sldNum' || type === 'dt' || type === 'ftr') continue;
      const ls = drawingLines(sp);
      if (!title && (type === 'title' || type === 'ctrTitle') && ls.length) title = ls.join(' ');
      else lines.push(...ls);
    }
    // Notes de l'orateur : zone « body » de la page de notes liée à la diapositive.
    const notes: string[] = [];
    const notesPath = [...(await relsOf(zip, path)).values()].find((r) => r.type.endsWith('/notesSlide'))?.target;
    const nx = notesPath ? await text(zip, notesPath) : null;
    if (nx) for (const sp of findAll(root(nx), 'p:sp')) if (phType(sp) === 'body') notes.push(...drawingLines(sp));
    slides.push({ n: i + 1, title, lines, notes, hidden: attr(sld ?? {}, 'show') === '0' });
  }
  return slides;
}

// ───────────── Excel ─────────────

export interface XlsxSheet { name: string; header: string[] | null; rows: Array<{ n: number; text: string }>; truncated: boolean }

/** Lignes lues au plus par classeur (au-delà : extraction partielle, signalée). */
export const XLSX_MAX_ROWS = 20_000;

function cellText(v: ExcelJS.CellValue, fallback: string): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v && typeof v === 'object') {
    if ('result' in v) return cellText((v as any).result, fallback);
    if ('richText' in v) return (v as any).richText.map((r: any) => r.text).join('');
    if ('text' in v) return String((v as any).text);
    if ('error' in v) return '';
  }
  return fallback;
}

export async function readXlsx(buf: Buffer): Promise<XlsxSheet[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as any);
  } catch {
    throw new OfficeReadError('Classeur Excel illisible : il est peut-être endommagé.');
  }
  let budget = XLSX_MAX_ROWS;
  const out: XlsxSheet[] = [];
  wb.eachSheet((ws) => {
    const raw: Array<{ n: number; cells: string[] }> = [];
    let truncated = false;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (budget <= 0) { truncated = true; return; }
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (c, col) => { cells[col - 1] = clean(cellText(c.value, c.text ?? '')); });
      if (cells.some(Boolean)) { raw.push({ n, cells: Array.from(cells, (x) => x ?? '') }); budget--; }
    });
    if (!raw.length) return;
    // En-têtes : première ligne non vide, si elle est faite de libellés (texte court, pas que des nombres).
    const first = raw[0].cells;
    const isHeader = raw.length > 1 && first.filter(Boolean).length >= 1 && first.every((c) => c.length <= 80) && first.filter(Boolean).some((c) => !/^-?[\d\s.,%€]+$/.test(c));
    const header = isHeader ? first : null;
    const rows = (isHeader ? raw.slice(1) : raw).map((r) => ({
      n: r.n,
      text: r.cells.map((c, i) => (c ? (header?.[i] ? `${header[i]} : ${c}` : c) : '')).filter(Boolean).join(' ; '),
    })).filter((r) => r.text);
    out.push({ name: ws.name, header, rows, truncated });
  });
  return out;
}
