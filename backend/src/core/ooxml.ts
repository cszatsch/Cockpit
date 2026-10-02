import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

/**
 * Lecture des paquets Office Open XML (PowerPoint) : arbre XML ordonné, relations entre parties, chemins et couleurs
 * DrawingML. Sert à l'analyse des pages modèles (Format du rapport) et au générateur PowerPoint.
 */

/** Nœud de l'arbre XML ordonné (`preserveOrder`) : `{ balise: enfants, ':@': attributs }` ou `{ '#text': … }`. */
export type XNode = Record<string, any>;

const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', trimValues: false, processEntities: true, htmlEntities: true });
export const tagOf = (n: XNode) => Object.keys(n).find((k) => k !== ':@') ?? '';
export const kids = (n: XNode | null | undefined): XNode[] => (n && Array.isArray(n[tagOf(n)]) ? n[tagOf(n)] : []);
export const attr = (n: XNode | null | undefined, a: string): string | undefined => n?.[':@']?.[a];
/** Enfant direct portant la balise. */
export const child = (n: XNode | null | undefined, tag: string): XNode | null => kids(n).find((c) => tagOf(c) === tag) ?? null;
/** Chemin d'enfants directs : `path(n, 'p:cSld', 'p:spTree')`. */
export const path = (n: XNode | null | undefined, ...tags: string[]): XNode | null => tags.reduce<XNode | null>((cur, t) => (cur ? child(cur, t) : null), n ?? null);
/** Premier descendant (profondeur d'abord) portant la balise. */
export function find(n: XNode | null | undefined, tag: string): XNode | null {
  for (const c of kids(n)) {
    if (tagOf(c) === tag) return c;
    const f = find(c, tag);
    if (f) return f;
  }
  return null;
}
export function findAll(n: XNode | null | undefined, tag: string, out: XNode[] = []): XNode[] {
  for (const c of kids(n)) {
    if (tagOf(c) === tag) out.push(c);
    findAll(c, tag, out);
  }
  return out;
}
/** Texte de tous les `a:t` du nœud, paragraphes séparés par un saut de ligne. */
export function textOf(n: XNode | null | undefined): string {
  if (!n) return '';
  return findAll(n, 'a:p')
    .map((p) => findAll(p, 'a:t').map((t) => kids(t).map((x) => x['#text'] ?? '').join('')).join(''))
    .join('\n')
    .trim();
}
/** Racine du document XML (le premier élément, après la déclaration). */
export function parseXml(xml: string): XNode {
  const all = parser.parse(xml) as XNode[];
  return all.find((n) => !tagOf(n).startsWith('?')) ?? {};
}

// ───────────── Paquet et relations ─────────────

export interface Rel { id: string; type: string; target: string; external: boolean }

/** Dossier d'une partie : `ppt/slides/slide1.xml` → `ppt/slides`. */
export const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'));
/** Chemin absolu (dans le paquet) d'une cible relative. */
export function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = dirOf(base).split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
/** Fichier de relations d'une partie : `ppt/slides/slide1.xml` → `ppt/slides/_rels/slide1.xml.rels`. */
export const relsPath = (p: string) => `${dirOf(p)}/_rels/${p.slice(p.lastIndexOf('/') + 1)}.rels`;

export class OoxmlPackage {
  private cache = new Map<string, XNode>();
  constructor(readonly zip: JSZip) {}
  static async load(buf: Buffer): Promise<OoxmlPackage> {
    return new OoxmlPackage(await JSZip.loadAsync(buf));
  }
  has(p: string) {
    return !!this.zip.file(p);
  }
  async text(p: string): Promise<string | null> {
    const f = this.zip.file(p);
    return f ? f.async('string') : null;
  }
  async xml(p: string): Promise<XNode | null> {
    if (this.cache.has(p)) return this.cache.get(p)!;
    const t = await this.text(p);
    if (t === null) return null;
    const x = parseXml(t);
    this.cache.set(p, x);
    return x;
  }
  async rels(p: string): Promise<Rel[]> {
    const x = await this.xml(relsPath(p));
    if (!x) return [];
    return kids(x)
      .filter((r) => tagOf(r) === 'Relationship')
      .map((r) => ({ id: attr(r, 'Id') ?? '', type: (attr(r, 'Type') ?? '').split('/').pop() ?? '', target: attr(r, 'Target') ?? '', external: attr(r, 'TargetMode') === 'External' }));
  }
  /** Cible (chemin absolu) d'une relation par identifiant. */
  async target(p: string, rid: string): Promise<string | null> {
    const r = (await this.rels(p)).find((x) => x.id === rid);
    return r && !r.external ? resolvePath(p, r.target) : null;
  }
  async targetOfType(p: string, type: string): Promise<string | null> {
    const r = (await this.rels(p)).find((x) => x.type === type);
    return r && !r.external ? resolvePath(p, r.target) : null;
  }
  async bytes(p: string): Promise<Buffer | null> {
    const f = this.zip.file(p);
    return f ? f.async('nodebuffer') : null;
  }
}

// ───────────── Couleurs DrawingML ─────────────

const PRESET: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080', darkGray: 'A9A9A9', lightGray: 'D3D3D3', orange: 'FFA500', navy: '000080' };

function rgbToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h: number, s: number, l: number): string {
  const f = (p: number, q: number, t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  let r = l, g = l, b = l;
  if (s) { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
  return [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const mix = (hex: string, other: string, k: number) => [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k) + parseInt(other.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Contexte de résolution des couleurs : schéma du thème et correspondance du masque (`bg1` → `lt1`…). */
export interface ColorCtx { scheme: Record<string, string>; map: Record<string, string>; ph?: string }

/** Couleur d'un nœud porteur (`a:solidFill`, `a:gs`, `a:fontRef`…) : RRGGBB et opacité, modificateurs appliqués. */
export function colorOf(n: XNode | null | undefined, ctx: ColorCtx): { color: string; alpha?: number } | null {
  const c = kids(n).find((k) => ['a:srgbClr', 'a:schemeClr', 'a:sysClr', 'a:prstClr', 'a:scrgbClr', 'a:hslClr'].includes(tagOf(k)));
  if (!c) return null;
  const t = tagOf(c);
  let hex: string | undefined;
  if (t === 'a:srgbClr') hex = attr(c, 'val');
  else if (t === 'a:sysClr') hex = attr(c, 'lastClr') ?? (attr(c, 'val') === 'window' ? 'FFFFFF' : '000000');
  else if (t === 'a:prstClr') hex = PRESET[attr(c, 'val') ?? ''];
  else if (t === 'a:schemeClr') {
    let v = attr(c, 'val') ?? '';
    if (v === 'phClr' && ctx.ph) hex = ctx.ph;
    else { v = ctx.map[v] ?? v; hex = ctx.scheme[v]; }
  } else if (t === 'a:scrgbClr') hex = ['r', 'g', 'b'].map((k) => Math.round((Number(attr(c, k) ?? 0) / 100000) * 255).toString(16).padStart(2, '0')).join('');
  if (!hex || !/^[0-9A-F]{6}$/i.test(hex)) return null;
  hex = hex.toUpperCase();
  let alpha: number | undefined;
  for (const m of kids(c)) {
    const v = Number(attr(m, 'val') ?? 0) / 100000;
    switch (tagOf(m)) {
      case 'a:alpha': alpha = v; break;
      case 'a:tint': hex = mix(hex, 'FFFFFF', 1 - v); break;
      case 'a:shade': hex = mix(hex, '000000', 1 - v); break;
      case 'a:lumMod': { const [h, s, l] = rgbToHsl(hex); hex = hslToRgb(h, s, l * v); break; }
      case 'a:lumOff': { const [h, s, l] = rgbToHsl(hex); hex = hslToRgb(h, s, Math.min(1, l + v)); break; }
    }
  }
  return { color: hex, ...(alpha !== undefined && alpha < 1 ? { alpha } : {}) };
}
