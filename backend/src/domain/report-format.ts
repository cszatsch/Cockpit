/**
 * Format du rapport (étape B de « Créer un template », 02/10/2026) : identité visuelle d'un template, définie par
 * quatre pages modèles (couverture, intercalaire, standard, clôture). Règles pures : types de page, dimensions,
 * contrôles bloquants, alertes, rôle des éléments fixes, résumé et aperçu SVG de ce qui a été extrait.
 */

/** Les quatre types de page, dans l'ordre du rapport. */
export const PAGE_KINDS = ['cover', 'divider', 'standard', 'closing'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];
export const PAGE_LABELS: Record<PageKind, string> = { cover: 'Page de couverture', divider: 'Page intercalaire', standard: 'Page standard', closing: 'Page de clôture' };

/** Formats acceptés : PowerPoint en priorité ; PDF et image en complément (extraction moins précise). */
export type FormatFileKind = 'PPTX' | 'PDF' | 'IMAGE';
export const FORMAT_EXTENSIONS: Record<string, FormatFileKind> = { pptx: 'PPTX', pdf: 'PDF', png: 'IMAGE', jpg: 'IMAGE', jpeg: 'IMAGE' };
/** Taille maximale d'un fichier de format (même règle que la Base de connaissance). */
export const FORMAT_MAX_BYTES = 25 * 1024 * 1024;
/** Largeur minimale d'une image modèle : en dessous, le fond serait flou en plein écran. */
export const IMAGE_MIN_WIDTH_PX = 960;
/** Nombre maximal de diapositives (ou pages) analysées dans un fichier. */
export const FORMAT_MAX_SLIDES = 200;

/** Unités OOXML. */
export const EMU_PER_PT = 12700;
export const EMU_PER_CM = 360000;
export const EMU_PER_PX = 9525; // 96 ppp
/** Repères PowerPoint (`p15:guide pos`) : 1/8 de point. */
export const EMU_PER_GUIDE_UNIT = 1587.5;
/** Dimensions par défaut (16:9, 33,867 × 19,05 cm) : templates sans format et images. */
export const DEFAULT_SIZE = { cx: 12192000, cy: 6858000 };

export interface Box { x: number; y: number; w: number; h: number }
export interface GradientStop { pos: number; color: string }
export interface Fill { type: 'solid' | 'gradient' | 'image' | 'none'; color?: string; alpha?: number; stops?: GradientStop[]; angle?: number; image?: string }
export interface TextStyle { font: string | null; size: number | null; bold: boolean; italic: boolean; color: string | null }
export type ElementRole = 'logo' | 'band' | 'watermark' | 'background' | 'shape' | 'text' | 'image' | 'line' | 'table' | 'chart';
export interface FixedElement {
  kind: 'image' | 'shape' | 'text' | 'line' | 'table' | 'chart';
  role: ElementRole;
  name: string;
  box: Box;
  rot?: number;
  geometry?: string;
  fill?: Fill;
  line?: string | null;
  image?: string;
  text?: string;
  style?: TextStyle;
  origin: 'master' | 'layout' | 'slide';
  /** Tableau : texte des cellules et mise en forme par ligne (aperçu). */
  table?: { rows: string[][]; widths: number[]; heights: number[]; fills: Array<string | null>; colors: Array<string | null>; size: number | null; font: string | null };
  /** Graphique natif : type et données (aperçu). */
  chart?: { type: 'bar' | 'line'; categories: string[]; series: Array<{ name: string; values: Array<number | null>; color: string | null }> };
}
export type ZoneRole = 'title' | 'subtitle' | 'body' | 'chart' | 'table' | 'picture' | 'date' | 'pageNumber' | 'footer';
export interface Zone { role: ZoneRole; box: Box; style: TextStyle; text?: string; origin: 'master' | 'layout' | 'slide'; /** Placeholder PowerPoint (type, index) : le générateur y écrit le contenu. */ ph?: { type: string; idx: string | null } }
export interface Typography { title: TextStyle | null; subtitle: TextStyle | null; body: TextStyle | null; caption: TextStyle | null }
export interface Margins { left: number; top: number; right: number; bottom: number }
export interface SlideAnalysis {
  index: number;
  /** Premier texte trouvé (titre), pour reconnaître la diapositive. */
  label: string;
  background: Fill;
  elements: FixedElement[];
  zones: Zone[];
  typography: Typography;
  palette: string[];
  fonts: string[];
  margins: Margins | null;
  warnings: string[];
  /** Formes de premier niveau de la diapositive (PowerPoint), pour leur attribuer un rôle. */
  shapes?: ShapeInfo[];
  /** Rôles proposés par type de page (règles ou IA), gardés avec le fichier. */
  suggestedRoles?: Partial<Record<PageKind, { roles: RoleMap; source: string }>>;
}
export interface FormatAnalysis {
  kind: FormatFileKind;
  size: { cx: number; cy: number };
  theme: { colors: Record<string, string>; major: string | null; minor: string | null } | null;
  /** Repères de la grille (EMU) : verticaux (x) et horizontaux (y). */
  guides: { x: number[]; y: number[] };
  embeddedFonts: string[];
  slides: SlideAnalysis[];
  warnings: string[];
}

/** Erreur de lecture d'un fichier de format : message affiché tel quel à l'utilisateur. */
export class FormatReadError extends Error {}

export const FORMAT_REFUSED = 'Format non pris en charge : chargez un fichier .pptx (recommandé), .pdf, .png ou .jpg.';
export const FORMAT_TOO_BIG = 'Fichier trop volumineux : 25 Mo au maximum.';
export const FORMAT_EMPTY = 'Fichier vide.';
export const FORMAT_PROTECTED = 'Ce fichier est protégé par un mot de passe : enregistrez une version sans protection puis réessayez.';
export const FORMAT_OLD_PPT = 'Ancien format PowerPoint (.ppt) non pris en charge : enregistrez le fichier au format .pptx.';
export const FORMAT_PPTX_UNREADABLE = 'Fichier PowerPoint illisible ou endommagé : enregistrez-le de nouveau au format .pptx puis réessayez.';
export const FORMAT_NO_SLIDE = 'Ce fichier ne contient aucune diapositive.';
export const FORMAT_IMAGE_UNREADABLE = 'Image illisible : chargez un fichier PNG ou JPEG valide.';
export const formatMismatch = (ext: string, real: string) => `Le contenu ne correspond pas à l'extension .${ext} (fichier ${real}) : vérifiez le fichier.`;
export const imageTooSmall = (w: number) => `Image trop petite (${w} px de large) : il faut au moins ${IMAGE_MIN_WIDTH_PX} px pour un rendu net en plein écran.`;

/** Polices présentes sur les postes Windows / macOS équipés d'Office : un rapport qui les utilise s'affiche partout. */
export const STANDARD_FONTS = [
  'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Calibri Light', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New',
  'Franklin Gothic Book', 'Franklin Gothic Medium', 'Garamond', 'Georgia', 'Gill Sans MT', 'Helvetica', 'Impact', 'Lucida Console', 'Lucida Sans', 'Palatino Linotype', 'Segoe UI',
  'Segoe UI Light', 'Segoe UI Semibold', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Aptos', 'Aptos Display', 'Aptos Narrow', 'Symbol', 'Wingdings', 'Book Antiqua',
  'Bookman Old Style', 'Tw Cen MT', 'Rockwell', 'Gadugi', 'Sitka Text', 'Bahnschrift',
];
const STANDARD = new Set(STANDARD_FONTS.map((f) => f.toLowerCase()));
export const isStandardFont = (f: string) => STANDARD.has(f.trim().toLowerCase());
export const fontMissing = (f: string) => `Police introuvable : « ${f} » n'est ni incorporée au fichier ni une police standard d'Office. Installez-la sur les postes qui ouvriront le rapport, ou incorporez-la au fichier (PowerPoint › Options › Enregistrement).`;

/** Rapport largeur / hauteur ramené à un format nommé (tolérance 1 %). */
export function ratioLabel(cx: number, cy: number): string {
  const r = cx / cy;
  const known: Array<[number, string]> = [[16 / 9, '16:9'], [4 / 3, '4:3'], [16 / 10, '16:10'], [297 / 210, 'A4 paysage'], [210 / 297, 'A4 portrait'], [1, 'carré']];
  const k = known.find(([v]) => Math.abs(r - v) / v < 0.01);
  return k ? k[1] : 'personnalisé';
}
const cm = (emu: number) => (emu / EMU_PER_CM).toFixed(2).replace('.', ',');
export const sizeLabel = (s: { cx: number; cy: number }) => `${ratioLabel(s.cx, s.cy)} · ${cm(s.cx)} × ${cm(s.cy)} cm`;
/** Deux formats sont compatibles s'ils ont les mêmes dimensions (tolérance 0,5 %) : un PowerPoint n'a qu'une taille de diapositive. */
export const sameSize = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) => Math.abs(a.cx - b.cx) / a.cx < 0.005 && Math.abs(a.cy - b.cy) / a.cy < 0.005;

/** Rôle d'un élément fixe, déduit de sa forme et de sa position. */
export function elementRole(kind: FixedElement['kind'], box: Box, size: { cx: number; cy: number }, alpha?: number): ElementRole {
  const fw = box.w / size.cx, fh = box.h / size.cy, area = fw * fh;
  if (kind === 'line') return 'line';
  if (kind === 'table' || kind === 'chart') return kind;
  if (kind === 'text') return 'text';
  if (area >= 0.9) return alpha !== undefined && alpha < 0.6 ? 'watermark' : 'background';
  if (alpha !== undefined && alpha < 0.6 && area >= 0.08) return 'watermark';
  if (kind === 'image' && area <= 0.12) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const nearEdge = cx < size.cx * 0.3 || cx > size.cx * 0.7 || cy < size.cy * 0.25 || cy > size.cy * 0.75;
    if (nearEdge) return 'logo';
  }
  if ((fw >= 0.7 && fh <= 0.25) || (fh >= 0.7 && fw <= 0.2)) return 'band';
  return kind === 'image' ? 'image' : 'shape';
}

/** Marges : écart entre les bords de la diapositive et l'enveloppe des zones de contenu. */
export function marginsOf(zones: Zone[], size: { cx: number; cy: number }): Margins | null {
  const z = zones.filter((x) => ['title', 'subtitle', 'body', 'chart', 'table', 'picture'].includes(x.role));
  if (!z.length) return null;
  const l = Math.min(...z.map((x) => x.box.x)), t = Math.min(...z.map((x) => x.box.y));
  const r = Math.max(...z.map((x) => x.box.x + x.box.w)), b = Math.max(...z.map((x) => x.box.y + x.box.h));
  return { left: Math.max(0, l), top: Math.max(0, t), right: Math.max(0, size.cx - r), bottom: Math.max(0, size.cy - b) };
}

/** Palette : couleurs du thème d'abord (principales : accent1-2, foncé, clair), puis couleurs réellement utilisées. */
export function paletteOf(theme: FormatAnalysis['theme'], used: string[]): string[] {
  const out: string[] = [];
  const add = (c?: string | null) => { if (c && /^[0-9A-F]{6}$/i.test(c) && !out.includes(c.toUpperCase())) out.push(c.toUpperCase()); };
  for (const c of used) add(c);
  if (theme) for (const k of ['accent1', 'accent2', 'dk2', 'lt2', 'accent3', 'accent4', 'accent5', 'accent6']) add(theme.colors[k]);
  return out.slice(0, 12);
}

/** Alertes d'une page : extraction incomplète (zones manquantes) et polices introuvables. */
export function pageWarnings(kind: PageKind, s: SlideAnalysis, fileKind: FormatFileKind, embedded: string[], roles?: RoleMap): string[] {
  const out = [...s.warnings];
  // Une zone existe si la page a le placeholder, ou une forme désignée pour ce rôle (le contenu d'exemple retiré
  // libère la zone de contenu).
  const assigned = new Set<string>(Object.values(roles ?? {}));
  const has = (r: ZoneRole) => s.zones.some((z) => z.role === r) || assigned.has(r) || (r === 'body' && assigned.has('example'));
  if (fileKind !== 'PPTX') out.push(fileKind === 'PDF'
    ? 'Extraction partielle depuis un PDF : fonds, formes et textes sont repris, mais pas les images ni les dégradés. Pour un rendu identique, chargez la page au format .pptx.'
    : 'Image : la page sert de fond plein écran (un texte d’exemple présent dans l’image restera visible) et les zones de texte sont estimées. Pour un rendu identique et des zones exactes, chargez la page au format .pptx.');
  else {
    if (!has('title') && kind !== 'closing') out.push(kind === 'standard' ? "Aucune zone de titre trouvée : le titre de section sera placé en haut à gauche, dans les marges de la page." : "Aucune zone de titre trouvée : le titre sera placé au centre de la page.");
    if (kind === 'standard' && !has('body') && !has('chart') && !has('table')) out.push('Aucune zone de contenu trouvée : le texte sera placé sous le titre, dans les marges de la page.');
    if (kind === 'standard' && !has('pageNumber')) out.push("Aucune zone de pagination trouvée : les pages standard ne seront pas numérotées.");
  }
  const emb = new Set(embedded.map((f) => f.toLowerCase()));
  for (const f of s.fonts) if (!isStandardFont(f) && !emb.has(f.toLowerCase())) out.push(fontMissing(f));
  return [...new Set(out)];
}

/** Référence d'une page modèle : fichier chargé et numéro de diapositive (1 = première). */
export interface PageRef { fileId: string; slide: number; /** Rôle des formes de la diapositive, validé à l'étape B. */ roles?: RoleMap }
export type FormatSelection = Partial<Record<PageKind, PageRef | null>>;

/** Références du format d'un template (fichier, diapositive, type) sans l'extraction complète. */
export function formatRefs(f: any) {
  if (!f?.pages) return null;
  return Object.fromEntries(Object.entries(f.pages).map(([k, p]: [string, any]) => [k, { fileId: p.fileId, fileName: p.fileName, slide: p.slide, kind: p.kind, ...(p.roles ? { roles: p.roles } : {}) }]));
}

/** Contrôles bloquants du format complet (passage à l'étape suivante et enregistrement du template). */
export function formatErrors(sel: FormatSelection, files: Map<string, { name: string; analysis: FormatAnalysis | null; error: string | null }>): Record<string, string> {
  const err: Record<string, string> = {};
  const sizes: Array<{ kind: PageKind; size: { cx: number; cy: number } }> = [];
  for (const k of PAGE_KINDS) {
    const ref = sel[k];
    if (!ref) { err[k] = `${PAGE_LABELS[k]} manquante`; continue; }
    const f = files.get(ref.fileId);
    if (!f) { err[k] = `${PAGE_LABELS[k]} : fichier introuvable, chargez-le de nouveau`; continue; }
    if (f.error || !f.analysis) { err[k] = `${PAGE_LABELS[k]} : ${f.error ?? 'fichier illisible'}`; continue; }
    if (!Number.isInteger(ref.slide) || ref.slide < 1 || ref.slide > f.analysis.slides.length) { err[k] = `${PAGE_LABELS[k]} : la diapositive ${ref.slide} n'existe pas dans ${f.name} (${f.analysis.slides.length})`; continue; }
    sizes.push({ kind: k, size: f.analysis.size });
  }
  const pptxSizes = sizes.filter((s) => {
    const f = files.get(sel[s.kind]!.fileId)!;
    return f.analysis!.kind === 'PPTX';
  });
  const ref = pptxSizes[0] ?? sizes[0];
  for (const s of pptxSizes.slice(1)) {
    if (!sameSize(ref.size, s.size)) err[s.kind] = `${PAGE_LABELS[s.kind]} : dimensions ${sizeLabel(s.size)} différentes de la ${PAGE_LABELS[ref.kind].toLowerCase()} (${sizeLabel(ref.size)}). Les 4 pages doivent avoir le même format.`;
  }
  return err;
}

/** Résumé d'une page pour l'écran : format, polices, palette, éléments fixes et zones. */
export function pageSummary(a: FormatAnalysis, s: SlideAnalysis, roles?: RoleMap) {
  const roleLabel: Record<string, string> = { logo: 'logo', band: 'bandeau', watermark: 'filigrane', background: 'image de fond', shape: 'forme', text: 'texte fixe', image: 'image', line: 'trait', table: 'tableau', chart: 'graphique' };
  const zoneLabel: Record<ZoneRole, string> = { title: 'titre', subtitle: 'sous-titre', body: 'texte', chart: 'graphique', table: 'tableau', picture: 'image', date: 'date', pageNumber: 'pagination', footer: 'bas de page' };
  const count = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {})).map(([k, n]) => (n > 1 ? `${n} ${k}${/[sx]$/.test(k) ? '' : 's'}` : `1 ${k}`));
  const bg = s.background.type === 'solid' ? `uni #${s.background.color}` : s.background.type === 'gradient' ? `dégradé ${(s.background.stops ?? []).map((x) => '#' + x.color).join(' → ')}` : s.background.type === 'image' ? 'image' : 'aucun (blanc)';
  const st = (t: TextStyle | null) => (t ? [t.font, t.size ? `${t.size} pt` : null, t.bold ? 'gras' : null, t.color ? '#' + t.color : null].filter(Boolean).join(' · ') : '—');
  // Style de la forme désignée pour un rôle (titre, sous-titre) : c'est lui que gardera le rapport.
  const roleStyle = (r: ShapeRole): TextStyle | null => { const sh = roles && s.shapes?.find((x) => roles[x.id] === r); return sh ? { font: sh.font ?? null, size: sh.size, bold: sh.bold, italic: false, color: sh.color ?? null } : null; };
  return {
    format: sizeLabel(a.size),
    background: bg,
    elements: count(s.elements.map((e) => roleLabel[e.role] ?? e.role)),
    zones: roles ? [...new Set(Object.values(roles).filter((r) => r !== 'fixed' && r !== 'footer').map((r) => SHAPE_ROLES.find((x) => x.id === r)!.label.replace(/ \(.*\)$/, '').toLowerCase()))] : [...new Set(s.zones.map((z) => zoneLabel[z.role]))],
    fonts: s.fonts,
    palette: s.palette,
    typography: { title: st(roleStyle('title') ?? s.typography.title), subtitle: st(roleStyle('subtitle') ?? s.typography.subtitle), body: st(s.typography.body), caption: st(s.typography.caption) },
    margins: s.margins ? `${cm(s.margins.left)} / ${cm(s.margins.top)} / ${cm(s.margins.right)} / ${cm(s.margins.bottom)} cm` : null,
  };
}

// ───────────── Aperçu SVG ─────────────

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const px = (emu: number) => Math.round((emu / EMU_PER_PX) * 10) / 10;
const ZONE_TEXT: Record<ZoneRole, string> = { title: 'Titre', subtitle: 'Sous-titre', body: 'Texte, tableaux, graphiques', chart: 'Graphique', table: 'Tableau', picture: 'Image', date: 'Date', pageNumber: 'N°', footer: 'Mention de bas de page' };

function fillAttr(f: Fill | undefined, defs: string[], id: string, images: (p: string) => string | null): string {
  if (!f || f.type === 'none') return 'fill="none"';
  if (f.type === 'solid') return `fill="#${f.color}"${f.alpha !== undefined && f.alpha < 1 ? ` fill-opacity="${f.alpha.toFixed(2)}"` : ''}`;
  if (f.type === 'gradient' && f.stops?.length) {
    const a = ((f.angle ?? 0) * Math.PI) / 180;
    const x2 = 50 + 50 * Math.cos(a), y2 = 50 + 50 * Math.sin(a);
    defs.push(`<linearGradient id="${id}" x1="${(100 - x2).toFixed(1)}%" y1="${(100 - y2).toFixed(1)}%" x2="${x2.toFixed(1)}%" y2="${y2.toFixed(1)}%">${f.stops.map((s) => `<stop offset="${(s.pos * 100).toFixed(1)}%" stop-color="#${s.color}"/>`).join('')}</linearGradient>`);
    return `fill="url(#${id})"`;
  }
  if (f.type === 'image' && f.image) {
    const href = images(f.image);
    if (href) { defs.push(`<pattern id="${id}" patternContentUnits="objectBoundingBox" width="1" height="1"><image href="${href}" width="1" height="1" preserveAspectRatio="none"/></pattern>`); return `fill="url(#${id})"`; }
  }
  return 'fill="#e6eeec"';
}

function textSvg(text: string, box: Box, st: TextStyle, anchorMiddle = false): string {
  const size = (st.size ?? 18) * (96 / 72);
  const lineH = size * 1.2;
  const maxChars = Math.max(4, Math.floor(px(box.w) / (size * 0.52)));
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const w of para.split(' ')) { if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    lines.push(cur);
  }
  const maxLines = Math.max(1, Math.floor(px(box.h) / lineH));
  const x = anchorMiddle ? px(box.x + box.w / 2) : px(box.x) + 4;
  return `<text x="${x}" y="${px(box.y) + size}" font-family="${xmlEsc(st.font ?? 'Calibri')}, sans-serif" font-size="${size.toFixed(1)}" font-weight="${st.bold ? 700 : 400}"${st.italic ? ' font-style="italic"' : ''} fill="#${st.color ?? '000000'}"${anchorMiddle ? ' text-anchor="middle"' : ''}>${lines
    .slice(0, maxLines)
    .map((l, i) => `<tspan x="${x}" dy="${i ? lineH.toFixed(1) : 0}">${xmlEsc(l)}</tspan>`)
    .join('')}</text>`;
}

const clip = (s: string, w: number, size: number) => { const n = Math.max(2, Math.floor(w / (size * 0.55))); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/** Tableau de l'aperçu : cellules à leurs dimensions, fond et couleur de texte de chaque ligne. */
function tableSvg(t: NonNullable<FixedElement['table']>, x: number, y: number, w: number): string {
  const total = t.widths.reduce((a, b) => a + b, 0) || 1;
  const ws = t.widths.map((v) => (v / total) * w);
  const size = (t.size ?? 11) * (96 / 72);
  let cy = y;
  return t.rows.map((r, i) => {
    const h = px(t.heights[i] || 280000);
    let cx = x;
    const cells = r.map((txt, j) => {
      const cw = ws[j] ?? 0;
      const out = `<text x="${(cx + 4).toFixed(1)}" y="${(cy + h / 2 + size * 0.35).toFixed(1)}" font-family="${xmlEsc(t.font ?? 'Calibri')}, sans-serif" font-size="${size.toFixed(1)}"${i === 0 ? ' font-weight="700"' : ''} fill="#${t.colors[i] ?? '1F2124'}">${xmlEsc(clip(txt, cw - 8, size))}</text>`;
      cx += cw;
      return out;
    }).join('');
    const row = `<rect x="${x}" y="${cy.toFixed(1)}" width="${w}" height="${h}" fill="${t.fills[i] ? '#' + t.fills[i] : 'none'}"/><line x1="${x}" y1="${(cy + h).toFixed(1)}" x2="${x + w}" y2="${(cy + h).toFixed(1)}" stroke="#d9e2e0" stroke-width=".8"/>${cells}`;
    cy += h;
    return row;
  }).join('');
}

/** Graphique de l'aperçu : histogramme groupé ou courbes, axes et légende simplifiés. */
function chartSvg(ch: NonNullable<FixedElement['chart']>, x: number, y: number, w: number, h: number): string {
  const vals = ch.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const max = Math.max(1, ...vals), n = Math.max(1, ch.categories.length);
  const L = x + w * 0.06, B = y + h * 0.82, T = y + h * 0.04, R = x + w * 0.98, pw = R - L, ph = B - T;
  const out: string[] = [];
  for (let g = 0; g <= 4; g++) { const gy = B - (ph * g) / 4; out.push(`<line x1="${L.toFixed(1)}" y1="${gy.toFixed(1)}" x2="${R.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="#e3e9e7" stroke-width=".8"/><text x="${(L - 4).toFixed(1)}" y="${(gy + 3).toFixed(1)}" font-size="9" text-anchor="end" fill="#6b7a86" font-family="sans-serif">${Math.round((max * g) / 4)}</text>`); }
  const colors = ch.series.map((s, i) => '#' + (s.color ?? ['1D8F86', 'F7A41C', '43586A'][i % 3]));
  const slot = pw / n;
  ch.series.forEach((s, si) => {
    if (ch.type === 'bar') {
      const bw = (slot * 0.7) / ch.series.length;
      s.values.forEach((v, i) => { if (v === null) return; const bh = (ph * v) / max; out.push(`<rect x="${(L + i * slot + slot * 0.15 + si * bw).toFixed(1)}" y="${(B - bh).toFixed(1)}" width="${(bw * 0.92).toFixed(1)}" height="${bh.toFixed(1)}" fill="${colors[si]}"/>`); });
    } else {
      const pts = s.values.map((v, i) => (v === null ? null : `${(L + i * slot + slot / 2).toFixed(1)},${(B - (ph * v) / max).toFixed(1)}`)).filter(Boolean);
      out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${colors[si]}" stroke-width="2.5"/>`);
      pts.forEach((p) => { const [px_, py] = p!.split(','); out.push(`<circle cx="${px_}" cy="${py}" r="3" fill="${colors[si]}"/>`); });
    }
  });
  ch.categories.forEach((c, i) => out.push(`<text x="${(L + i * slot + slot / 2).toFixed(1)}" y="${(B + 12).toFixed(1)}" font-size="9" text-anchor="middle" fill="#6b7a86" font-family="sans-serif">${xmlEsc(clip(c, slot, 9))}</text>`));
  let lx = L;
  ch.series.forEach((s, i) => { out.push(`<rect x="${lx.toFixed(1)}" y="${(y + h * 0.93).toFixed(1)}" width="8" height="8" fill="${colors[i]}"/><text x="${(lx + 12).toFixed(1)}" y="${(y + h * 0.93 + 8).toFixed(1)}" font-size="10" fill="#43586a" font-family="sans-serif">${xmlEsc(s.name)}</text>`); lx += 24 + s.name.length * 5.5; });
  return out.join('');
}

/**
 * Aperçu d'une page modèle reconstitué à partir de l'extraction : fond, éléments fixes à leur position exacte, puis
 * zones de contenu en pointillés (texte d'exemple s'il y en a). Montre ce que le générateur reprendra.
 * `final` : diapositive d'un rapport généré (zones dessinées par leur seul texte).
 * `images` : chemin du média → URI `data:` (null si le format n'est pas affichable, ex. EMF).
 */
export function previewSvg(a: FormatAnalysis, s: SlideAnalysis, images: (path: string) => string | null, opts: { final?: boolean; roles?: RoleMap } = {}): string {
  const W = px(a.size.cx), H = px(a.size.cy);
  const defs: string[] = [];
  const body: string[] = [];
  body.push(`<rect width="${W}" height="${H}" ${s.background.type === 'none' ? 'fill="#ffffff"' : fillAttr(s.background, defs, 'bg', images)}/>`);
  s.elements.forEach((e, i) => {
    const b = e.box, x = px(b.x), y = px(b.y), w = Math.max(px(b.w), 0.5), h = Math.max(px(b.h), 0.5);
    const rot = e.rot ? ` transform="rotate(${e.rot} ${x + w / 2} ${y + h / 2})"` : '';
    if (e.kind === 'image') {
      const href = e.image ? images(e.image) : null;
      body.push(href ? `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"${rot}/>` : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e6eeec" stroke="#b9c9c5" stroke-dasharray="4 3"${rot}/>`);
      return;
    }
    if (e.kind === 'line') { body.push(`<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="#${e.line ?? '000000'}" stroke-width="1.5"${rot}/>`); return; }
    if (e.kind === 'table' && e.table?.rows.length) { body.push(tableSvg(e.table, x, y, w)); return; }
    if (e.kind === 'chart' && e.chart?.series.length) { body.push(chartSvg(e.chart, x, y, w, h)); return; }
    if (e.kind === 'table' || e.kind === 'chart') { body.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f3f7f6" stroke="#b9c9c5"${rot}/>`); return; }
    const fill = fillAttr(e.fill, defs, 'f' + i, images);
    const stroke = e.line ? ` stroke="#${e.line}"` : '';
    if (e.kind === 'shape' || e.fill) {
      const g = e.geometry ?? 'rect';
      if (g === 'ellipse') body.push(`<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${fill}${stroke}${rot}/>`);
      else body.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}"${g === 'roundRect' ? ` rx="${Math.min(w, h) * 0.16}"` : ''} ${fill}${stroke}${rot}/>`);
    }
    if (e.text && e.style) body.push(textSvg(e.text, b, e.style));
  });
  for (const z of s.zones) {
    const b = z.box;
    // Rapport généré : seul le texte réel des zones de la diapositive est dessiné (ni cadre, ni invite de la disposition).
    if (opts.final) { if (z.origin === 'slide' && z.text?.trim()) body.push(textSvg(z.text, b, { ...z.style, size: z.style.size ?? 18 }, z.role === 'pageNumber')); continue; }
    body.push(`<rect x="${px(b.x)}" y="${px(b.y)}" width="${px(b.w)}" height="${px(b.h)}" fill="none" stroke="#1d8f86" stroke-width="1.5" stroke-dasharray="6 4" opacity=".75"/>`);
    const st = { ...z.style, size: z.style.size ?? (z.role === 'title' ? 32 : z.role === 'body' ? 16 : 11) };
    body.push(textSvg(z.text?.trim() ? z.text : ZONE_TEXT[z.role], b, st, ['pageNumber'].includes(z.role)));
  }
  // Rôles en cours de validation : contenu d'exemple voilé (retiré), zones de texte encadrées avec leur rôle.
  if (opts.roles && s.shapes) for (const sh of s.shapes) {
    const r = opts.roles[sh.id];
    const b = sh.box, x = px(b.x), y = px(b.y), w = Math.max(px(b.w), 2), h = Math.max(px(b.h), 2);
    if (r === 'example') body.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" fill-opacity=".82" stroke="#d4574a" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${x + 4}" y="${y + 14}" font-family="sans-serif" font-size="12" font-weight="700" fill="#d4574a">Exemple retiré</text>`);
    else if (r && TEXT_ROLES.includes(r)) body.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#1d8f86" stroke-width="2" stroke-dasharray="6 3"/><rect x="${x}" y="${Math.max(0, y - 16)}" width="${(SHAPE_ROLES.find((q) => q.id === r)?.label.length ?? 8) * 6.4 + 10}" height="15" fill="#1d8f86"/><text x="${x + 5}" y="${Math.max(0, y - 16) + 11}" font-family="sans-serif" font-size="11" font-weight="700" fill="#ffffff">${xmlEsc(SHAPE_ROLES.find((q) => q.id === r)?.label ?? r)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body.join('')}</svg>`;
}

// ───────────── Zones estimées et présentation par défaut ─────────────

const st = (font: string, size: number, bold: boolean, color: string): TextStyle => ({ font, size, bold, italic: false, color });
const rel = (size: { cx: number; cy: number }, x: number, y: number, w: number, h: number): Box => ({ x: Math.round(size.cx * x), y: Math.round(size.cy * y), w: Math.round(size.cx * w), h: Math.round(size.cy * h) });

/**
 * Zones de contenu estimées d'une page modèle sans placeholder (image, ou PDF sans texte) : proportions usuelles des
 * présentations (titre centré sur la couverture et l'intercalaire, titre en haut et texte dessous sur la page standard).
 */
export function estimatedZones(kind: PageKind, size: { cx: number; cy: number }, color = '1F2124', font = 'Calibri'): Zone[] {
  const z = (role: ZoneRole, b: Box, s: TextStyle): Zone => ({ role, box: b, style: s, origin: 'slide' });
  if (kind === 'cover') return [z('title', rel(size, 0.08, 0.36, 0.84, 0.16), st(font, 40, true, color)), z('subtitle', rel(size, 0.08, 0.54, 0.84, 0.1), st(font, 20, false, color)), z('date', rel(size, 0.08, 0.66, 0.5, 0.06), st(font, 14, false, color))];
  if (kind === 'divider') return [z('title', rel(size, 0.08, 0.4, 0.84, 0.14), st(font, 36, true, color)), z('subtitle', rel(size, 0.08, 0.55, 0.84, 0.08), st(font, 18, false, color))];
  if (kind === 'standard') return [z('title', rel(size, 0.05, 0.05, 0.9, 0.12), st(font, 28, true, color)), z('body', rel(size, 0.05, 0.2, 0.9, 0.68), st(font, 16, false, color)), z('pageNumber', rel(size, 0.9, 0.92, 0.06, 0.05), st(font, 10, false, color))];
  return [];
}

/** Présentation par défaut (templates sans format) : charte de RISE, 16:9. */
export function builtInFormat(): { analysis: FormatAnalysis; pages: Record<PageKind, SlideAnalysis> } {
  const size = DEFAULT_SIZE;
  const navy = '10233A', teal = '1D8F86', amber = 'F7A41C', white = 'FFFFFF', ink = '43586A';
  const page = (index: number, bg: string, elements: FixedElement[], zones: Zone[]): SlideAnalysis => ({ index, label: '', background: { type: 'solid', color: bg }, elements, zones, typography: { title: zones[0]?.style ?? null, subtitle: null, body: zones[1]?.style ?? null, caption: null }, palette: [navy, teal, amber, white], fonts: ['Calibri'], margins: null, warnings: [] });
  const band = (b: Box, color: string): FixedElement => ({ kind: 'shape', role: 'band', name: 'Bandeau', box: b, geometry: 'rect', fill: { type: 'solid', color }, line: null, origin: 'slide' });
  const zone = (role: ZoneRole, b: Box, s: TextStyle): Zone => ({ role, box: b, style: s, origin: 'slide' });
  const pages: Record<PageKind, SlideAnalysis> = {
    cover: page(1, navy, [band(rel(size, 0, 0.94, 1, 0.06), amber)], [zone('title', rel(size, 0.08, 0.34, 0.84, 0.16), st('Calibri', 40, true, white)), zone('subtitle', rel(size, 0.08, 0.52, 0.84, 0.1), st('Calibri', 20, false, amber)), zone('date', rel(size, 0.08, 0.64, 0.5, 0.06), st('Calibri', 14, false, white))]),
    divider: page(2, teal, [band(rel(size, 0.08, 0.37, 0.06, 0.012), amber)], [zone('title', rel(size, 0.08, 0.4, 0.84, 0.14), st('Calibri', 36, true, white)), zone('subtitle', rel(size, 0.08, 0.55, 0.84, 0.08), st('Calibri', 18, false, white))]),
    standard: page(3, white, [band(rel(size, 0, 0, 1, 0.025), navy)], [zone('title', rel(size, 0.05, 0.06, 0.9, 0.11), st('Calibri', 28, true, navy)), zone('body', rel(size, 0.05, 0.2, 0.9, 0.68), st('Calibri', 16, false, ink)), zone('pageNumber', rel(size, 0.9, 0.92, 0.06, 0.05), st('Calibri', 10, false, ink))]),
    closing: page(4, navy, [band(rel(size, 0, 0.94, 1, 0.06), amber)], [zone('title', rel(size, 0.08, 0.42, 0.84, 0.14), st('Calibri', 36, true, white))]),
  };
  pages.closing.zones[0].text = 'Merci';
  return { analysis: { kind: 'PDF', size, theme: null, guides: { x: [], y: [] }, embeddedFonts: [], slides: Object.values(pages), warnings: [] }, pages };
}

// ───────────── Rôle des formes d'une page modèle (03/10/2026) ─────────────

/**
 * Rôle d'une forme posée sur la diapositive modèle : design fixe gardé tel quel, zone dont le texte est remplacé
 * (titre, sous-titre, date…) ou contenu d'exemple retiré (sa place devient la zone de contenu de la page standard).
 */
export type ShapeRole = 'fixed' | 'title' | 'subtitle' | 'section' | 'sectionNumber' | 'date' | 'period' | 'project' | 'client' | 'committee' | 'pageNumber' | 'footer' | 'example';
export const SHAPE_ROLES: Array<{ id: ShapeRole; label: string }> = [
  { id: 'fixed', label: 'Design fixe (gardé)' },
  { id: 'example', label: 'Contenu d’exemple (retiré)' },
  { id: 'title', label: 'Titre' },
  { id: 'subtitle', label: 'Sous-titre' },
  { id: 'section', label: 'Nom de la section' },
  { id: 'sectionNumber', label: 'Numéro de la section' },
  { id: 'date', label: 'Date du rapport' },
  { id: 'period', label: 'Période des données' },
  { id: 'project', label: 'Nom du projet' },
  { id: 'client', label: 'Client' },
  { id: 'committee', label: 'Comité' },
  { id: 'pageNumber', label: 'Numéro de page' },
  { id: 'footer', label: 'Mention de bas de page (gardée)' },
];
/** Rôles qui remplacent le texte de la forme (zone de texte ou placeholder seulement). */
export const TEXT_ROLES: ShapeRole[] = ['title', 'subtitle', 'section', 'sectionNumber', 'date', 'period', 'project', 'client', 'committee', 'pageNumber'];
/** Forme de premier niveau de la diapositive (un groupe compte pour une forme). */
export interface ShapeInfo {
  id: string;
  name: string;
  kind: 'text' | 'shape' | 'image' | 'group' | 'table' | 'chart' | 'line' | 'placeholder';
  ph?: string;
  box: Box;
  text: string;
  size: number | null;
  bold: boolean;
  font?: string | null;
  color?: string | null;
}
export type RoleMap = Record<string, ShapeRole>;

const DATE_RE = /\b(janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)[a-zéû]*\.?\s+\d{4}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b|\b(january|february|march|april|june|july|august|september|october|november|december)\s+\d{4}\b/i;
const isUpperLabel = (t: string) => t.length <= 40 && /[A-ZÉ]/.test(t) && t === t.toUpperCase() && !/\d{3,}/.test(t);

/**
 * Rôles proposés pour les formes d'une page modèle, selon le type de page : le plus grand texte (du haut de la page
 * standard) est le titre ; le texte juste dessous, le sous-titre ; une courte mention en capitales au-dessus du titre,
 * le nom de la section ; dates et numéros de page reconnus à leur forme ; petites mentions du bas, bas de page. Sur la
 * page standard (sous le titre) et l'intercalaire, le reste du contenu est de l'exemple ; ailleurs, il est gardé.
 * Proposition par règles, affinée par l'IA quand elle est disponible, validée par l'utilisateur à l'étape B.
 */
export function suggestRoles(kind: PageKind, shapes: ShapeInfo[], size: { cx: number; cy: number }): RoleMap {
  const roles: RoleMap = {};
  const H = size.cy, W = size.cx;
  for (const s of shapes.filter((x) => x.kind === 'placeholder')) {
    const t = s.ph ?? 'body';
    roles[s.id] = t === 'title' || t === 'ctrTitle' ? 'title' : t === 'subTitle' ? 'subtitle' : t === 'dt' ? 'date' : t === 'sldNum' ? 'pageNumber' : t === 'ftr' ? 'footer' : kind === 'standard' ? 'example' : kind === 'closing' ? 'fixed' : 'subtitle';
  }
  const free = shapes.filter((s) => s.kind === 'text' && s.text.trim() && !roles[s.id]);
  if (kind !== 'closing' && !Object.values(roles).includes('title')) {
    const zone = kind === 'standard' ? free.filter((s) => s.box.y < H * 0.3) : free;
    const best = [...zone].filter((s) => (s.size ?? 0) >= 16 && s.text.length <= 140).sort((a, b) => (b.size ?? 0) - (a.size ?? 0) || a.box.y - b.box.y)[0];
    if (best) roles[best.id] = 'title';
  }
  const title = shapes.find((s) => roles[s.id] === 'title');
  for (const s of free) {
    if (roles[s.id]) continue;
    const t = s.text.trim();
    const nearEdge = s.box.y < H * 0.15 || s.box.y + s.box.h > H * 0.85;
    if (/^\d{1,3}$/.test(t) && s.box.w < W * 0.1 && nearEdge && kind !== 'divider') roles[s.id] = 'pageNumber';
    else if (/^\d{1,2}\s*[.·)]?$/.test(t) && kind === 'divider') roles[s.id] = 'sectionNumber';
    else if (DATE_RE.test(t) && t.length <= 60 && (kind !== 'standard' || nearEdge)) roles[s.id] = /→|\s-\s|\sau\s/.test(t) ? 'period' : 'date';
    else if (title && kind !== 'cover' && isUpperLabel(t) && s.box.y + s.box.h <= title.box.y + H * 0.02 && title.box.y - (s.box.y + s.box.h) < H * 0.12) roles[s.id] = 'section';
    else if (s.box.y > H * 0.88 && (s.size ?? 12) <= 10) roles[s.id] = 'footer';
  }
  if (title && kind !== 'closing' && !Object.values(roles).includes('subtitle')) {
    const sub = free.filter((s) => !roles[s.id] && s.box.y >= title.box.y + title.box.h * 0.5 && s.box.y - (title.box.y + title.box.h) < H * 0.12 && (s.size ?? 0) < (title.size ?? 99)).sort((a, b) => a.box.y - b.box.y)[0];
    if (sub) roles[sub.id] = 'subtitle';
  }
  const top = title ? title.box.y + title.box.h : H * 0.15;
  for (const s of shapes) {
    if (roles[s.id]) continue;
    // Bandeau ou fond (sans texte) : design ; un groupe ou une carte avec du texte reste du contenu.
    const band = !s.text.trim() && ((s.box.w >= W * 0.7 && s.box.h <= H * 0.25) || (s.box.h >= H * 0.7 && s.box.w <= W * 0.2) || s.box.w * s.box.h >= W * H * 0.9);
    const smallImage = s.kind === 'image' && s.box.w * s.box.h <= W * H * 0.05;
    if (kind === 'standard' && !band && !smallImage && s.box.y >= top - H * 0.02 && s.box.y < H * 0.9) roles[s.id] = 'example';
    else if (kind === 'divider' && s.text.trim() && !band) roles[s.id] = 'example';
    else roles[s.id] = 'fixed';
  }
  return roles;
}

/** Contrôle des rôles : rôles connus, texte seulement dans une zone de texte, un titre (sauf clôture). */
export function roleErrors(kind: PageKind, shapes: ShapeInfo[], roles: RoleMap): string | null {
  const known = new Set(SHAPE_ROLES.map((r) => r.id));
  if (Object.entries(roles).some(([id, r]) => !known.has(r) || !shapes.some((s) => s.id === id))) return `${PAGE_LABELS[kind]} : rôle de forme inconnu`;
  const bad = shapes.filter((s) => TEXT_ROLES.includes(roles[s.id]) && !['text', 'placeholder'].includes(s.kind));
  if (bad.length) return `${PAGE_LABELS[kind]} : seule une zone de texte peut recevoir un texte (« ${bad[0].name} »)`;
  if (kind !== 'closing' && shapes.length && !Object.values(roles).includes('title')) return `${PAGE_LABELS[kind]} : désignez la zone de titre (la forme qui recevra le titre)`;
  return null;
}

/** Zone de contenu de la page standard : place libérée par le contenu d'exemple retiré. */
export function exampleArea(shapes: ShapeInfo[], roles: RoleMap): Box | null {
  const ex = shapes.filter((s) => roles[s.id] === 'example');
  if (!ex.length) return null;
  const x0 = Math.min(...ex.map((s) => s.box.x)), y0 = Math.min(...ex.map((s) => s.box.y));
  const x1 = Math.max(...ex.map((s) => s.box.x + s.box.w)), y1 = Math.max(...ex.map((s) => s.box.y + s.box.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
