import JSZip from 'jszip';
import {
  Box, builtInFormat, DEFAULT_SIZE, estimatedZones, FixedElement, FormatAnalysis, FormatFileKind, PageKind, SlideAnalysis, TextStyle, Zone, ZoneRole,
} from '../domain/report-format';
import { attr, kids, parseXml, relsPath, resolvePath, tagOf } from './ooxml';

/**
 * Assemblage des paquets PowerPoint du Format du rapport : chaque diapositive est la copie de sa page modèle
 * (couverture, intercalaire, standard, clôture), avec son masque, sa disposition, son thème, ses médias et ses polices
 * incorporées ; seul le texte des zones change. Une page venue d'un PDF ou d'une image est reconstruite à partir de
 * l'extraction (fond, aplats, zones de texte). La composition du template est dans `report-template.ts`.
 */

export interface PageSource { fileId: string; kind: FormatFileKind; buf: Buffer | null; analysis: FormatAnalysis; slide: number }

export const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT_BASE = 'application/vnd.openxmlformats-officedocument.presentationml';
const CT = { slide: `${CT_BASE}.slide+xml`, layout: `${CT_BASE}.slideLayout+xml`, master: `${CT_BASE}.slideMaster+xml`, pres: `${CT_BASE}.presentation.main+xml`, theme: 'application/vnd.openxmlformats-officedocument.theme+xml', presProps: `${CT_BASE}.presProps+xml`, viewProps: `${CT_BASE}.viewProps+xml`, tableStyles: `${CT_BASE}.tableStyles+xml` };
const IMG_CT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/x-emf', wmf: 'image/x-wmf', svg: 'image/svg+xml', fntdata: 'application/x-fontdata' };

export const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export interface RelRow { id: string; type: string; target: string; external: boolean }
export const relsXml = (rows: RelRow[]) => `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rows.map((r) => `<Relationship Id="${r.id}" Type="${r.type.includes('/') ? r.type : `${REL}/${r.type}`}" Target="${xmlEsc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;
/** Cible relative d'une partie vue depuis une autre : `ppt/slides/slide1.xml` → `../media/image1.png`. */
export function relTarget(from: string, to: string): string {
  const a = from.split('/').slice(0, -1), b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}
export async function readRels(zip: JSZip, part: string): Promise<RelRow[]> {
  const f = zip.file(relsPath(part));
  if (!f) return [];
  const x = parseXml(await f.async('string'));
  return kids(x).filter((r) => tagOf(r) === 'Relationship').map((r) => ({ id: attr(r, 'Id') ?? '', type: (attr(r, 'Type') ?? '').split('/').pop() ?? '', target: attr(r, 'Target') ?? '', external: attr(r, 'TargetMode') === 'External' }));
}

/** Paquet source (fichier PowerPoint chargé) et parties déjà importées depuis lui. */
export interface Src { key: string; zip: JSZip; ct: string; slides: string[]; map: Map<string, string> }

export class Assembler {
  zip!: JSZip;
  private ct = '';
  private pres = '';
  private presRels: RelRow[] = [];
  private counters = new Map<string, number>();
  private masters = new Map<string, { rels: RelRow[]; layouts: string[]; xml: string; imported: boolean }>();
  private slideCount = 0;
  base: Src | null = null;
  /** Diapositives d'origine du paquet de base (copiées avant d'être retirées). */
  private original = new Map<string, { xml: string; rels: RelRow[] }>();
  size = DEFAULT_SIZE;

  async init(baseKey: string | null, baseBuf: Buffer | null, size: { cx: number; cy: number }) {
    this.size = size;
    this.zip = baseBuf ? await JSZip.loadAsync(baseBuf) : skeleton(size);
    this.ct = await this.zip.file('[Content_Types].xml')!.async('string');
    this.pres = await this.zip.file('ppt/presentation.xml')!.async('string');
    this.presRels = await readRels(this.zip, 'ppt/presentation.xml');
    const slides: string[] = [];
    for (const m of this.pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)) {
      const r = this.presRels.find((x) => x.id === m[1]);
      if (r) slides.push(resolvePath('ppt/presentation.xml', r.target));
    }
    for (const s of slides) {
      const f = this.zip.file(s);
      if (f) this.original.set(s, { xml: await f.async('string'), rels: await readRels(this.zip, s) });
    }
    if (baseBuf && baseKey) this.base = { key: baseKey, zip: this.zip, ct: this.ct, slides, map: new Map() };
    // Toutes les diapositives d'origine sont retirées (avec leurs notes et commentaires) : le rapport est reconstruit.
    for (const s of slides) {
      for (const r of this.original.get(s)?.rels ?? []) {
        if (['notesSlide', 'comments'].includes(r.type) && !r.external) { const p = resolvePath(s, r.target); this.zip.remove(p); this.zip.remove(relsPath(p)); this.dropCt(p); }
      }
      this.zip.remove(s);
      this.zip.remove(relsPath(s));
      this.dropCt(s);
    }
    this.presRels = this.presRels.filter((r) => r.type !== 'slide');
    this.pres = this.pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>|<p:sldIdLst\/>/, '<p:sldIdLst></p:sldIdLst>');
    // Sections et diaporamas personnalisés : ils désignaient les diapositives retirées.
    this.pres = this.pres.replace(/<p:custShowLst>[\s\S]*?<\/p:custShowLst>/, '').replace(/<p:ext uri="\{521415D9-36F7-43E2-AB2F-B90AF26B5E84\}">[\s\S]*?<\/p:ext>/, '');
    for (const m of this.pres.matchAll(/<p:sldMasterId\b[^>]*r:id="([^"]+)"/g)) {
      const r = this.presRels.find((x) => x.id === m[1]);
      if (!r) continue;
      const mp = resolvePath('ppt/presentation.xml', r.target);
      this.masters.set(mp, { rels: [], layouts: [], xml: (await this.zip.file(mp)?.async('string')) ?? '', imported: false });
    }
  }

  private dropCt(p: string) {
    this.ct = this.ct.replace(new RegExp(`<Override PartName="/${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), '');
  }
  private addCt(p: string, type: string) {
    if (!this.ct.includes(`PartName="/${p}"`)) this.ct = this.ct.replace('</Types>', `<Override PartName="/${p}" ContentType="${type}"/></Types>`);
  }
  private addDefault(ext: string, type: string) {
    if (!new RegExp(`Extension="${ext}"`, 'i').test(this.ct)) this.ct = this.ct.replace(/(<Types[^>]*>)/, `$1<Default Extension="${ext}" ContentType="${type}"/>`);
  }
  private unique(dir: string, stem: string, ext: string): string {
    let n = this.counters.get(dir + stem) ?? 0;
    let p: string;
    do { n++; p = `${dir}/${stem}${n}.${ext}`; } while (this.zip.file(p));
    this.counters.set(dir + stem, n);
    return p;
  }
  private nextRid(rows: RelRow[]) {
    return `rId${Math.max(0, ...rows.map((r) => Number(r.id.replace(/\D/g, '')) || 0)) + 1}`;
  }
  private ctOf(src: Src, p: string): string | null {
    const o = new RegExp(`<Override PartName="/${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" ContentType="([^"]+)"`).exec(src.ct);
    if (o) return o[1];
    const ext = (p.split('.').pop() ?? '').toLowerCase();
    return new RegExp(`<Default Extension="${ext}" ContentType="([^"]+)"`, 'i').exec(src.ct)?.[1] ?? IMG_CT[ext] ?? null;
  }

  /** Copie d'une partie quelconque (média, graphique, balises…) et de ses relations ; médias et thèmes partagés. */
  private async importPart(src: Src, p: string): Promise<string> {
    if (src === this.base) return p;
    const shared = /^ppt\/(media|theme|fonts)\//.test(p);
    if (shared && src.map.has(p)) return src.map.get(p)!;
    const f = src.zip.file(p);
    if (!f) return p;
    const dir = p.slice(0, p.lastIndexOf('/')), name = p.slice(p.lastIndexOf('/') + 1), ext = name.split('.').pop() ?? 'bin';
    const dest = this.unique(dir, name.replace(/\d*\.[^.]+$/, '') + 'r', ext);
    const type = this.ctOf(src, p);
    if (/\.xml$/i.test(p)) {
      this.zip.file(dest, await f.async('string'));
      if (type) this.addCt(dest, type);
      const rels = await readRels(src.zip, p);
      const out: RelRow[] = [];
      for (const r of rels) out.push(r.external ? r : { ...r, target: relTarget(dest, await this.importPart(src, resolvePath(p, r.target))) });
      if (out.length) this.zip.file(relsPath(dest), relsXml(out));
    } else {
      this.zip.file(dest, await f.async('nodebuffer'));
      if (type) this.addDefault(ext.toLowerCase(), type);
    }
    if (shared) src.map.set(p, dest);
    return dest;
  }

  private nextLayoutOrMasterId(): number {
    let max = 2147483647;
    for (const m of this.pres.matchAll(/<p:sldMasterId\b[^>]*\bid="(\d+)"/g)) max = Math.max(max, Number(m[1]));
    for (const info of this.masters.values()) for (const m of info.xml.matchAll(/<p:sldLayoutId\b[^>]*\bid="(\d+)"/g)) max = Math.max(max, Number(m[1]));
    return max + 1;
  }

  /** Masque d'un autre fichier : copié avec son thème et ses médias, déclaré dans la présentation. */
  private async importMaster(src: Src, p: string): Promise<string> {
    if (src.map.has(p)) return src.map.get(p)!;
    const dest = this.unique('ppt/slideMasters', 'slideMaster', 'xml');
    src.map.set(p, dest);
    const rels: RelRow[] = [];
    for (const r of await readRels(src.zip, p)) {
      if (r.type === 'slideLayout') continue;
      rels.push(r.external ? r : { ...r, target: relTarget(dest, await this.importPart(src, resolvePath(p, r.target))) });
    }
    const xml = await src.zip.file(p)!.async('string');
    this.masters.set(dest, { rels, layouts: [], xml, imported: true });
    this.addCt(dest, CT.master);
    const rid = this.nextRid(this.presRels);
    this.presRels.push({ id: rid, type: 'slideMaster', target: relTarget('ppt/presentation.xml', dest), external: false });
    const id = this.nextLayoutOrMasterId();
    this.pres = this.pres.replace('</p:sldMasterIdLst>', `<p:sldMasterId id="${id}" r:id="${rid}"/></p:sldMasterIdLst>`);
    return dest;
  }

  private async importLayout(src: Src, p: string): Promise<string> {
    if (src.map.has(p)) return src.map.get(p)!;
    const rels = await readRels(src.zip, p);
    const mRel = rels.find((r) => r.type === 'slideMaster');
    const master = mRel ? await this.importMaster(src, resolvePath(p, mRel.target)) : null;
    const dest = this.unique('ppt/slideLayouts', 'slideLayout', 'xml');
    src.map.set(p, dest);
    const out: RelRow[] = [];
    for (const r of rels) {
      if (r.external) { out.push(r); continue; }
      const t = r.type === 'slideMaster' && master ? master : await this.importPart(src, resolvePath(p, r.target));
      out.push({ ...r, target: relTarget(dest, t) });
    }
    this.zip.file(dest, await src.zip.file(p)!.async('string'));
    this.zip.file(relsPath(dest), relsXml(out));
    this.addCt(dest, CT.layout);
    if (master) this.masters.get(master)!.layouts.push(dest);
    return dest;
  }

  /** Polices incorporées d'un autre fichier, ajoutées à la présentation si elles n'y sont pas déjà. */
  async importFonts(src: Src) {
    if (src === this.base) return;
    const pres = await src.zip.file('ppt/presentation.xml')?.async('string');
    const lst = pres ? /<p:embeddedFontLst>([\s\S]*?)<\/p:embeddedFontLst>/.exec(pres) : null;
    if (!lst) return;
    const srcRels = await readRels(src.zip, 'ppt/presentation.xml');
    for (const m of lst[1].matchAll(/<p:embeddedFont>[\s\S]*?<\/p:embeddedFont>/g)) {
      const face = /typeface="([^"]+)"/.exec(m[0])?.[1];
      if (!face || this.pres.includes(`typeface="${face}"`)) continue;
      let entry = m[0];
      for (const r of entry.matchAll(/r:id="([^"]+)"/g)) {
        const sr = srcRels.find((x) => x.id === r[1]);
        if (!sr) continue;
        const dest = await this.importPart(src, resolvePath('ppt/presentation.xml', sr.target));
        const rid = this.nextRid(this.presRels);
        this.presRels.push({ id: rid, type: 'font', target: relTarget('ppt/presentation.xml', dest), external: false });
        entry = entry.replace(`r:id="${r[1]}"`, `r:id="${rid}"`);
      }
      if (this.pres.includes('</p:embeddedFontLst>')) this.pres = this.pres.replace('</p:embeddedFontLst>', `${entry}</p:embeddedFontLst>`);
      else this.pres = this.pres.replace(/(<p:notesSz[^>]*\/>)/, `$1<p:embeddedFontLst>${entry}</p:embeddedFontLst>`);
    }
  }

  async source(key: string, buf: Buffer, cache: Map<string, Src>): Promise<Src> {
    if (this.base && this.base.key === key) return this.base;
    if (cache.has(key)) return cache.get(key)!;
    const zip = await JSZip.loadAsync(buf);
    const pres = await zip.file('ppt/presentation.xml')!.async('string');
    const rels = await readRels(zip, 'ppt/presentation.xml');
    const slides = [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => rels.find((r) => r.id === m[1])).filter(Boolean).map((r) => resolvePath('ppt/presentation.xml', r!.target));
    const s: Src = { key, zip, ct: await zip.file('[Content_Types].xml')!.async('string'), slides, map: new Map() };
    cache.set(key, s);
    await this.importFonts(s);
    return s;
  }

  /** Diapositive modèle n (1 = première) : XML et relations, réécrites vers les parties du paquet de sortie. */
  async templateSlide(src: Src, n: number): Promise<{ xml: string; rels: RelRow[]; from: string }> {
    const p = src.slides[n - 1];
    const orig = src === this.base ? this.original.get(p)! : { xml: await src.zip.file(p)!.async('string'), rels: await readRels(src.zip, p) };
    const rels: RelRow[] = [];
    for (const r of orig.rels) {
      if (['notesSlide', 'comments'].includes(r.type)) continue;
      if (r.external || src === this.base) { rels.push({ ...r }); continue; }
      const abs = resolvePath(p, r.target);
      const t = r.type === 'slideLayout' ? await this.importLayout(src, abs) : await this.importPart(src, abs);
      rels.push({ ...r, target: t });
    }
    // Cibles absolues pendant la construction, relatives à l'écriture.
    return { xml: orig.xml, rels: rels.map((r) => (r.external || src !== this.base ? r : { ...r, target: resolvePath(p, r.target) })), from: p };
  }

  /** Disposition vierge du paquet de sortie (pages reconstruites) : type `blank`, sinon celle qui a le moins de zones. */
  async blankLayout(): Promise<string> {
    let best: { p: string; score: number } | null = null;
    for (const f of Object.keys(this.zip.files).filter((x) => /^ppt\/slideLayouts\/[^/]+\.xml$/.test(x))) {
      const xml = await this.zip.file(f)!.async('string');
      const score = /<p:sldLayout[^>]*\btype="blank"/.test(xml) ? -1 : (xml.match(/<p:ph\b/g) ?? []).length;
      if (!best || score < best.score) best = { p: f, score };
    }
    return best!.p;
  }

  addMedia(buf: Buffer, ext: string): string {
    const p = this.unique('ppt/media', 'format', ext);
    this.zip.file(p, buf);
    this.addDefault(ext, IMG_CT[ext] ?? 'application/octet-stream');
    return p;
  }

  /** Partie ajoutée telle quelle (graphique, classeur incorporé…) avec son type de contenu. */
  addPart(dir: string, stem: string, ext: string, data: string | Buffer, type: string, isDefault = false): string {
    const p = this.unique(dir, stem, ext);
    this.zip.file(p, data);
    if (isDefault) this.addDefault(ext, type);
    else this.addCt(p, type);
    return p;
  }

  addSlide(xml: string, rels: RelRow[]): string {
    this.slideCount++;
    const p = this.unique('ppt/slides', 'slide', 'xml');
    // Relations inutilisées retirées (ex. graphique d'exemple supprimé de la page standard).
    const used = rels.filter((r) => r.type === 'slideLayout' || xml.includes(`"${r.id}"`));
    this.zip.file(p, xml);
    this.zip.file(relsPath(p), relsXml(used.map((r) => (r.external ? r : { ...r, target: relTarget(p, r.target) }))));
    this.addCt(p, CT.slide);
    const rid = this.nextRid(this.presRels);
    this.presRels.push({ id: rid, type: 'slide', target: relTarget('ppt/presentation.xml', p), external: false });
    this.pres = this.pres.replace('</p:sldIdLst>', `<p:sldId id="${255 + this.slideCount}" r:id="${rid}"/></p:sldIdLst>`);
    return p;
  }

  async finish(): Promise<Buffer> {
    // Masques importés : liste des dispositions et relations reconstruites.
    for (const [p, info] of this.masters) {
      if (!info.imported) continue;
      const rels = [...info.rels];
      const ids: string[] = [];
      let id = this.nextLayoutOrMasterId();
      for (const l of info.layouts) {
        const rid = this.nextRid(rels);
        rels.push({ id: rid, type: 'slideLayout', target: relTarget(p, l), external: false });
        ids.push(`<p:sldLayoutId id="${id++}" r:id="${rid}"/>`);
      }
      const xml = info.xml.replace(/<p:sldLayoutIdLst>[\s\S]*?<\/p:sldLayoutIdLst>|<p:sldLayoutIdLst\/>/, `<p:sldLayoutIdLst>${ids.join('')}</p:sldLayoutIdLst>`);
      info.xml = xml;
      this.zip.file(p, xml);
      this.zip.file(relsPath(p), relsXml(rels));
    }
    this.zip.file('ppt/presentation.xml', this.pres);
    this.zip.file('ppt/_rels/presentation.xml.rels', relsXml(this.presRels));
    this.zip.file('[Content_Types].xml', this.ct);
    const app = this.zip.file('docProps/app.xml');
    if (app) this.zip.file('docProps/app.xml', (await app.async('string')).replace(/<Slides>\d+<\/Slides>/, `<Slides>${this.slideCount}</Slides>`).replace(/<Notes>\d+<\/Notes>/, '<Notes>0</Notes>'));
    return this.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
}

// ───────────── Texte des zones ─────────────

const firstMatch = (s: string, re: RegExp) => re.exec(s)?.[0] ?? null;
/** Paragraphes écrits avec la mise en forme du premier paragraphe et du premier run de la zone d'origine. */
function paragraphs(txBody: string | null, lines: string[], field?: 'slidenum'): string {
  const firstP = txBody ? firstMatch(txBody, /<a:p>[\s\S]*?<\/a:p>|<a:p\/>/) ?? '' : '';
  const pPr = firstMatch(firstP, /<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/) ?? '';
  let rPr = firstMatch(firstP, /<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/);
  if (!rPr) { const e = firstMatch(firstP, /<a:endParaRPr\b[^>]*\/>|<a:endParaRPr\b[^>]*>[\s\S]*?<\/a:endParaRPr>/); rPr = e ? e.replace(/<a:endParaRPr/, '<a:rPr').replace(/<\/a:endParaRPr>/, '</a:rPr>') : '<a:rPr lang="fr-FR" dirty="0"/>'; }
  const end = rPr.replace(/^<a:rPr/, '<a:endParaRPr').replace(/<\/a:rPr>$/, '</a:endParaRPr>');
  return lines.map((l) => (field ? `<a:p>${pPr}<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum">${rPr}<a:t>${xmlEsc(l)}</a:t></a:fld>${end}</a:p>` : l ? `<a:p>${pPr}<a:r>${rPr}<a:t>${xmlEsc(l)}</a:t></a:r></a:p>` : `<a:p>${pPr}${end}</a:p>`)).join('');
}
/** Remplace le texte d'une forme (placeholder) en gardant ses propriétés de zone et de liste. */
export function setText(sp: string, lines: string[], field?: 'slidenum'): string {
  const tx = firstMatch(sp, /<p:txBody>[\s\S]*?<\/p:txBody>/);
  if (field && tx && /<a:fld\b[^>]*type="slidenum"/.test(tx)) return sp.replace(/(<a:fld\b[^>]*type="slidenum"[^>]*>[\s\S]*?<a:t>)[\s\S]*?(<\/a:t>)/, `$1${xmlEsc(lines[0] ?? '')}$2`);
  if (!tx) return sp.replace('</p:sp>', `<p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs(null, lines, field)}</p:txBody></p:sp>`);
  const bodyPr = firstMatch(tx, /<a:bodyPr\b[^>]*\/>|<a:bodyPr\b[^>]*>[\s\S]*?<\/a:bodyPr>/) ?? '<a:bodyPr/>';
  const lst = firstMatch(tx, /<a:lstStyle\/>|<a:lstStyle>[\s\S]*?<\/a:lstStyle>/) ?? '<a:lstStyle/>';
  return sp.replace(tx, `<p:txBody>${bodyPr}${lst}${paragraphs(tx, lines.length ? lines : [''], field)}</p:txBody>`);
}
export const runProps = (s: TextStyle) => `<a:rPr lang="fr-FR"${s.size ? ` sz="${Math.round(s.size * 100)}"` : ''} b="${s.bold ? 1 : 0}"${s.italic ? ' i="1"' : ''} dirty="0">${s.color ? `<a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill>` : ''}${s.font ? `<a:latin typeface="${xmlEsc(s.font)}"/><a:cs typeface="${xmlEsc(s.font)}"/>` : ''}</a:rPr>`;
/** Zone de texte libre à une position exacte (zone sans placeholder, ou page reconstruite). */
export function textBox(id: number, name: string, b: Box, s: TextStyle, lines: string[], opts: { field?: boolean; align?: 'l' | 'ctr' | 'r'; anchor?: 't' | 'ctr' | 'b' } = {}): string {
  const rPr = runProps(s);
  const pPr = opts.align && opts.align !== 'l' ? `<a:pPr algn="${opts.align}"/>` : '';
  const paras = (lines.length ? lines : ['']).map((l) => (opts.field ? `<a:p>${pPr}<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum">${rPr}<a:t>${xmlEsc(l)}</a:t></a:fld></a:p>` : `<a:p>${pPr}<a:r>${rPr}<a:t>${xmlEsc(l)}</a:t></a:r></a:p>`)).join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEsc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${b.x}" y="${b.y}"/><a:ext cx="${b.w}" cy="${b.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${opts.anchor ?? 't'}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
}
function phShape(id: number, ph: { type: string; idx: string | null }, lines: string[]): string {
  const t = ph.type === 'body' && ph.idx ? '' : ` type="${ph.type}"`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${ph.type} ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph${t}${ph.idx ? ` idx="${ph.idx}"` : ''}/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${lines.map((l) => `<a:p><a:r><a:rPr lang="fr-FR" dirty="0"/><a:t>${xmlEsc(l)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`;
}
export const maxId = (xml: string) => Math.max(1, ...[...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map((m) => Number(m[1])));

/**
 * Texte d'une page : titre, sous-titre, texte ; `names` renomme les zones remplies (zones variables du template,
 * ex. `rise:report.date`) ; `dropBody` retire les zones de texte de la page standard (le contenu y est posé ensuite).
 */
export interface Fill { title?: string; subtitle?: string; body?: string[]; date: string; page: number; names?: Partial<Record<'subtitle' | 'date' | 'body', string>>; dropBody?: boolean }
/** Nom (attribut `name` du premier `p:cNvPr`) d'une forme. */
export const nameShape = (sp: string, name: string | undefined) => (name ? sp.replace(/(<p:cNvPr\b[^>]*\bname=")[^"]*(")/, `$1${xmlEsc(name)}$2`) : sp);
const ROLE_OF: Record<string, ZoneRole> = { title: 'title', ctrTitle: 'title', subTitle: 'subtitle', body: 'body', obj: 'body', dt: 'date', sldNum: 'pageNumber', ftr: 'footer', pic: 'picture', chart: 'chart', tbl: 'table' };

/** Mots-clés remplacés partout dans le texte des pages modèles ({{titre}}, {{date}}, {{projet}}, {{comite}}…). */
export function tokens(xml: string, v: Record<string, string>): string {
  return xml.replace(/\{\{\s*([a-zàéèêô-]+)\s*\}\}/gi, (m, k) => (k.toLowerCase() in v ? xmlEsc(v[k.toLowerCase()]) : m));
}

/** Contenu écrit dans une page copiée d'un PowerPoint : placeholders remplis, zones manquantes ajoutées. */
export function fillPptxSlide(xml: string, kind: PageKind, s: SlideAnalysis, f: Fill, size: { cx: number; cy: number }): string {
  const done = new Set<ZoneRole>();
  let subtitleUsed = false, bodyUsed = false;
  xml = xml.replace(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g, (sp) => {
    const ph = /<p:ph\b([^>]*)\/?>/.exec(sp);
    if (!ph) return sp;
    const type = /type="([^"]+)"/.exec(ph[1])?.[1] ?? 'body';
    const role = ROLE_OF[type] ?? 'body';
    const hasText = /<a:t>[^<]*\S[^<]*<\/a:t>/.test(sp);
    if (role === 'date') return nameShape(setText(sp, [f.date]), f.names?.date);
    if (role === 'pageNumber') return setText(sp, [String(f.page)], 'slidenum');
    if (role === 'footer' || kind === 'closing') return sp;
    if (role === 'title' && f.title !== undefined) { done.add('title'); return setText(sp, [f.title]); }
    if (f.dropBody && ['body', 'chart', 'table', 'picture', 'subtitle'].includes(role)) return '';
    if (role === 'subtitle' && f.subtitle !== undefined && !subtitleUsed) { subtitleUsed = true; done.add('subtitle'); return nameShape(setText(sp, [f.subtitle]), f.names?.subtitle); }
    if (role === 'body' && f.body && !bodyUsed) { bodyUsed = true; done.add('body'); return nameShape(setText(sp, f.body), f.names?.body); }
    if (role === 'body' && !f.body && f.subtitle !== undefined && !subtitleUsed) { subtitleUsed = true; done.add('subtitle'); return nameShape(setText(sp, [f.subtitle]), f.names?.subtitle); }
    // Zone non utilisée : retirée si elle est vide (sinon « Cliquez pour ajouter… » resterait visible en édition).
    return hasText ? sp : '';
  });
  if (kind === 'standard') xml = xml.replace(/<p:graphicFrame(?:\s[^>]*)?>(?:(?!<p:ph\b)[\s\S])*?<\/p:graphicFrame>/g, ''); // tableaux et graphiques d'exemple
  if (kind === 'closing') return xml;
  let id = maxId(xml) + 1;
  const add: string[] = [];
  const zone = (r: ZoneRole) => s.zones.find((z) => z.role === r);
  const fallback = estimatedZones(kind, size, s.typography.title?.color ?? '1F2124', s.typography.title?.font ?? 'Calibri');
  const place = (r: ZoneRole, lines: string[]) => {
    const z = zone(r);
    const name = r === 'subtitle' ? f.names?.subtitle : r === 'body' ? f.names?.body : undefined;
    if (z?.ph && z.origin !== 'slide') { add.push(nameShape(phShape(id++, z.ph, lines), name)); return; }
    const est = fallback.find((x) => x.role === r) ?? fallback[0];
    const typo = r === 'title' ? s.typography.title : r === 'body' ? s.typography.body : s.typography.subtitle;
    const style = { ...est.style, ...Object.fromEntries(Object.entries(typo ?? {}).filter(([, v]) => v !== null)) } as TextStyle;
    add.push(textBox(id++, name ?? (r === 'title' ? 'Titre' : r === 'body' ? 'Texte' : 'Sous-titre'), z?.box ?? est.box, style, lines));
  };
  if (f.title !== undefined && !done.has('title')) place('title', [f.title]);
  if (f.body && !done.has('body')) place('body', f.body);
  if (f.subtitle && !done.has('subtitle') && kind !== 'standard') { if (zone('subtitle')) place('subtitle', [f.subtitle]); }
  return add.length ? xml.replace(/<\/p:spTree>/, `${add.join('')}</p:spTree>`) : xml;
}

/** Page reconstruite (PDF, image, présentation par défaut) : fond, aplats, textes fixes et zones remplies. */
export function syntheticSlide(kind: PageKind, s: SlideAnalysis, f: Fill, size: { cx: number; cy: number }, bgImageRid: string | null): string {
  let id = 2;
  const shapes: string[] = [];
  const bg = s.background;
  const bgXml = bgImageRid ? `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${bgImageRid}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`
    : bg.type === 'gradient' && bg.stops?.length ? `<a:gradFill rotWithShape="1"><a:gsLst>${bg.stops.map((g) => `<a:gs pos="${Math.round(g.pos * 100000)}"><a:srgbClr val="${g.color}"/></a:gs>`).join('')}</a:gsLst><a:lin ang="${Math.round((bg.angle ?? 90) * 60000)}" scaled="0"/></a:gradFill>`
    : `<a:solidFill><a:srgbClr val="${bg.type === 'solid' ? bg.color : 'FFFFFF'}"/></a:solidFill>`;
  for (const e of s.elements as FixedElement[]) {
    if (e.kind === 'shape' && e.fill?.type === 'solid') {
      const geom = ['ellipse', 'roundRect'].includes(e.geometry ?? '') ? e.geometry : 'rect';
      shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="${xmlEsc(e.name || 'Forme')}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${e.box.x}" y="${e.box.y}"/><a:ext cx="${e.box.w}" cy="${e.box.h}"/></a:xfrm><a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${e.fill.color}">${e.fill.alpha !== undefined ? `<a:alpha val="${Math.round(e.fill.alpha * 100000)}"/>` : ''}</a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`);
    } else if (e.kind === 'text' && e.text && e.style) shapes.push(textBox(id++, e.name || 'Texte', e.box, e.style, e.text.split('\n')));
  }
  const zones = s.zones.length ? s.zones : estimatedZones(kind, size);
  const fb = estimatedZones(kind, size);
  for (const z of zones) {
    const est = fb.find((x) => x.role === z.role);
    const style: TextStyle = { ...(est?.style ?? z.style), ...Object.fromEntries(Object.entries(z.style).filter(([, v]) => v !== null && v !== false)) } as TextStyle;
    let lines: string[] | null = null;
    let field = false;
    if (z.role === 'title') lines = kind === 'closing' ? (z.text ? z.text.split('\n') : null) : f.title !== undefined ? [f.title] : null;
    else if (z.role === 'subtitle') lines = f.subtitle !== undefined ? [f.subtitle] : null;
    else if (z.role === 'body' && f.dropBody) lines = null;
    else if (z.role === 'body') lines = f.body ?? (kind === 'closing' && z.text ? z.text.split('\n') : f.subtitle !== undefined && !zones.some((x) => x.role === 'subtitle') ? [f.subtitle] : null);
    else if (z.role === 'date') lines = [f.date];
    else if (z.role === 'pageNumber') { lines = [String(f.page)]; field = true; }
    else if (z.role === 'footer') lines = z.text ? [z.text] : null;
    if (!lines) continue;
    const name = z.role === 'date' ? f.names?.date : z.role === 'subtitle' || (z.role === 'body' && !f.body) ? f.names?.subtitle : z.role === 'body' ? f.names?.body : undefined;
    shapes.push(textBox(id++, name ?? z.role, z.box, style, lines, { field, align: z.role === 'pageNumber' ? 'r' : 'l', anchor: z.role === 'title' && kind !== 'standard' ? 'b' : 't' }));
  }
  return `${XML_DECL}<p:sld ${NS} showMasterSp="0"><p:cSld><p:bg><p:bgPr>${bgXml}<a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

// ───────────── Paquet minimal (présentation par défaut, pages sans PowerPoint) ─────────────

function skeleton(size: { cx: number; cy: number }): JSZip {
  const z = new JSZip();
  z.file('[Content_Types].xml', `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="${CT.pres}"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT.master}"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT.layout}"/><Override PartName="/ppt/theme/theme1.xml" ContentType="${CT.theme}"/><Override PartName="/ppt/presProps.xml" ContentType="${CT.presProps}"/><Override PartName="/ppt/viewProps.xml" ContentType="${CT.viewProps}"/><Override PartName="/ppt/tableStyles.xml" ContentType="${CT.tableStyles}"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  z.file('_rels/.rels', relsXml([{ id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml', external: false }, { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml', external: false }, { id: 'rId3', type: 'extended-properties', target: 'docProps/app.xml', external: false }]));
  z.file('docProps/core.xml', `${XML_DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Rapport</dc:title><dc:creator>RISE</dc:creator></cp:coreProperties>`);
  z.file('docProps/app.xml', `${XML_DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>RISE</Application><Slides>0</Slides><Notes>0</Notes></Properties>`);
  z.file('ppt/presentation.xml', `${XML_DECL}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst></p:sldIdLst><p:sldSz cx="${size.cx}" cy="${size.cy}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle></p:presentation>`);
  z.file('ppt/_rels/presentation.xml.rels', relsXml([{ id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml', external: false }, { id: 'rId2', type: 'theme', target: 'theme/theme1.xml', external: false }, { id: 'rId3', type: 'presProps', target: 'presProps.xml', external: false }, { id: 'rId4', type: 'viewProps', target: 'viewProps.xml', external: false }, { id: 'rId5', type: 'tableStyles', target: 'tableStyles.xml', external: false }]));
  z.file('ppt/presProps.xml', `${XML_DECL}<p:presentationPr ${NS}/>`);
  z.file('ppt/viewProps.xml', `${XML_DECL}<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="72008" cy="72008"/></p:viewPr>`);
  z.file('ppt/tableStyles.xml', `${XML_DECL}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`);
  const tree = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
  z.file('ppt/slideMasters/slideMaster1.xml', `${XML_DECL}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${tree}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`);
  z.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', relsXml([{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml', external: false }, { id: 'rId2', type: 'theme', target: '../theme/theme1.xml', external: false }]));
  z.file('ppt/slideLayouts/slideLayout1.xml', `${XML_DECL}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Vierge">${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  z.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relsXml([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml', external: false }]));
  const clr = (n: string, v: string) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
  const fillStyles = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const lnStyles = '<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>';
  z.file('ppt/theme/theme1.xml', `${XML_DECL}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="RISE"><a:themeElements><a:clrScheme name="RISE"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>${clr('dk2', '10233A')}${clr('lt2', 'F3F7F6')}${clr('accent1', '1D8F86')}${clr('accent2', 'F7A41C')}${clr('accent3', '43586A')}${clr('accent4', 'F0752B')}${clr('accent5', '5C7280')}${clr('accent6', '8A8F9C')}${clr('hlink', '0563C1')}${clr('folHlink', '954F72')}</a:clrScheme><a:fontScheme name="RISE"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="RISE"><a:fillStyleLst>${fillStyles}</a:fillStyleLst><a:lnStyleLst>${lnStyles}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${fillStyles}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`);
  return z;
}

