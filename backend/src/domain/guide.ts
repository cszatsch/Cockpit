/**
 * Guide utilisateur de la Console (décision du 30/09/2026, maquette « Guide utilisateur 1c ») : règles pures.
 */

/** Taille maximale d'un guide déposé. */
export const GUIDE_MAX_BYTES = 50 * 1024 * 1024;
/** Premier numéro, quand aucun guide n'a encore été publié. */
export const GUIDE_FIRST_VERSION = '1.0';
/** Message de la maquette pour un fichier refusé. */
export const GUIDE_PDF_ONLY = 'Seuls les fichiers PDF sont acceptés.';

/** Un PDF se reconnaît à sa signature « %PDF- » (et non à son nom ou au type déclaré par le navigateur). */
export function isPdf(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

/** Version suivante : incrément mineur (3.2 → 3.3, 3.9 → 3.10) ; « 1.0 » pour le premier guide. */
export function nextGuideVersion(latest: string | null | undefined): string {
  if (!latest) return GUIDE_FIRST_VERSION;
  const [major, minor] = latest.split('.').map((x) => Number.parseInt(x, 10));
  return `${Number.isFinite(major) ? major : 1}.${(Number.isFinite(minor) ? minor : 0) + 1}`;
}

/** Nom du fichier servi (ASCII : en-tête Content-Disposition lisible partout). */
export function guideFileName(v: string): string {
  return `Guide utilisateur Console v${v}.pdf`;
}
