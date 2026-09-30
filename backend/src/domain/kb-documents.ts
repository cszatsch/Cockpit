import JSZip from 'jszip';
import { ChunkSizes, chunkBlocks, CHUNK_MAX_TOKENS, CHUNK_MIN_TOKENS, CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS, estimateTokens, GuideBlock, splitText } from './guide-index';
import type { DocxBlock, PptxSlide, XlsxSheet } from '../core/office-text';
import { tableLines } from '../core/office-text';

/**
 * Base de connaissance du Cockpit (décisions du 30/09/2026) : formats acceptés, contrôles du fichier, découpage propre à
 * chaque format, métadonnées des extraits, texte vectorisé enrichi, résumé du document.
 */

// ───────────── Formats et contrôles ─────────────

export type KbFormat = 'PDF' | 'DOCX' | 'PPTX' | 'XLSX';
export const KB_FORMATS: Record<string, { format: KbFormat; mime: string }> = {
  '.pdf': { format: 'PDF', mime: 'application/pdf' },
  '.docx': { format: 'DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  '.pptx': { format: 'PPTX', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  '.xlsx': { format: 'XLSX', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};
/** Anciens formats Office : refusés avec la marche à suivre (leur lecture exigerait LibreOffice sur le serveur). */
export const KB_OLD_FORMATS: Record<string, { app: string; now: string }> = {
  '.doc': { app: 'Word', now: '.docx' },
  '.ppt': { app: 'PowerPoint', now: '.pptx' },
  '.xls': { app: 'Excel', now: '.xlsx' },
};
export const KB_MAX_BYTES = 25 * 1024 * 1024;

export const KB_EMPTY = 'Le fichier est vide.';
export const KB_TOO_BIG = 'Fichier trop volumineux : 25 Mo au plus.';
export const KB_FORMAT_REFUSED = 'Format non accepté : déposez un fichier PDF, Word (.docx), PowerPoint (.pptx) ou Excel (.xlsx).';
export const kbOldFormat = (ext: string) => `Ancien format ${ext} non accepté : ouvrez le fichier dans ${KB_OLD_FORMATS[ext].app}, enregistrez-le au format ${KB_OLD_FORMATS[ext].now}, puis déposez-le à nouveau.`;
export const kbMismatch = (ext: string) => `Le contenu du fichier ne correspond pas à un fichier ${ext} : il est peut-être endommagé ou renommé.`;
export const KB_PROTECTED = 'Fichier protégé par mot de passe : retirez la protection, puis déposez-le à nouveau.';
export const KB_SCANNED = 'PDF scanné (pages en images, sans texte) : la reconnaissance de caractères n’est pas prise en charge. Déposez une version qui contient du texte, par exemple un PDF exporté depuis Word.';
export const KB_NO_TEXT = 'Aucun texte exploitable dans ce document.';
export const KB_INTERRUPTED = 'Traitement interrompu (redémarrage du serveur) : déposez le document à nouveau.';
export const kbDuplicateContent = (name: string, date: string) => `Ce document est déjà dans la Base de connaissance : « ${name} », déposé le ${date}.`;
export const kbDuplicateName = (name: string) => `Un document nommé « ${name} » existe déjà : remplacez-le ou gardez les deux.`;

const CFB = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const MAIN_PART: Record<string, string> = { DOCX: 'word/document.xml', PPTX: 'ppt/presentation.xml', XLSX: 'xl/workbook.xml' };

/**
 * Type réel du fichier (signature et contenu, pas seulement l'extension). Un fichier Office protégé par mot de passe
 * est un conteneur chiffré (format composé OLE), non une archive ZIP.
 */
export async function detectFormat(buf: Buffer, fileName: string): Promise<{ ext: string; format: KbFormat; mime: string } | { error: string }> {
  if (!buf.length) return { error: KB_EMPTY };
  if (buf.length > KB_MAX_BYTES) return { error: KB_TOO_BIG };
  const ext = (/\.[a-z0-9]+$/i.exec(fileName)?.[0] ?? '').toLowerCase();
  if (KB_OLD_FORMATS[ext]) return { error: kbOldFormat(ext) };
  const f = KB_FORMATS[ext];
  if (!f) return { error: KB_FORMAT_REFUSED };
  if (f.format === 'PDF') return buf.subarray(0, 1024).includes('%PDF-') ? { ext, ...f } : { error: kbMismatch(ext) };
  if (buf.subarray(0, 8).equals(CFB)) return { error: KB_PROTECTED };
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return { error: kbMismatch(ext) };
  try {
    const zip = await JSZip.loadAsync(buf);
    if (!zip.file(MAIN_PART[f.format])) return { error: kbMismatch(ext) };
  } catch {
    return { error: kbMismatch(ext) };
  }
  return { ext, ...f };
}

// ───────────── Découpage ─────────────

export interface KbChunk {
  position: number;
  /** Chemin (sections) ou repère : « 2. Architecture › 2.3 Flux », « Diapositive 4 », « Onglet Budget ». */
  section: string;
  heading: string;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  slide: number | null;
  sheet: string | null;
  rowStart: number | null;
  rowEnd: number | null;
  tokens: number;
}

/**
 * Tailles adaptées au modèle d'embedding : celles du guide (350 jetons, 50 de chevauchement), réduites si la fenêtre du
 * modèle est petite (la cible reste sous le quart de la fenêtre, pour laisser la place aux métadonnées ajoutées).
 */
export function kbSizes(contextTokens: number | null | undefined): ChunkSizes {
  const ctx = contextTokens && contextTokens > 0 ? contextTokens : 8192;
  const target = Math.max(64, Math.min(CHUNK_TARGET_TOKENS, Math.floor(ctx / 4)));
  return { target, max: Math.min(CHUNK_MAX_TOKENS, Math.floor(ctx / 2), Math.round((target * CHUNK_MAX_TOKENS) / CHUNK_TARGET_TOKENS)), min: Math.min(CHUNK_MIN_TOKENS, Math.floor(target / 4)), overlap: Math.min(CHUNK_OVERLAP_TOKENS, Math.floor(target / 7)) };
}

const blank = { pageStart: null, pageEnd: null, slide: null, sheet: null, rowStart: null, rowEnd: null };

/** PDF : sections (titres détectés par la taille de police), pages. */
export function pdfChunks(blocks: GuideBlock[], title: string, z: ChunkSizes): KbChunk[] {
  return chunkBlocks(blocks, title, z).map((c) => ({ ...blank, position: c.position, section: c.path.slice(1).join(' › ') || title, heading: c.heading, content: c.content, pageStart: c.pageStart, pageEnd: c.pageEnd, tokens: c.tokens }));
}

/** Word : sections (styles de titre), paragraphes, puces, tableaux lus ligne à ligne. Pas de numéro de page fiable. */
export function docxChunks(blocks: DocxBlock[], title: string, z: ChunkSizes): KbChunk[] {
  const gb: GuideBlock[] = [];
  for (const b of blocks) {
    if (b.kind === 'heading') gb.push({ kind: 'heading', level: Math.min(b.level, 4), text: b.text, page: 1 });
    else if (b.kind === 'table') for (const l of tableLines(b.rows)) gb.push({ kind: 'para', text: l, page: 1, pageEnd: 1 });
    else gb.push({ kind: b.kind, text: b.text, page: 1, pageEnd: 1, depth: b.depth });
  }
  return chunkBlocks(gb, title, z).map((c) => ({ ...blank, position: c.position, section: c.path.slice(1).join(' › ') || title, heading: c.heading, content: c.content, tokens: c.tokens }));
}

/** PowerPoint : une diapositive par extrait (coupée si elle dépasse la taille), titre et notes de l'orateur compris. */
export function pptxChunks(slides: PptxSlide[], z: ChunkSizes): KbChunk[] {
  const out: KbChunk[] = [];
  for (const s of slides) {
    const body = [...(s.title ? [s.title] : []), ...s.lines, ...(s.notes.length ? [`Notes de l’orateur : ${s.notes.join(' ')}`] : [])].join('\n').trim();
    if (!body) continue;
    const heading = s.title || `Diapositive ${s.n}`;
    for (const part of estimateTokens(body) <= z.max ? [body] : splitText(body, z)) {
      out.push({ ...blank, position: out.length, section: `Diapositive ${s.n}${s.title ? ` · ${s.title}` : ''}`, heading, content: part, slide: s.n, tokens: estimateTokens(part) });
    }
  }
  return out;
}

/** Excel : lignes d'un onglet regroupées jusqu'à la taille cible, « en-tête : valeur » ; rangées d'origine gardées. */
export function xlsxChunks(sheets: XlsxSheet[], z: ChunkSizes): KbChunk[] {
  const out: KbChunk[] = [];
  for (const sh of sheets) {
    let buf: Array<{ n: number; text: string }> = [], size = 0;
    const emit = () => {
      if (!buf.length) return;
      const content = buf.map((r) => r.text).join('\n');
      out.push({ ...blank, position: out.length, section: `Onglet ${sh.name}`, heading: sh.name, content, sheet: sh.name, rowStart: buf[0].n, rowEnd: buf[buf.length - 1].n, tokens: estimateTokens(content) });
      buf = []; size = 0;
    };
    for (const r of sh.rows) {
      const pieces = estimateTokens(r.text) <= z.max ? [r.text] : splitText(r.text, z);
      for (const text of pieces) {
        const t = estimateTokens(text);
        if (buf.length && size + t > z.target) emit();
        buf.push({ n: r.n, text }); size += t;
      }
    }
    emit();
  }
  return out;
}

// ───────────── Métadonnées et texte vectorisé ─────────────

export interface KbDocMeta { name: string; depositedAt: string; description: string }

const pages = (c: Pick<KbChunk, 'pageStart' | 'pageEnd'>) => (c.pageStart == null ? null : c.pageStart === c.pageEnd || c.pageEnd == null ? `p. ${c.pageStart}` : `p. ${c.pageStart}-${c.pageEnd}`);

/** Repère lisible d'un extrait : section et page, diapositive, ou onglet et lignes. */
export function chunkLocation(c: KbChunk): string {
  if (c.slide != null) return c.section;
  if (c.sheet != null) return `${c.section}${c.rowStart != null ? ` · lignes ${c.rowStart}${c.rowEnd !== c.rowStart ? `-${c.rowEnd}` : ''}` : ''}`;
  const p = pages(c);
  return `Section : ${c.section}${p ? ` · ${p}` : ''}`;
}

/** Métadonnées enregistrées avec chaque extrait. */
export function chunkMetadata(m: KbDocMeta, c: KbChunk) {
  return {
    document: m.name, deposeLe: m.depositedAt, description: m.description,
    ...(c.slide != null ? { diapositive: c.slide, titre: c.heading } : c.sheet != null ? { onglet: c.sheet, lignes: c.rowStart != null ? [c.rowStart, c.rowEnd] : null } : { section: c.section, ...(c.pageStart != null ? { page: c.pageStart, pageFin: c.pageEnd } : {}) }),
  };
}

/** Texte vectorisé : métadonnées du document en tête (contexte global porté par chaque vecteur), puis l'extrait. */
export function kbEmbeddingText(m: KbDocMeta, c: KbChunk): string {
  return `Document : ${m.name}\nDéposé le : ${m.depositedAt}\nDescription : ${m.description}\n${chunkLocation(c)}\n\n${c.content}`;
}

// ───────────── Résumé ─────────────

/** Texte envoyé pour le résumé : le début du document jusqu'à cette taille (≈ 15 000 jetons). */
export const KB_SUMMARY_INPUT_CHARS = 60_000;
/** Plafond de la réponse du modèle (le format borné tient en ~700 jetons ; marge contre toute coupure). */
export const KB_SUMMARY_MAX_TOKENS = 2048;
/** Bornes du résumé structuré (affichage sans surcharge). */
export const KB_SUMMARY_LIMITS = { figures: 4, sections: 5, points: 4 } as const;

/**
 * Résumé structuré (décision du 30/09/2026, refonte de la fenêtre « Vue ») : une description en deux phrases, jusqu'à
 * 4 chiffres clés présents dans le texte, 3 à 5 rubriques de points courts. Stocké en JSON dans `Document.summary`.
 */
export interface KbSummary {
  description: string;
  figures: Array<{ value: string; label: string }>;
  sections: Array<{ title: string; points: string[] }>;
}

export const KB_SUMMARY_SYSTEM = [
  'Tu résumes un document déposé dans la base de connaissance d’un projet de transformation, pour une lecture en quelques secondes.',
  'Réponds uniquement par un objet JSON valide, sans texte autour et sans bloc de code :',
  '{"description": "…", "chiffres": [{"valeur": "…", "libelle": "…"}], "rubriques": [{"titre": "…", "points": ["…"]}]}',
  '- description : exactement deux phrases, 45 mots au plus : de quoi parle le document et à quoi il sert dans le projet.',
  '- chiffres : 0 à 4 chiffres clés présents tels quels dans le texte (montant, effectif, durée, date clé) ; valeur courte (« 3,0 Md€ », « 418 », « 2024–2026 »), libellé de 2 à 6 mots.',
  '- rubriques : 3 à 5 rubriques (titre de 1 à 4 mots : Contexte, Enjeux, Périmètre, Planning, Organisation, Décisions…), chacune 1 à 4 points de 25 mots au plus ; **gras** pour un nom propre ou une décision, avec parcimonie.',
  '- 300 mots au total au plus. Pas de conclusion qui reformule ; ne mentionne pas le format du fichier.',
  '- N’invente rien : uniquement ce que contient le texte. En français.',
].join('\n');

export function summaryPrompt(name: string, type: string, format: KbFormat, chunks: KbChunk[]): { prompt: string; truncated: boolean } {
  let body = '', truncated = false;
  for (const c of chunks) {
    const piece = `[${chunkLocation(c)}]\n${c.content}\n\n`;
    if (body.length + piece.length > KB_SUMMARY_INPUT_CHARS) { truncated = true; break; }
    body += piece;
  }
  return { prompt: `Document : ${name}\nType : ${type}\nFormat : ${format}\n${truncated ? 'Texte (début du document seulement) :' : 'Texte :'}\n\n${body.trim()}`, truncated };
}

/** Deux premières phrases d'un texte. */
export function twoSentences(s: string): string {
  const parts = s.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(\s|$)/g) ?? [s.replace(/\s+/g, ' ').trim()];
  return parts.slice(0, 2).join('').trim().slice(0, 600);
}

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** Texte borné sans couper un mot : fin de la dernière phrase complète, sinon dernier mot suivi de « … ». */
const clipText = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > n * 0.5 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '') + '…';
};
/** Chaînes JSON complètes trouvées après une clé (réponse coupée : seules les valeurs entières sont gardées). */
const jsonStrings = (src: string) => [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => { try { return JSON.parse(`"${m[1]}"`) as string; } catch { return m[1]; } });
/** Retours à la ligne et tabulations bruts écrits par le modèle dans une chaîne JSON (invalide) : échappés. */
export function escapeControlsInStrings(src: string): string {
  const BS = '\\', NL = '\n', CR = '\r', TAB = '\t';
  let out = '', inStr = false, esc = false;
  for (const ch of src) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === BS) esc = true;
      else if (ch === '"') inStr = false;
      else if (ch === NL) { out += BS + 'n'; continue; }
      else if (ch === CR) continue;
      else if (ch === TAB) { out += BS + 't'; continue; }
    } else if (ch === '"') inStr = true;
    out += ch;
  }
  return out;
}
/** Valeur d'une chaîne JSON (contenu entre guillemets), échappements compris. */
const unescape = (v: string) => { try { return JSON.parse('"' + escapeControlsInStrings('"' + v).slice(1) + '"') as string; } catch { return v.split('\\n').join('\n'); } };

/** Rubriques tirées d'un texte Markdown (ancien format « resume ») : « ## Titre », puces, paragraphes. */
export function markdownSections(md: string, cut = false): KbSummary['sections'] {
  const out: KbSummary['sections'] = [];
  let cur: KbSummary['sections'][number] | null = null;
  const lines = md.split('\n').map((l) => l.trim()).filter(Boolean);
  // Réponse coupée : la dernière ligne, inachevée, est ramenée à sa dernière phrase complète (écartée s'il n'y en a pas).
  if (cut && lines.length && !/[.!?»)]$/.test(lines[lines.length - 1])) {
    const last = lines.pop()!;
    // Fin de phrase : ponctuation suivie d'un espace, sauf après une initiale (« C. Le »).
    let end = -1;
    for (const m of last.matchAll(/[.!?»](?=\s)/g)) if (!/(^|[\s(])\p{Lu}$/u.test(last.slice(0, m.index))) end = m.index!;
    const kept = end >= 0 ? last.slice(0, end + 1) : '';
    if (kept.replace(/^[-*•#\s]+/, '').length > 20) lines.push(kept);
  }
  for (const l of lines) {
    const h = /^#{1,4}\s+(.+)$/.exec(l) ?? /^\*\*([^*]{1,60})\*\*\s*:?$/.exec(l);
    if (h) { cur = { title: clip(h[1], 60), points: [] }; out.push(cur); continue; }
    if (!cur) { cur = { title: 'Points clés', points: [] }; out.push(cur); }
    cur.points.push(clipText(l.replace(/^[-*•]\s+/, ''), 420));
  }
  return out.filter((x) => x.points.length);
}

/** Normalise un résumé structuré (bornes, textes nettoyés). */
function normalizeSummary(x: { description?: unknown; figures?: unknown; sections?: unknown }): KbSummary {
  const figures = (Array.isArray(x.figures) ? x.figures : []).map((f: any) => ({ value: clip(f?.value ?? f?.valeur, 24), label: clip(f?.label ?? f?.libelle, 60) })).filter((f) => f.value && f.label).slice(0, KB_SUMMARY_LIMITS.figures);
  const sections = (Array.isArray(x.sections) ? x.sections : []).map((r: any) => ({ title: clip(r?.title ?? r?.titre, 60), points: (Array.isArray(r?.points) ? r.points : []).map((p: unknown) => clipText(p, 420)).filter(Boolean).slice(0, KB_SUMMARY_LIMITS.points) })).filter((r) => r.title && r.points.length).slice(0, KB_SUMMARY_LIMITS.sections);
  return { description: twoSentences(clip(x.description, 800)), figures, sections };
}

/**
 * Lecture tolérante d'une réponse du modèle ou d'un résumé stocké : JSON structuré, JSON de l'ancien format
 * (`resume` en Markdown), JSON coupé (seuls les éléments complets sont gardés), ou texte libre (rubriques Markdown).
 * Jamais de JSON brut à l'affichage.
 */
export function readSummary(raw: string | null | undefined): KbSummary | null {
  const t = escapeControlsInStrings(String(raw ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  if (!t) return null;
  const start = t.indexOf('{');
  if (start >= 0) {
    const body = t.slice(start);
    try {
      const j = JSON.parse(body.slice(0, body.lastIndexOf('}') + 1));
      if (typeof j.resume === 'string') return normalizeSummary({ description: j.description, sections: markdownSections(j.resume) });
      return normalizeSummary({ description: j.description, figures: j.chiffres ?? j.figures, sections: j.rubriques ?? j.sections });
    } catch { /* JSON coupé : récupération ci-dessous */ }
    const desc = /"description"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(body);
    const resume = /"resume"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(body);
    if (resume) return normalizeSummary({ description: desc ? unescape(desc[1]) : '', sections: markdownSections(unescape(resume[1].replace(/\\$/, '')), true) });
    const figures = [...body.matchAll(/\{\s*"valeur"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"libelle"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g)].map((m) => ({ value: unescape(m[1]), label: unescape(m[2]) }));
    const sections = [...body.matchAll(/\{\s*"titre"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"points"\s*:\s*\[((?:\s*"(?:[^"\\]|\\.)*"\s*,?)*)\s*\]\s*\}/g)].map((m) => ({ title: unescape(m[1]), points: jsonStrings(m[2]) }));
    if (desc || figures.length || sections.length) return normalizeSummary({ description: desc ? unescape(desc[1]) : '', figures, sections });
  }
  return normalizeSummary({ description: '', sections: markdownSections(t) });
}

/**
 * Réponse du modèle → description (deux phrases) et résumé structuré (JSON stocké). Sans description exploitable, elle
 * est tirée du résumé ; sans rien d'exploitable, les deux premières phrases du document.
 */
export function parseSummary(raw: string, fallbackText: string): { description: string; summary: string } {
  const s = readSummary(raw);
  if (!s || (!s.description && !s.sections.length)) {
    const text = twoSentences(fallbackText);
    return { description: text, summary: JSON.stringify({ description: text, figures: [], sections: [] }) };
  }
  const description = s.description || twoSentences(s.sections.flatMap((x) => x.points).join(' ')) || twoSentences(fallbackText);
  return { description, summary: JSON.stringify({ ...s, description }) };
}

// ───────────── PDF : couche texte ─────────────

/** Caractères (hors espaces) à partir desquels une page compte comme « avec du texte ». */
export const KB_PAGE_TEXT_CHARS = 20;

/**
 * PDF scanné (Base de connaissance) : moins de la moitié des pages ont du texte. Contrairement au guide, un document
 * court (note d'une page) n'est pas refusé pour son peu de texte. Pages sans texte d'un document accepté : extraction
 * partielle, signalée.
 */
export function pdfTextState(lines: Array<{ page: number; text: string }>, pages: number): { scanned: boolean; pagesWithoutText: number } {
  const perPage = new Map<number, number>();
  for (const l of lines) perPage.set(l.page, (perPage.get(l.page) ?? 0) + l.text.replace(/\s/g, '').length);
  const withText = [...perPage.values()].filter((n) => n >= KB_PAGE_TEXT_CHARS).length;
  return { scanned: pages === 0 || withText === 0 || withText / pages < 0.5, pagesWithoutText: Math.max(0, pages - withText) };
}
