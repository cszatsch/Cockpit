/** Utilitaires de dates ISO `YYYY-MM-DD` (sans fuseau : dates civiles du projet). */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function toUtc(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}

/** Nombre de jours de `a` à `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function addDays(iso: string, n: number): string {
  return new Date(toUtc(iso) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Date civile d'un instant dans un fuseau IANA. */
export function isoInTimezone(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export type Precision = 'D' | 'M' | 'Y';

/**
 * Analyse une date du Référentiel : « JJ/MM/AAAA », « MM/AAAA », « AAAA » ou ISO.
 * `bound` choisit le premier ou le dernier jour quand la précision est au mois / à l'année.
 */
export function parseRefDate(label: string | null | undefined, bound: 'start' | 'end'): { iso: string; prec: Precision } | null {
  if (!label) return null;
  const s = label.trim();
  if (isIsoDate(s)) return { iso: s, prec: 'D' };
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isIsoDate(iso) ? { iso, prec: 'D' } : null;
  }
  m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const y = +m[2];
    const mo = +m[1];
    if (mo < 1 || mo > 12) return null;
    const d = bound === 'start' ? 1 : lastDayOfMonth(y, mo);
    return { iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, prec: 'M' };
  }
  m = /^(\d{4})$/.exec(s);
  if (m) return { iso: bound === 'start' ? `${m[1]}-01-01` : `${m[1]}-12-31`, prec: 'Y' };
  return null;
}

/** Libellé d'affichage d'une date du Référentiel selon sa précision. */
export function formatRefDate(iso: string | null | undefined, prec: Precision = 'D'): string {
  if (!iso) return '';
  const [y, mo, d] = iso.split('-');
  if (prec === 'Y') return y;
  if (prec === 'M') return `${mo}/${y}`;
  return `${d}/${mo}/${y}`;
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_KEYS: Record<string, number> = {
  janv: 1, janvier: 1, jan: 1,
  fevr: 2, fev: 2, fevrier: 2, feb: 2,
  mars: 3, mar: 3,
  avr: 4, avril: 4,
  mai: 5,
  juin: 6, jun: 6,
  juil: 7, juillet: 7, jul: 7,
  aout: 8,
  sept: 9, septembre: 9, sep: 9,
  oct: 10, octobre: 10,
  nov: 11, novembre: 11,
  dec: 12, decembre: 12,
};

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function monthFromKey(key: string): number | null {
  const k = stripAccents(key.toLowerCase()).replace(/\.$/, '');
  return MONTHS_KEYS[k] ?? null;
}

/**
 * Libellé court français d'une date (« 19 sept. », « 1er avr. 2027 ») ;
 * l'année est omise quand elle vaut `hideYear`, comme dans le frontend.
 */
export function frShort(iso: string | null | undefined, hideYear = 2026): string {
  if (!iso) return '';
  const y = +iso.slice(0, 4);
  const mo = +iso.slice(5, 7);
  const d = +iso.slice(8, 10);
  const day = d === 1 ? '1er' : String(d);
  return `${day} ${MONTHS_SHORT[mo - 1]}${y === hideYear ? '' : ` ${y}`}`;
}

/**
 * Convertit un libellé de date du jeu de démonstration (« 27 août », « 3 janv. 2024 », « 1er avr. 2027 »)
 * en ISO. L'année par défaut est 2026 (brief § 12).
 */
export function parseFrLabel(label: string | null | undefined, defaultYear = 2026): string | null {
  if (!label) return null;
  const s = stripAccents(label.toLowerCase()).replace(/^copil\s+/, '').trim();
  const m = /^(\d{1,2})(?:er)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/.exec(s);
  if (!m) return null;
  const mo = monthFromKey(m[2]);
  if (!mo) return null;
  const iso = `${m[3] ?? defaultYear}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}
