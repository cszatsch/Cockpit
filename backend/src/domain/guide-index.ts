/**
 * Indexation du guide utilisateur de la Console (décision du 30/09/2026) : règles pures, sans base ni réseau.
 * 1. Lignes du PDF (texte, page, position, taille de police) → blocs : titres (niveau déduit de la taille de police),
 *    paragraphes et éléments de liste ; en-têtes et pieds de page répétés écartés.
 * 2. Blocs → chunks : découpe par section (titre de plus bas niveau), taille cible ~350 jetons, chevauchement ~50 jetons
 *    quand une section est coupée, petites sections voisines regroupées, chemin des titres en tête de chaque chunk.
 */

/** Ligne de texte lue dans le PDF (coordonnées PDF : y croît vers le haut). */
export interface PdfLine {
  page: number;
  x: number;
  y: number;
  size: number;
  text: string;
  pageHeight: number;
}

export type GuideBlock =
  | { kind: 'heading'; level: number; text: string; page: number }
  | { kind: 'para' | 'item'; text: string; page: number; pageEnd: number; depth?: number };

export interface GuideChunk {
  position: number;
  /** Chemin des titres, du chapitre à la section (« 3. Fonctionnalités › 3.18 Notifications › 3.18.4 … »). */
  path: string[];
  heading: string;
  /** Texte du chunk (sans le chemin). */
  content: string;
  pageStart: number;
  pageEnd: number;
  tokens: number;
}

// ───────────── Paramètres (justifiés dans docs/DECISIONS.md) ─────────────

/** Estimation des jetons : ~4 caractères par jeton (texte français). */
export const CHARS_PER_TOKEN = 4;
/** Taille cible d'un chunk : assez pour une règle complète, assez peu pour ne pas diluer le sujet. */
export const CHUNK_TARGET_TOKENS = 350;
/** Au-delà, une section est coupée entre paragraphes (et un paragraphe entre phrases). */
export const CHUNK_MAX_TOKENS = 600;
/** En deçà, une section est regroupée avec la suivante (sans franchir un titre de niveau 1 ou 2). */
export const CHUNK_MIN_TOKENS = 80;
/** Chevauchement entre deux chunks d'une même section coupée (dernière phrase ou dernier élément). */
export const CHUNK_OVERLAP_TOKENS = 50;
/** Une ligne est un titre si sa police dépasse celle du texte courant de ce facteur. */
export const HEADING_SIZE_RATIO = 1.1;
/** Nouveau bloc quand l'écart entre deux lignes dépasse ce multiple de la taille de police (interligne ~1,5). */
export const BLOCK_GAP_RATIO = 1.6;
/** Niveaux de titre retenus au plus. */
export const MAX_HEADING_LEVELS = 4;
/** PDF scanné : moins de caractères que ce seuil, ou moins de la moitié des pages avec du texte. */
export const MIN_TEXT_CHARS = 200;
export const MIN_TEXT_PAGE_SHARE = 0.5;
/** Zone d'en-tête et de pied de page (part de la hauteur) où les lignes répétées sont écartées. */
const MARGIN_ZONE = 0.08;

export const estimateTokens = (s: string) => Math.ceil(s.length / CHARS_PER_TOKEN);

// ───────────── Contrôle du texte (PDF scanné) ─────────────

/** Motif de refus si le PDF n'a pas de couche texte exploitable, sinon null. */
export function scannedReason(lines: PdfLine[], pages: number): string | null {
  const chars = lines.reduce((n, l) => n + l.text.replace(/\s/g, '').length, 0);
  const perPage = new Map<number, number>();
  for (const l of lines) perPage.set(l.page, (perPage.get(l.page) ?? 0) + l.text.replace(/\s/g, '').length);
  const withText = [...perPage.values()].filter((n) => n >= 20).length;
  if (chars < MIN_TEXT_CHARS || (pages > 0 && withText / pages < MIN_TEXT_PAGE_SHARE)) return 'scanned';
  return null;
}

// ───────────── Lignes → blocs ─────────────

const round = (n: number, step: number) => Math.round(n / step) * step;

/** En-têtes et pieds de page : lignes (chiffres ignorés) répétées sur au moins la moitié des pages, en marge haute ou basse. */
export function stripRepeated(lines: PdfLine[], pages: number): PdfLine[] {
  const inMargin = (l: PdfLine) => l.y < l.pageHeight * MARGIN_ZONE || l.y > l.pageHeight * (1 - MARGIN_ZONE);
  const key = (l: PdfLine) => l.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
  const seen = new Map<string, Set<number>>();
  for (const l of lines.filter(inMargin)) seen.set(key(l), (seen.get(key(l)) ?? new Set()).add(l.page));
  return lines.filter((l) => {
    if (!inMargin(l)) return true;
    if (/^\s*(page\s*)?\d+(\s*(\/|sur)\s*\d+)?\s*$/i.test(l.text)) return false; // numéro de page seul
    return !(pages >= 3 && (seen.get(key(l))?.size ?? 0) >= Math.max(2, pages * 0.5));
  });
}

/** Taille du texte courant : celle qui porte le plus de caractères. */
export function bodySize(lines: PdfLine[]): number {
  const w = new Map<number, number>();
  for (const l of lines) w.set(round(l.size, 0.1), (w.get(round(l.size, 0.1)) ?? 0) + l.text.length);
  return [...w.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
}

/**
 * Blocs du document. Titre : police ≥ texte courant × 1,1 et ligne courte ; niveau = rang de sa taille (la plus grande
 * = 1). La plus grande taille, si elle n'apparaît qu'en page 1 (couverture), est le titre du document : ignorée.
 * Paragraphe ou élément de liste : lignes consécutives séparées par moins de 1,6 × la taille de police ; un bloc qui
 * commence en retrait de la marge est un élément de liste.
 */
export function toBlocks(input: PdfLine[], pages: number): GuideBlock[] {
  const lines = stripRepeated(input, pages).filter((l) => l.text.trim());
  if (!lines.length) return [];
  const body = bodySize(lines);
  const isHeadingLine = (l: PdfLine) => l.size >= body * HEADING_SIZE_RATIO && l.text.trim().length <= 160;
  // Tailles de titre, fusionnées à 0,6 pt près, de la plus grande à la plus petite.
  let sizes = [...new Set(lines.filter(isHeadingLine).map((l) => round(l.size, 0.5)))].sort((a, b) => b - a);
  sizes = sizes.filter((s, i) => i === 0 || sizes[i - 1] - s > 0.6);
  // Tailles propres à la couverture (page 1 seulement : titre, chapeau) : pas des niveaux de titre.
  const cover = new Set(pages > 1 ? sizes.filter((s) => lines.filter((l) => isHeadingLine(l) && Math.abs(round(l.size, 0.5) - s) <= 0.6).every((l) => l.page === 1)) : []);
  sizes = sizes.filter((s) => !cover.has(s));
  const onCover = (l: PdfLine) => l.page === 1 && isHeadingLine(l) && [...cover].some((s) => Math.abs(round(l.size, 0.5) - s) <= 0.6);
  const levelOf = (l: PdfLine) => {
    if (!isHeadingLine(l)) return 0;
    const i = sizes.findIndex((s) => Math.abs(s - round(l.size, 0.5)) <= 0.6);
    return i < 0 || i >= MAX_HEADING_LEVELS ? 0 : i + 1;
  };
  // Marge gauche du texte courant : la plus à gauche parmi les positions fréquentes (retrait = élément de liste).
  const margin = leftMargin(lines.filter((l) => Math.abs(l.size - body) < 0.3).map((l) => round(l.x, 1))) ?? Math.min(...lines.map((l) => l.x));

  const blocks: GuideBlock[] = [];
  let prev: PdfLine | null = null;
  for (const l of lines) {
    const level = levelOf(l);
    const text = l.text.replace(/\s+/g, ' ').trim();
    const last = blocks[blocks.length - 1];
    const gap = prev && prev.page === l.page ? prev.y - l.y : Infinity;
    if (onCover(l)) { prev = l; continue; }
    if (level) {
      // Titre sur plusieurs lignes : même niveau, lignes rapprochées.
      if (last && last.kind === 'heading' && last.level === level && prev && levelOf(prev) === level && gap <= l.size * BLOCK_GAP_RATIO) last.text += ' ' + text;
      else blocks.push({ kind: 'heading', level, text, page: l.page });
    } else {
      const continues = last && last.kind !== 'heading' && prev && !levelOf(prev) && (gap <= l.size * BLOCK_GAP_RATIO || (prev.page !== l.page && Math.abs(l.x - prev.x) < 2 && !/[.:;!?]$/.test(last.text)));
      if (continues) { last.text += ' ' + text; last.pageEnd = l.page; }
      else if (l.x > margin + body * 0.8) blocks.push({ kind: 'item', text, page: l.page, pageEnd: l.page, depth: Math.max(1, Math.round((l.x - margin) / (body * 1.5))) });
      else blocks.push({ kind: 'para', text, page: l.page, pageEnd: l.page });
    }
    prev = l;
  }
  return blocks;
}

function leftMargin(xs: number[]): number | null {
  const c = new Map<number, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  const common = [...c.entries()].filter(([, n]) => n >= Math.max(3, xs.length * 0.05)).map(([x]) => x);
  return common.length ? Math.min(...common) : null;
}

// ───────────── Blocs → chunks ─────────────

interface Piece { text: string; page: number; pageEnd: number; tokens: number }

/** Coupe un texte trop long entre phrases (jamais au milieu d'une phrase), en morceaux d'au plus la taille cible. */
function splitLong(p: Piece): Piece[] {
  if (p.tokens <= CHUNK_MAX_TOKENS) return [p];
  const sentences = p.text.split(/(?<=[.!?;:])\s+/);
  const out: Piece[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && estimateTokens(cur + ' ' + s) > CHUNK_TARGET_TOKENS) { out.push({ ...p, text: cur, tokens: estimateTokens(cur) }); cur = s; }
    else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) out.push({ ...p, text: cur, tokens: estimateTokens(cur) });
  // Phrase unique plus longue que le maximum : coupe au mot.
  return out.flatMap((x) => (x.tokens <= CHUNK_MAX_TOKENS ? [x] : hardSplit(x)));
}

function hardSplit(p: Piece): Piece[] {
  const words = p.text.split(' '), out: Piece[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && estimateTokens(cur + ' ' + w) > CHUNK_TARGET_TOKENS) { out.push({ ...p, text: cur, tokens: estimateTokens(cur) }); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push({ ...p, text: cur, tokens: estimateTokens(cur) });
  return out;
}

/** Chevauchement : fin du chunk précédent (dernière pièce, ou ses dernières phrases) d'environ 50 jetons. */
function overlapOf(prev: Piece[]): Piece | null {
  const last = prev[prev.length - 1];
  if (!last) return null;
  if (last.tokens <= CHUNK_OVERLAP_TOKENS * 2) return last;
  const sentences = last.text.split(/(?<=[.!?;:])\s+/);
  let tail = '';
  for (let i = sentences.length - 1; i >= 0; i--) {
    const next = tail ? sentences[i] + ' ' + tail : sentences[i];
    if (tail && estimateTokens(next) > CHUNK_OVERLAP_TOKENS) break;
    tail = next;
  }
  return estimateTokens(tail) <= CHUNK_OVERLAP_TOKENS * 2 ? { ...last, text: tail, tokens: estimateTokens(tail) } : null;
}

interface Section { path: string[]; level: number; pieces: Piece[] }

/** Découpe par section. `title` : titre du document, en tête de chaque chemin. */
export function chunkBlocks(blocks: GuideBlock[], title = 'Guide utilisateur'): GuideChunk[] {
  // 1. Sections : le contenu qui suit chaque titre, jusqu'au titre suivant.
  const sections: Section[] = [];
  const stack: string[] = [];
  let cur: Section = { path: [], level: 0, pieces: [] };
  for (const b of blocks) {
    if (b.kind === 'heading') {
      if (cur.pieces.length) sections.push(cur);
      stack.length = b.level - 1;
      for (let i = 0; i < stack.length; i++) stack[i] = stack[i] ?? '';
      stack[b.level - 1] = b.text;
      cur = { path: stack.filter(Boolean), level: b.level, pieces: [] };
    } else {
      const text = b.kind === 'item' ? `${'  '.repeat(Math.max(0, (b.depth ?? 1) - 1))}- ${b.text}` : b.text;
      cur.pieces.push(...splitLong({ text, page: b.page, pageEnd: b.pageEnd, tokens: estimateTokens(text) }));
    }
  }
  if (cur.pieces.length) sections.push(cur);

  // 2. Petites sections regroupées avec la suivante, dans le même chapitre et la même section de niveau 2.
  const merged: Section[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i], next = sections[i + 1];
    const size = s.pieces.reduce((n, p) => n + p.tokens, 0);
    const sameParent = next && s.path.length >= 2 && next.path.length >= 2 && s.path[0] === next.path[0] && s.path[1] === next.path[1];
    if (next && size < CHUNK_MIN_TOKENS && sameParent) {
      const head = s.path.length > 2 ? s.path[s.path.length - 1] : '';
      const carried = head ? [{ text: head, page: s.pieces[0].page, pageEnd: s.pieces[0].page, tokens: estimateTokens(head) }, ...s.pieces] : s.pieces;
      next.pieces = [...carried, ...next.pieces];
      next.path = commonPath(s.path, next.path);
      continue;
    }
    merged.push(s);
  }

  // 3. Chunks : pièces empilées jusqu'à la taille cible ; chevauchement entre deux chunks d'une même section.
  const chunks: GuideChunk[] = [];
  const emit = (s: Section, ps: Piece[]) => {
    const content = ps.map((p) => p.text).join('\n');
    chunks.push({ position: chunks.length, path: [title, ...s.path], heading: s.path[s.path.length - 1] ?? title, content, pageStart: Math.min(...ps.map((p) => p.page)), pageEnd: Math.max(...ps.map((p) => p.pageEnd)), tokens: estimateTokens(content) });
  };
  for (const s of merged) {
    let buf: Piece[] = [], size = 0, fresh = 0;
    for (const p of s.pieces) {
      if (fresh && size + p.tokens > CHUNK_TARGET_TOKENS && size >= CHUNK_MIN_TOKENS) {
        emit(s, buf);
        const o = overlapOf(buf);
        buf = o ? [o] : []; size = o ? o.tokens : 0; fresh = 0;
      }
      buf.push(p); size += p.tokens; fresh++;
    }
    if (!fresh) continue;
    // Reste trop court d'une section coupée : rattaché au chunk précédent de la même section s'il reste sous le maximum.
    const rest = buf.slice(buf.length - fresh), restSize = rest.reduce((n, p) => n + p.tokens, 0), last = chunks[chunks.length - 1];
    if (restSize < CHUNK_MIN_TOKENS && last && last.heading === (s.path[s.path.length - 1] ?? title) && last.path.length === s.path.length + 1 && last.tokens + restSize <= CHUNK_MAX_TOKENS) {
      last.content += '\n' + rest.map((p) => p.text).join('\n');
      last.tokens = estimateTokens(last.content);
      last.pageEnd = Math.max(last.pageEnd, ...rest.map((p) => p.pageEnd));
    } else emit(s, buf);
  }
  return chunks;
}

function commonPath(a: string[], b: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) out.push(a[i]);
  return out.length >= 2 ? b : out;
}

/** Texte envoyé au modèle d'embedding : le chemin des titres puis le contenu (améliore la recherche). */
export function embeddingText(c: GuideChunk): string {
  return `${c.path.join(' › ')}\n\n${c.content}`;
}

// ───────────── Vecteurs ─────────────

/** Normalisation L2 (une troncature Matryoshka doit être renormalisée). */
export function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

/**
 * Vecteur de démonstration, déterministe (hors ligne et tests) : sac de mots haché sur `dims` composantes, normalisé.
 * Deux textes qui partagent des mots ont des vecteurs proches : la recherche reste vérifiable sans appel réseau.
 */
export function hashEmbedding(text: string, dims: number): number[] {
  const v = new Array<number>(dims).fill(0);
  const words = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{3,}/g) ?? [];
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619) >>> 0;
    v[h % dims] += (h >>> 31) ? -1 : 1;
  }
  return normalize(v);
}

/** Littéral pgvector (« [0.1,0.2,…] »). */
export const vectorLiteral = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`;

/** Index HNSW : type `vector` jusqu'à 2 000 dimensions, `halfvec` jusqu'à 4 000 ; au-delà, pas d'index (recherche exacte). */
export const HNSW_VECTOR_MAX_DIMS = 2000;
export const HNSW_HALFVEC_MAX_DIMS = 4000;
export function hnswIndexSql(dims: number): string | null {
  if (!Number.isInteger(dims) || dims < 1 || dims > HNSW_HALFVEC_MAX_DIMS) return null;
  const type = dims <= HNSW_VECTOR_MAX_DIMS ? 'vector' : 'halfvec';
  return `CREATE INDEX IF NOT EXISTS guide_chunks_hnsw_${dims} ON guide_chunks USING hnsw ((embedding::${type}(${dims})) ${type}_cosine_ops) WITH (m = 16, ef_construction = 64) WHERE dims = ${dims}`;
}
