/**
 * Guide utilisateur de la Console (décision du 30/09/2026, maquette « Guide utilisateur 1c ») : règles pures.
 */

/** Taille maximale d'un guide déposé (décision du 30/09/2026 : 10 Mo). */
export const GUIDE_MAX_BYTES = 10 * 1024 * 1024;
/** Limite technique de réception : au-delà de `GUIDE_MAX_BYTES`, le refus est expliqué et tracé jusqu'à ce seuil. */
export const GUIDE_UPLOAD_HARD_LIMIT = 3 * GUIDE_MAX_BYTES;
/** Premier numéro, quand aucun guide n'a encore été publié. */
export const GUIDE_FIRST_VERSION = '1.0';
/** Message de la maquette pour un fichier refusé. */
export const GUIDE_PDF_ONLY = 'Seuls les fichiers PDF sont acceptés.';
export const GUIDE_TOO_BIG = 'Fichier trop lourd (10 Mo maximum).';
export const GUIDE_SCANNED = 'Ce PDF ne contient pas de texte (document scanné) : déposez un PDF exporté depuis un traitement de texte.';
export const GUIDE_NO_TEXT = 'Aucun texte exploitable dans ce PDF.';
export const GUIDE_BUSY = 'Indexation en cours : attendez la fin avant un nouveau dépôt.';
export const GUIDE_UNKNOWN_APP = 'Application inconnue : console ou cockpit.';
export const GUIDE_INTERRUPTED = 'Indexation interrompue : le serveur a redémarré pendant le traitement. Déposez le guide de nouveau.';

/** Étapes du traitement d'un dépôt (affichées pendant l'indexation). */
export const GUIDE_STEPS = ['Lecture du PDF', 'Structure du document', 'Découpage en extraits', 'Vectorisation', 'Enregistrement'] as const;

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

/** Applications ayant chacune leur guide (décision du 30/09/2026, maquette « Guide utilisateur Console Cockpit »). */
export const GUIDE_APPS = ['console', 'cockpit'] as const;
export type GuideApp = (typeof GUIDE_APPS)[number];
export const isGuideApp = (x: string): x is GuideApp => (GUIDE_APPS as readonly string[]).includes(x);
/** Libellés accordés à l'application (« le guide de la Console », « du Cockpit »). */
export const GUIDE_APP_LABELS: Record<GuideApp, { name: string; of: string; the: string }> = {
  console: { name: 'Console', of: 'de la Console', the: 'la Console' },
  cockpit: { name: 'Cockpit', of: 'du Cockpit', the: 'le Cockpit' },
};

/** Nom du fichier servi (ASCII : en-tête Content-Disposition lisible partout). */
export function guideFileName(v: string, app: GuideApp = 'console'): string {
  return `Guide utilisateur ${GUIDE_APP_LABELS[app].name} v${v}.pdf`;
}
