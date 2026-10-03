import {
  Box, DEFAULT_SIZE, EMU_PER_GUIDE_UNIT, EMU_PER_PT, Fill, FixedElement, FORMAT_EMPTY, FORMAT_EXTENSIONS, FORMAT_IMAGE_UNREADABLE, FORMAT_MAX_SLIDES, FORMAT_NO_SLIDE, FORMAT_OLD_PPT,
  FORMAT_PPTX_UNREADABLE, FORMAT_PROTECTED, FORMAT_REFUSED, FormatAnalysis, FormatFileKind, FormatReadError, IMAGE_MIN_WIDTH_PX, ShapeInfo, SlideAnalysis, TextStyle, Typography, Zone, ZoneRole,
  elementRole, formatMismatch, imageTooSmall, marginsOf, paletteOf,
} from '../domain/report-format';
import { attr, child, ColorCtx, colorOf, find, findAll, kids, OoxmlPackage, path, tagOf, textOf, XNode } from './ooxml';

/**
 * Analyse des pages modèles du Format du rapport : PowerPoint (lecture complète du masque, de la disposition et de la
 * diapositive), PDF (dimensions, aplats, positions des images, textes et polices) et image (fond plein écran).
 */

/** Type réel d'un fichier, d'après ses premiers octets. */
export function sniff(buf: Buffer): 'ZIP' | 'OLE' | 'PDF' | 'PNG' | 'JPEG' | null {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'ZIP';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'OLE';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'PDF';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'PNG';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'JPEG';
  return null;
}

/** Type de fichier accepté (contrôle de l'extension puis du contenu réel). */
export function formatKindOf(buf: Buffer, fileName: string): FormatFileKind {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (!buf.length) throw new FormatReadError(FORMAT_EMPTY);
  if (ext === 'ppt') throw new FormatReadError(FORMAT_OLD_PPT);
  const kind = FORMAT_EXTENSIONS[ext];
  if (!kind) throw new FormatReadError(FORMAT_REFUSED);
  const real = sniff(buf);
  if (kind === 'PPTX' && real === 'OLE') throw new FormatReadError(FORMAT_PROTECTED);
  const expected = kind === 'PPTX' ? ['ZIP'] : kind === 'PDF' ? ['PDF'] : ['PNG', 'JPEG'];
  if (!real || !expected.includes(real)) throw new FormatReadError(real ? formatMismatch(ext, real) : kind === 'IMAGE' ? FORMAT_IMAGE_UNREADABLE : kind === 'PDF' ? 'PDF illisible ou endommagé : exportez-le de nouveau puis réessayez.' : FORMAT_PPTX_UNREADABLE);
  return kind;
}

export async function analyzeFormatFile(buf: Buffer, fileName: string): Promise<FormatAnalysis> {
  const kind = formatKindOf(buf, fileName);
  if (kind === 'PPTX') return analyzePptx(buf);
  if (kind === 'PDF') return analyzePdf(buf);
  return analyzeImage(buf);
}

// ───────────── PowerPoint ─────────────

const num = (v: string | undefined, d = 0) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
interface Xf { off: [number, number]; ext: [number, number]; chOff: [number, number]; chExt: [number, number] }
const IDENT = { sx: 1, sy: 1, dx: 0, dy: 0 };
type Tr = typeof IDENT;
const apply = (t: Tr, b: Box): Box => ({ x: Math.round(t.dx + b.x * t.sx), y: Math.round(t.dy + b.y * t.sy), w: Math.round(b.w * t.sx), h: Math.round(b.h * t.sy) });
function xfOf(x: XNode | null): Xf | null {
  if (!x) return null;
  const o = child(x, 'a:off'), e = child(x, 'a:ext');
  if (!o || !e) return null;
  const co = child(x, 'a:chOff'), ce = child(x, 'a:chExt');
  return { off: [num(attr(o, 'x')), num(attr(o, 'y'))], ext: [num(attr(e, 'cx')), num(attr(e, 'cy'))], chOff: [num(attr(co, 'x')), num(attr(co, 'y'))], chExt: [num(attr(ce, 'cx'), 1), num(attr(ce, 'cy'), 1)] };
}
const boxOf = (xf: Xf): Box => ({ x: xf.off[0], y: xf.off[1], w: xf.ext[0], h: xf.ext[1] });

/** Placeholder : type normalisé et index. */
interface Ph { type: string; idx: string | null }
function phOf(nvPr: XNode | null): Ph | null {
  const ph = child(nvPr, 'p:ph');
  if (!ph) return null;
  return { type: attr(ph, 'type') ?? 'body', idx: attr(ph, 'idx') ?? null };
}
const PH_ROLE: Record<string, ZoneRole> = { title: 'title', ctrTitle: 'title', subTitle: 'subtitle', body: 'body', obj: 'body', dt: 'date', sldNum: 'pageNumber', ftr: 'footer', pic: 'picture', chart: 'chart', tbl: 'table', media: 'body', clipArt: 'picture', dgm: 'chart' };
/** Famille de placeholder pour l'héritage depuis le masque (titre, corps, date, numéro, pied). */
const phFamily = (t: string) => (t === 'ctrTitle' || t === 'title' ? 'title' : ['dt', 'sldNum', 'ftr'].includes(t) ? t : 'body');

interface PhDef { ph: Ph; xf: Xf | null; node: XNode }
interface Part { path: string; doc: XNode; origin: 'master' | 'layout' | 'slide' }
interface Ctx { pkg: OoxmlPackage; size: { cx: number; cy: number }; color: ColorCtx; major: string | null; minor: string | null; theme: XNode | null; themePath: string | null; warnings: Set<string>; fonts: Set<string>; colors: string[]; masterDoc: () => XNode | null }

function emptyStyle(): TextStyle { return { font: null, size: null, bold: false, italic: false, color: null }; }
interface PartialStyle { font?: string; size?: number; bold?: boolean; italic?: boolean; color?: string }
function rprStyle(rpr: XNode | null, c: Ctx): PartialStyle {
  if (!rpr) return {};
  const out: PartialStyle = {};
  const sz = attr(rpr, 'sz');
  if (sz) out.size = num(sz) / 100;
  if (attr(rpr, 'b') !== undefined) out.bold = attr(rpr, 'b') === '1' || attr(rpr, 'b') === 'true';
  if (attr(rpr, 'i') !== undefined) out.italic = attr(rpr, 'i') === '1' || attr(rpr, 'i') === 'true';
  const latin = attr(child(rpr, 'a:latin'), 'typeface');
  if (latin) out.font = latin === '+mj-lt' ? c.major ?? undefined : latin === '+mn-lt' ? c.minor ?? undefined : latin;
  const col = colorOf(child(rpr, 'a:solidFill'), c.color);
  if (col) out.color = col.color;
  return out;
}
const merge = (...ss: PartialStyle[]): PartialStyle => ss.reduce((acc, s) => ({ ...s, ...acc }), {} as PartialStyle);
/** Style de niveau 1 d'une liste de styles (`a:lstStyle`, `p:titleStyle`…). */
const lvl1 = (lst: XNode | null, c: Ctx) => rprStyle(path(lst, 'a:lvl1pPr', 'a:defRPr'), c);
/** Style du texte d'une forme : premier run, puis fin de paragraphe, puis styles de la forme. */
function shapeStyle(sp: XNode, c: Ctx): PartialStyle {
  const tx = child(sp, 'p:txBody');
  if (!tx) return {};
  const firstP = child(tx, 'a:p');
  const run = kids(firstP).find((k) => tagOf(k) === 'a:r' || tagOf(k) === 'a:fld');
  return merge(rprStyle(child(run, 'a:rPr'), c), rprStyle(child(firstP, 'a:endParaRPr'), c), rprStyle(path(firstP, 'a:pPr', 'a:defRPr'), c), lvl1(child(tx, 'a:lstStyle'), c));
}
const toStyle = (p: PartialStyle): TextStyle => ({ ...emptyStyle(), ...p, font: p.font ?? null, size: p.size ?? null, color: p.color ?? null, bold: !!p.bold, italic: !!p.italic });

async function fillOf(spPr: XNode | null, part: string, c: Ctx): Promise<Fill | undefined> {
  for (const k of kids(spPr)) {
    const t = tagOf(k);
    if (t === 'a:noFill') return { type: 'none' };
    if (t === 'a:solidFill') { const col = colorOf(k, c.color); return col ? { type: 'solid', color: col.color, ...(col.alpha !== undefined ? { alpha: col.alpha } : {}) } : undefined; }
    if (t === 'a:gradFill') {
      const stops = kids(child(k, 'a:gsLst')).map((g) => ({ pos: num(attr(g, 'pos')) / 100000, color: colorOf(g, c.color)?.color ?? 'FFFFFF' })).sort((a, b) => a.pos - b.pos);
      const lin = child(k, 'a:lin');
      return { type: 'gradient', stops, angle: lin ? num(attr(lin, 'ang')) / 60000 : 90 };
    }
    if (t === 'a:blipFill') {
      const rid = attr(child(k, 'a:blip'), 'r:embed');
      const img = rid ? await c.pkg.target(part, rid) : null;
      return img ? { type: 'image', image: img } : undefined;
    }
    if (t === 'a:pattFill') { const fg = colorOf(child(k, 'a:fgClr'), c.color); return fg ? { type: 'solid', color: fg.color } : undefined; }
  }
  return undefined;
}
function lineOf(spPr: XNode | null, style: XNode | null, c: Ctx): string | null {
  const ln = child(spPr, 'a:ln');
  if (ln) {
    if (child(ln, 'a:noFill')) return null;
    const col = colorOf(child(ln, 'a:solidFill'), c.color);
    if (col) return col.color;
  }
  const ref = child(style, 'a:lnRef');
  return ref && attr(ref, 'idx') !== '0' ? colorOf(ref, c.color)?.color ?? null : null;
}

/** Contenu d'un tableau (aperçu) : texte des cellules, largeurs, hauteurs, couleur de fond et de texte par ligne. */
function tableOf(tbl: XNode | null, c: Ctx): NonNullable<FixedElement['table']> | undefined {
  if (!tbl) return undefined;
  const widths = kids(child(tbl, 'a:tblGrid')).map((g) => num(attr(g, 'w')));
  const trs = kids(tbl).filter((k) => tagOf(k) === 'a:tr');
  const first = (tr: XNode) => kids(tr).find((k) => tagOf(k) === 'a:tc');
  return {
    widths,
    heights: trs.map((r) => num(attr(r, 'h'))),
    rows: trs.map((r) => kids(r).filter((k) => tagOf(k) === 'a:tc').map((tc) => textOf(child(tc, 'a:txBody')))),
    fills: trs.map((r) => colorOf(child(child(first(r), 'a:tcPr'), 'a:solidFill'), c.color)?.color ?? null),
    colors: trs.map((r) => rprStyle(find(first(r), 'a:rPr'), c).color ?? null),
    size: rprStyle(find(trs[1] ?? trs[0], 'a:rPr'), c).size ?? null,
    font: rprStyle(find(trs[0], 'a:rPr'), c).font ?? null,
  };
}

/** Données d'un graphique natif (aperçu) : type, catégories, séries (valeurs du cache, couleur). */
async function chartOf(pkg: OoxmlPackage, p: string, c: Ctx): Promise<FixedElement['chart'] | null> {
  const x = await pkg.xml(p);
  const plot = find(x, 'c:plotArea');
  const typeNode = kids(plot).find((k) => /^c:(bar|line|area|pie|doughnut)Chart$/.test(tagOf(k)));
  if (!typeNode) return null;
  const pts = (n: XNode | null) => findAll(n, 'c:pt').map((pt) => ({ i: num(attr(pt, 'idx')), v: kids(child(pt, 'c:v')).map((t) => t['#text'] ?? '').join('') }));
  const sers = kids(typeNode).filter((k) => tagOf(k) === 'c:ser');
  const cats = sers[0] ? pts(child(sers[0], 'c:cat')) : [];
  const n = Math.max(cats.length ? Math.max(...cats.map((q) => q.i)) + 1 : 0, ...sers.map((s) => { const v = pts(child(s, 'c:val')); return v.length ? Math.max(...v.map((q) => q.i)) + 1 : 0; }));
  return {
    type: tagOf(typeNode) === 'c:lineChart' ? 'line' : 'bar',
    categories: Array.from({ length: n }, (_, i) => cats.find((q) => q.i === i)?.v ?? ''),
    series: sers.map((s) => {
      const v = pts(child(s, 'c:val'));
      const sp = child(s, 'c:spPr');
      return { name: pts(child(s, 'c:tx')).map((q) => q.v).join(''), values: Array.from({ length: n }, (_, i) => { const q = v.find((y) => y.i === i); return q && q.v !== '' ? Number(q.v) : null; }), color: colorOf(child(sp, 'a:solidFill'), c.color)?.color ?? colorOf(child(child(sp, 'a:ln'), 'a:solidFill'), c.color)?.color ?? null };
    }),
  };
}

/** Fond d'une partie (`p:bg`) : propriétés explicites, ou référence au style de fond du thème. */
async function backgroundOf(p: Part, c: Ctx): Promise<Fill | null> {
  const bg = path(p.doc, 'p:cSld', 'p:bg');
  if (!bg) return null;
  const pr = child(bg, 'p:bgPr');
  if (pr) return (await fillOf(pr, p.path, c)) ?? null;
  const ref = child(bg, 'p:bgRef');
  if (ref) {
    const col = colorOf(ref, c.color);
    const idx = num(attr(ref, 'idx'));
    const styles = kids(path(c.theme, 'a:themeElements', 'a:fmtScheme', 'a:bgFillStyleLst'));
    const st = idx >= 1001 ? styles[idx - 1001] : null;
    if (st) {
      const f = await fillOf({ x: [st] }, c.themePath ?? p.path, { ...c, color: { ...c.color, ph: col?.color } });
      if (f) return f;
    }
    return col ? { type: 'solid', color: col.color } : null;
  }
  return null;
}

/** Éléments fixes et placeholders d'une arborescence de formes (groupes aplatis, contenu de repli des `mc:AlternateContent`). */
async function walk(tree: XNode | null, p: Part, c: Ctx, tr: Tr, out: { elements: FixedElement[]; phs: PhDef[] }) {
  for (let n of kids(tree)) {
    if (tagOf(n) === 'mc:AlternateContent') {
      const alt = child(n, 'mc:Fallback') ?? child(n, 'mc:Choice');
      if (!alt) continue;
      await walk(alt, p, c, tr, out);
      continue;
    }
    const t = tagOf(n);
    if (t === 'p:grpSp') {
      const xf = xfOf(child(child(n, 'p:grpSpPr'), 'a:xfrm'));
      let inner = tr;
      if (xf) {
        const sx = xf.chExt[0] ? xf.ext[0] / xf.chExt[0] : 1, sy = xf.chExt[1] ? xf.ext[1] / xf.chExt[1] : 1;
        inner = { sx: tr.sx * sx, sy: tr.sy * sy, dx: tr.dx + tr.sx * (xf.off[0] - xf.chOff[0] * sx), dy: tr.dy + tr.sy * (xf.off[1] - xf.chOff[1] * sy) };
      }
      await walk(n, p, c, inner, out);
      continue;
    }
    if (t === 'p:sp' || t === 'p:cxnSp') {
      const nv = child(n, t === 'p:sp' ? 'p:nvSpPr' : 'p:nvCxnSpPr');
      const name = attr(child(nv, 'p:cNvPr'), 'name') ?? '';
      const spPr = child(n, 'p:spPr');
      const xf = xfOf(child(spPr, 'a:xfrm'));
      const ph = phOf(child(nv, 'p:nvPr'));
      if (ph) { out.phs.push({ ph, xf: xf ? { ...xf, off: [apply(tr, boxOf(xf)).x, apply(tr, boxOf(xf)).y], ext: [apply(tr, boxOf(xf)).w, apply(tr, boxOf(xf)).h] } : null, node: n }); continue; }
      if (!xf) continue;
      const box = apply(tr, boxOf(xf));
      const style = child(n, 'p:style');
      const geom = attr(child(spPr, 'a:prstGeom'), 'prst') ?? (child(spPr, 'a:custGeom') ? 'custom' : 'rect');
      let fill = await fillOf(spPr, p.path, c);
      if (!fill) { const ref = child(style, 'a:fillRef'); const col = ref && attr(ref, 'idx') !== '0' ? colorOf(ref, c.color) : null; fill = col ? { type: 'solid', color: col.color } : undefined; }
      const line = lineOf(spPr, style, c);
      const text = textOf(child(n, 'p:txBody'));
      const isLine = t === 'p:cxnSp' || ['line', 'straightConnector1', 'bentConnector2', 'bentConnector3'].includes(geom);
      const visibleFill = fill && fill.type !== 'none';
      const kind: FixedElement['kind'] = isLine ? 'line' : !visibleFill && !line && text ? 'text' : 'shape';
      if (kind === 'shape' && !visibleFill && !line) continue; // forme invisible
      const st = text ? toStyle(merge(shapeStyle(n, c), lvl1(path(c.masterDoc(), 'p:txStyles', 'p:otherStyle'), c), { font: c.minor ?? undefined })) : undefined;
      if (st?.font) c.fonts.add(st.font);
      if (fill?.type === 'solid') c.colors.push(fill.color!);
      if (st?.color) c.colors.push(st.color);
      if (geom === 'custom') c.warnings.add('Forme libre : reprise à l’identique dans le rapport, approchée par un rectangle dans l’aperçu.');
      out.elements.push({ kind, role: elementRole(kind, box, c.size, fill?.alpha), name, box, rot: num(attr(child(spPr, 'a:xfrm'), 'rot')) / 60000 || undefined, geometry: geom, fill, line, ...(text ? { text, style: st } : {}), origin: p.origin });
      continue;
    }
    if (t === 'p:pic') {
      const nv = child(n, 'p:nvPicPr');
      const ph = phOf(child(nv, 'p:nvPr'));
      const spPr = child(n, 'p:spPr');
      const xf = xfOf(child(spPr, 'a:xfrm'));
      if (ph) { out.phs.push({ ph, xf, node: n }); continue; }
      if (!xf) continue;
      const blip = child(child(n, 'p:blipFill'), 'a:blip');
      const rid = attr(blip, 'r:embed');
      const img = rid ? await c.pkg.target(p.path, rid) : null;
      const amt = attr(child(blip, 'a:alphaModFix'), 'amt');
      const alpha = amt ? num(amt) / 100000 : undefined;
      if (img && /\.(emf|wmf)$/i.test(img)) c.warnings.add('Image au format EMF / WMF : reprise à l’identique dans le rapport, mais non affichée dans l’aperçu.');
      const box = apply(tr, boxOf(xf));
      out.elements.push({ kind: 'image', role: elementRole('image', box, c.size, alpha), name: attr(child(nv, 'p:cNvPr'), 'name') ?? '', box, rot: num(attr(child(spPr, 'a:xfrm'), 'rot')) / 60000 || undefined, image: img ?? undefined, ...(alpha !== undefined ? { fill: { type: 'none', alpha } } : {}), origin: p.origin });
      continue;
    }
    if (t === 'p:graphicFrame') {
      const nv = child(n, 'p:nvGraphicFramePr');
      const ph = phOf(child(nv, 'p:nvPr'));
      const xf = xfOf(child(n, 'p:xfrm'));
      const uri = attr(path(n, 'a:graphic', 'a:graphicData'), 'uri') ?? '';
      if (ph) { out.phs.push({ ph, xf, node: n }); continue; }
      if (!xf) continue;
      const kind = uri.includes('table') ? 'table' : 'chart';
      const el: FixedElement = { kind, role: kind, name: attr(child(nv, 'p:cNvPr'), 'name') ?? '', box: apply(tr, boxOf(xf)), origin: p.origin };
      if (kind === 'table') el.table = tableOf(find(n, 'a:tbl'), c);
      else { const rid = attr(find(n, 'c:chart'), 'r:id'); const cp = rid ? await c.pkg.target(p.path, rid) : null; if (cp) el.chart = (await chartOf(c.pkg, cp, c)) ?? undefined; }
      out.elements.push(el);
    }
  }
}


async function themeOf(pkg: OoxmlPackage, themePath: string | null) {
  const theme = themePath ? await pkg.xml(themePath) : null;
  const scheme: Record<string, string> = {};
  for (const k of kids(path(theme, 'a:themeElements', 'a:clrScheme'))) {
    const col = colorOf(k, { scheme: {}, map: {} });
    if (col) scheme[tagOf(k).replace('a:', '')] = col.color;
  }
  const fs = path(theme, 'a:themeElements', 'a:fontScheme');
  return { theme, path: themePath, scheme, major: attr(path(fs, 'a:majorFont', 'a:latin'), 'typeface') ?? null, minor: attr(path(fs, 'a:minorFont', 'a:latin'), 'typeface') ?? null };
}

export async function analyzePptx(buf: Buffer): Promise<FormatAnalysis> {
  let pkg: OoxmlPackage;
  try { pkg = await OoxmlPackage.load(buf); } catch { throw new FormatReadError(FORMAT_PPTX_UNREADABLE); }
  const presPath = 'ppt/presentation.xml';
  const pres = await pkg.xml(presPath).catch(() => null);
  if (!pres || tagOf(pres) !== 'p:presentation') throw new FormatReadError(FORMAT_PPTX_UNREADABLE);
  const sz = child(pres, 'p:sldSz');
  const size = { cx: num(attr(sz, 'cx'), DEFAULT_SIZE.cx), cy: num(attr(sz, 'cy'), DEFAULT_SIZE.cy) };
  const slidePaths: string[] = [];
  for (const s of kids(child(pres, 'p:sldIdLst'))) {
    const t = await pkg.target(presPath, attr(s, 'r:id') ?? '');
    if (t && pkg.has(t)) slidePaths.push(t);
  }
  if (!slidePaths.length) throw new FormatReadError(FORMAT_NO_SLIDE);
  const embeddedFonts = findAll(child(pres, 'p:embeddedFontLst'), 'p:font').map((f) => attr(f, 'typeface') ?? '').filter(Boolean);
  const guides = { x: [] as number[], y: [] as number[] };
  for (const g of findAll(pres, 'p15:guide')) (attr(g, 'orient') === 'vert' ? guides.x : guides.y).push(Math.round(num(attr(g, 'pos')) * EMU_PER_GUIDE_UNIT));
  const warnings: string[] = [];
  if (slidePaths.length > FORMAT_MAX_SLIDES) warnings.push(`Seules les ${FORMAT_MAX_SLIDES} premières diapositives sont analysées.`);

  let firstTheme: FormatAnalysis['theme'] = null;
  const slides: SlideAnalysis[] = [];
  for (const [i, sp] of slidePaths.slice(0, FORMAT_MAX_SLIDES).entries()) {
    try {
      slides.push(await analyzeSlide(pkg, sp, i + 1, size, (t) => { if (!firstTheme) firstTheme = t; }));
    } catch {
      throw new FormatReadError(`Diapositive ${i + 1} illisible : ${FORMAT_PPTX_UNREADABLE}`);
    }
  }
  return { kind: 'PPTX', size, theme: firstTheme, guides, embeddedFonts, slides, warnings };
}

/** Formes de premier niveau de la diapositive (groupes entiers), avec texte, corps et position (rôles, 03/10/2026). */
function inventory(tree: XNode | null, zones: Zone[], c: Ctx): ShapeInfo[] {
  const NV: Record<string, string> = { 'p:sp': 'p:nvSpPr', 'p:pic': 'p:nvPicPr', 'p:grpSp': 'p:nvGrpSpPr', 'p:graphicFrame': 'p:nvGraphicFramePr', 'p:cxnSp': 'p:nvCxnSpPr' };
  const out: ShapeInfo[] = [];
  for (let n of kids(tree)) {
    if (tagOf(n) === 'mc:AlternateContent') n = kids(child(n, 'mc:Fallback') ?? child(n, 'mc:Choice')).find((k) => NV[tagOf(k)]) ?? n;
    const t = tagOf(n);
    if (!NV[t]) continue;
    const nv = child(n, NV[t]);
    const cnv = child(nv, 'p:cNvPr');
    const id = attr(cnv, 'id');
    if (!id) continue;
    const ph = phOf(child(nv, 'p:nvPr'));
    const xf = t === 'p:graphicFrame' ? xfOf(child(n, 'p:xfrm')) : t === 'p:grpSp' ? xfOf(child(child(n, 'p:grpSpPr'), 'a:xfrm')) : xfOf(child(child(n, 'p:spPr'), 'a:xfrm'));
    const zone = ph ? zones.find((z) => z.ph && z.ph.type === ph.type && z.ph.idx === ph.idx && z.origin === 'slide') : undefined;
    const box = xf ? boxOf(xf) : zone?.box;
    if (!box) continue;
    const text = t === 'p:sp' || t === 'p:grpSp' ? textOf(n) : '';
    const sizes = [...findAll(n, 'a:rPr'), ...findAll(n, 'a:defRPr'), ...findAll(n, 'a:endParaRPr')].map((r) => num(attr(r, 'sz')) / 100).filter((v) => v > 0);
    const uri = attr(path(n, 'a:graphic', 'a:graphicData'), 'uri') ?? '';
    const kind: ShapeInfo['kind'] = ph ? 'placeholder' : t === 'p:pic' ? 'image' : t === 'p:grpSp' ? 'group' : t === 'p:cxnSp' ? 'line' : t === 'p:graphicFrame' ? (uri.includes('table') ? 'table' : 'chart') : text ? 'text' : 'shape';
    const b = findAll(n, 'a:rPr').find((r) => attr(r, 'b') !== undefined);
    const first = t === 'p:sp' ? shapeStyle(n, c) : rprStyle(findAll(n, 'a:rPr')[0] ?? null, c);
    out.push({ id, name: attr(cnv, 'name') ?? '', kind, ...(ph ? { ph: ph.type } : {}), box, text: text.slice(0, 400), size: sizes.length ? Math.max(...sizes) : zone?.style.size ?? null, bold: b ? attr(b, 'b') === '1' : !!zone?.style.bold, font: first.font ?? zone?.style.font ?? null, color: first.color ?? zone?.style.color ?? null });
  }
  return out;
}

async function analyzeSlide(pkg: OoxmlPackage, slidePath: string, index: number, size: { cx: number; cy: number }, onTheme: (t: NonNullable<FormatAnalysis['theme']>) => void): Promise<SlideAnalysis> {
  const slide = (await pkg.xml(slidePath))!;
  const layoutPath = await pkg.targetOfType(slidePath, 'slideLayout');
  const layout = layoutPath ? await pkg.xml(layoutPath) : null;
  const masterPath = layoutPath ? await pkg.targetOfType(layoutPath, 'slideMaster') : null;
  const master = masterPath ? await pkg.xml(masterPath) : null;
  const th = await themeOf(pkg, masterPath ? await pkg.targetOfType(masterPath, 'theme') : null);
  const map: Record<string, string> = {};
  const cm = child(master, 'p:clrMap');
  for (const [k, v] of Object.entries(cm?.[':@'] ?? {})) map[k] = String(v);
  for (const doc of [layout, slide]) {
    const ov = path(doc, 'p:clrMapOvr', 'a:overrideClrMapping');
    if (ov) for (const [k, v] of Object.entries(ov[':@'] ?? {})) map[k] = String(v);
  }
  if (!Object.keys(map).length) Object.assign(map, { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' });
  onTheme({ colors: th.scheme, major: th.major, minor: th.minor });
  const c: Ctx = { pkg, size, color: { scheme: th.scheme, map }, major: th.major, minor: th.minor, theme: th.theme, themePath: th.path, warnings: new Set(), fonts: new Set(), colors: [], masterDoc: () => master };

  const parts: Part[] = [];
  const showMaster = attr(slide, 'showMasterSp') !== '0' && attr(layout, 'showMasterSp') !== '0';
  if (master && masterPath && showMaster) parts.push({ path: masterPath, doc: master, origin: 'master' });
  if (layout && layoutPath && attr(slide, 'showMasterSp') !== '0') parts.push({ path: layoutPath, doc: layout, origin: 'layout' });
  parts.push({ path: slidePath, doc: slide, origin: 'slide' });

  // Fond : diapositive, puis disposition, puis masque.
  let background: Fill = { type: 'none' };
  for (const p of [{ path: slidePath, doc: slide, origin: 'slide' as const }, ...(layout && layoutPath ? [{ path: layoutPath, doc: layout, origin: 'layout' as const }] : []), ...(master && masterPath ? [{ path: masterPath, doc: master, origin: 'master' as const }] : [])]) {
    const f = await backgroundOf(p, c);
    if (f) { background = f; break; }
  }
  if (background.type === 'solid') c.colors.push(background.color!);
  if (background.type === 'gradient') for (const s of background.stops ?? []) c.colors.push(s.color);

  const elements: FixedElement[] = [];
  const phsBy: Record<string, PhDef[]> = { master: [], layout: [], slide: [] };
  for (const p of parts) {
    const out = { elements: [] as FixedElement[], phs: [] as PhDef[] };
    await walk(path(p.doc, 'p:cSld', 'p:spTree'), p, c, IDENT, out);
    elements.push(...out.elements);
    phsBy[p.origin] = out.phs;
  }
  // Placeholders de la disposition et du masque, même masqués (héritage de la position et du style).
  if (layout && layoutPath && !parts.some((p) => p.origin === 'layout')) { const out = { elements: [], phs: [] as PhDef[] }; await walk(path(layout, 'p:cSld', 'p:spTree'), { path: layoutPath, doc: layout, origin: 'layout' }, c, IDENT, out); phsBy.layout = out.phs; }
  if (master && masterPath && !parts.some((p) => p.origin === 'master')) { const out = { elements: [], phs: [] as PhDef[] }; await walk(path(master, 'p:cSld', 'p:spTree'), { path: masterPath, doc: master, origin: 'master' }, c, IDENT, out); phsBy.master = out.phs; }

  const txStyles = path(master, 'p:txStyles');
  const baseStyle = (fam: string): PartialStyle => {
    const lst = fam === 'title' ? child(txStyles, 'p:titleStyle') : fam === 'body' ? child(txStyles, 'p:bodyStyle') : child(txStyles, 'p:otherStyle');
    return merge(lvl1(lst, c), { font: (fam === 'title' ? c.major : c.minor) ?? undefined, color: c.color.scheme[c.color.map.tx1 ?? 'dk1'] });
  };
  const matchIn = (list: PhDef[], ph: Ph, byFamily: boolean) => list.find((d) => (byFamily ? phFamily(d.ph.type) === phFamily(ph.type) : (ph.idx !== null && d.ph.idx === ph.idx) || (ph.idx === null && phFamily(d.ph.type) === phFamily(ph.type) && d.ph.type === ph.type)))
    ?? (byFamily ? undefined : list.find((d) => d.ph.type === ph.type && ph.type !== 'body'));
  const zoneOf = (def: PhDef, origin: Zone['origin']): Zone | null => {
    const role = PH_ROLE[def.ph.type];
    if (!role) return null;
    const lay = origin === 'slide' ? matchIn(phsBy.layout, def.ph, false) : origin === 'layout' ? def : undefined;
    const mas = matchIn(phsBy.master, (lay ?? def).ph, true);
    const xf = def.xf ?? lay?.xf ?? mas?.xf;
    if (!xf) return null;
    const st = toStyle(merge(shapeStyle(def.node, c), lay && lay !== def ? shapeStyle(lay.node, c) : {}, mas ? shapeStyle(mas.node, c) : {}, baseStyle(phFamily(def.ph.type))));
    if (st.font) c.fonts.add(st.font);
    if (st.color) c.colors.push(st.color);
    return { role, box: boxOf(xf), style: st, text: textOf(child(def.node, 'p:txBody')) || undefined, origin, ph: def.ph };
  };
  const zones: Zone[] = [];
  for (const d of phsBy.slide) { const z = zoneOf(d, 'slide'); if (z) zones.push(z); }
  // Zones prévues par la disposition mais absentes de la diapositive (titre, texte, graphique…) : le générateur les ajoute.
  for (const d of phsBy.layout) {
    const role = PH_ROLE[d.ph.type];
    if (!role || ['date', 'pageNumber', 'footer'].includes(role)) continue;
    if (phsBy.slide.some((s) => (s.ph.idx !== null && s.ph.idx === d.ph.idx) || phFamily(s.ph.type) === phFamily(d.ph.type) && s.ph.type === d.ph.type)) continue;
    if (zones.some((z) => z.role === role && role !== 'body')) continue;
    const z = zoneOf(d, 'layout');
    if (z) zones.push(z);
  }

  const by = (r: ZoneRole) => zones.find((z) => z.role === r)?.style ?? null;
  const other = lvl1(child(txStyles, 'p:otherStyle'), c);
  const typography: Typography = {
    title: by('title') ?? toStyle(baseStyle('title')),
    subtitle: by('subtitle'),
    body: by('body') ?? toStyle(baseStyle('body')),
    caption: by('footer') ?? by('date') ?? by('pageNumber') ?? (Object.keys(other).length ? toStyle(merge(other, { font: c.minor ?? undefined })) : null),
  };
  for (const t of Object.values(typography)) if (t?.font) c.fonts.add(t.font);
  const label = zones.find((z) => z.role === 'title')?.text ?? elements.find((e) => e.text)?.text ?? zones.find((z) => z.text)?.text ?? '';
  return {
    index,
    label: label.split('\n')[0].slice(0, 120),
    background,
    elements,
    zones,
    typography,
    palette: paletteOf({ colors: th.scheme, major: th.major, minor: th.minor }, c.colors),
    fonts: [...c.fonts].filter((f) => !f.startsWith('+')),
    margins: marginsOf(zones, size),
    warnings: [...c.warnings],
    shapes: inventory(path(slide, 'p:cSld', 'p:spTree'), zones, c),
  };
}

// ───────────── Image ─────────────

/** Dimensions d'une image PNG ou JPEG (en-têtes seulement). */
export function imageSize(buf: Buffer): { w: number; h: number; mime: 'image/png' | 'image/jpeg' } | null {
  const k = sniff(buf);
  if (k === 'PNG' && buf.length >= 24) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), mime: 'image/png' };
  if (k === 'JPEG') {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), mime: 'image/jpeg' };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Image : fond plein écran ; dimensions de la diapositive d'après ses proportions (hauteur de 19,05 cm). */
export function analyzeImage(buf: Buffer): FormatAnalysis {
  const s = imageSize(buf);
  if (!s || !s.w || !s.h) throw new FormatReadError(FORMAT_IMAGE_UNREADABLE);
  if (s.w < IMAGE_MIN_WIDTH_PX) throw new FormatReadError(imageTooSmall(s.w));
  const size = { cx: Math.round((DEFAULT_SIZE.cy * s.w) / s.h), cy: DEFAULT_SIZE.cy };
  if (Math.abs(size.cx - DEFAULT_SIZE.cx) / DEFAULT_SIZE.cx < 0.01) size.cx = DEFAULT_SIZE.cx;
  return {
    kind: 'IMAGE', size, theme: null, guides: { x: [], y: [] }, embeddedFonts: [], warnings: [],
    slides: [{ index: 1, label: '', background: { type: 'image', image: 'image' }, elements: [], zones: [], typography: { title: null, subtitle: null, body: null, caption: null }, palette: [], fonts: [], margins: null, warnings: [] }],
  };
}

// ───────────── PDF ─────────────

let pdfjs: any = null;
function pdfLib() {
  if (pdfjs) return pdfjs;
  const g = globalThis as any;
  if (!g.DOMMatrix) g.DOMMatrix = class {};
  if (!g.Path2D) g.Path2D = class {};
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  return pdfjs;
}
type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const hexOf = (raw: any): string | null => {
  const args = raw && typeof raw !== 'string' && raw.length !== undefined ? Array.from(raw as ArrayLike<any>) : raw;
  if (typeof args?.[0] === 'string' && /^#[0-9a-f]{6}$/i.test(args[0])) return args[0].slice(1).toUpperCase();
  if (args?.length === 3 && args.every((v: any) => typeof v === 'number')) return args.map((v: number) => Math.round(v <= 1 ? v * 255 : v).toString(16).padStart(2, '0')).join('').toUpperCase();
  return null;
};
/** Couleur de texte lisible sur un fond : blanc sur fond foncé, encre foncée sinon. */
export function contrastOn(hex: string): string {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5 ? 'FFFFFF' : '1F2124';
}
/** Nom de police PDF → famille et graisse : « ABCDEF+Montserrat-Bold » → Montserrat, gras. */
export function pdfFont(name: string): { font: string; bold: boolean; italic: boolean } {
  const n = name.replace(/^[A-Z]{6}\+/, '');
  const [fam, var_ = ''] = n.split(/[-,]/);
  return { font: fam.replace(/(MT|PS|PSMT)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim(), bold: /bold|black|heavy|semibold/i.test(var_ || n), italic: /italic|oblique/i.test(var_ || n) };
}

export async function analyzePdf(buf: Buffer): Promise<FormatAnalysis> {
  const { getDocument, OPS } = pdfLib();
  let doc: any;
  try {
    doc = await getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  } catch (e: any) {
    throw new FormatReadError(e?.name === 'PasswordException' ? FORMAT_PROTECTED : 'PDF illisible ou endommagé : exportez-le de nouveau puis réessayez.');
  }
  try {
    const slides: SlideAnalysis[] = [];
    let size = DEFAULT_SIZE;
    for (let n = 1; n <= Math.min(doc.numPages, FORMAT_MAX_SLIDES); n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const W = vp.width, H = vp.height, k = EMU_PER_PT;
      if (n === 1) size = { cx: Math.round(W * k), cy: Math.round(H * k) };
      const ps = { cx: Math.round(W * k), cy: Math.round(H * k) };
      const ops = await page.getOperatorList();
      // Aplats (rectangles remplis) et images, sous la matrice de transformation courante.
      let ctm: M = [1, 0, 0, 1, 0, 0];
      let fill = '000000';
      const stack: Array<{ ctm: M; fill: string }> = [];
      let pending: Box[] = [];
      const rects: Array<{ box: Box; color: string }> = [];
      const images: Box[] = [];
      const toBox = (x: number, y: number, w: number, h: number): Box => {
        const p1 = [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]], p2 = [ctm[0] * (x + w) + ctm[2] * (y + h) + ctm[4], ctm[1] * (x + w) + ctm[3] * (y + h) + ctm[5]];
        const x0 = Math.min(p1[0], p2[0]), x1 = Math.max(p1[0], p2[0]), y0 = Math.min(p1[1], p2[1]), y1 = Math.max(p1[1], p2[1]);
        return { x: Math.round(x0 * k), y: Math.round((H - y1) * k), w: Math.round((x1 - x0) * k), h: Math.round((y1 - y0) * k) };
      };
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i], args = ops.argsArray[i];
        if (fn === OPS.save) stack.push({ ctm, fill });
        else if (fn === OPS.restore) { const s = stack.pop(); if (s) { ctm = s.ctm; fill = s.fill; } }
        else if (fn === OPS.transform) ctm = mul(ctm, args as M);
        else if (fn === OPS.setFillRGBColor || fn === OPS.setFillColor) { const h = hexOf(args); if (h) fill = h; }
        else if (fn === OPS.setFillGray) { const v = Math.round((args[0] <= 1 ? args[0] : args[0] / 255) * 255).toString(16).padStart(2, '0').toUpperCase(); fill = v + v + v; }
        else if (fn === OPS.constructPath) {
          pending = [];
          const [sub, coords] = args;
          let ci = 0;
          for (const op of sub) {
            if (op === OPS.rectangle) { const [x, y, w, h] = coords.slice(ci, ci + 4); pending.push(toBox(x, y, w, h)); ci += 4; }
            else if (op === OPS.moveTo || op === OPS.lineTo) ci += 2;
            else if (op === OPS.curveTo) ci += 6;
            else if (op === OPS.curveTo2 || op === OPS.curveTo3) ci += 4;
          }
        } else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.eoFillStroke) { for (const b of pending) if (b.w > 0 && b.h > 0) rects.push({ box: b, color: fill }); pending = []; }
        else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintJpegXObject) images.push(toBox(0, 0, 1, 1));
      }
      // Textes : taille, police réelle (objets de police chargés par la liste d'opérations), position.
      const content = await page.getTextContent();
      const items = (content.items as any[])
        .filter((it) => typeof it.str === 'string' && it.str.trim())
        .map((it) => {
          const sizePt = Math.hypot(it.transform[2], it.transform[3]) || Math.abs(it.transform[3]) || 10;
          let fname = content.styles?.[it.fontName]?.fontFamily ?? '';
          try { const f = page.commonObjs.get(it.fontName); if (f?.name) fname = f.name; } catch { /* police non chargée */ }
          const x = it.transform[4], yb = it.transform[5];
          return { str: it.str as string, size: Math.round(sizePt * 10) / 10, font: pdfFont(fname), box: { x: Math.round(x * k), y: Math.round((H - yb - sizePt) * k), w: Math.round((it.width || sizePt * it.str.length * 0.5) * k), h: Math.round(sizePt * 1.2 * k) } };
        });
      const fonts = new Set<string>(items.map((i) => i.font.font).filter((f) => f && !/^(sans-serif|serif|monospace)$/i.test(f)));
      // Fond : aplat couvrant au moins 90 % de la page.
      const bgIdx = rects.findIndex((r) => r.box.w * r.box.h >= ps.cx * ps.cy * 0.9);
      const background: Fill = bgIdx >= 0 ? { type: 'solid', color: rects[bgIdx].color } : { type: 'solid', color: 'FFFFFF' };
      const elements: FixedElement[] = [
        ...rects.filter((_, i) => i !== bgIdx).filter((r) => r.box.w > k && r.box.h > k).map((r) => ({ kind: 'shape' as const, role: elementRole('shape', r.box, ps), name: 'Aplat', box: r.box, geometry: 'rect', fill: { type: 'solid' as const, color: r.color }, line: null, origin: 'slide' as const })),
        ...images.map((b) => ({ kind: 'image' as const, role: elementRole('image', b, ps), name: 'Image', box: b, origin: 'slide' as const })),
      ];
      // Zones : plus grand corps de texte → titre ; petits textes en bas → bas de page / pagination ; reste → texte.
      const zones: Zone[] = [];
      const st = (i: (typeof items)[number]): TextStyle => ({ font: i.font.font || null, size: i.size, bold: i.font.bold, italic: i.font.italic, color: null });
      const env = (xs: typeof items): Box => { const x0 = Math.min(...xs.map((i) => i.box.x)), y0 = Math.min(...xs.map((i) => i.box.y)); return { x: x0, y: y0, w: Math.max(...xs.map((i) => i.box.x + i.box.w)) - x0, h: Math.max(...xs.map((i) => i.box.y + i.box.h)) - y0 }; };
      if (items.length) {
        const max = Math.max(...items.map((i) => i.size));
        const titles = items.filter((i) => i.size >= max * 0.9);
        const foot = items.filter((i) => !titles.includes(i) && i.box.y > ps.cy * 0.88);
        const body = items.filter((i) => !titles.includes(i) && !foot.includes(i));
        zones.push({ role: 'title', box: env(titles), style: st(titles[0]), text: titles.map((i) => i.str).join(' '), origin: 'slide' });
        if (body.length) zones.push({ role: 'body', box: env(body), style: st(body[0]), text: body.map((i) => i.str).join('\n'), origin: 'slide' });
        const pn = foot.filter((i) => /^\d{1,3}$/.test(i.str.trim()));
        if (pn.length) zones.push({ role: 'pageNumber', box: env(pn), style: st(pn[0]), text: pn[0].str, origin: 'slide' });
        const ft = foot.filter((i) => !pn.includes(i));
        if (ft.length) zones.push({ role: 'footer', box: env(ft), style: st(ft[0]), text: ft.map((i) => i.str).join(' '), origin: 'slide' });
      }
      // Zones élargies : un texte extrait n'occupe que sa propre largeur ; la zone va jusqu'à la marge droite (symétrique)
      // et, pour le texte courant, jusqu'au bas de page. Couleur du texte : contraste avec l'aplat ou le fond situé dessous.
      const left = Math.max(Math.round(ps.cx * 0.05), Math.min(...zones.map((z) => z.box.x)));
      const footTop = Math.min(...zones.filter((z) => z.role === 'footer' || z.role === 'pageNumber').map((z) => z.box.y), Math.round(ps.cy * 0.9));
      for (const z of zones) {
        if (z.role === 'title' || z.role === 'body') z.box.w = Math.max(z.box.w, ps.cx - z.box.x - left);
        if (z.role === 'body') z.box.h = Math.max(z.box.h, footTop - z.box.y - Math.round(ps.cy * 0.02));
        if (z.role === 'title') z.box.h = Math.max(z.box.h, Math.round((z.style.size ?? 28) * 1.5 * k));
        const cx = z.box.x + z.box.w / 2, cy = z.box.y + Math.min(z.box.h, (z.style.size ?? 12) * k) / 2;
        const under = [...rects].reverse().find((r, i) => rects.length - 1 - i !== bgIdx && cx >= r.box.x && cx <= r.box.x + r.box.w && cy >= r.box.y && cy <= r.box.y + r.box.h);
        z.style.color = contrastOn(under?.color ?? background.color!);
      }
      const typo: Typography = { title: zones.find((z) => z.role === 'title')?.style ?? null, subtitle: null, body: zones.find((z) => z.role === 'body')?.style ?? null, caption: zones.find((z) => z.role === 'footer' || z.role === 'pageNumber')?.style ?? null };
      slides.push({
        index: n, label: zones.find((z) => z.role === 'title')?.text?.slice(0, 120) ?? '', background, elements, zones, typography: typo,
        palette: paletteOf(null, [background.color!, ...rects.map((r) => r.color)]), fonts: [...fonts], margins: marginsOf(zones, ps),
        warnings: images.length ? ['Images du PDF : position reprise, mais pas leur contenu (elles n’apparaîtront pas dans le rapport).'] : [],
      });
    }
    if (!slides.length) throw new FormatReadError(FORMAT_NO_SLIDE);
    return { kind: 'PDF', size, theme: null, guides: { x: [], y: [] }, embeddedFonts: [], slides, warnings: doc.numPages > FORMAT_MAX_SLIDES ? [`Seules les ${FORMAT_MAX_SLIDES} premières pages sont analysées.`] : [] };
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

/** URI `data:` d'un média du paquet, pour l'aperçu (null si le format n'est pas affichable par un navigateur). */
export async function mediaDataUri(pkg: OoxmlPackage, p: string): Promise<string | null> {
  const ext = (p.split('.').pop() ?? '').toLowerCase();
  const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp' };
  if (!mime[ext]) return null;
  const b = await pkg.bytes(p);
  return b ? `data:${mime[ext]};base64,${b.toString('base64')}` : null;
}
