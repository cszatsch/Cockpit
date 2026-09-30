import type { PdfLine } from '../domain/guide-index';

/** PDF illisible, protégé ou vide : message affiché tel quel à l'utilisateur. */
export class PdfReadError extends Error {}

export const PDF_ENCRYPTED = 'Ce PDF est protégé par un mot de passe : déposez une version sans protection.';
export const PDF_UNREADABLE = 'PDF illisible ou endommagé : exportez-le de nouveau puis réessayez.';

let pdfjs: any = null;
/**
 * pdf.js (Mozilla, `pdfjs-dist` 3.x, version CommonJS « legacy ») : lecture du texte avec sa position et sa taille de
 * police, sans dépendance système. `DOMMatrix` et `Path2D` ne servent qu'au rendu graphique : de simples substituts
 * évitent l'avertissement de chargement sous Node.
 */
function lib() {
  if (pdfjs) return pdfjs;
  const g = globalThis as any;
  if (!g.DOMMatrix) g.DOMMatrix = class {};
  if (!g.Path2D) g.Path2D = class {};
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  return pdfjs;
}

/**
 * Lignes de texte du PDF, page par page, de haut en bas : fragments regroupés par ligne (même hauteur), triés de gauche
 * à droite, espace ajoutée quand deux fragments sont séparés ; cellules éloignées d'une même ligne (tableau) séparées
 * par « · ».
 */
export async function readPdfLines(buf: Buffer): Promise<{ pages: number; lines: PdfLine[] }> {
  const { getDocument } = lib();
  let doc: any;
  try {
    doc = await getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  } catch (e: any) {
    throw new PdfReadError(e?.name === 'PasswordException' ? PDF_ENCRYPTED : PDF_UNREADABLE);
  }
  try {
    const lines: PdfLine[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const height = page.getViewport({ scale: 1 }).height;
      const content = await page.getTextContent();
      const items = (content.items as any[])
        .filter((i) => typeof i.str === 'string' && i.str.trim())
        .map((i) => ({ str: i.str as string, x: i.transform[4] as number, y: i.transform[5] as number, w: (i.width as number) || 0, size: Math.hypot(i.transform[2], i.transform[3]) || Math.abs(i.transform[3]) || 10 }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const rows: Array<typeof items> = [];
      for (const it of items) {
        const row = rows.find((r) => Math.abs(r[0].y - it.y) < Math.max(1.5, it.size * 0.35));
        if (row) row.push(it);
        else rows.push([it]);
      }
      for (const r of rows) {
        r.sort((a, b) => a.x - b.x);
        let text = '', end = -Infinity;
        for (const it of r) {
          const gap = it.x - end;
          if (text && gap > it.size * 3) text += ' · ';
          else if (text && gap > it.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' ';
          text += it.str;
          end = it.x + it.w;
        }
        lines.push({ page: n, x: r[0].x, y: r[0].y, size: Math.max(...r.map((i) => i.size)), text: text.replace(/\s+/g, ' ').trim(), pageHeight: height });
      }
      page.cleanup();
    }
    return { pages: doc.numPages, lines };
  } finally {
    await doc.destroy().catch(() => {});
  }
}
