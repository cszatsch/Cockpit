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

export const KB_SUMMARY_SYSTEM = [
  'Tu résumes un document déposé dans la base de connaissance d’un projet de transformation.',
  'Réponds uniquement par un objet JSON, sans texte autour : {"description": "…", "resume": "…"}.',
  '- description : exactement deux phrases, qui disent de quoi parle le document et à quoi il sert dans le projet.',
  '- resume : 120 à 250 mots en Markdown simple (courts paragraphes ou puces) : objet, points clés, décisions, dates, chiffres, responsables quand ils figurent dans le texte.',
  '- Pas de phrase de conclusion qui reformule ce qui précède ; ne mentionne pas le format du fichier.',
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

/** Réponse du modèle → description (deux phrases) et résumé ; réponse non conforme : texte brut, description tirée du texte. */
export function parseSummary(raw: string, fallbackText: string): { description: string; summary: string } {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      const summary = typeof j.resume === 'string' ? j.resume.trim() : '';
      const description = typeof j.description === 'string' && j.description.trim() ? twoSentences(j.description) : twoSentences(summary || fallbackText);
      if (summary) return { description, summary: summary.slice(0, 6000) };
    } catch { /* réponse non JSON : repli */ }
  }
  const summary = raw.trim().slice(0, 6000);
  return { description: twoSentences(fallbackText || summary), summary };
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
