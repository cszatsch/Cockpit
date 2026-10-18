import JSZip from 'jszip';

/**
 * Plafonds de lecture des fichiers Office déposés (DOCX, PPTX, XLSX : archives ZIP), décision du 18/10/2026 (audit de
 * sécurité). Seule la taille compressée était bornée : un fichier de quelques Ko pouvait se décompresser en dizaines de
 * Mo de XML et épuiser la mémoire du processus unique. Chaque partie est décompressée en flux, octets comptés, et la
 * lecture s'arrête au premier plafond dépassé — la taille déclarée dans l'archive n'est pas crue.
 */
export const ZIP_MAX_ENTRIES = 5000;
/** Toutes parties décompressées (images comprises). */
export const ZIP_MAX_TOTAL_BYTES = 128 * 1024 * 1024;
/** Une partie XML décompressée (document, diapositive, feuille…). */
export const ZIP_MAX_XML_PART_BYTES = 16 * 1024 * 1024;
/** Toutes les parties XML décompressées. */
export const ZIP_MAX_XML_TOTAL_BYTES = 32 * 1024 * 1024;

export const ZIP_TOO_LARGE_MESSAGE = 'Document trop volumineux une fois décompressé : allégez-le ou découpez-le, puis réessayez.';

export class ZipTooLargeError extends Error {
  constructor() {
    super(ZIP_TOO_LARGE_MESSAGE);
  }
}

const isXml = (name: string) => /\.(xml|rels|vml)$/i.test(name);

/** Taille décompressée d'une partie, en flux ; rejet dès que `cap` est dépassé. */
function inflatedSize(f: JSZip.JSZipObject, cap: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let n = 0;
    let done = false;
    const s = (f as any).internalStream('uint8array'); // méthode de JSZip 3 absente de ses déclarations de types
    s.on('data', (chunk: Uint8Array) => {
      if (done) return;
      n += chunk.length;
      if (n > cap) {
        done = true;
        s.pause();
        reject(new ZipTooLargeError());
      }
    })
      .on('error', (e: Error) => {
        if (!done) { done = true; reject(e); }
      })
      .on('end', () => {
        if (!done) { done = true; resolve(n); }
      })
      .resume();
  });
}

/** Vérifie les plafonds d'une archive déjà chargée (nombre de parties, tailles décompressées réelles). */
export async function checkZip(zip: JSZip): Promise<void> {
  const files = Object.values(zip.files).filter((f) => !f.dir);
  if (files.length > ZIP_MAX_ENTRIES) throw new ZipTooLargeError();
  let total = 0;
  let xml = 0;
  for (const f of files) {
    const x = isXml(f.name);
    const cap = Math.min(ZIP_MAX_TOTAL_BYTES - total, x ? Math.min(ZIP_MAX_XML_PART_BYTES, ZIP_MAX_XML_TOTAL_BYTES - xml) : Infinity);
    const n = await inflatedSize(f, cap);
    total += n;
    if (x) xml += n;
  }
}

/** Charge une archive déposée et vérifie ses plafonds. */
export async function loadZipBounded(buf: Buffer | Uint8Array): Promise<JSZip> {
  const zip = await JSZip.loadAsync(buf);
  await checkZip(zip);
  return zip;
}
