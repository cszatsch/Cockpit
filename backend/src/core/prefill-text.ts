import JSZip from 'jszip';
import { detectFormat, KB_PROTECTED, pdfTextState } from '../domain/kb-documents';
import { PREFILL_DOCX_PAGE_CHARS, PREFILL_EXTENSIONS, PREFILL_MAX_BYTES } from '../domain/prefill';
import { OfficeReadError, readPptx } from './office-text';
import { PdfReadError, readPdfLines } from './pdf-text';

/**
 * Lecture de la proposition commerciale (préremplissage, 07/10/2026) : extension, taille et type réel (signature),
 * puis texte page par page (PDF : pages ; PowerPoint : diapositives ; Word : sauts de page, sinon pages estimées).
 * Refus typés pour l'écran : FORMAT (format refusé) ou LECTURE (protégé, scanné, sans texte).
 */
export class PrefillRefusal extends Error {
  constructor(readonly code: 'FORMAT' | 'LECTURE', message: string) {
    super(message);
  }
}

export const PREFILL_FORMAT_MESSAGE = 'Format non pris en charge : déposez un PDF, DOCX, PPTX ou XLSX de 25 Mo au plus.';
export const PREFILL_READ_MESSAGE = 'Fichier illisible : le document est protégé ou ne contient que des images.';

export interface ProposalText {
  format: 'PDF' | 'DOCX' | 'PPTX';
  pages: string[];
}

const xmlText = (s: string) =>
  s.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** Word : texte coupé aux sauts de page (manuels ou mémorisés par Word) ; sans saut, pages estimées par longueur. */
async function docxPages(buf: Buffer): Promise<string[]> {
  let xml: string | undefined;
  try {
    xml = await (await JSZip.loadAsync(buf)).file('word/document.xml')?.async('string');
  } catch {
    throw new PrefillRefusal('LECTURE', PREFILL_READ_MESSAGE);
  }
  if (!xml) throw new PrefillRefusal('LECTURE', PREFILL_READ_MESSAGE);
  const body = xml.replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, '');
  const parts = body.split(/<w:br [^>]*w:type="page"[^>]*\/>|<w:lastRenderedPageBreak\/>/).map(xmlText);
  if (parts.length > 1) return parts.filter((p, i) => p || i === 0);
  const all = parts[0] ?? '';
  const pages: string[] = [];
  for (let i = 0; i < all.length; i += PREFILL_DOCX_PAGE_CHARS) pages.push(all.slice(i, i + PREFILL_DOCX_PAGE_CHARS));
  return pages.length ? pages : [''];
}

export async function readProposal(buf: Buffer, fileName: string): Promise<ProposalText> {
  const ext = (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? '').toLowerCase();
  if (!(PREFILL_EXTENSIONS as readonly string[]).includes(ext) || !buf.length || buf.length > PREFILL_MAX_BYTES) throw new PrefillRefusal('FORMAT', PREFILL_FORMAT_MESSAGE);
  const f = await detectFormat(buf, fileName);
  if ('error' in f) throw new PrefillRefusal(f.error === KB_PROTECTED ? 'LECTURE' : 'FORMAT', f.error === KB_PROTECTED ? PREFILL_READ_MESSAGE : PREFILL_FORMAT_MESSAGE);
  let pages: string[];
  if (f.format === 'PDF') {
    let read: Awaited<ReturnType<typeof readPdfLines>>;
    try {
      read = await readPdfLines(buf);
    } catch (e) {
      if (e instanceof PdfReadError) throw new PrefillRefusal('LECTURE', PREFILL_READ_MESSAGE);
      throw e;
    }
    if (pdfTextState(read.lines, read.pages).scanned) throw new PrefillRefusal('LECTURE', PREFILL_READ_MESSAGE);
    pages = Array.from({ length: read.pages }, (_, i) => read.lines.filter((l) => l.page === i + 1).map((l) => l.text).join('\n'));
  } else if (f.format === 'PPTX') {
    try {
      pages = (await readPptx(buf)).map((s) => [s.title, ...s.lines, ...(s.notes.length ? ['Notes :', ...s.notes] : [])].filter(Boolean).join('\n'));
    } catch (e) {
      if (e instanceof OfficeReadError) throw new PrefillRefusal('LECTURE', PREFILL_READ_MESSAGE);
      throw e;
    }
  } else if (f.format === 'DOCX') {
    pages = await docxPages(buf);
  } else {
    throw new PrefillRefusal('FORMAT', PREFILL_FORMAT_MESSAGE);
  }
  if (pages.join('').replace(/\s/g, '').length < 20) throw new PrefillRefusal('LECTURE', PREFILL_READ_MESSAGE);
  return { format: f.format as ProposalText['format'], pages };
}
